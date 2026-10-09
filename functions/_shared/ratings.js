// functions/_shared/ratings.js
//
// Citizen ratings (grieviq-30, approved 9 Oct 2026). Table: case_ratings
// (database update part24-citizen-ratings.sql).
//
// Follows:
//   - GOV.UK Service Manual feedback pattern: five worded answers, from
//     "Very satisfied" to "Very dissatisfied", and an optional comment.
//   - CPGRAMS (DARPG): the citizen rates the outcome after the grievance is
//     closed; a poor rating leads to a follow-up. Here a low rating goes on
//     the admin "Low ratings" list (reopening stays a separate step, item 7d).
// Owner decisions: rate the representative's office and, if a department
// worked on the case, the department; one rating per case, changeable for 7
// days (the kinder option); private to the representative's office (rep and
// office managers) and GrievIQ staff; an average only from 5 ratings.

import { toUtcMs } from "./time-limits.js";
import { closedAtMs } from "./reopen.js";
import { loadSteps } from "./dept-steps.js";

// Stored as 5..1. The keys are what pages translate.
export const SCALE = [
  { score: 5, key: "VERY_SATISFIED" },
  { score: 4, key: "SATISFIED" },
  { score: 3, key: "NEITHER" },
  { score: 2, key: "DISSATISFIED" },
  { score: 1, key: "VERY_DISSATISFIED" },
];
const KEY_BY_SCORE = Object.fromEntries(SCALE.map((s) => [s.score, s.key]));
const SCORE_BY_KEY = Object.fromEntries(SCALE.map((s) => [s.key, s.score]));

export const RATE_DAYS = 30;          // how long after closing a case can be rated
export const EDIT_DAYS = 7;           // how long after sending a rating can be changed
export const COMMENT_MAX = 500;
export const MIN_FOR_AVERAGE = 5;
export const LOW_MAX = 2;             // 1 or 2 on either question is a low rating
export const FOLLOW_NOTE_MIN = 10;
export const FOLLOW_NOTE_MAX = 500;
const DAY = 86400000;

export function scoreOf(key) { return SCORE_BY_KEY[String(key || "")] || null; }
export function keyOf(score) { return KEY_BY_SCORE[Number(score)] || null; }

export function isMissingRatingsTable(e) {
  return /no such table:?\s*case_ratings/i.test(String(e && e.message));
}
export async function ratingsReady(env) {
  try { await env.DB.prepare("SELECT id FROM case_ratings LIMIT 1").first(); return true; }
  catch (e) { if (isMissingRatingsTable(e)) return false; throw e; }
}

// Ratings for many cases at once: Map(grievanceId -> row). Empty before part24.
export async function loadRatings(env, grievanceIds) {
  const map = new Map();
  const ids = Array.from(new Set(grievanceIds || []));
  if (!ids.length) return map;
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM case_ratings WHERE grievance_id IN (SELECT value FROM json_each(?))"
    ).bind(JSON.stringify(ids)).all();
    for (const r of results || []) map.set(r.grievance_id, r);
  } catch (e) {
    if (!isMissingRatingsTable(e)) throw e;
  }
  return map;
}

function isClosed(g) { return !!g && (g.status === "RESOLVED" || g.status === "CLOSED"); }
function iso(ms) { return new Date(ms).toISOString(); }

// Can the citizen rate (or change the rating of) this case now?
// { can, code, until, mode }
//   code: OK | NOT_CLOSED | TOO_LATE | LOCKED
//   mode: NEW (no rating for this closing yet) | EDIT (change within 7 days)
// A case reopened and closed again can be rated again (a new round).
export function ratingStatus(g, rating, nowMs) {
  const now = nowMs || Date.now();
  if (!isClosed(g)) return { can: false, code: "NOT_CLOSED", until: null, mode: null };
  const closed = closedAtMs(g);
  if (isNaN(closed)) return { can: false, code: "TOO_LATE", until: null, mode: null };
  const roundClosed = rating && rating.round_closed_at ? toUtcMs(rating.round_closed_at) : NaN;
  const newRound = !rating || (!isNaN(roundClosed) && closed > roundClosed + 60000);
  if (newRound) {
    const until = closed + RATE_DAYS * DAY;
    return now <= until ? { can: true, code: "OK", until: iso(until), mode: "NEW" } : { can: false, code: "TOO_LATE", until: null, mode: null };
  }
  const until = toUtcMs(rating.submitted_at) + EDIT_DAYS * DAY;
  return now <= until ? { can: true, code: "OK", until: iso(until), mode: "EDIT" } : { can: false, code: "LOCKED", until: null, mode: null };
}

// The department the citizen is asked about: the latest department the case
// was forwarded to (department step, else the older "Forward to department"
// record). { key, officeName } or null.
export async function departmentFor(env, grievanceId) {
  const steps = (await loadSteps(env, [grievanceId])).get(grievanceId) || [];
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].department) return { key: steps[i].department, officeName: steps[i].office_name || null };
  }
  const ev = await env.DB.prepare(
    "SELECT reason FROM grievance_events WHERE grievance_id = ? AND event_type = 'FOLLOW_UP' ORDER BY created_at DESC, rowid DESC LIMIT 1"
  ).bind(grievanceId).first();
  return ev && ev.reason ? { key: ev.reason, officeName: null } : null;
}

// The office that resolved the case: its level (current_tier when closed)
// and that level's id in the ward's chain.
export function resolvingOffice(g, chain) {
  if (!chain) return { tier: g.current_tier || null, id: null };
  const ids = { LOCAL: chain.localUnit && chain.localUnit.id, MAYOR: chain.municipalBody && chain.municipalBody.id, MLA: chain.mla && chain.mla.id, MP: chain.mp && chain.mp.id };
  const tier = g.current_tier || "LOCAL";
  return { tier, id: ids[tier] != null ? String(ids[tier]) : null };
}

// Citizen: their own answers only.
export function shapeForCitizen(r) {
  if (!r) return null;
  return { office: keyOf(r.office_score), dept: keyOf(r.dept_score), department: r.department || null, comment: r.comment || "", submittedAt: r.submitted_at, updatedAt: r.updated_at };
}
// Representative's office (rep and office managers): no follow-up details.
export function shapeForRep(r) {
  if (!r) return null;
  return { office: keyOf(r.office_score), dept: keyOf(r.dept_score), department: r.department || null, comment: r.comment || "", submittedAt: r.submitted_at, updatedAt: r.updated_at, changed: Number(r.edit_count) > 0 };
}
// GrievIQ staff.
export function shapeForAdmin(r) {
  if (!r) return null;
  return Object.assign(shapeForRep(r), {
    low: Number(r.low) === 1, officeTier: r.office_tier || null, officeId: r.office_id || null,
    followedUpAt: r.followed_up_at || null, followedUpBy: r.followed_up_by || null, followUpNote: r.follow_up_note || "",
  });
}

// { count, needed, average, word, byAnswer } -- average/word only from
// MIN_FOR_AVERAGE ratings.
export function summarise(scores) {
  const list = (scores || []).map(Number).filter((n) => n >= 1 && n <= 5);
  const byAnswer = {};
  for (const s of SCALE) byAnswer[s.key] = 0;
  for (const n of list) byAnswer[keyOf(n)]++;
  const out = { count: list.length, needed: MIN_FOR_AVERAGE, average: null, word: null, byAnswer };
  if (list.length >= MIN_FOR_AVERAGE) {
    const avg = list.reduce((a, b) => a + b, 0) / list.length;
    out.average = Math.round(avg * 10) / 10;
    out.word = keyOf(Math.min(5, Math.max(1, Math.round(avg))));
  }
  return out;
}
