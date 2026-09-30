// functions/_shared/audit.js
//
// Audit observations (item 9a, approved Sept 2026), following the IIA
// Global Internal Audit Standards (2024) and the CAG Auditing Standards
// (2017):
//   - each finding records the criteria (what should happen), the
//     condition (what was found), the cause and the effect, a rating and a
//     recommendation (IIA 14.3, 14.4);
//   - the owner replies, agreeing or disagreeing, with an action plan (the
//     CAG "contradictory process": the audited party's reply is recorded);
//   - only the auditor closes a finding, after checking that the action was
//     really carried out (IIA 15.2), or sends it back;
//   - the super admin may formally accept the risk instead, with a reason
//     (a management decision, not the auditor's);
//   - every step is kept permanently (observation_events), and once issued
//     the finding itself is locked; corrections are dated amendments with a
//     reason (observation_amendments). The database refuses edits and
//     deletions (triggers in part9a-audit.sql, NIST SP 800-53 AU-9).
//
// Lifecycle:
//   DRAFT -> ISSUED -> RESPONDED -> DONE_REPORTED -> CLOSED
//                                         \-> sent back -> RESPONDED
//   ISSUED / RESPONDED / DONE_REPORTED -> RISK_ACCEPTED (super admin)
//   DRAFT -> WITHDRAWN (a draft is never deleted)
// Overdue (worked out live): ISSUED or RESPONDED past the due date.

export const RATINGS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export const DEFAULT_DUE_DAYS = { CRITICAL: 15, HIGH: 30, MEDIUM: 60, LOW: 90 };
export const STATUSES = ["DRAFT", "ISSUED", "RESPONDED", "DONE_REPORTED", "CLOSED", "RISK_ACCEPTED", "WITHDRAWN"];
export const OPEN_STATUSES = ["ISSUED", "RESPONDED", "DONE_REPORTED"];
export const SUBJECT_TYPES = ["CASE", "OFFICE", "PROCESS"];
// Fields that may be corrected after issue, by amendment.
export const AMENDABLE = ["title", "criteria", "condition", "cause", "effect", "recommendation", "rating", "due_date"];
export const LIMITS = { title: [5, 160], text: [10, 4000], short: [0, 300], note: [5, 2000] };

const DAY = 86400000;

export function todayIst(nowMs) {
  return new Date((nowMs || Date.now()) + 5.5 * 3600000).toISOString().slice(0, 10);
}
export function addDays(day, n) {
  const d = new Date(day + "T00:00:00Z");
  return new Date(d.getTime() + n * DAY).toISOString().slice(0, 10);
}
export function isDay(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) && !isNaN(Date.parse(d + "T00:00:00Z")); }
export function defaultDue(rating, fromDay) { return addDays(fromDay || todayIst(), DEFAULT_DUE_DAYS[rating] || 90); }

export function parseJson(t, fallback) {
  if (t == null || t === "") return fallback;
  try { return JSON.parse(t); } catch (e) { return fallback; }
}

// The values in force: the original, with any amendments applied in order.
export function effective(o, amendments) {
  const out = Object.assign({}, o);
  for (const a of (amendments || []).slice().sort((x, y) => (x.amended_at < y.amended_at ? -1 : 1))) {
    if (AMENDABLE.includes(a.field)) out[a.field] = a.new_value;
  }
  return out;
}

export function isOverdue(o, today) {
  return (o.status === "ISSUED" || o.status === "RESPONDED") && !!o.due_date && o.due_date < (today || todayIst());
}

// Checks draft fields. `issuing` = every field needed to issue must be there.
// Returns { value } or { fields }.
export function readDraft(body, issuing) {
  const f = {};
  const s = (k) => String(body[k] == null ? "" : body[k]).trim();
  const v = {
    title: s("title"),
    subject_type: s("subjectType").toUpperCase(),
    subject_cases: Array.isArray(body.subjectCases) ? Array.from(new Set(body.subjectCases.map((x) => String(x).trim().toUpperCase()).filter(Boolean))).slice(0, 50) : [],
    subject_office: s("subjectOffice") || null,
    subject_process: s("subjectProcess") || null,
    criteria: s("criteria"), condition: s("condition"), cause: s("cause"), effect: s("effect"),
    recommendation: s("recommendation"),
    rating: s("rating").toUpperCase(),
    owner_email: s("ownerEmail").toLowerCase() || null,
    due_date: s("dueDate") || null,
    due_reason: s("dueReason") || null,
  };
  const len = (k, [lo, hi], required) => {
    if (!v[k]) { if (required) f[k] = "REQUIRED"; return; }
    if (v[k].length < lo || v[k].length > hi) f[k] = "LENGTH";
  };
  len("title", LIMITS.title, true);
  if (!SUBJECT_TYPES.includes(v.subject_type)) f.subjectType = "REQUIRED";
  else if (v.subject_type === "CASE" && !v.subject_cases.length && issuing) f.subjectCases = "REQUIRED";
  else if (v.subject_type === "OFFICE" && !v.subject_office && issuing) f.subjectOffice = "REQUIRED";
  else if (v.subject_type === "PROCESS" && !v.subject_process && issuing) f.subjectProcess = "REQUIRED";
  if (v.subject_process && v.subject_process.length > 200) f.subjectProcess = "LENGTH";
  for (const k of ["criteria", "condition", "cause", "effect", "recommendation"]) len(k, LIMITS.text, issuing);
  if (!RATINGS.includes(v.rating)) f.rating = "REQUIRED";
  if (v.due_date && !isDay(v.due_date)) f.dueDate = "DATE";
  if (v.due_reason && v.due_reason.length > 300) f.dueReason = "LENGTH";
  if (issuing && !v.owner_email) f.ownerEmail = "REQUIRED";
  // Map internal names to the form's names for errors.
  const map = { subject_type: "subjectType" };
  const fields = {};
  for (const [k, val] of Object.entries(f)) fields[map[k] || k] = val;
  if (Object.keys(fields).length) return { fields };
  return { value: v };
}

// Rows for pages. `amendments` for this observation.
export function shapeObservation(o, amendments, today) {
  const e = effective(o, amendments);
  return {
    id: o.id, ref: o.ref, status: o.status, overdue: isOverdue(e, today), engagementId: o.engagement_id || null,
    title: e.title, subjectType: o.subject_type, subjectCases: parseJson(o.subject_cases, []),
    subjectOffice: o.subject_office, subjectProcess: o.subject_process,
    criteria: e.criteria, condition: e.condition, cause: e.cause, effect: e.effect, recommendation: e.recommendation,
    rating: e.rating, ownerType: o.owner_type, ownerEmail: o.owner_email, ownerOffice: o.owner_office,
    dueDate: e.due_date, originalDueDate: o.due_date, dueReason: o.due_reason,
    source: parseJson(o.source, null),
    response: o.response_text ? { agree: o.response_agree === 1, text: o.response_text, actionPlan: o.action_plan, targetDate: o.target_date } : null,
    doneEvidence: o.done_evidence || null,
    createdBy: o.created_by, createdAt: o.created_at, updatedAt: o.updated_at,
    issuedAt: o.issued_at, issuedBy: o.issued_by, closedAt: o.closed_at, closedBy: o.closed_by,
    riskReason: o.risk_reason, riskReviewDate: o.risk_review_date,
    amendments: (amendments || []).map((a) => ({ field: a.field, oldValue: a.old_value, newValue: a.new_value, reason: a.reason, by: a.amended_by, at: a.amended_at })),
  };
}

// The next reference number for the year: OBS-2026-001.
export async function nextRef(env, today) {
  const year = (today || todayIst()).slice(0, 4);
  const row = await env.DB.prepare("SELECT ref FROM observations WHERE ref LIKE ? ORDER BY ref DESC LIMIT 1").bind("OBS-" + year + "-%").first();
  const n = row ? Number(String(row.ref).split("-")[2]) + 1 : 1;
  return "OBS-" + year + "-" + String(n).padStart(3, "0");
}

export async function logObservation(env, obsId, kind, actor, role, text, detail) {
  await env.DB.prepare(
    "INSERT INTO observation_events (id, observation_id, kind, actor_email, actor_role, text, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), obsId, kind, actor, role || null, text || null, detail == null ? null : JSON.stringify(detail), new Date().toISOString()).run();
}
