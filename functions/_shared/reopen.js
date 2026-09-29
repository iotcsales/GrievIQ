// functions/_shared/reopen.js
//
// Reopening a resolved case (item 7d, approved Sept 2026).
//
// Modelled on the appeal in the Government of India's CPGRAMS portal: a
// citizen unhappy with how a grievance was closed can appeal once, within
// 30 days of closure, and the appeal goes to a more senior officer (ISO
// 10002 likewise sends an unresolved complaint to a higher level).
//
//   - Who: the citizen, from the status page after the email code; or, for
//     a citizen who gave no email, a Super admin or Operations admin on
//     their behalf (a reason is required, logged).
//   - When: the case is RESOLVED/CLOSED and closed no more than REOPEN_DAYS
//     ago. Once per case (REOPEN_LIMIT): after that, disagreement goes to
//     GrievIQ staff through Exceptions.
//   - Why: one of REOPEN_REASONS and a short note (required).
//   - Where it goes: one level above the level that resolved it, with a
//     fresh clock from the moment of reopening (escalation.js clockStart);
//     it escalates from there as usual. At the top level it stays there on a
//     fresh clock and shows in Exceptions straight away. Lower levels keep
//     seeing it (visibility is additive).
//   - A new acknowledgement is needed from the level now responsible
//     (acknowledged_at is cleared; the earlier one stays in the history).
//   - Photo deletion pauses automatically: the case is no longer closed.
//
// Recorded in grievance_reopens (who, when, why, from which level to which),
// which the admin case history reads alongside grievance_events.

import { toUtcMs } from "./time-limits.js";
import { CONFIRM_DAYS } from "./confirmation.js";

export const REOPEN_DAYS = 30;
export const REOPEN_LIMIT = 1;
export const REOPEN_REASONS = ["NOT_FIXED", "PARTIALLY_FIXED", "CAME_BACK", "WRONG_ISSUE", "OTHER"];
export const REOPEN_NOTE_MIN = 10;
export const REOPEN_NOTE_MAX = 500;
export const STAFF_REASON_MIN = 10;

const DAY = 86400000;

// When the case finally closed (ms). closed_at from item 7d; for cases
// closed before that, the best date available: the citizen's confirmation,
// else the end of the waiting time after "marked resolved", else the last
// update.
export function closedAtMs(g) {
  if (!g) return NaN;
  if (g.closed_at) return toUtcMs(g.closed_at);
  if (g.citizen_confirmed_at) return toUtcMs(g.citizen_confirmed_at);
  if (g.resolved_at) return toUtcMs(g.resolved_at) + CONFIRM_DAYS * DAY;
  return toUtcMs(g.updated_at || g.created_at);
}

function isClosed(g) { return !!g && (g.status === "RESOLVED" || g.status === "CLOSED"); }

// { can, code, until } -- code: OK | NOT_CLOSED | ALREADY_REOPENED | TOO_LATE
export function reopenStatus(g, nowMs) {
  if (!isClosed(g)) return { can: false, code: "NOT_CLOSED", until: null };
  if (Number(g.reopen_count || 0) >= REOPEN_LIMIT) return { can: false, code: "ALREADY_REOPENED", until: null };
  const closed = closedAtMs(g);
  if (isNaN(closed)) return { can: false, code: "TOO_LATE", until: null };
  const until = closed + REOPEN_DAYS * DAY;
  if ((nowMs || Date.now()) > until) return { can: false, code: "TOO_LATE", until: new Date(until).toISOString() };
  return { can: true, code: "OK", until: new Date(until).toISOString() };
}

// Checks the citizen's or staff member's input. Returns { reason, note }
// or { error, field, fields } (fields: every problem, for errors shown next
// to each field).
export function readReopenInput(reasonIn, noteIn) {
  const reason = String(reasonIn || "").toUpperCase();
  const note = String(noteIn || "").trim();
  const fields = {};
  if (!REOPEN_REASONS.includes(reason)) fields.reason = "REASON";
  if (note.length < REOPEN_NOTE_MIN || note.length > REOPEN_NOTE_MAX) fields.note = "NOTE_LENGTH";
  if (fields.reason) return { error: "Choose why you are reopening this case.", field: "reason", fields };
  if (fields.note) return { error: "Say what is still wrong, in 10 to 500 characters.", field: "note", fields };
  return { reason, note };
}

// Reopens the case. chain = resolveChain() result. who = { actor: "citizen" |
// "staff", staffEmail, staffReason }. Returns { ok, fromTier, toTier,
// toLabel, atTop } or { ok: false, code }.
export async function reopenCase(env, g, chain, input, who) {
  const tiers = chain.tiers;
  const last = tiers.length - 1;
  const fromIdx = Math.max(0, tiers.findIndex((t) => t.tier === g.current_tier));
  const toIdx = Math.min(fromIdx + 1, last);
  const fromTier = tiers[fromIdx].tier, toTier = tiers[toIdx].tier;
  const now = new Date().toISOString();

  // Only if it is still closed and not reopened before (safe against two
  // clicks or two staff at once).
  const res = await env.DB.prepare(
    `UPDATE grievances
     SET status = 'OPEN', resolved_at = NULL, closed_at = NULL, closure_kind = NULL,
         citizen_confirmed = 0, acknowledged_at = NULL,
         reopened_at = ?, reopen_start_tier = ?, current_tier = ?,
         reopen_count = COALESCE(reopen_count, 0) + 1, updated_at = ?
     WHERE id = ? AND status IN ('RESOLVED', 'CLOSED') AND COALESCE(reopen_count, 0) < ?`
  ).bind(now, toTier, toTier, now, g.id, REOPEN_LIMIT).run();
  if (res && res.meta && res.meta.changes === 0) return { ok: false, code: "NOT_REOPENABLE" };

  const staff = who.actor === "staff";
  // The reopening is recorded here only: grievance_events has a fixed list
  // of event types (a CHECK constraint that SQLite can't change without
  // rebuilding the table), so pages read reopenings from this table.
  await env.DB.prepare(
    `INSERT INTO grievance_reopens
       (id, grievance_id, reopened_at, closed_at_before, reason, note, actor, staff_email, staff_reason, from_tier, to_tier)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), g.id, now, g.closed_at || null, input.reason, input.note,
    staff ? "staff" : "citizen", staff ? who.staffEmail : null, staff ? who.staffReason : null, fromTier, toTier).run();
  return { ok: true, fromTier, toTier, toLabel: tiers[toIdx].label, atTop: fromIdx === last, at: now };
}

// The latest reopening of each case, for pages: { at, reason, note, by,
// fromTier, toTier }.
export function shapeReopen(row, audience) {
  if (!row) return null;
  return {
    at: row.reopened_at,
    reason: row.reason,
    note: row.note,
    by: row.actor,
    staffEmail: audience === "staff" ? row.staff_email || null : null,
    staffReason: audience === "staff" ? row.staff_reason || null : null,
    fromTier: row.from_tier,
    toTier: row.to_tier,
  };
}

export async function loadReopen(env, grievanceId) {
  return env.DB.prepare(
    "SELECT * FROM grievance_reopens WHERE grievance_id = ? ORDER BY reopened_at DESC, rowid DESC LIMIT 1"
  ).bind(grievanceId).first();
}
