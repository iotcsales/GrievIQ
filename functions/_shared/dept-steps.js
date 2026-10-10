// functions/_shared/dept-steps.js
//
// Departments stage 3 (approved Oct 2026): the department step on each case.
// See helpers/part23-department-step.sql for the table. Follows:
//   - DARPG / CPGRAMS guidelines (OM 23 Aug 2024): a wrongly routed
//     grievance is never closed as "does not pertain" -- it goes back to be
//     forwarded to the right office (NOT_OURS); a refusal needs a reason
//     (CANT_DO); a date is given when work will take time (SCHEDULED);
//     21 days at most.
//   - FixMyStreet Pro: every status change is visible to the citizen with a
//     short explanation, and nothing is shown as fixed until it is.
//   - The owner's rule: the department's word is never enough. When a
//     department says the work is done, the representative's team checks on
//     site, with photos (CHECK_FIXED / CHECK_PARTLY / CHECK_NOT_FIXED).
// The department's state on a case is always derived from its latest step.

import { deptTypes } from "./departments.js";

export const STEP = {
  FORWARDED: "FORWARDED", SCHEDULED: "SCHEDULED", IN_PROGRESS: "IN_PROGRESS", DONE_CLAIMED: "DONE_CLAIMED",
  NOT_OURS: "NOT_OURS", CANT_DO: "CANT_DO", CHECK_FIXED: "CHECK_FIXED", CHECK_PARTLY: "CHECK_PARTLY", CHECK_NOT_FIXED: "CHECK_NOT_FIXED",
};
// What the representative's office records when the department replies.
export const REPLY_KINDS = [STEP.SCHEDULED, STEP.IN_PROGRESS, STEP.DONE_CLAIMED, STEP.NOT_OURS, STEP.CANT_DO];
export const CHECK_KINDS = [STEP.CHECK_PARTLY, STEP.CHECK_NOT_FIXED];   // CHECK_FIXED comes with resolving the case
// grieviq-34: DASHBOARD = sent only through GrievIQ, to an office whose
// officers use the department dashboard (they are emailed at once).
export const CHANNELS = ["DASHBOARD", "PHONE", "WHATSAPP", "EMAIL", "IN_PERSON", "LETTER"];
export const DEFAULT_TARGET_DAYS = 7;
export const MAX_TARGET_DAYS = 21;
export const NOTE_MAX = 500;
export const CANT_DO_MIN = 10;
export const CHECK_NOTE_MIN = 10;

export function isMissingStepsTable(e) {
  return /no such table:?\s*case_dept_steps/i.test(String(e && e.message));
}
export async function stepsReady(env) {
  try { await env.DB.prepare("SELECT id FROM case_dept_steps LIMIT 1").first(); return true; }
  catch (e) { if (isMissingStepsTable(e)) return false; throw e; }
}

function istDate(ms) { return new Date(ms + 5.5 * 3600000).toISOString().slice(0, 10); }
// End of a day in India (23:59:59 IST) as UTC ms.
function endOfIstDay(d) { return Date.parse(d + "T23:59:59+05:30"); }

// { key: days } for every department type (default 7).
export async function targetDaysByType(env) {
  const out = {};
  let rows = [];
  try { ({ results: rows } = await env.DB.prepare("SELECT key, target_days FROM dept_types").all()); }
  catch (e) { rows = []; }
  for (const r of rows || []) out[r.key] = clampDays(r.target_days);
  for (const t of await deptTypes(env)) if (!(t.key in out)) out[t.key] = DEFAULT_TARGET_DAYS;
  return out;
}
export function clampDays(n) {
  const v = Number(n);
  return Number.isInteger(v) && v >= 1 && v <= MAX_TARGET_DAYS ? v : DEFAULT_TARGET_DAYS;
}

// Steps for many cases at once: Map(grievanceId -> [steps oldest first]).
export async function loadSteps(env, grievanceIds) {
  const map = new Map();
  const ids = Array.from(new Set(grievanceIds || []));
  if (!ids.length) return map;
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM case_dept_steps WHERE grievance_id IN (SELECT value FROM json_each(?)) ORDER BY created_at ASC, rowid ASC"
    ).bind(JSON.stringify(ids)).all();
    for (const r of results || []) {
      if (!map.has(r.grievance_id)) map.set(r.grievance_id, []);
      map.get(r.grievance_id).push(r);
    }
  } catch (e) {
    if (!isMissingStepsTable(e)) throw e;
  }
  return map;
}

// The department's current state on a case, from its steps.
//   phase: NONE | WITH_DEPT | NEEDS_CHECK | NEEDS_FORWARD | CANT_DO | CHECKED
//   department / officeName: who has it now (from the latest forwarding)
//   dueAt / overdue / dayOf / days: the department's target (while WITH_DEPT)
export function deptState(steps, targets, nowMs) {
  const list = steps || [];
  if (!list.length) return { phase: "NONE" };
  const now = nowMs || Date.now();
  const last = list[list.length - 1];
  let fwd = null;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].kind === STEP.FORWARDED) { fwd = list[i]; break; }
  const out = {
    phase: "WITH_DEPT", lastKind: last.kind, lastAt: last.created_at,
    department: fwd ? fwd.department : last.department, officeName: fwd ? fwd.office_name : null, officeId: fwd ? fwd.office_id : null,
    forwardedAt: fwd ? fwd.created_at : null, expectedDate: null, suggestedDepartment: null,
  };
  if (last.kind === STEP.DONE_CLAIMED) out.phase = "NEEDS_CHECK";
  else if (last.kind === STEP.NOT_OURS) { out.phase = "NEEDS_FORWARD"; out.suggestedDepartment = last.suggested_department || null; }
  else if (last.kind === STEP.CANT_DO) out.phase = "CANT_DO";
  else if (last.kind === STEP.CHECK_FIXED) out.phase = "CHECKED";
  if (out.phase !== "WITH_DEPT") return out;

  // The department's clock: from the forwarding, or from a failed field
  // check (the department has to come back), whichever is later; a date the
  // department gave (SCHEDULED) moves the target to that day if later.
  const from = fwd ? list.indexOf(fwd) : 0;
  let start = Date.parse(list[from].created_at);
  let sched = null;
  for (const s of list.slice(from)) {
    if (s.kind === STEP.CHECK_PARTLY || s.kind === STEP.CHECK_NOT_FIXED) start = Math.max(start, Date.parse(s.created_at));
    if (s.kind === STEP.SCHEDULED && s.expected_date) sched = s.expected_date;
  }
  const days = (targets && targets[out.department]) || DEFAULT_TARGET_DAYS;
  let due = start + days * 86400000;
  if (sched) { out.expectedDate = sched; due = Math.max(due, endOfIstDay(sched)); }
  out.days = days;
  out.dueAt = new Date(due).toISOString();
  out.dayOf = Math.max(1, Math.floor((now - start) / 86400000) + 1);
  out.overdue = now > due;
  out.overdueDays = out.overdue ? Math.ceil((now - due) / 86400000) : 0;
  out.sentBack = last.kind === STEP.CHECK_PARTLY || last.kind === STEP.CHECK_NOT_FIXED;
  return out;
}

// A step for the representative's console (notes and who did it shown to
// the office only).
export function shapeStepForRep(s) {
  return { id: s.id, kind: s.kind, department: s.department, officeName: s.office_name, channel: s.channel, expectedDate: s.expected_date,
    suggestedDepartment: s.suggested_department, note: s.note, actor: s.actor, actorRole: s.actor_role, at: s.created_at, photoReportId: s.photo_report_id || null };
}
// A step for the citizen's Track page: what happened and when, no notes,
// no names of people or phone numbers.
export function shapeStepForCitizen(s) {
  return { kind: s.kind, department: s.department, officeName: s.office_name, expectedDate: s.expected_date, at: s.created_at };
}

export async function addStep(env, row) {
  const id = crypto.randomUUID();
  const now = row.created_at || new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO case_dept_steps (id, grievance_id, kind, department, office_id, office_name, channel, expected_date, suggested_department,
       note, photo_report_id, actor, actor_role, by_office_tier, by_office_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, row.grievance_id, row.kind, row.department || null, row.office_id || null, row.office_name || null, row.channel || null,
    row.expected_date || null, row.suggested_department || null, row.note || null, row.photo_report_id || null,
    row.actor, row.actor_role || null, row.by_office_tier || null, row.by_office_id != null ? String(row.by_office_id) : null, now).run();
  return id;
}

// The latest step of one case (or null).
export async function latestStep(env, grievanceId) {
  try {
    return await env.DB.prepare("SELECT * FROM case_dept_steps WHERE grievance_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .bind(grievanceId).first();
  } catch (e) {
    if (isMissingStepsTable(e)) return null;
    throw e;
  }
}
export async function hasAnyStep(env, grievanceId) {
  return !!(await latestStep(env, grievanceId));
}

// "Today" in India, for checking a date the department gave.
export function istToday(nowMs) { return istDate(nowMs || Date.now()); }
export function validDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ""))) return false;
  const x = new Date(d + "T00:00:00Z");
  return !isNaN(x) && x.toISOString().slice(0, 10) === d;
}
