/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/followups.js   (grieviq-65)
//
// Follow-up requests between government officials (design approved by the
// owner, 24 Oct 2026). A request starts from one figure on the government
// dashboard ("38 pending over 30 days"), carries a short note, the official
// letter or eOffice number if an order was issued, and a reply-by date; the
// people at the other end acknowledge it and reply with the action taken;
// on the reply-by date the same figure is measured again.
//
//   down     national -> a state; state -> a district in it or a department
//            office in it; district -> a department office in it
//   up       district -> its state; state -> national ("raise an issue")
//   never    representatives' offices, citizens, another state
//
// It is NOT an order: orders go through NIC email or eOffice (Government of
// India e-mail policy, cl. 2.1). So: no attachments, no links, no citizen
// details (phone numbers, emails and complaint numbers are refused), only a
// letter number pointing to the official record. Switched on per state by a
// super admin on the state's letter ('*' = national requests, on a
// ministry's letter). Every step is in followup_events, which can't be
// changed (part41 triggers). Alerts and emails carry no content.

import { govStats, istMonth } from "./gov-stats.js";
import { addDays, istToday, realDate } from "./gov.js";
import { usable } from "./gov-auth.js";
import { createNotices, queueEmail, flushOutbox, KIND } from "./notify.js";
import { officerRecipient } from "./dept-auth.js";

export const PLACE_FIGURES = ["OVER30", "PENDING", "WITHIN", "RECEIVED"];
export const DEPT_FIGURES = ["LATE_NOW", "WITH_NOW", "ON_TIME", "FIXED_FIRST"];
export const DAYS = [7, 15, 30];
export const DEFAULT_DAYS = 15;
export const NOTE_MIN = 20, NOTE_MAX = 1000, REASON_MIN = 10, REASON_MAX = 500;
export const OPEN_MAX = 20;           // open requests one official may have at a time
export const REMIND_DAYS = 2;         // the reminder, this many days before the reply-by date
export const KEEP_YEARS = 3;          // after closing (events: part41 trigger)
const LIVE = ["OPEN", "ACKNOWLEDGED", "REPLIED", "OVERDUE"];
const REF_RE = /^[\p{L}\p{M}0-9 .,\/()&:#\-]{3,80}$/u;

const now = () => new Date().toISOString();
function missing(e) { return /no such (table|column)/i.test(String(e && e.message)); }
export async function followupsReady(env) {
  try { await env.DB.prepare("SELECT id FROM followups LIMIT 1").first(); await env.DB.prepare("SELECT state_id FROM gov_followup_settings LIMIT 1").first(); return true; }
  catch (e) { if (missing(e)) return false; throw e; }
}

// ---------------------------------------------------------------- text checks
// A note or reply: plain words about the figure and the action taken. No
// phone numbers, email addresses, complaint numbers or links.
export function textProblem(v, min, max) {
  const s = clean(v, max);
  if (s.length < min) return "TOO_SHORT";
  if (s.length > max) return "TOO_LONG";
  if (/https?:\/\/|www\.|\.(com|in|org|net|gov)\b\//i.test(s)) return "NO_LINKS";
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(s)) return "NO_CONTACTS";
  if (/(\+?91[\s-]?)?[6-9](\D?\d){9}\b/.test(s) || /\d{10,}/.test(s.replace(/[\s-]/g, ""))) return "NO_CONTACTS";
  if (/\bGRV[\s-]?[A-Z0-9]{3,}/i.test(s)) return "NO_CASES";
  return null;
}
export function clean(v, max) {
  return String(v == null ? "" : v).normalize("NFC").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, (max || 1000) + 1);
}

// ---------------------------------------------------------------- settings
export async function enabledFor(env, stateId) {
  const r = await env.DB.prepare("SELECT enabled FROM gov_followup_settings WHERE state_id = ?").bind(String(stateId)).first();
  return !!(r && Number(r.enabled) === 1);
}
export async function settingsList(env) {
  return ((await env.DB.prepare("SELECT * FROM gov_followup_settings ORDER BY state_id").all()).results || [])
    .map((r) => ({ stateId: r.state_id, on: Number(r.enabled) === 1, letterRef: r.letter_ref, by: r.changed_by, at: r.changed_at }));
}

// ---------------------------------------------------------------- places
async function stateRow(env, id) { return id ? env.DB.prepare("SELECT * FROM states WHERE id = ? AND demo = 0").bind(String(id)).first() : null; }
async function districtRow(env, id) { return id ? env.DB.prepare("SELECT * FROM districts WHERE id = ?").bind(String(id)).first() : null; }
// A department office on the department dashboard, with where it is.
export async function officeRow(env, id) {
  if (!id) return null;
  const o = await env.DB.prepare(
    `SELECT d.id, d.name_en, d.name_hi, d.area_id, d.retired_at, a.state AS state_name, a.district_id,
            (SELECT s.id FROM states s WHERE s.name_en = a.state AND s.demo = 0) AS state_id
       FROM dept_offices d JOIN areas a ON a.id = d.area_id WHERE d.id = ?`
  ).bind(String(id)).first();
  return o && !o.retired_at ? o : null;
}
// Officers who would get a request sent to the office (signed agreement, active).
export async function officeOfficers(env, officeId) {
  try {
    return (await env.DB.prepare(
      `SELECT o.id, o.email, o.name FROM dept_officers o
         JOIN dept_offices d ON d.id = o.office_id AND d.retired_at IS NULL
         JOIN dept_agreements a ON a.office_id = o.office_id AND a.ended_at IS NULL
        WHERE o.status = 'ACTIVE' AND o.office_id = ?`
    ).bind(String(officeId)).all()).results || [];
  } catch (e) { return []; }
}
// Officials who may use the dashboard at a place (level + state/district).
export async function placeOfficials(env, level, stateId, districtId) {
  let sql = "SELECT * FROM gov_users WHERE status = 'ACTIVE' AND level = ?", b = [level];
  if (level === "STATE") { sql += " AND state_id = ?"; b.push(String(stateId)); }
  if (level === "DISTRICT") { sql += " AND district_id = ?"; b.push(String(districtId)); }
  const today = istToday();
  return ((await env.DB.prepare(sql).bind(...b).all()).results || []).filter((u) => usable(u, today));
}
function placeName(st, d) { return d ? d.name_en : st ? st.name_en : "India"; }
function placeLabel(level, st, d) { return level === "NATIONAL" ? "national" : level === "STATE" ? "state:" + (st ? st.id : "") : "district:" + (d ? d.id : ""); }

// Which side of a request an official or officer is on.
export function senderSide(u, f) {
  return f.from_level === u.level && (u.level === "NATIONAL" || f.from_state_id === u.state_id) && (u.level !== "DISTRICT" || f.from_district_id === u.district_id);
}
export function recipientSide(u, f) {
  return f.to_kind === u.level && (u.level === "NATIONAL" || f.to_state_id === u.state_id) && (u.level !== "DISTRICT" || f.to_district_id === u.district_id);
}
export function officeSide(officer, f) { return f.to_kind === "DEPT" && String(f.to_office_id) === String(officer.office_id); }

// What an official may send now: { on, down: [...], up: {...} | null, subjects: [...] }
export async function sendOptions(env, u) {
  const out = { on: false, down: [], up: null, offices: [] };
  if (u.level === "NATIONAL") {
    if (!(await enabledFor(env, "*"))) return out;
    out.on = true;
    const states = (await env.DB.prepare("SELECT s.* FROM states s JOIN gov_followup_settings f ON f.state_id = s.id AND f.enabled = 1 WHERE s.demo = 0 ORDER BY s.name_en").all()).results || [];
    for (const s of states) if ((await placeOfficials(env, "STATE", s.id)).length) out.down.push({ kind: "STATE", id: s.id, nameEn: s.name_en, nameHi: s.name_hi });
    return out;
  }
  if (!u.state_id || !(await enabledFor(env, u.state_id))) return out;
  out.on = true;
  const st = await stateRow(env, u.state_id);
  if (!st) return out;
  if (u.level === "STATE") {
    const ds = (await env.DB.prepare("SELECT * FROM districts WHERE state_id = ? ORDER BY name_en").bind(st.id).all()).results || [];
    for (const d of ds) if ((await placeOfficials(env, "DISTRICT", st.id, d.id)).length) out.down.push({ kind: "DISTRICT", id: d.id, nameEn: d.name_en, nameHi: d.name_hi });
    if ((await enabledFor(env, "*")) && (await placeOfficials(env, "NATIONAL")).length) out.up = { kind: "NATIONAL", nameEn: "National (Union ministry)", nameHi: "राष्ट्रीय (केंद्रीय मंत्रालय)" };
  } else {
    if ((await placeOfficials(env, "STATE", st.id)).length) out.up = { kind: "STATE", id: st.id, nameEn: st.name_en, nameHi: st.name_hi };
  }
  // Department offices on the dashboard in the official's state or district.
  const offs = (await env.DB.prepare(
    `SELECT d.id, d.name_en, d.name_hi, a.district_id FROM dept_offices d JOIN areas a ON a.id = d.area_id
      WHERE d.retired_at IS NULL AND a.state = ? ${u.level === "DISTRICT" ? "AND a.district_id = ?" : ""} ORDER BY d.name_en`
  ).bind(...(u.level === "DISTRICT" ? [st.name_en, String(u.district_id)] : [st.name_en])).all()).results || [];
  for (const o of offs) if ((await officeOfficers(env, o.id)).length) out.offices.push({ kind: "DEPT", id: o.id, nameEn: o.name_en, nameHi: o.name_hi });
  if (u.level === "STATE" || u.level === "DISTRICT") out.down = out.down.concat(out.offices);
  return out;
}

// ---------------------------------------------------------------- figures
// subject: { kind: STATE|DISTRICT|DEPT, state, district, office }
export async function measureFigure(env, subject, figure, nowMs) {
  const t = nowMs || Date.now(), month = istMonth(t);
  const base = { figure, month, at: new Date(t).toISOString(), subject: { kind: subject.kind, nameEn: subject.nameEn, nameHi: subject.nameHi || null, officeId: subject.office ? subject.office.id : null } };
  if (subject.kind === "DEPT") {
    if (!DEPT_FIGURES.includes(figure)) return null;
    const scope = { state: subject.state, district: subject.district || null, deptKey: "id:" + subject.office.id };
    const data = subject.state ? await govStats(env, scope, month, t) : null;
    const d = data && data.dept;
    const pick = { LATE_NOW: [d ? d.overdueNow : 0, "count"], WITH_NOW: [d ? d.withNow : 0, "count"], ON_TIME: [d ? d.onTime : null, "percent"], FIXED_FIRST: [d ? d.fixedFirst : null, "percent"] }[figure];
    return Object.assign(base, { value: pick[0] == null ? null : pick[0], unit: pick[1] });
  }
  if (!PLACE_FIGURES.includes(figure)) return null;
  const data = await govStats(env, { state: subject.state || null, district: subject.district || null }, month, t, { raw: true });
  const ti = data.tiles;
  if (figure === "OVER30") {
    const pend = data.raw.all.filter((f) => f.pending);
    const oldest = pend.length >= 10 ? Math.max(...pend.map((f) => f.ageDays)) : null;
    return Object.assign(base, { value: ti.over30, unit: "count", ages: ti.ages, oldest });
  }
  if (figure === "PENDING") return Object.assign(base, { value: ti.pending, unit: "count", ages: ti.ages });
  if (figure === "WITHIN") return Object.assign(base, { value: ti.within, unit: "percent" });
  return Object.assign(base, { value: ti.received, unit: "count", resolved: ti.resolved });
}

// ---------------------------------------------------------------- reading
function evData(v) { try { return v ? JSON.parse(v) : null; } catch (e) { return null; } }
export function out(f, events, side) {
  let snap = {}, res = null;
  try { snap = JSON.parse(f.snapshot); } catch (e) { /* keep empty */ }
  try { res = f.result ? JSON.parse(f.result) : null; } catch (e) { res = null; }
  return {
    id: f.id, ref: f.ref, direction: f.to_kind === "NATIONAL" || (f.to_kind === "STATE" && f.from_level === "DISTRICT") ? "UP" : "DOWN",
    from: { level: f.from_level, stateId: f.from_state_id, districtId: f.from_district_id },
    to: { kind: f.to_kind, stateId: f.to_state_id, districtId: f.to_district_id, officeId: f.to_office_id, name: f.to_name },
    figure: f.figure, snapshot: snap, snapshotAt: f.snapshot_at, result: res, measuredAt: f.measured_at,
    note: f.note, letterRef: f.letter_ref, letterDate: f.letter_date, replyBy: f.reply_by,
    status: f.status, wasOverdue: !!Number(f.was_overdue), closedAs: f.closed_as, closedReason: f.closed_reason, closedAt: f.closed_at,
    follows: f.follows, createdAt: f.created_at, updatedAt: f.updated_at,
    side: side || null,
    events: events ? events.map((e) => ({ at: e.at, kind: e.kind, by: e.by_name, byPlace: e.by_place, byKind: e.by_kind, text: e.text, letterRef: e.letter_ref, data: evData(e.data) })) : undefined,
  };
}
// Names (English and Hindi) for both ends of each request, for the screens.
export async function withNames(env, items) {
  const ids = { s: new Set(), d: new Set(), o: new Set() };
  for (const x of items) {
    if (x.from.stateId) ids.s.add(String(x.from.stateId));
    if (x.from.districtId) ids.d.add(String(x.from.districtId));
    if (x.to.stateId) ids.s.add(String(x.to.stateId));
    if (x.to.districtId) ids.d.add(String(x.to.districtId));
    if (x.to.officeId) ids.o.add(String(x.to.officeId));
  }
  const look = async (table, set) => {
    const m = new Map(), all = Array.from(set);
    for (let i = 0; i < all.length; i += 80) {
      const part = all.slice(i, i + 80);
      const rows = (await env.DB.prepare(`SELECT id, name_en, name_hi FROM ${table} WHERE id IN (${part.map(() => "?").join(",")})`).bind(...part).all()).results || [];
      for (const r of rows) m.set(String(r.id), r);
    }
    return m;
  };
  const S = await look("states", ids.s), D = await look("districts", ids.d), O = await look("dept_offices", ids.o);
  const pick = (r) => (r ? { nameEn: r.name_en, nameHi: r.name_hi || null } : null);
  for (const x of items) {
    const f = x.from.level === "NATIONAL" ? { nameEn: "National (Union ministry)", nameHi: "राष्ट्रीय (केंद्रीय मंत्रालय)" }
      : x.from.level === "DISTRICT" ? pick(D.get(String(x.from.districtId))) : pick(S.get(String(x.from.stateId)));
    x.from.nameEn = f ? f.nameEn : ""; x.from.nameHi = f ? f.nameHi : null;
    const t = x.to.kind === "NATIONAL" ? { nameEn: "National (Union ministry)", nameHi: "राष्ट्रीय (केंद्रीय मंत्रालय)" }
      : x.to.kind === "DEPT" ? pick(O.get(String(x.to.officeId))) : x.to.kind === "DISTRICT" ? pick(D.get(String(x.to.districtId))) : pick(S.get(String(x.to.stateId)));
    x.to.nameEn = t ? t.nameEn : x.to.name; x.to.nameHi = t ? t.nameHi : null;
  }
  return items;
}
export async function eventsOf(env, id) {
  return (await env.DB.prepare("SELECT * FROM followup_events WHERE followup_id = ? ORDER BY at, rowid").bind(id).all()).results || [];
}
export async function listForGov(env, u) {
  let sql, b;
  if (u.level === "NATIONAL") { sql = "from_level = 'NATIONAL' OR to_kind = 'NATIONAL'"; b = []; }
  else if (u.level === "STATE") { sql = "(from_level = 'STATE' AND from_state_id = ?) OR (to_kind = 'STATE' AND to_state_id = ?)"; b = [u.state_id, u.state_id]; }
  else { sql = "(from_level = 'DISTRICT' AND from_district_id = ?) OR (to_kind = 'DISTRICT' AND to_district_id = ?)"; b = [u.district_id, u.district_id]; }
  return (await env.DB.prepare(`SELECT * FROM followups WHERE ${sql} ORDER BY updated_at DESC LIMIT 300`).bind(...b).all()).results || [];
}
export async function listForOffice(env, officeId) {
  return (await env.DB.prepare("SELECT * FROM followups WHERE to_kind = 'DEPT' AND to_office_id = ? ORDER BY updated_at DESC LIMIT 300").bind(String(officeId)).all()).results || [];
}
export function counts(list, isRecipient) {
  const c = { open: 0, overdue: 0, replied: 0, waitingOnUs: 0, total: list.length };
  for (const f of list) {
    if (f.status === "CLOSED") continue;
    if (f.status === "OVERDUE") c.overdue++; else if (f.status === "REPLIED") c.replied++; else c.open++;
    if (isRecipient(f) && f.status !== "REPLIED") c.waitingOnUs++;
  }
  return c;
}

export async function addEvent(env, id, kind, by, text, letterRef, data) {
  await env.DB.prepare("INSERT INTO followup_events (id, followup_id, at, kind, by_kind, by_id, by_name, by_place, text, letter_ref, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), id, now(), kind, by ? by.kind : "SYSTEM", by ? by.id : null, by ? by.name : null, by ? by.place : null,
      text == null ? null : text, letterRef || null, data == null ? null : JSON.stringify(data)).run();
}
export function govActor(u, st, d) {
  return { kind: "GOV", id: u.id, name: u.name + (u.designation ? ", " + u.designation : ""), place: u.level === "NATIONAL" ? "National" : d ? d.name_en : st ? st.name_en : "" };
}
export function officerActor(o) {
  return { kind: "DEPT", id: o.id, name: o.name + (o.designation ? ", " + o.designation : ""), place: o.office_name_en || "" };
}

// ---------------------------------------------------------------- creating
// body: { toKind, toId, subject?: 'SELF'|'DEPT', subjectOfficeId?, figure, note, letterRef?, letterDate?, days }
export async function createFollowup(env, origin, u, body, opts) {
  const f = {};
  const st = u.state_id ? await stateRow(env, u.state_id) : null;
  const dist = u.district_id ? await districtRow(env, u.district_id) : null;
  if (u.level === "NATIONAL" ? !(await enabledFor(env, "*")) : !(st && (await enabledFor(env, st.id)))) return { status: 403, body: { error: "NOT_ON" } };
  const toKind = String(body.toKind || ""), toId = body.toId == null ? null : String(body.toId);
  let to = null, up = false;
  if (u.level === "NATIONAL" && toKind === "STATE") {
    const s = await stateRow(env, toId);
    if (s && (await enabledFor(env, s.id))) to = { kind: "STATE", state: s, district: null, name: s.name_en, nameHi: s.name_hi, people: await placeOfficials(env, "STATE", s.id) };
  } else if (u.level === "STATE" && toKind === "DISTRICT") {
    const d = await districtRow(env, toId);
    if (d && d.state_id === st.id) to = { kind: "DISTRICT", state: st, district: d, name: d.name_en, nameHi: d.name_hi, people: await placeOfficials(env, "DISTRICT", st.id, d.id) };
  } else if ((u.level === "STATE" || u.level === "DISTRICT") && toKind === "DEPT") {
    const o = await officeRow(env, toId);
    if (o && o.state_id === st.id && (u.level === "STATE" || String(o.district_id) === String(u.district_id))) {
      const od = o.district_id ? await districtRow(env, o.district_id) : null;
      to = { kind: "DEPT", state: st, district: od, office: o, name: o.name_en, nameHi: o.name_hi, officers: await officeOfficers(env, o.id) };
    }
  } else if (u.level === "STATE" && toKind === "NATIONAL") {
    if (await enabledFor(env, "*")) { to = { kind: "NATIONAL", state: null, district: null, name: "National", nameHi: "राष्ट्रीय", people: await placeOfficials(env, "NATIONAL") }; up = true; }
  } else if (u.level === "DISTRICT" && toKind === "STATE") {
    to = { kind: "STATE", state: st, district: null, name: st.name_en, nameHi: st.name_hi, people: await placeOfficials(env, "STATE", st.id) }; up = true;
  }
  if (!to) return { status: 403, body: { error: "NOT_ALLOWED" } };
  if (to.kind === "DEPT" ? !to.officers.length : !to.people.length) return { status: 409, body: { error: "NO_ONE" } };

  // The figure is about the recipient (down) or the sender's own place or a
  // department office in it (up).
  let subject;
  if (!up) subject = to.kind === "DEPT" ? { kind: "DEPT", state: to.state, district: to.district, office: to.office, nameEn: to.name, nameHi: to.nameHi }
    : { kind: to.kind, state: to.state, district: to.district, nameEn: to.name, nameHi: to.nameHi };
  else if (body.subject === "DEPT") {
    const o = await officeRow(env, body.subjectOfficeId);
    if (!o || o.state_id !== st.id || (u.level === "DISTRICT" && String(o.district_id) !== String(u.district_id))) f.subjectOfficeId = "NOT_ALLOWED";
    else subject = { kind: "DEPT", state: st, district: o.district_id ? await districtRow(env, o.district_id) : null, office: o, nameEn: o.name_en, nameHi: o.name_hi };
  } else subject = { kind: u.level, state: st, district: dist, nameEn: placeName(st, dist), nameHi: dist ? dist.name_hi : st.name_hi };

  const figure = String(body.figure || "");
  if (subject && !(subject.kind === "DEPT" ? DEPT_FIGURES : PLACE_FIGURES).includes(figure)) f.figure = "CHOOSE";
  // The form's preview: the figure as it stands now, nothing saved.
  if (opts && opts.preview) {
    if (Object.keys(f).length) return { status: 400, body: { error: "CHECK_FIELDS", fields: f } };
    return { status: 200, body: { snapshot: await measureFigure(env, subject, figure, opts.nowMs), to: { kind: to.kind, name: to.name, nameHi: to.nameHi }, up } };
  }
  const note = clean(body.note, NOTE_MAX), np = textProblem(note, NOTE_MIN, NOTE_MAX);
  if (np) f.note = np;
  const letterRef = clean(body.letterRef, 80), letterDate = String(body.letterDate || "").trim();
  if (letterRef && !REF_RE.test(letterRef)) f.letterRef = "FORMAT";
  if (letterDate && (!realDate(letterDate) || letterDate > istToday())) f.letterDate = "DATE";
  if (letterDate && !letterRef) f.letterRef = "REQUIRED";
  const days = Number(body.days || DEFAULT_DAYS);
  if (!DAYS.includes(days)) f.days = "CHOOSE";
  if (Object.keys(f).length) return { status: 400, body: { error: "CHECK_FIELDS", fields: f } };
  const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM followups WHERE from_user_id = ? AND status != 'CLOSED'").bind(u.id).first();
  if (open && open.n >= OPEN_MAX) return { status: 429, body: { error: "TOO_MANY_OPEN", max: OPEN_MAX } };

  const snap = await measureFigure(env, subject, figure, opts && opts.nowMs);
  const id = crypto.randomUUID(), t = now(), replyBy = addDays(istToday(), days);
  let ref = null;
  for (let i = 0; i < 3 && !ref; i++) {
    const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM followups").first();
    const tryRef = "GIQ-FU-" + String((c ? c.n : 0) + 1 + i).padStart(6, "0");
    try {
      await env.DB.prepare(
        `INSERT INTO followups (id, ref, from_level, from_state_id, from_district_id, from_user_id, to_kind, to_state_id, to_district_id, to_office_id, to_name,
           figure, snapshot, snapshot_at, note, letter_ref, letter_date, reply_by, status, follows, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`
      ).bind(id, tryRef, u.level, u.state_id || null, u.district_id || null, u.id, to.kind,
        to.kind === "NATIONAL" ? null : (to.state ? to.state.id : null), to.kind === "DISTRICT" ? to.district.id : (to.kind === "DEPT" && to.district ? to.district.id : null),
        to.kind === "DEPT" ? to.office.id : null, to.name, figure, JSON.stringify(snap), t, note, letterRef || null, letterDate || null, replyBy,
        (opts && opts.follows) || null, t, t).run();
      ref = tryRef;
    } catch (e) { if (!/UNIQUE/i.test(String(e && e.message))) throw e; }
  }
  if (!ref) return { status: 409, body: { error: "TRY_AGAIN" } };
  await addEvent(env, id, "CREATED", govActor(u, st, dist), note, letterRef, { replyBy, figure, follows: (opts && opts.follows) || null });
  await tellRecipients(env, origin, { id, ref, to_kind: to.kind, to_state_id: to.state ? to.state.id : null, to_district_id: to.district ? to.district.id : null, to_office_id: to.office ? to.office.id : null }, "NEW");
  return { status: 200, body: { ok: true, id, ref, replyBy } };
}

// ---------------------------------------------------------------- acting
export async function getFollowup(env, id) { return id ? env.DB.prepare("SELECT * FROM followups WHERE id = ?").bind(String(id)).first() : null; }

export async function acknowledge(env, origin, f, actor) {
  if (f.status === "CLOSED") return { status: 409, body: { error: "CLOSED" } };
  const done = await env.DB.prepare("SELECT 1 AS x FROM followup_events WHERE followup_id = ? AND kind = 'ACKNOWLEDGED' LIMIT 1").bind(f.id).first();
  if (done) return { status: 200, body: { ok: true, already: true } };
  await env.DB.prepare("UPDATE followups SET status = CASE WHEN status = 'OPEN' THEN 'ACKNOWLEDGED' ELSE status END, updated_at = ? WHERE id = ?").bind(now(), f.id).run();
  await addEvent(env, f.id, "ACKNOWLEDGED", actor, null, null, null);
  return { status: 200, body: { ok: true } };
}

export async function reply(env, origin, f, actor, body) {
  if (f.status === "CLOSED") return { status: 409, body: { error: "CLOSED" } };
  const text = clean(body.text, NOTE_MAX), p = textProblem(text, NOTE_MIN, NOTE_MAX), fields = {};
  if (p) fields.text = p;
  const letterRef = clean(body.letterRef, 80);
  if (letterRef && !REF_RE.test(letterRef)) fields.letterRef = "FORMAT";
  if (Object.keys(fields).length) return { status: 400, body: { error: "CHECK_FIELDS", fields } };
  const acked = await env.DB.prepare("SELECT 1 AS x FROM followup_events WHERE followup_id = ? AND kind = 'ACKNOWLEDGED' LIMIT 1").bind(f.id).first();
  if (!acked) await addEvent(env, f.id, "ACKNOWLEDGED", actor, null, null, { withReply: true });
  await env.DB.prepare("UPDATE followups SET status = 'REPLIED', updated_at = ? WHERE id = ?").bind(now(), f.id).run();
  await addEvent(env, f.id, "REPLIED", actor, text, letterRef, null);
  await tellSenders(env, origin, f, "REPLY");
  return { status: 200, body: { ok: true } };
}

export async function closeFollowup(env, origin, f, u, body, opts) {
  if (f.status === "CLOSED") return { status: 409, body: { error: "CLOSED" } };
  const as = String(body.as || ""), reason = clean(body.reason, REASON_MAX), fields = {};
  if (!["DONE", "NOT_RESOLVED"].includes(as)) fields.as = "CHOOSE";
  const rp = textProblem(reason, REASON_MIN, REASON_MAX);
  if (rp) fields.reason = rp;
  if (as === "NOT_RESOLVED" && body.again) {
    const np = textProblem(clean(body.note, NOTE_MAX), NOTE_MIN, NOTE_MAX);
    if (np) fields.note = np;
    if (!DAYS.includes(Number(body.days || DEFAULT_DAYS))) fields.days = "CHOOSE";
  }
  if (Object.keys(fields).length) return { status: 400, body: { error: "CHECK_FIELDS", fields } };
  const st = u.state_id ? await stateRow(env, u.state_id) : null, d = u.district_id ? await districtRow(env, u.district_id) : null;
  await env.DB.prepare("UPDATE followups SET status = 'CLOSED', closed_as = ?, closed_reason = ?, closed_by = ?, closed_at = ?, updated_at = ? WHERE id = ? AND status != 'CLOSED'")
    .bind(as, reason, u.id, now(), now(), f.id).run();
  await addEvent(env, f.id, "CLOSED", govActor(u, st, d), reason, null, { as });
  await tellRecipients(env, origin, f, "CLOSED");
  let again = null;
  if (as === "NOT_RESOLVED" && body.again) {
    const toId = f.to_kind === "DEPT" ? f.to_office_id : f.to_kind === "DISTRICT" ? f.to_district_id : f.to_state_id;
    let subject = "SELF", subjectOfficeId = null;
    try { const s = JSON.parse(f.snapshot).subject; if (s && s.kind === "DEPT") { subject = "DEPT"; subjectOfficeId = s.officeId || null; } } catch (e) { /* the place itself */ }
    const r = await createFollowup(env, origin, u, { toKind: f.to_kind, toId, subject, subjectOfficeId, figure: f.figure,
      note: body.note, letterRef: body.letterRef, letterDate: body.letterDate, days: body.days }, Object.assign({}, opts, { follows: f.id }));
    again = r.body;
  }
  return { status: 200, body: { ok: true, again } };
}

// The first time someone on the receiving side opens a request.
export async function markSeen(env, f, actor) {
  if (!actor || !actor.id) return;
  const seen = await env.DB.prepare("SELECT 1 AS x FROM followup_events WHERE followup_id = ? AND kind = 'SEEN' AND by_id = ? LIMIT 1").bind(f.id, actor.id).first();
  if (!seen) await addEvent(env, f.id, "SEEN", actor, null, null, null);
}

// ---------------------------------------------------------------- alerts (no content)
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
const WHAT = {
  NEW: ["A follow-up request is waiting for you on GrievIQ", "GrievIQ पर आपके लिए एक अनुवर्ती अनुरोध प्रतीक्षा में है"],
  REMIND: ["A follow-up request on GrievIQ is due for a reply soon", "GrievIQ पर एक अनुवर्ती अनुरोध का उत्तर जल्द देय है"],
  OVERDUE: ["A follow-up request on GrievIQ has passed its reply-by date", "GrievIQ पर एक अनुवर्ती अनुरोध की उत्तर-तिथि बीत गई है"],
  REPLY: ["Your follow-up request on GrievIQ has a reply", "GrievIQ पर आपके अनुवर्ती अनुरोध का उत्तर आया है"],
  RESULT: ["The figure on your follow-up request has been measured again", "आपके अनुवर्ती अनुरोध का आँकड़ा फिर से मापा गया है"],
  CLOSED: ["A follow-up request on GrievIQ was closed", "GrievIQ पर एक अनुवर्ती अनुरोध बंद किया गया"],
};
function mailHtml(type, ref, url) {
  const w = WHAT[type];
  return "<p>" + esc(w[0]) + " (" + esc(ref) + ").</p><p><a href=\"" + esc(url) + "\">Open GrievIQ</a></p>" +
    "<p>For security, GrievIQ never puts the request's words in emails and never asks for your sign-in code.</p><hr>" +
    "<p>" + esc(w[1]) + " (" + esc(ref) + ")।</p><p><a href=\"" + esc(url) + "\">GrievIQ खोलें</a></p>" +
    "<p>सुरक्षा के लिए GrievIQ अनुरोध के शब्द ईमेल में नहीं भेजता और कभी आपका साइन-इन कोड नहीं माँगता।</p>";
}
function subjectOf(type, ref) { return "GrievIQ " + ref + ": " + WHAT[type][0].replace(/ on GrievIQ| for you on GrievIQ/, "") + " · " + WHAT[type][1].replace(/GrievIQ पर /, ""); }
async function mailGov(env, origin, people, type, f) {
  for (const p of people) {
    const url = origin + (p.level === "NATIONAL" ? "/national" : "/state") + "#fu=" + encodeURIComponent(f.id);
    await queueEmail(env, p.email, "FU_" + type, "FU:" + type + ":" + f.id + ":" + p.id + (type === "REPLY" ? ":" + Date.now() : ""), subjectOf(type, f.ref), mailHtml(type, f.ref, url), null);
  }
}
export async function tellRecipients(env, origin, f, type) {
  if (f.to_kind === "DEPT") {
    const officers = await officeOfficers(env, f.to_office_id);
    if (!officers.length) return 0;
    if (type === "NEW" || type === "REMIND" || type === "OVERDUE") {
      await createNotices(env, origin, officers.map((o) => officerRecipient(o.id)), {
        kind: KIND.DEPT_O_FU, key: "FU:" + type + ":" + f.id, officeTier: "DEPT", officeId: String(f.to_office_id), data: { fu: f.id, ref: f.ref, type },
      });
    }
    for (const o of officers) {
      await queueEmail(env, o.email, "FU_" + type, "FU:" + type + ":" + f.id + ":" + o.id, subjectOf(type, f.ref), mailHtml(type, f.ref, origin + "/dept#fu=" + encodeURIComponent(f.id)), null);
    }
    await flushOutbox(env, 10);
    return officers.length;
  }
  const people = await placeOfficials(env, f.to_kind, f.to_state_id, f.to_district_id);
  await mailGov(env, origin, people, type, f);
  await flushOutbox(env, 10);
  return people.length;
}
export async function tellSenders(env, origin, f, type) {
  const people = await placeOfficials(env, f.from_level, f.from_state_id, f.from_district_id);
  await mailGov(env, origin, people, type, f);
  await flushOutbox(env, 10);
  return people.length;
}

// ---------------------------------------------------------------- the hourly job
// Reminders (REMIND_DAYS before the date), overdue on the day after the
// reply-by date, and the figure measured again on the reply-by date.
export async function runFollowups(env, origin, nowMs) {
  if (!(await followupsReady(env))) return { ready: false };
  const t = nowMs || Date.now(), today = new Date(t + 5.5 * 3600000).toISOString().slice(0, 10);
  const r = { reminded: 0, overdue: 0, measured: 0, removed: 0 };
  const due = (await env.DB.prepare("SELECT * FROM followups WHERE status IN ('OPEN','ACKNOWLEDGED') AND reminded = 0 AND reply_by >= ? AND reply_by <= ? LIMIT 50")
    .bind(today, addDays(today, REMIND_DAYS)).all()).results || [];
  for (const f of due) {
    const ch = await env.DB.prepare("UPDATE followups SET reminded = 1 WHERE id = ? AND reminded = 0").bind(f.id).run();
    if (!ch.meta || !ch.meta.changes) continue;
    await addEvent(env, f.id, "REMINDED", null, null, null, { replyBy: f.reply_by });
    await tellRecipients(env, origin, f, "REMIND");
    r.reminded++;
  }
  const late = (await env.DB.prepare("SELECT * FROM followups WHERE status IN ('OPEN','ACKNOWLEDGED') AND reply_by < ? LIMIT 50").bind(today).all()).results || [];
  for (const f of late) {
    const ch = await env.DB.prepare("UPDATE followups SET status = 'OVERDUE', was_overdue = 1, updated_at = ? WHERE id = ? AND status IN ('OPEN','ACKNOWLEDGED')").bind(now(), f.id).run();
    if (!ch.meta || !ch.meta.changes) continue;
    await addEvent(env, f.id, "OVERDUE", null, null, null, { replyBy: f.reply_by });
    await tellRecipients(env, origin, f, "OVERDUE");
    await tellSenders(env, origin, f, "OVERDUE");
    r.overdue++;
  }
  const meas = (await env.DB.prepare("SELECT * FROM followups WHERE measured_at IS NULL AND reply_by <= ? AND status != 'CLOSED' LIMIT 20").bind(today).all()).results || [];
  for (const f of meas) {
    let snap = {};
    try { snap = JSON.parse(f.snapshot); } catch (e) { snap = {}; }
    const subject = await subjectFor(env, f, snap);
    const res = subject ? await measureFigure(env, subject, f.figure, t) : null;
    const ch = await env.DB.prepare("UPDATE followups SET result = ?, measured_at = ?, updated_at = ? WHERE id = ? AND measured_at IS NULL")
      .bind(res ? JSON.stringify(res) : JSON.stringify({ missing: true }), now(), now(), f.id).run();
    if (!ch.meta || !ch.meta.changes) continue;
    await addEvent(env, f.id, "MEASURED", null, null, null, res ? { value: res.value, before: snap.value } : { missing: true });
    await tellSenders(env, origin, f, "RESULT");
    r.measured++;
  }
  // Kept for KEEP_YEARS after closing, then removed (events: part41 trigger).
  try {
    const cut = new Date(t - KEEP_YEARS * 365.25 * 86400000).toISOString();
    const old = (await env.DB.prepare("SELECT id FROM followups WHERE status = 'CLOSED' AND closed_at < ? LIMIT 50").bind(cut).all()).results || [];
    for (const o of old) {
      await env.DB.prepare("DELETE FROM followup_events WHERE followup_id = ?").bind(o.id).run();
      await env.DB.prepare("DELETE FROM followups WHERE id = ?").bind(o.id).run();
      r.removed++;
    }
  } catch (e) { /* events younger than the keeping time stay */ }
  return r;
}
// Rebuilds the figure's subject from a stored request.
async function subjectFor(env, f, snap) {
  const kind = snap.subject && snap.subject.kind;
  if (kind === "DEPT") {
    const officeId = f.to_kind === "DEPT" ? f.to_office_id : snap.subject.officeId;
    const o = await officeRow(env, officeId);
    if (!o) return null;
    return { kind: "DEPT", state: await stateRow(env, o.state_id), district: o.district_id ? await districtRow(env, o.district_id) : null, office: o, nameEn: o.name_en, nameHi: o.name_hi };
  }
  // The place the figure is about: the recipient (down) or the sender (up).
  const upward = f.to_kind === "NATIONAL" || (f.to_kind === "STATE" && f.from_level === "DISTRICT");
  const stateId = upward ? f.from_state_id : f.to_state_id, districtId = upward ? f.from_district_id : (f.to_kind === "DISTRICT" ? f.to_district_id : null);
  const s = await stateRow(env, stateId), d = districtId ? await districtRow(env, districtId) : null;
  if (!s) return null;
  return { kind: d ? "DISTRICT" : "STATE", state: s, district: d, nameEn: d ? d.name_en : s.name_en, nameHi: d ? d.name_hi : s.name_hi };
}
export { placeLabel, stateRow, districtRow, LIVE };
