/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/staff-policies.js (grieviq-78): staff records and access
// controls. ISO/IEC 27001:2022 people controls (6.1 screening, 6.2 terms,
// 6.3 awareness, 6.5 after leaving, 6.6 confidentiality) and 5.18 access
// rights; DPDP Rules 2025 rule 6 (control and log who reaches personal data).
//
// - Staff policies: every person accepts them at sign-in, again when one
//   changes and once a year. Until then they can only read (getVerifiedAdmin
//   refuses changes with POLICIES_NOT_ACCEPTED). The texts are in i18n.js
//   (adm.pol_*) and in the project document for the lawyer.
// - Contract end: access pauses at the end of the day unless extended;
//   reminders 14 and 3 days before (the person's manager and the super
//   admins). Probation end: one reminder, 7 days before.
// - 90 days without signing in: access pauses (never a super admin, so the
//   owner can't be locked out). 45 days: flagged in the access review.
// Every staff email is content-free: the details are seen after signing in.

export const POLICY_VERSIONS = {
  CONFIDENTIALITY: "2026-10-30",
  DATA_PROTECTION: "2026-10-30",
  SECURITY: "2026-10-30",
};
export const POLICIES = Object.keys(POLICY_VERSIONS);
export const POLICY_DAYS = 365;
export const CHECK_ITEMS = ["IDENTITY", "BACKGROUND", "CONFIDENTIALITY", "APPOINTMENT", "DEVICE", "INDUCTION"];
// Background checks are needed for roles that see personal data or hold
// duties (in proportion to the risk, ISO 27001 6.1).
export const BACKGROUND_ROLES = ["super_admin", "operations_admin", "data_moderator", "support_executive", "sales_executive", "sales_manager"];
export const EXIT_ITEMS = ["ASSETS", "EMAIL_ROUTING", "ACCESS_POLICY", "NO_COPIES"];
export const KINDS = ["EMPLOYEE", "CONTRACT", "INTERN", "CONSULTANT"];
export const DORMANT_FLAG_DAYS = 45, DORMANT_PAUSE_DAYS = 90;

export const istToday = (ms) => new Date((ms || Date.now()) + 5.5 * 3600000).toISOString().slice(0, 10);
export function addDays(day, n) { return new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10); }
export function quarterOf(day) { const m = +day.slice(5, 7); return day.slice(0, 4) + "-Q" + (Math.floor((m - 1) / 3) + 1); }
export function checksNeeded(role, duties) {
  const bg = BACKGROUND_ROLES.includes(role) || (duties || []).length > 0;
  return CHECK_ITEMS.filter((i) => i !== "BACKGROUND" || bg);
}

let ready = null;
export async function recordsReady(env) {
  if (ready === true) return true;
  try { await env.DB.prepare("SELECT admin_id FROM staff_records LIMIT 1").all(); ready = true; return true; } catch (e) { return false; }
}

// Which policies this person still has to accept (now).
export async function policiesNeeded(env, adminId, nowMs) {
  if (!adminId || !(await recordsReady(env))) return [];
  const since = new Date((nowMs || Date.now()) - POLICY_DAYS * 86400000).toISOString();
  const { results } = await env.DB.prepare(
    "SELECT policy, version FROM staff_policy_acceptances WHERE admin_id = ? AND accepted_at >= ?"
  ).bind(adminId, since).all();
  const ok = new Set((results || []).filter((r) => POLICY_VERSIONS[r.policy] === r.version).map((r) => r.policy));
  return POLICIES.filter((p) => !ok.has(p));
}
export async function acceptPolicies(env, auth, list) {
  const need = await policiesNeeded(env, auth.adminId);
  const given = new Set([].concat(list || []).map(String));
  if (!need.length) return { status: 200, body: { ok: true, already: true } };
  if (need.some((p) => !given.has(p))) return { status: 400, body: { error: "CHECK_FIELDS", fields: { policies: "REQUIRED" }, need } };
  const now = new Date().toISOString();
  for (const p of need) {
    await env.DB.prepare("INSERT INTO staff_policy_acceptances (id, admin_id, policy, version, accepted_at) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), auth.adminId, p, POLICY_VERSIONS[p], now).run();
  }
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), auth.email, "staff_policies_accepted", auth.email, JSON.stringify(Object.fromEntries(need.map((p) => [p, POLICY_VERSIONS[p]])))).run();
  return { status: 200, body: { ok: true, accepted: need } };
}

// Last sign-in, written at most once an hour.
export async function touchSeen(env, adminId) {
  try {
    const now = new Date(), hourAgo = new Date(now.getTime() - 3600000).toISOString();
    await env.DB.prepare("UPDATE admin_users SET last_seen_at = ? WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)").bind(now.toISOString(), adminId, hourAgo).run();
  } catch (e) { /* part52 not run yet */ }
}

async function superAdmins(env) {
  const { results } = await env.DB.prepare("SELECT LOWER(email) AS email FROM admin_users WHERE role = 'super_admin' AND COALESCE(status, 'PRESENT') <> 'LEFT' AND auto_paused IS NULL").all();
  return (results || []).map((r) => r.email);
}
async function log(env, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), "system", action, target, detail == null ? null : JSON.stringify(detail)).run();
}
function note(origin, what) {
  return `<p>${what} Sign in to see it:</p><p><a href="${origin}/admin-staff-records.html">${origin}/admin-staff-records.html</a></p><p>For security, the details are shown only after you sign in.</p>`;
}

// Hourly, from the worker.
export async function runStaff(env, origin, nowMs, sendEmail) {
  if (!(await recordsReady(env))) return { ready: false };
  const today = istToday(nowMs), out = { paused: 0, dormant: 0, reminders: 0 };
  const send = async (to, subject, html) => { if (sendEmail) { try { if (await sendEmail(env, to, subject, html)) out.reminders++; } catch (e) { /* next hour */ } } };
  const { results } = await env.DB.prepare(
    `SELECT a.id, LOWER(a.email) AS email, a.role, a.status, a.auto_paused, a.last_seen_at, a.created_at, r.contract_end, r.probation_end, r.reminded_14, r.reminded_3, r.reminded_probation,
            LOWER(m.email) AS manager_email
     FROM admin_users a LEFT JOIN staff_records r ON r.admin_id = a.id LEFT JOIN admin_users m ON m.id = r.manager_id AND COALESCE(m.status, 'PRESENT') <> 'LEFT'
     WHERE COALESCE(a.status, 'PRESENT') <> 'LEFT'`
  ).all();
  const supers = await superAdmins(env);
  for (const p of results || []) {
    const tell = Array.from(new Set(supers.concat(p.manager_email ? [p.manager_email] : []))).filter((e) => e !== p.email);
    // Contract end: pause after the last day.
    if (p.contract_end && !p.auto_paused) {
      if (p.contract_end < today) {
        const others = supers.filter((e) => e !== p.email).length;
        if (p.role !== "super_admin" || others > 0) {
          await env.DB.prepare("UPDATE admin_users SET auto_paused = 'CONTRACT_END', auto_paused_at = ? WHERE id = ? AND auto_paused IS NULL").bind(new Date().toISOString(), p.id).run();
          await log(env, "staff_access_paused", p.email, { why: "CONTRACT_END", contractEnd: p.contract_end });
          out.paused++;
          for (const t of tell) await send(t, "GrievIQ: a staff member's access was paused", note(origin, "A staff member's contract has ended, so GrievIQ paused their access."));
        }
        continue;
      }
      for (const [days, col] of [[14, "reminded_14"], [3, "reminded_3"]]) {
        if (!p[col] && p.contract_end <= addDays(today, days) && (days === 3 || p.contract_end > addDays(today, 3))) {
          await env.DB.prepare(`UPDATE staff_records SET ${col} = ? WHERE admin_id = ?`).bind(today, p.id).run();
          for (const t of tell) await send(t, "GrievIQ: a staff member's contract ends soon", note(origin, `A staff member's contract ends within ${days} days. Their access pauses after the last day unless it is extended.`));
          break;
        }
      }
    }
    if (p.probation_end && !p.reminded_probation && p.probation_end <= addDays(today, 7) && p.probation_end >= today) {
      await env.DB.prepare("UPDATE staff_records SET reminded_probation = ? WHERE admin_id = ?").bind(today, p.id).run();
      for (const t of tell) await send(t, "GrievIQ: a staff member's probation ends soon", note(origin, "A staff member's probation ends within 7 days."));
    }
    // 90 days without signing in (never a super admin, never someone on leave).
    if (!p.auto_paused && p.role !== "super_admin" && p.status !== "ON_LEAVE") {
      const seen = p.last_seen_at || (p.created_at ? String(p.created_at).replace(" ", "T") + (String(p.created_at).endsWith("Z") ? "" : "Z") : null);
      if (seen && Date.parse(seen) < (nowMs || Date.now()) - DORMANT_PAUSE_DAYS * 86400000) {
        await env.DB.prepare("UPDATE admin_users SET auto_paused = 'DORMANT', auto_paused_at = ? WHERE id = ? AND auto_paused IS NULL").bind(new Date().toISOString(), p.id).run();
        await log(env, "staff_access_paused", p.email, { why: "DORMANT", lastSeen: p.last_seen_at || null });
        out.dormant++;
        for (const t of tell) await send(t, "GrievIQ: a staff member's access was paused", note(origin, `A staff member hasn't signed in for ${DORMANT_PAUSE_DAYS} days, so GrievIQ paused their access.`));
      }
    }
  }
  return out;
}
