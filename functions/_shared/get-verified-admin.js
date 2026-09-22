// functions/_shared/get-verified-admin.js
//
// Verifies the caller's Cloudflare Access JWT, then checks the verified
// email against the admin_users table. Unlike get-verified-rep.js, admin
// authority is not derived from any jurisdiction data -- it is an
// explicit, manually-granted row in admin_users, since these endpoints
// can affect data citywide rather than being scoped to one ward/mandate.

import { verifyAccessJwt } from "./verify-access-jwt.js";

/**
 * @param {Request} request
 * @param {object} env - expects ACCESS_TEAM_DOMAIN, ACCESS_AUD, DB
 * @returns {Promise
 *   { ok: true, email: string }
 *   | { ok: false, status: number, error: string }
 * >}
 */
export async function getVerifiedAdmin(request, env) {
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
    "SELECT id FROM admin_users WHERE LOWER(email) = ?"
  ).bind(email).first();

  if (!admin) {
    return { ok: false, status: 403, error: "NOT_ADMIN" };
  }

  return { ok: true, email };
}