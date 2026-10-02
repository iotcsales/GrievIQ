// functions/_shared/get-verified-admin.js
//
// Verifies the caller's Cloudflare Access JWT, then checks the verified
// email against the admin_users table. Unlike get-verified-rep.js, admin
// authority is not derived from any jurisdiction data -- it is an
// explicit, manually-granted row in admin_users, since these endpoints
// can affect data citywide rather than being scoped to one ward/mandate.
//
// Each admin also has a role (super_admin, operations_admin,
// data_moderator, auditor, data_entry_operator). Pass a permission name as the third argument
// to require the caller's role to hold that permission; omit it to just
// require "is an admin at all" (existing behavior, unchanged).

import { verifyAccessJwt } from "./verify-access-jwt.js";

export const PERMISSIONS = {
  manage_admins: ["super_admin"],
  run_import: ["super_admin", "operations_admin"],
  review_queue: ["super_admin", "operations_admin", "data_moderator"],
  exceptions_queue: ["super_admin", "operations_admin"],
  manage_issue_types: ["super_admin", "operations_admin"],
  view_issue_types: ["super_admin", "operations_admin", "data_moderator", "auditor"],
  view_cases: ["super_admin", "operations_admin", "auditor"],
  view_dashboard: ["super_admin", "operations_admin", "data_moderator", "auditor", "data_entry_operator"],
  // Data entry with maker-checker (separation of duties): operators can
  // see the jurisdiction data and REQUEST changes; only super_admin and
  // operations_admin can approve them, never their own.
  view_jurisdiction: ["super_admin", "operations_admin", "data_entry_operator", "auditor"],
  request_changes: ["data_entry_operator"],
  approve_changes: ["super_admin", "operations_admin"],
  // Item 7b-2: GrievIQ staff check a fix when the citizen gave no email.
  // Checking (by photos or a phone call) is moderation work; showing a
  // citizen's full phone number is limited to the two senior roles (least
  // privilege, NIST AC-6) and every reveal is logged with a reason.
  view_checks: ["super_admin", "operations_admin", "data_moderator", "auditor"],
  check_resolutions: ["super_admin", "operations_admin", "data_moderator"],
  reveal_citizen_phone: ["super_admin", "operations_admin"],
  // Item 7c: photo storage -- moving old public photos to private storage
  // and running the retention clean-up by hand.
  manage_photos: ["super_admin"],
  // Item 7d: reopen a resolved case for a citizen who gave no email (and so
  // can't use the status page), e.g. after they phone support. Logged.
  reopen_cases: ["super_admin", "operations_admin"],
  // Item 9a: audit (IIA Global Internal Audit Standards 2024). The auditor
  // stays independent (Standard 7): only the auditor raises, issues,
  // verifies and closes findings; the super admin sees everything and
  // formally accepts risk (a management decision) but never edits a
  // finding; the logs are read by the auditor and the super admin only.
  // Any staff member replies to the findings they own.
  view_audit_log: ["super_admin", "auditor"],
  audit_observations: ["auditor"],
  view_all_observations: ["super_admin", "auditor"],
  accept_risk: ["super_admin"],
  // The auditor reads every record (IIA Standards: unrestricted access to
  // records), but never changes anything; these are read-only views.
  view_staff: ["super_admin", "auditor"],
  view_exceptions: ["super_admin", "operations_admin", "auditor"],
  view_reviews: ["super_admin", "operations_admin", "data_moderator", "auditor"],
  view_change_requests: ["super_admin", "operations_admin", "auditor"],
  // Item 9d: data retention. The super admin runs it and places holds; the
  // auditor reads the register (records of what was removed and why).
  view_retention: ["super_admin", "auditor"],
  manage_retention: ["super_admin"],
};

// Which admin pages each role may open (the menu shows only these). A page
// is listed with the permission that lets a role use it at all.
export const PAGES = {
  "admin-dashboard": "view_dashboard",
  "admin-cases": "view_cases",
  "admin-checks": "view_checks",
  "admin-import": "run_import",
  "admin-import-wards": "run_import",
  "admin-jurisdiction": "view_jurisdiction",
  "admin-exceptions": "view_exceptions",
  "admin-reviews": "view_reviews",
  "admin-change-requests": ["view_change_requests", "request_changes"],
  "admin-issue-types": "view_issue_types",
  "admin-staff": "view_staff",
  "admin-photos": "manage_photos",
  "admin-retention": "view_retention",
  "admin-audit": null,   // everyone: the observations they own
};
export function pagesFor(role) {
  const out = {};
  for (const [page, perm] of Object.entries(PAGES)) {
    const perms = perm == null ? null : [].concat(perm);
    out[page] = { allowed: !perms || perms.some((p) => (PERMISSIONS[p] || []).includes(role)),
      roles: perms ? Array.from(new Set(perms.flatMap((p) => PERMISSIONS[p] || []))) : null };
  }
  return out;
}

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