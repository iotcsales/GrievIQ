// functions/_shared/dept-cases.js
//
// Department dashboard (grieviq-32): which cases an officer sees, and what
// of each case. Approved 9 Oct 2026.
//
//   - Only cases whose LATEST forwarding went to the officer's office. When
//     a case is forwarded elsewhere ("not ours"), this office stops seeing it
//     (DPDP data minimisation: only what the department needs for its work).
//   - Open cases, and cases closed in the last 30 days (read only), so the
//     office can see what happened after its work.
//   - Never the citizen's name, phone or email: the representative's office
//     stays the citizen's contact. Notes written by the representative's
//     staff are shown only on the forwarding (what they asked the office to
//     do); who did what is shown as a role, not a person, except the
//     department's own officers.

import { loadSteps, deptState, targetDaysByType, STEP } from "./dept-steps.js";
import { photoMedia, complaintPhotoList, loadComplaintPhotos } from "./photo-store.js";
import { toUtcMs } from "./time-limits.js";

export const RECENT_CLOSED_DAYS = 30;
const OPEN = ["OPEN", "ACKNOWLEDGED", "PENDING_CONFIRMATION"];

// Grievance ids whose latest FORWARDED step went to this office.
export async function caseIdsForOffice(env, officeId) {
  const { results } = await env.DB.prepare(
    `SELECT s.grievance_id FROM case_dept_steps s
     WHERE s.kind = 'FORWARDED' AND s.office_id = ?
       AND s.rowid = (SELECT s2.rowid FROM case_dept_steps s2 WHERE s2.grievance_id = s.grievance_id AND s2.kind = 'FORWARDED'
                      ORDER BY s2.created_at DESC, s2.rowid DESC LIMIT 1)`
  ).bind(String(officeId)).all();
  return (results || []).map((r) => r.grievance_id);
}

// Is this case one the officer's office may see now?
export async function officerMaySee(env, officer, grievanceId) {
  const ids = await caseIdsForOffice(env, officer.office_id);
  if (!ids.includes(grievanceId)) return null;
  const g = await env.DB.prepare(
    `SELECT g.*, lu.name AS ward_name, c.name AS category_name, lu.ward_boundary_geojson FROM grievances g
     LEFT JOIN local_units lu ON lu.id = g.local_unit_id LEFT JOIN grievance_categories c ON c.id = g.category_id WHERE g.id = ?`
  ).bind(grievanceId).first();
  return g && visibleNow(g) ? g : null;
}
function visibleNow(g, nowMs) {
  if (OPEN.includes(g.status)) return true;
  const closed = toUtcMs(g.closed_at || g.resolved_at || g.updated_at);
  return !isNaN(closed) && (nowMs || Date.now()) - closed <= RECENT_CLOSED_DAYS * 86400000;
}

// A step as the department sees it: the representative's staff appear as
// "the representative's office"; the department's own officers by name.
export function shapeStepForDept(s, names) {
  const byDept = s.actor_role === "DEPARTMENT";
  return {
    id: s.id, kind: s.kind, department: s.department, officeName: s.office_name, channel: s.channel,
    expectedDate: s.expected_date, suggestedDepartment: s.suggested_department,
    note: s.kind === STEP.FORWARDED || byDept || s.kind === STEP.CHECK_PARTLY || s.kind === STEP.CHECK_NOT_FIXED ? s.note : null,
    by: byDept ? "DEPARTMENT" : "OFFICE", byName: byDept ? (names[String(s.actor || "").toLowerCase()] || null) : null,
    at: s.created_at, photoReportId: s.photo_report_id || null,
  };
}

// Officer names by email (for showing who replied).
export async function officerNames(env, emails) {
  const list = Array.from(new Set((emails || []).map((e) => String(e || "").toLowerCase()).filter(Boolean)));
  const out = {};
  if (!list.length) return out;
  try {
    const { results } = await env.DB.prepare("SELECT email, name FROM dept_officers WHERE LOWER(email) IN (SELECT value FROM json_each(?))").bind(JSON.stringify(list)).all();
    for (const r of results || []) out[String(r.email).toLowerCase()] = r.name;
  } catch (e) { /* before part25 */ }
  return out;
}

// The office's list: tiles and one row per case (no photos, no text beyond
// the first 160 characters).
export async function officeCaseList(env, officer, nowMs) {
  const now = nowMs || Date.now();
  const ids = await caseIdsForOffice(env, officer.office_id);
  const tiles = { newCases: 0, withUs: 0, overdue: 0, waitingCheck: 0, sentBack: 0, closed: 0 };
  if (!ids.length) return { tiles, cases: [] };
  const { results } = await env.DB.prepare(
    `SELECT g.id, g.tracking_ref, g.status, g.description, g.created_at, g.resolved_at, g.closed_at, g.updated_at, g.retention_removed_at,
            g.category_id, g.local_unit_id, lu.name AS ward_name, c.name AS category_name
     FROM grievances g LEFT JOIN local_units lu ON lu.id = g.local_unit_id LEFT JOIN grievance_categories c ON c.id = g.category_id
     WHERE g.id IN (SELECT value FROM json_each(?))`
  ).bind(JSON.stringify(ids)).all();
  const rows = (results || []).filter((g) => visibleNow(g, now));
  const stepsBy = await loadSteps(env, rows.map((g) => g.id));
  const targets = await targetDaysByType(env);
  const cases = [];
  for (const g of rows) {
    const steps = stepsBy.get(g.id) || [];
    const st = deptState(steps, targets, now);
    const last = steps[steps.length - 1] || null;
    const open = OPEN.includes(g.status) && g.status !== "PENDING_CONFIRMATION";
    let bucket;
    if (!open) { bucket = "CLOSED"; tiles.closed++; }
    else if (st.phase === "NEEDS_CHECK") { bucket = "WAITING_CHECK"; tiles.waitingCheck++; }
    else if (st.phase === "WITH_DEPT") {
      tiles.withUs++;
      bucket = last && last.kind === STEP.FORWARDED ? "NEW" : st.sentBack ? "SENT_BACK" : "WITH_US";
      if (bucket === "NEW") tiles.newCases++;
      if (st.sentBack) tiles.sentBack++;
      if (st.overdue) tiles.overdue++;
    } else bucket = "OTHER";   // can't do / not ours: shown, nothing to do
    if (g.status === "PENDING_CONFIRMATION" && bucket !== "CLOSED") { bucket = "CLOSED"; tiles.closed++; }
    cases.push({
      id: g.id, trackingRef: g.tracking_ref, status: g.status, bucket,
      category: { id: g.category_id, name: g.category_name || "" }, ward: { id: g.local_unit_id, name: g.ward_name || "" },
      summary: g.retention_removed_at ? "" : String(g.description || "").slice(0, 160),
      createdAt: g.created_at, forwardedAt: (steps.filter((x) => x.kind === STEP.FORWARDED).pop() || {}).created_at || null,
      lastStep: last ? { kind: last.kind, at: last.created_at } : null,
      state: { phase: st.phase, days: st.days, dayOf: st.dayOf, overdue: !!st.overdue, overdueDays: st.overdueDays || 0, dueAt: st.dueAt || null, expectedDate: st.expectedDate || null, sentBack: !!st.sentBack },
    });
  }
  const rank = { NEW: 0, SENT_BACK: 1, WITH_US: 2, WAITING_CHECK: 3, OTHER: 4, CLOSED: 5 };
  cases.sort((a, b) => (b.state.overdue - a.state.overdue) || (b.state.overdueDays - a.state.overdueDays) || (rank[a.bucket] - rank[b.bucket]) || String(a.forwardedAt || "").localeCompare(String(b.forwardedAt || "")));
  return { tiles, cases };
}

// One case in full, as the department sees it.
export async function officeCaseDetail(env, officer, g, nowMs) {
  const steps = (await loadSteps(env, [g.id])).get(g.id) || [];
  const targets = await targetDaysByType(env);
  const st = deptState(steps, targets, nowMs || Date.now());
  const names = await officerNames(env, steps.filter((s) => s.actor_role === "DEPARTMENT").map((s) => s.actor));
  // Photos: the citizen's, and the department's own "work done" photos.
  const photos = g.retention_removed_at ? [] : await complaintPhotoList(env, g, await loadComplaintPhotos(env, g.id), false);
  const deptReports = steps.filter((s) => s.actor_role === "DEPARTMENT" && s.photo_report_id).map((s) => s.photo_report_id);
  const stepPhotos = {};
  if (deptReports.length) {
    const { results } = await env.DB.prepare("SELECT * FROM resolution_photos WHERE report_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(deptReports)).all();
    for (const p of results || []) { (stepPhotos[p.report_id] = stepPhotos[p.report_id] || []).push(await photoMedia(env, p, "r")); }
  }
  const open = g.status === "OPEN" || g.status === "ACKNOWLEDGED";
  const last = steps[steps.length - 1] || null;
  return {
    id: g.id, trackingRef: g.tracking_ref, status: g.status,
    category: { id: g.category_id, name: g.category_name || "" }, ward: { id: g.local_unit_id, name: g.ward_name || "" },
    description: g.retention_removed_at ? "" : (g.description || ""), retentionRemoved: !!g.retention_removed_at,
    locationDetail: g.retention_removed_at ? "" : (g.location_detail || ""),
    pin: !g.retention_removed_at && g.pin_lat != null && g.pin_lng != null ? { lat: Number(g.pin_lat), lng: Number(g.pin_lng) } : null,
    photos, createdAt: g.created_at,
    steps: steps.map((s) => Object.assign(shapeStepForDept(s, names), s.photo_report_id && stepPhotos[s.photo_report_id] ? { photos: stepPhotos[s.photo_report_id] } : {})),
    state: { phase: st.phase, days: st.days, dayOf: st.dayOf, overdue: !!st.overdue, overdueDays: st.overdueDays || 0, dueAt: st.dueAt || null, expectedDate: st.expectedDate || null, sentBack: !!st.sentBack, department: st.department || null },
    canReply: open && !!last && last.kind !== STEP.NOT_OURS,
  };
}
