/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/assisted.js   (grieviq-88, owner approved 12 Nov 2026)
//
// GrievIQ-assisted wards: a pilot in wards whose councillor's office has not
// joined GrievIQ (storage: dev-tests/part57-assisted.sql).
//
//   Filing   open only between the pilot's first and last filing day (India
//            time) and up to its daily limit (all its wards together). The
//            citizen is told first that GrievIQ's team, not the office,
//            sends it on and follows it up, with no promise of a fix.
//   Staff    forward each complaint to the councillor's office and the
//            department: an email from GrievIQ to the office's OFFICIAL
//            public address with a private reply link (30 days), or the
//            office's GrievIQ console for a department that has joined, or
//            a letter, call or visit that staff record. Offices never get
//            the citizen's name, phone or email (DPDP Act 2023, s.8(4)
//            minimisation). Follow-ups are due 3, 7 and 14 days after the
//            first forwarding, then weekly. Each step records staff minutes,
//            so the pilot shows how much staff time a complaint needs.
//   Clock    an assisted case never moves up the chain on its own: the
//            offices above haven't been asked to take part (escalation.js).
//   Handover when the ward's office joins, staff hand its open cases over:
//            they move to the office's console with fresh time limits, and
//            the citizen is told.
//   Report   a private link (30 days) to the office's own ward figures:
//            counts by type only, counts 1-9 shown as "<10", a median only
//            from 10 or more cases, no citizen details. Same report for
//            every office, whatever its party; never another ward's figures.

import { maskPersonal } from "./misuse.js";

const DAY = 86400000;
export const FOLLOWUP_DAYS = [3, 7, 14];   // then every 7 days
export const LINK_DAYS = 30;
export const LINK_MAX_REPLIES = 10;
export const REPORT_DAYS = 30;
export const PILOT_MAX_DAYS = 120;
export const CAP_MIN = 1, CAP_MAX = 200;
export const MINUTES_MAX = 240;
export const TEXT_MIN = 10, TEXT_MAX = 1000;
export const REPLY_KINDS = ["PLANNED", "IN_PROGRESS", "DONE", "NOT_OURS", "CANT_DO", "OTHER"];
export const RECORD_CHANNELS = ["LETTER", "CALL", "VISIT"];
const OPEN = ["OPEN", "ACKNOWLEDGED"];

export function toMs(v) {
  const s = String(v || "");
  if (!s) return NaN;
  return s.indexOf("T") !== -1 ? new Date(s).getTime() : new Date(s.replace(" ", "T") + "Z").getTime();
}
// "YYYY-MM-DD" in India time.
export function istDay(ms) { return new Date((ms == null ? Date.now() : ms) + 5.5 * 3600000).toISOString().slice(0, 10); }
// The first moment of an India-time day, as an ISO string (UTC).
export function istDayStartIso(day) { return new Date(Date.parse(day + "T00:00:00+05:30")).toISOString(); }
// Times are stored in two shapes ("YYYY-MM-DD HH:MM:SS" and ISO with T/Z);
// compare them in one shape: SQL expression for a column, and the bound value.
export const at = (col) => `REPLACE(REPLACE(${col}, 'T', ' '), 'Z', '')`;
export const atVal = (iso) => String(iso).replace("T", " ").replace("Z", "");
export function validDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s; }
export function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY); }

export async function assistedReady(env) {
  try { await env.DB.prepare("SELECT id FROM assisted_pilots LIMIT 1").first(); return true; }
  catch (e) { if (/no such table/i.test(String(e && e.message))) return false; throw e; }
}

// Is this case being handled by GrievIQ staff (assisted, not yet handed over)?
export function isAssisted(g) { return !!(g && g.assisted_pilot && !g.assisted_handed_at); }

// The pilot's filing state today: BEFORE / OPEN / AFTER / STOPPED.
export function filingState(pilot, nowMs) {
  if (!pilot) return "NONE";
  if (pilot.stopped_at) return "STOPPED";
  const d = istDay(nowMs);
  if (d < pilot.starts_on) return "BEFORE";
  if (d > pilot.ends_on) return "AFTER";
  return "OPEN";
}

// The ward's place in a pilot (not removed), or null.
export async function wardPilot(env, unitId) {
  if (!unitId) return null;
  try {
    return await env.DB.prepare(
      `SELECT w.id AS ward_row, w.unit_id, w.office_email, w.email_source, p.*
       FROM assisted_wards w JOIN assisted_pilots p ON p.id = w.pilot_id
       WHERE w.unit_id = ? AND w.removed_at IS NULL ORDER BY w.added_at DESC LIMIT 1`
    ).bind(String(unitId)).first();
  } catch (e) { if (/no such table/i.test(String(e && e.message))) return null; throw e; }
}

// New complaints filed today in this pilot (India time).
export async function todayCount(env, pilotId, nowMs) {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM grievances WHERE assisted_pilot = ? AND ${at("created_at")} >= ?`)
    .bind(pilotId, atVal(istDayStartIso(istDay(nowMs)))).first();
  return Number(r && r.n) || 0;
}

// For a ward whose office hasn't joined: can citizens file here through
// GrievIQ's team now? null when the ward is in no pilot.
// { pilotId, state, open, full, cap, today }
export async function assistedFiling(env, unitId, nowMs) {
  const p = await wardPilot(env, unitId);
  if (!p) return null;
  const state = filingState(p, nowMs);
  const out = { pilotId: p.id, state, open: state === "OPEN", full: false, cap: p.daily_cap, today: 0, startsOn: p.starts_on, endsOn: p.ends_on };
  if (out.open) {
    out.today = await todayCount(env, p.id, nowMs);
    out.full = out.today >= Number(p.daily_cap || 0);
  }
  return out;
}

// Assisted filing for many wards at once (form lists): Map(unitId -> state).
export async function assistedFilingMap(env, nowMs) {
  const out = new Map();
  if (!(await assistedReady(env))) return out;
  const { results } = await env.DB.prepare(
    `SELECT w.unit_id, p.* FROM assisted_wards w JOIN assisted_pilots p ON p.id = w.pilot_id WHERE w.removed_at IS NULL`
  ).all();
  const counts = new Map();
  for (const p of results || []) {
    const state = filingState(p, nowMs);
    if (state !== "OPEN") continue;
    if (!counts.has(p.id)) counts.set(p.id, await todayCount(env, p.id, nowMs));
    out.set(p.unit_id, { pilotId: p.id, open: true, full: counts.get(p.id) >= Number(p.daily_cap || 0) });
  }
  return out;
}

// ---- Steps and follow-ups -------------------------------------------------

export async function loadSteps(env, ids) {
  const out = new Map();
  if (!ids || !ids.length) return out;
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM assisted_steps WHERE grievance_id IN (SELECT value FROM json_each(?)) ORDER BY created_at ASC, rowid ASC"
    ).bind(JSON.stringify(ids)).all();
    for (const r of results || []) {
      if (!out.has(r.grievance_id)) out.set(r.grievance_id, []);
      out.get(r.grievance_id).push(r);
    }
  } catch (e) { if (!/no such table/i.test(String(e && e.message))) throw e; }
  return out;
}

export async function addStep(env, row) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO assisted_steps (id, grievance_id, kind, target, target_name, channel, reply_kind, expected_by, text, replied_by, minutes, dept_step_id, by_email, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, row.grievanceId, row.kind, row.target || null, row.targetName || null, row.channel || null, row.replyKind || null,
    row.expectedBy || null, row.text || null, row.repliedBy || null, row.minutes != null ? row.minutes : null, row.deptStepId || null,
    row.byEmail || null, row.at || new Date().toISOString()).run();
  return id;
}

// When the next follow-up is due (ms), or null (not forwarded, or closed).
export function nextFollowUp(g, steps) {
  if (!g || !OPEN.includes(g.status) || !isAssisted(g)) return null;
  const fw = (steps || []).filter((s) => s.kind === "FORWARD");
  if (!fw.length) return null;
  const first = toMs(fw[0].created_at);
  const fu = (steps || []).filter((s) => s.kind === "FOLLOWUP");
  const last = fu.length ? toMs(fu[fu.length - 1].created_at) : first;
  const marks = FOLLOWUP_DAYS.map((d) => first + d * DAY);
  let m = marks[marks.length - 1];
  while (m <= last) m += 7 * DAY;
  const next = marks.find((x) => x > last);
  return next != null ? next : m;
}

// What staff need to do on a case: NEW / REPLY / DUE / WAITING / JOINED / DONE.
export function caseState(g, steps, officeJoined, nowMs) {
  const now = nowMs || Date.now();
  if (!OPEN.includes(g.status)) return "DONE";
  if (g.assisted_handed_at) return "HANDED";
  if (officeJoined) return "JOINED";
  if (!(steps || []).some((s) => s.kind === "FORWARD")) return "NEW";
  // A reply came through a link after staff last acted.
  const lastStaff = [...(steps || [])].reverse().find((s) => s.by_email);
  const lastLinkReply = [...(steps || [])].reverse().find((s) => s.kind === "REPLY" && s.channel === "LINK");
  if (lastLinkReply && (!lastStaff || toMs(lastLinkReply.created_at) > toMs(lastStaff.created_at))) return "REPLY";
  const due = nextFollowUp(g, steps);
  if (due != null && now >= due) return "DUE";
  return "WAITING";
}

export function totalMinutes(steps) { return (steps || []).reduce((n, s) => n + (Number(s.minutes) || 0), 0); }

// The citizen's view: who did what, and what offices said (personal details
// masked). The department forwarding made through the department dashboard
// is shown by the department steps already, so it isn't repeated here.
export function shapeStepsForCitizen(steps) {
  return (steps || []).filter((s) => s.kind !== "NOTE" && !(s.kind === "FORWARD" && s.dept_step_id)).map((s) => ({
    kind: s.kind, target: s.target || null, targetName: s.target_name || null, replyKind: s.reply_kind || null,
    expectedBy: s.expected_by || null, text: s.kind === "REPLY" && s.text ? maskPersonal(s.text) : null, at: s.created_at,
  }));
}
// The office's view after handover: the same, without staff names.
export const shapeStepsForOffice = shapeStepsForCitizen;

// ---- Private links (reply links and area reports) -------------------------

export function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function tokenHash(t) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("grieviq-assisted:" + String(t || ""))));
  return Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function validToken(t) { return /^[A-Za-z0-9_-]{40,60}$/.test(String(t || "")); }

// The reply link row for a token, if it can still be used (or why not).
export async function linkFor(env, token, nowMs) {
  if (!validToken(token)) return { ok: false, code: "NOT_FOUND" };
  const row = await env.DB.prepare("SELECT * FROM assisted_links WHERE token_hash = ?").bind(await tokenHash(token)).first();
  if (!row) return { ok: false, code: "NOT_FOUND" };
  if (row.revoked_at) return { ok: false, code: "REVOKED" };
  if ((nowMs || Date.now()) > toMs(row.expires_at)) return { ok: false, code: "EXPIRED" };
  return { ok: true, row };
}

// ---- The office's area report ------------------------------------------------

export function small(n) { n = Number(n) || 0; return n > 0 && n < 10 ? "<10" : String(n); }

// Figures for one ward between two India-time days (inclusive). Counts only.
export async function areaReport(env, unitId, from, to, nowMs) {
  const unit = await env.DB.prepare("SELECT id, name FROM local_units WHERE id = ?").bind(unitId).first();
  if (!unit) return null;
  const startIso = istDayStartIso(from);
  const endIso = istDayStartIso(new Date(Date.parse(to + "T00:00:00Z") + DAY).toISOString().slice(0, 10));
  const { results } = await env.DB.prepare(
    `SELECT g.id, g.status, g.closure_kind, g.resolved_at, g.created_at, c.id AS cat_id, c.name AS cat
     FROM grievances g JOIN grievance_categories c ON c.id = g.category_id
     WHERE g.local_unit_id = ? AND ${at("g.created_at")} >= ? AND ${at("g.created_at")} < ?
       AND COALESCE(g.closure_kind, '') <> 'NOT_GENUINE'`
  ).bind(unitId, atVal(startIso), atVal(endIso)).all();
  const rows = results || [];
  const steps = await loadSteps(env, rows.map((r) => r.id));
  const now = nowMs || Date.now();
  const byCat = new Map();
  let open = 0, fixed = 0, forwarded = 0, replied = 0, oldest = 0;
  const firstReply = [];
  for (const r of rows) {
    const k = r.cat || "Other";
    if (!byCat.has(k)) byCat.set(k, { id: r.cat_id, filed: 0, open: 0, fixed: 0 });
    const b = byCat.get(k);
    b.filed++;
    const isOpen = OPEN.includes(r.status);
    const isFixed = !!r.resolved_at && r.closure_kind !== "NO_INFO" && !isOpen;
    if (isOpen) { b.open++; open++; oldest = Math.max(oldest, Math.floor((now - toMs(r.created_at)) / DAY)); }
    if (isFixed) { b.fixed++; fixed++; }
    const s = steps.get(r.id) || [];
    const fw = s.find((x) => x.kind === "FORWARD");
    const rp = s.find((x) => x.kind === "REPLY");
    if (fw) forwarded++;
    if (rp) replied++;
    if (fw && rp) firstReply.push((toMs(rp.created_at) - toMs(fw.created_at)) / DAY);
  }
  // Types with fewer than 10 complaints go together as "Other types".
  const types = [], other = { name: null, filed: 0, open: 0, fixed: 0 };
  for (const [name, b] of Array.from(byCat.entries()).sort((a, b) => b[1].filed - a[1].filed || a[0].localeCompare(b[0]))) {
    if (b.filed >= 10) types.push(Object.assign({ name }, b));
    else { other.filed += b.filed; other.open += b.open; other.fixed += b.fixed; }
  }
  if (other.filed) types.push(other);
  firstReply.sort((a, b) => a - b);
  const median = firstReply.length >= 10
    ? Math.round((firstReply.length % 2 ? firstReply[(firstReply.length - 1) / 2] : (firstReply[firstReply.length / 2 - 1] + firstReply[firstReply.length / 2]) / 2) * 10) / 10
    : null;
  const shown = (b) => ({ filed: small(b.filed), open: small(b.open), fixed: small(b.fixed) });
  return {
    ward: unit.name, from, to,
    total: shown({ filed: rows.length, open, fixed }),
    forwarded: small(forwarded), replied: small(replied),
    types: types.map((t) => Object.assign({ name: t.name, id: t.id || null }, shown(t))),
    medianReplyDays: median, oldestOpenDays: open ? oldest : null,
    madeAt: new Date(now).toISOString(),
  };
}
