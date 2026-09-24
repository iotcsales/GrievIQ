// functions/_shared/get-verified-admin.js
//
// Verifies the caller's Cloudflare Access JWT, then checks the verified
// email against the admin_users table. Unlike get-verified-rep.js, admin
// authority is not derived from any jurisdiction data -- it is an
// explicit, manually-granted row in admin_users, since these endpoints
// can affect data citywide rather than being scoped to one ward/mandate.
//
// Each admin also has a role (super_admin, operations_admin,
// data_moderator, auditor). Pass a permission name as the third argument
// to require the caller's role to hold that permission; omit it to just
// require "is an admin at all" (existing behavior, unchanged).

import { verifyAccessJwt } from "./verify-access-jwt.js";

export const PERMISSIONS = {
  manage_admins: ["super_admin"],
  run_import: ["super_admin", "operations_admin"],
  review_queue: ["super_admin", "operations_admin", "data_moderator"],
  exceptions_queue: ["super_admin", "operations_admin"],
  view_cases: ["super_admin", "operations_admin", "auditor"], view_dashboard: ["super_admin", "operations_admin", "data_moderator", "auditor"],
};

/**
 * @param {Request} request
 * @param {object} env - expects ACCESS_TEAM_DOMAIN, ACCESS_AUD, DB
 * @param {string} [permission] - optional key into PERMISSIONS
 * @returns {Promise
 *   { ok: true, email: string, role: string }
 *   | { ok: false, status: number, error: string }
 * >}
 */
export async function getVerifiedAdmin(request, env, permission) {
  let email;
  try {
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    const payload = await verifyAccessJwt(token, {
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      aud: env.ACCESS_AUD,
    });
    email = String(payload.email || "").toLowerCase();
    if (!email) {
      return { ok: false, status: 401, error: "No email in Access token" };
    }
  } catch (err) {
    return { ok: false, status: 401, error: (err && err.message) || "Unauthorized" };
  }

  const admin = await env.DB.prepare(
    "SELECT id, role FROM admin_users WHERE LOWER(email) = ?"
  ).bind(email).first();

  if (!admin) {
    return { ok: false, status: 403, error: "NOT_ADMIN" };
  }

  if (permission) {
    const allowedRoles = PERMISSIONS[permission] || [];
    if (!allowedRoles.includes(admin.role)) {
      return { ok: false, status: 403, error: "INSUFFICIENT_ROLE" };
    }
  }

  return { ok: true, email, role: admin.role };
}