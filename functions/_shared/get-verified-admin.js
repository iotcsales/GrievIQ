/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/get-verified-admin.js
//
// Verifies the caller's Cloudflare Access JWT, then checks the verified
// email against the admin_users table. Unlike get-verified-rep.js, admin
// authority is not derived from any jurisdiction data -- it is an
// explicit, manually-granted row in admin_users, since these endpoints
// can affect data citywide rather than being scoped to one ward/mandate.
//
// Each admin also has a role (super_admin, operations_admin,
// data_moderator, auditor, data_entry_operator; grieviq-75 adds
// accounts_executive, accounts_manager, support_executive, sales_executive,
// sales_manager and management_viewer). Named duties given by the super admin
// (staff_duties, part49) add the duty roles helper_checker and
// helper_approver to the person's roles (never through a leave cover). Pass a permission name as the third argument
// to require the caller's role to hold that permission; omit it to just
// require "is an admin at all" (existing behavior, unchanged).

import { verifyAccessJwt } from "./verify-access-jwt.js";

export const PERMISSIONS = {
  manage_admins: ["super_admin"],
  run_import: ["super_admin", "operations_admin"],
  review_queue: ["super_admin", "operations_admin", "data_moderator"],
  exceptions_queue: ["super_admin", "operations_admin"],
  manage_issue_types: ["super_admin", "operations_admin"],
  view_issue_types: ["super_admin", "operations_admin", "data_moderator", "auditor", "support_executive"],
  view_cases: ["super_admin", "operations_admin", "auditor", "support_executive"],
  view_dashboard: ["super_admin", "operations_admin", "data_moderator", "auditor", "data_entry_operator", "accounts_executive", "accounts_manager", "support_executive", "sales_executive", "sales_manager", "management_viewer"],
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
  view_checks: ["super_admin", "operations_admin", "data_moderator", "auditor", "support_executive"],
  check_resolutions: ["super_admin", "operations_admin", "data_moderator", "support_executive"],
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
  // "Where people want GrievIQ next": anonymous city totals from the home
  // page's "I want GrievIQ in my city" button. Planning information for the
  // two senior roles; the auditor reads it.
  view_demand: ["super_admin", "operations_admin", "auditor", "sales_executive", "sales_manager", "management_viewer"],
  // Visitor count and live visitor map (anonymous, city level only).
  view_visitors: ["super_admin", "operations_admin", "auditor", "management_viewer"],
  // Areas (cities and districts): adding one, adding wards and villages by
  // hand, and switching an area on for citizens are senior decisions; data
  // entry operators see the areas (and request changes on Jurisdiction);
  // the auditor reads.
  view_areas: ["super_admin", "operations_admin", "data_entry_operator", "auditor", "support_executive", "sales_executive", "sales_manager"],
  manage_areas: ["super_admin", "operations_admin"],
  // Citizen feedback about the app: read and handled by the two senior
  // roles; the auditor reads (with citizens' emails partly hidden).
  view_feedback: ["super_admin", "operations_admin", "auditor", "support_executive"],
  manage_feedback: ["super_admin", "operations_admin", "support_executive"],
  // Notifications (Oct 2026): messages from GrievIQ to representatives'
  // offices and the replies. The auditor reads (independent oversight).
  view_messages: ["super_admin", "operations_admin", "auditor", "support_executive"],
  send_messages: ["super_admin", "operations_admin", "support_executive"],
  // Departments stage 1 (Oct 2026): the department directory. The two senior
  // roles add and change offices; data entry operators request changes
  // (maker-checker, approved on Change requests); the auditor reads.
  view_departments: ["super_admin", "operations_admin", "data_entry_operator", "auditor", "support_executive"],
  manage_departments: ["super_admin", "operations_admin"],
  // Citizen ratings (grieviq-30): the two senior roles follow up low
  // ratings; the auditor reads (same people who see cases).
  view_ratings: ["super_admin", "operations_admin", "auditor", "support_executive"],
  follow_up_ratings: ["super_admin", "operations_admin", "support_executive"],
  // Department dashboard (grieviq-32): who from a department office may sign
  // in. Giving access to citizens' complaints is a senior decision; the
  // auditor reads the officers, agreements and their activity.
  // grieviq-55: paid public notices
  view_notices: ["super_admin", "operations_admin", "auditor"],
  manage_notices: ["super_admin", "operations_admin"],
  view_dept_officers: ["super_admin", "operations_admin", "auditor"],
  manage_dept_officers: ["super_admin", "operations_admin"],
  // Department performance (grieviq-33): counts and timings only.
  view_dept_performance: ["super_admin", "operations_admin", "auditor", "management_viewer"],
  // Prices & site details (grieviq-39): every admin reads what GrievIQ
  // publishes; only the super admin changes prices, discounts, contacts
  // and claims (a business decision), and every change is logged.
  view_site_settings: ["super_admin", "operations_admin", "data_moderator", "auditor", "data_entry_operator", "accounts_executive", "accounts_manager", "support_executive", "sales_executive", "sales_manager", "management_viewer"],
  manage_site_settings: ["super_admin"],
  // Pilot requests from the "For offices" page: the two senior roles call
  // the office back; the auditor reads (mobile numbers partly hidden).
  view_pilot_requests: ["super_admin", "operations_admin", "auditor", "sales_executive", "sales_manager"],
  manage_pilot_requests: ["super_admin", "operations_admin", "sales_executive", "sales_manager"],
  // grieviq-41: bills for offices (UPI / bank transfer). Making bills and
  // checking payments: super and operations admins; the auditor looks.
  // grieviq-75: accounts staff. Making and sending bills is everyday work;
  // confirming money received, returning a payment and cancelling a bill
  // need the accounts manager (never on a bill they made themselves) or a
  // senior admin. The super admin can switch billing to accounts staff only
  // (admin_settings billing_accounts_only): then operations admins read.
  view_bills: ["super_admin", "operations_admin", "auditor", "accounts_executive", "accounts_manager"],
  make_bills: ["super_admin", "operations_admin", "accounts_executive", "accounts_manager"],
  confirm_bills: ["super_admin", "operations_admin", "accounts_manager"],
  // Quotations (on the Bills page): sales and accounts staff prepare and
  // email them; accepting (which makes the bill) or withdrawing one is for a
  // manager or a senior admin. State and National quotations: super admin.
  view_quotations: ["super_admin", "operations_admin", "auditor", "accounts_executive", "accounts_manager", "sales_executive", "sales_manager"],
  make_quotations: ["super_admin", "operations_admin", "accounts_executive", "accounts_manager", "sales_executive", "sales_manager"],
  accept_quotations: ["super_admin", "operations_admin", "accounts_manager", "sales_manager"],
  // grieviq-76: Accounts (tax invoices, credit notes, GST summary, TDS,
  // settlements, exports). Accounts staff and the super admin; the auditor
  // reads. The accounts manager and super admin lock filed months, fetch
  // settlements and issue credit notes; only the super admin changes the
  // settings (SAC codes, series, start date) or unlocks a month.
  view_accounts: ["super_admin", "auditor", "accounts_executive", "accounts_manager"],
  manage_accounts: ["super_admin", "accounts_manager"],
  // grieviq-77: the sales pipeline (leads, follow-ups, territories). Sales
  // staff work their own leads and the open ones in their states; the sales
  // manager and the two senior admins see every lead, give leads and
  // territories. The auditor reads (contacts partly hidden); management
  // sees totals only.
  view_sales: ["super_admin", "operations_admin", "auditor", "sales_executive", "sales_manager", "management_viewer"],
  work_sales: ["super_admin", "operations_admin", "sales_executive", "sales_manager"],
  manage_sales: ["super_admin", "operations_admin", "sales_manager"],
  // grieviq-45: web addresses where a copy of GrievIQ was seen.
  view_copies: ["super_admin", "auditor"],
  // grieviq-46: office subscriptions (pilot dates, paid-up date, pause, end).
  view_subscriptions: ["super_admin", "operations_admin", "auditor", "accounts_executive", "accounts_manager", "sales_executive", "sales_manager"],
  manage_subscriptions: ["super_admin"],
  // grieviq-47: the speed monitor.
  view_speed: ["super_admin", "operations_admin", "management_viewer"],
  // grieviq-48: government dashboard accounts (state and district
  // officials). Only the super admin gives or removes access, and only on a
  // letter from the state; operations admins and the auditor read the list
  // and the view log.
  view_gov: ["super_admin", "operations_admin", "auditor"],
  manage_gov: ["super_admin"],
  // grieviq-53: change of representative. Operators ask, super and
  // operations admins approve (never their own) or apply directly; the
  // auditor reads every change.
  view_handovers: ["super_admin", "operations_admin", "data_entry_operator", "auditor"],
  request_handover: ["data_entry_operator"],
  apply_handover: ["super_admin", "operations_admin"],
  // grieviq-72: Community helpers. Maker-checker (NIST AC-5): checking an
  // application (ID, selfie, video call) is moderation work; approving it,
  // and suspending or removing a helper, is for the two senior roles, never
  // by the person who checked. The ID photos are seen only by those who
  // check or approve (never the auditor); every view is recorded. The
  // auditor reads everything else.
  // grieviq-75: checking and approving are named duties (staff_duties), not
  // roles: the super admin gives them to named people, for all areas or
  // some. Accounts staff see helper payments only (never KYC).
  view_helpers: ["super_admin", "operations_admin", "data_moderator", "auditor", "helper_checker", "helper_approver"],
  view_helper_payments: ["super_admin", "operations_admin", "auditor", "accounts_executive", "accounts_manager", "helper_approver"],
  view_helper_files: ["helper_checker", "helper_approver"],
  check_helpers: ["helper_checker"],
  approve_helpers: ["helper_approver"],
  refund_helper_fees: ["super_admin", "operations_admin", "accounts_manager", "helper_approver"],
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
  "admin-visitors": "view_visitors",
  "admin-areas": "view_areas",
  "admin-feedback": "view_feedback",
  "admin-messages": "view_messages",
  "admin-departments": "view_departments",
  "admin-ratings": "view_ratings",
  "admin-dept-performance": "view_dept_performance",
  "admin-dept-agreement": "view_dept_officers",   // grieviq-37: the agreement to print (opened from Departments)
  "admin-site-settings": "view_site_settings",     // grieviq-39
  "admin-pilot-requests": "view_pilot_requests",   // grieviq-39
  "admin-bills": ["view_bills", "view_quotations"], // grieviq-41; quotations for sales (grieviq-75)
  "admin-copies": "view_copies",                   // grieviq-45
  "admin-subscriptions": "view_subscriptions",     // grieviq-46
  "admin-speed": "view_speed",                     // grieviq-47
  "admin-gov": "view_gov",                         // grieviq-48
  "admin-handovers": "view_handovers",             // grieviq-53
  "admin-notices": "view_notices",                 // grieviq-55
  "admin-accounts": "view_accounts",                // grieviq-76
  "admin-sales": "view_sales",                      // grieviq-77
  "admin-helpers": ["view_helpers", "view_helper_payments"], // grieviq-72; payments only for accounts (grieviq-75)
};
export function pagesFor(roleOrRoles) {
  const mine = [].concat(roleOrRoles);
  const out = {};
  for (const [page, perm] of Object.entries(PAGES)) {
    const perms = perm == null ? null : [].concat(perm);
    out[page] = { allowed: !perms || perms.some((p) => (PERMISSIONS[p] || []).some((r) => mine.includes(r))),
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

  return resolveAdmin(env, email, permission);
}

// Does this signed-in admin hold the permission (through their own role or
// a role they are covering for)?
export function allows(auth, permission) {
  const roles = (auth && (auth.roles || (auth.role ? [auth.role] : []))) || [];
  return roles.some((r) => (PERMISSIONS[permission] || []).includes(r));
}

// ---- grieviq-75: named duties ----
export const DUTIES = ["HELPER_CHECK", "HELPER_APPROVE", "GRIEVANCE_OFFICER", "SECURITY_CONTACT"];
export const HELPER_DUTIES = ["HELPER_CHECK", "HELPER_APPROVE"];
export const DUTY_ROLE = { HELPER_CHECK: "helper_checker", HELPER_APPROVE: "helper_approver" };
// The roles that held these powers before duties: given to anyone else, the
// super admin is warned and must confirm (with a reason).
export const DUTY_USUAL_ROLES = { HELPER_CHECK: ["super_admin", "operations_admin", "data_moderator"], HELPER_APPROVE: ["super_admin", "operations_admin"] };
export const ROLES = ["super_admin", "operations_admin", "data_moderator", "auditor", "data_entry_operator",
  "accounts_executive", "accounts_manager", "support_executive", "sales_executive", "sales_manager", "management_viewer"];
export const SALES_ROLES = ["sales_executive", "sales_manager"];
export function parseAreas(v) {
  if (v == null || v === "") return null;
  try { const a = JSON.parse(v); return Array.isArray(a) && a.length ? a.map(String) : null; } catch (e) { return null; }
}
// Does this person hold the duty for this area? (null areas = all areas)
export function dutyCovers(auth, duty, areaId) {
  const d = ((auth && auth.duties) || []).find((x) => x.duty === duty);
  if (!d) return false;
  return !d.areas || (areaId != null && d.areas.includes(String(areaId)));
}
// The super admin's switches (part49 admin_settings).
export async function adminSetting(env, key) {
  try { const r = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = ?").bind(key).first(); return r ? r.value : null; } catch (e) { return null; }
}
// Billing powers, with the "accounts staff only" switch: when it is on, an
// operations admin (without another role that gives the power) only reads.
export async function billingAllows(env, auth, permission) {
  if (!allows(auth, permission)) return false;
  const roles = (auth.roles || [auth.role]).filter((r) => (PERMISSIONS[permission] || []).includes(r));
  if (roles.some((r) => r !== "operations_admin")) return true;
  return (await adminSetting(env, "billing_accounts_only")) !== "1";
}

function istDay(ms) { return new Date((ms || Date.now()) + 5.5 * 3600000).toISOString().slice(0, 10); }

// The admin's record, status and leave cover, after the email is verified.
// Item 10: staff who have left can't sign in; staff on leave whose access is
// paused can't either, until their return date; a person covering for a
// colleague also holds that colleague's role (NIST AC-2: temporary access
// that ends by itself). Exported so tests can use it without Access.
export async function resolveAdmin(env, email, permission) {
  let admin = null, extended = true;
  try {
    admin = await env.DB.prepare(
      "SELECT id, role, name, employee_id, status, leave_until, access_paused FROM admin_users WHERE LOWER(email) = ?"
    ).bind(email).first();
  } catch (e) {
    extended = false;   // item 10 columns not added yet
    admin = await env.DB.prepare("SELECT id, role FROM admin_users WHERE LOWER(email) = ?").bind(email).first();
  }
  if (!admin) return { ok: false, status: 403, error: "NOT_ADMIN" };

  const today = istDay();
  let covering = [];
  if (extended) {
    if (admin.status === "LEFT") return { ok: false, status: 403, error: "ACCOUNT_LEFT" };
    const onLeave = admin.status === "ON_LEAVE" && (!admin.leave_until || admin.leave_until >= today);
    if (onLeave && admin.access_paused === 1) return { ok: false, status: 403, error: "ACCESS_PAUSED", leaveUntil: admin.leave_until || null };
    try {
      const { results } = await env.DB.prepare(
        `SELECT c.id, c.away_email, c.to_date, a.role, a.name, a.employee_id FROM staff_covers c
         JOIN admin_users a ON LOWER(a.email) = LOWER(c.away_email)
         WHERE LOWER(c.cover_email) = ? AND c.ended_at IS NULL AND c.from_date <= ? AND c.to_date >= ? AND a.status <> 'LEFT'`
      ).bind(email, today, today).all();
      covering = (results || []).map((c) => ({ id: c.id, email: String(c.away_email).toLowerCase(), role: c.role, name: c.name || null, employeeId: c.employee_id || null, until: c.to_date }));
    } catch (e) { covering = []; }
  }
  // Item 10b: earlier sign-in emails of the same person still count as theirs
  // (e.g. an audit observation issued to their old address).
  let myEmails = [email];
  const coverAliases = {};
  if (extended) {
    try {
      const { results } = await env.DB.prepare("SELECT old_email FROM staff_email_history WHERE admin_id = ?").bind(admin.id).all();
      for (const r of results || []) myEmails.push(String(r.old_email).toLowerCase());
      if (covering.length) {
        const { results: cr } = await env.DB.prepare(
          "SELECT h.old_email, LOWER(a.email) AS cur FROM staff_email_history h JOIN admin_users a ON a.id = h.admin_id WHERE LOWER(a.email) IN (SELECT value FROM json_each(?))"
        ).bind(JSON.stringify(covering.map((c) => c.email))).all();
        for (const r of cr || []) coverAliases[String(r.old_email).toLowerCase()] = r.cur;
      }
    } catch (e) { /* item 10b table not there yet */ }
  }
  // grieviq-75: named duties (never through a leave cover; never for the
  // auditor, whose independence they would break).
  let duties = [];
  try {
    const { results } = await env.DB.prepare("SELECT duty, areas FROM staff_duties WHERE admin_id = ? AND ended_at IS NULL").bind(admin.id).all();
    duties = (results || []).map((d) => ({ duty: d.duty, areas: parseAreas(d.areas) }));
  } catch (e) { duties = []; }
  if (admin.role === "auditor") duties = duties.filter((d) => !HELPER_DUTIES.includes(d.duty));
  const roles = Array.from(new Set([admin.role].concat(covering.map((c) => c.role)).concat(duties.map((d) => DUTY_ROLE[d.duty]).filter(Boolean))));

  if (permission) {
    const allowedRoles = PERMISSIONS[permission] || [];
    if (!roles.some((r) => allowedRoles.includes(r))) {
      return { ok: false, status: 403, error: "INSUFFICIENT_ROLE" };
    }
  }

  return { ok: true, email, role: admin.role, roles, duties, adminId: admin.id, name: admin.name || null, employeeId: admin.employee_id || null, covering, coverFor: covering.map((c) => c.email), myEmails, coverAliases };
}