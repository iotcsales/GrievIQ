// functions/_shared/team.js
//
// The representative's team (item 8b, approved Sept 2026).
//
// Modelled on how Government of India grievance offices work (DARPG /
// CPGRAMS guidelines: Grievance Redressal Officers do the work and file the
// Action Taken Report; the nodal officer checks the quality; senior officers
// stay answerable) and on NIST SP 800-53 access control: every person has
// their own account (AC-2), only the access their job needs (AC-6), the
// person who does the work doesn't approve it (AC-5), and every action
// records who did it and for whom (AU-3).
//
//   - A team belongs to the OFFICE (e.g. "Corporator, Ward X"), not the
//     person. Each member records which representative confirmed them
//     (confirmed_by_rep_email). When a different person holds the office
//     (e.g. after an election), members are paused until the new
//     representative confirms them again. No scheduled job: checked live.
//   - Roles:
//       REPRESENTATIVE  everything, and managing the team
//       OFFICE_MANAGER  all of the office's cases: acknowledge, forward,
//                       assign, add after-photos, approve fix reports and
//                       mark resolved; not the team itself
//       FIELD_WORKER    only cases assigned to them: add after-photos and
//                       submit a fix report for approval
//   - Accountability doesn't move: escalation, deadlines and red flags stay
//     with the office's level; citizens see the representative.
//   - Up to TEAM_LIMIT members per office. Removing someone takes effect on
//     their next request (roles are looked up on every request).
//
// Item 8c-1 (approved Sept 2026): job profiles and a view-only role.
// Roles stay fixed (NIST RBAC, INCITS 359: permissions belong to roles, not
// people); each member's profile adds attributes on top (NIST SP 800-162):
//       OFFICE_ASSISTANT  sees the office's cases, read only; photo
//                         previews only (NIST AC-6 least privilege)
//   - designation + duties: the member's written job description;
//   - wards: ENFORCED. null = all the office's wards; otherwise only those
//     wards' cases are visible to them and can be assigned to them;
//   - issue_types: a SUGGESTION only (sorts the "Assign to" list);
//   - available = 0 (on leave): no new assignments.
// The representative is reminded to review the team every
// TEAM_REVIEW_DAYS (NIST AC-6(7) / AC-2(j)).

export const ROLE = { REP: "REPRESENTATIVE", OM: "OFFICE_MANAGER", FW: "FIELD_WORKER", OA: "OFFICE_ASSISTANT" };
export const TEAM_ROLES = [ROLE.OM, ROLE.FW, ROLE.OA];
export const TEAM_LIMIT = 25;
export const TEAM_REVIEW_DAYS = 90;
export const WORKLOAD_WARN = 10;
export const DESIGNATIONS = ["PERSONAL_ASSISTANT", "WARD_SUPERVISOR", "SANITATION_SUPERVISOR", "FIELD_STAFF", "OTHER"];
export const DUTIES_MAX = 300;
export const DESIGNATION_OTHER_MAX = 60;
// Field worker and office assistant rank the same: neither can do the
// other's work, and nobody holds both in one office.
const RANK = { REPRESENTATIVE: 3, OFFICE_MANAGER: 2, FIELD_WORKER: 1, OFFICE_ASSISTANT: 1 };

export function officeKey(tier, id) { return String(tier) + ":" + String(id); }
export function parseOfficeKey(key) {
  const m = /^(LOCAL|MAYOR|MLA|MP):(.+)$/.exec(String(key || ""));
  return m ? { tier: m[1], id: m[2] } : null;
}
export function roleRank(role) { return RANK[role] || 0; }
export function canManageCases(role) { return role === ROLE.REP || role === ROLE.OM; }
// May change a case at all (upload after-photos, submit or mark a fix).
export function canWorkCases(role) { return role === ROLE.REP || role === ROLE.OM || role === ROLE.FW; }
export function isViewOnly(role) { return role === ROLE.OA; }

// JSON list column -> array of strings, or null (= all / none set).
export function parseList(text) {
  if (text == null || text === "") return null;
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v.map(String) : null;
  } catch (e) { return null; }
}

// A member row's job profile, for pages.
function istToday() { return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); }
export function jobProfile(r) {
  return {
    designation: r.designation || null,
    designationOther: r.designation_other || null,
    duties: r.duties || null,
    wards: parseList(r.wards),
    issueTypes: parseList(r.issue_types) || [],
    // Item 10: "on leave" ends by itself after the return date.
    available: r.available == null ? true : Number(r.available) === 1 || (!!r.leave_until && r.leave_until < istToday()),
    leaveUntil: r.available != null && Number(r.available) === 0 && r.leave_until && r.leave_until >= istToday() ? r.leave_until : null,
  };
}

// Does this member cover this ward? (null wards = all the office's wards)
export function coversWard(row, wardId) {
  const w = parseList(row.wards);
  return !w || w.includes(String(wardId));
}

// The office's own row: its current representative's email, its name and
// the label shown for it.
export async function officeInfo(env, tier, id) {
  let row = null;
  if (tier === "LOCAL") row = await env.DB.prepare("SELECT id, name, unit_type, rep_email AS email FROM local_units WHERE id = ?").bind(id).first();
  else if (tier === "MAYOR") row = await env.DB.prepare("SELECT id, name, mayor_email AS email FROM municipal_bodies WHERE id = ?").bind(id).first();
  else if (tier === "MLA") row = await env.DB.prepare("SELECT id, name, mla_email AS email FROM mla_constituencies WHERE id = ?").bind(id).first();
  else if (tier === "MP") row = await env.DB.prepare("SELECT id, name, mp_email AS email FROM mp_constituencies WHERE id = ?").bind(id).first();
  if (!row) return null;
  const label = tier === "LOCAL" ? (row.unit_type === "URBAN" ? "Corporator" : "Gram Pradhan") : tier === "MAYOR" ? "Mayor" : tier;
  return { tier, id: row.id, name: row.name, label, repEmail: String(row.email || "").trim().toLowerCase() || null };
}

// Team memberships that are active and confirmed by the office's current
// representative, as mandates (same shape as a representative's own).
export async function teamMandates(env, email, rows) {
  const out = [];
  for (const t of rows || []) {
    const office = await officeInfo(env, t.office_tier, t.office_id);
    if (!office || !office.repEmail) continue;
    if (String(t.confirmed_by_rep_email || "").toLowerCase() !== office.repEmail) continue; // paused
    // Item 8c-1: the member's wards limit what they see (null = all).
    out.push({ tier: office.tier, id: office.id, name: office.name, label: office.label, role: t.role, memberId: t.id,
      officeRepEmail: office.repEmail, wards: parseList(t.wards), job: jobProfile(t) });
  }
  return out;
}

// The caller's best role for this case (and the mandate it comes from), or
// null. A field worker counts only for cases assigned to them in that
// office. getUnits(mandate) -> list of local unit ids the mandate covers.
export async function caseAccess(env, auth, g, getUnits) {
  let best = null;
  for (const m of auth.mandates) {
    const units = await getUnits(env, m);
    if (!units.includes(g.local_unit_id)) continue;
    const role = m.role || ROLE.REP;
    if (role === ROLE.FW) {
      const a = await activeAssignment(env, g.id);
      if (!a || a.assignee_email !== auth.email || a.office_tier !== m.tier || a.office_id !== m.id) continue;
    }
    if (!best || roleRank(role) > roleRank(best.role)) best = { role, mandate: m };
  }
  return best;
}

export async function activeAssignment(env, grievanceId) {
  return env.DB.prepare(
    "SELECT * FROM case_assignments WHERE grievance_id = ? AND ended_at IS NULL ORDER BY assigned_at DESC LIMIT 1"
  ).bind(grievanceId).first();
}

// Who the representative of an office is right now (for "done for ...").
export function onBehalfOf(mandate, auth) {
  return (mandate && mandate.officeRepEmail) || auth.email;
}

// The team activity log (NIST AU-3: who, what, when, for which office and
// on whose behalf).
export async function logTeam(env, { officeTier, officeId, actor, actorRole, onBehalf, action, grievanceId, detail }) {
  try {
    await env.DB.prepare(
      `INSERT INTO team_activity (id, office_tier, office_id, actor_email, actor_role, on_behalf_of, action, grievance_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), officeTier, officeId, actor, actorRole || null, onBehalf || null, action, grievanceId || null,
      detail == null ? null : JSON.stringify(detail), new Date().toISOString()).run();
  } catch (e) {
    // The log must never block the work itself.
  }
}
