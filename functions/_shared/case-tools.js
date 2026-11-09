/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/case-tools.js (grieviq-86)
//
// Five tools on a complaint (see dev-tests/part56-case-tools.sql):
//   priority      a danger to life or health right now: shorter time limits
//   interims      "this will take longer": a level's time limit moves to the
//                 expected date (once per level, at most 60 days ahead)
//   transfer      sent to the right ward or village: the clock starts again
//   questions     the office asks, the citizen answers on the Track page;
//                 closed as "not enough information" after 7 days unanswered
//   supporters    "this is my problem too": they follow it for updates
// The time rules live here and are used by escalation.js and
// time-limits.js, so every page and the hourly job agree.

import { maskPersonal } from "./misuse.js";

const H = 3600000, DAY = 86400000;
export const PRIORITY_KINDS = ["LIVE_WIRE", "OPEN_MANHOLE", "COLLAPSE", "SEWAGE_WATER", "OTHER_DANGER"];
export const PRIORITY_ACK_HOURS = 24;
export const PRIORITY_ACT_HOURS = 72;
export const INTERIM_REASONS = ["TENDER", "DEPARTMENT", "MATERIAL", "WEATHER", "LEGAL", "OTHER"];
export const INTERIM_MAX_DAYS = 60;
export const TRANSFER_HOURS = 48;
export const QUESTION_MAX = 3;
export const NO_INFO_DAYS = 7;
export const ANSWER_REOPEN_DAYS = 30;
export const TEXT_MIN = 20, TEXT_MAX = 500, REASON_MIN = 10, REASON_MAX = 300, ANSWER_MIN = 2;

function ms(v) {
  const s = String(v || "");
  if (!s) return NaN;
  return s.indexOf("T") !== -1 ? new Date(s).getTime() : new Date(s.replace(" ", "T") + "Z").getTime();
}

// Priority is on when the citizen chose a danger and the office hasn't taken it off.
export function isPriority(g) { return !!(g && g.priority && !g.priority_off_at); }

// The category's time limits for this case (shorter for a priority case).
export function effectiveCategory(g, category) {
  if (!category || !isPriority(g)) return category;
  const ack = Number(category.ack_sla_hours) || PRIORITY_ACK_HOURS;
  const res = category.resolution_sla_hours ? Math.min(Number(category.resolution_sla_hours), PRIORITY_ACT_HOURS) : null;
  return Object.assign({}, category, { ack_sla_hours: Math.min(ack, PRIORITY_ACK_HOURS), resolution_sla_hours: res, priority: true });
}

// { TIER: { until, clock } }: interim replies given on the current clock.
export function readInterims(g) {
  if (!g || !g.interims) return {};
  try { const x = JSON.parse(g.interims); return x && typeof x === "object" ? x : {}; } catch (e) { return {}; }
}

// When each level's time to act ends (ms), from the clock start, one
// resolution limit per level, moved by any interim reply given on this
// clock (the later levels move with it). null entries below the start.
export function levelEnds(g, category, chainTiers, start) {
  const sla = category && category.resolution_sla_hours ? category.resolution_sla_hours * H : null;
  const out = chainTiers.map(() => null);
  if (!sla || isNaN(start.ms)) return out;
  const iv = readInterims(g);
  let end = start.ms;
  for (let i = start.index; i < chainTiers.length; i++) {
    end += sla;
    const x = iv[chainTiers[i].tier];
    if (x && Number(x.clock) === start.ms) {
      const until = ms(x.until);
      if (!isNaN(until) && until > end) end = until;
    }
    out[i] = end;
  }
  return out;
}

// Can this case still be sent to another ward by the office? Within 48
// hours of filing, once, while open.
export function transferStatus(g, nowMs) {
  if (!g || (g.status !== "OPEN" && g.status !== "ACKNOWLEDGED")) return { can: false, code: "CLOSED" };
  if (Number(g.transfer_count || 0) >= 1) return { can: false, code: "ALREADY_MOVED" };
  if (Number(g.reopen_count || 0) > 0) return { can: false, code: "REOPENED" };
  const until = ms(g.created_at) + TRANSFER_HOURS * H;
  if ((nowMs || Date.now()) > until) return { can: false, code: "TOO_LATE", until: new Date(until).toISOString() };
  return { can: true, code: "OK", until: new Date(until).toISOString() };
}

// A question or an interim note must not carry a phone number or email.
export function hasContact(text) { return maskPersonal(String(text || "")) !== String(text || ""); }

export function cleanText(v, max) { return String(v || "").replace(/\s+/g, " ").trim().slice(0, max + 1); }

// Every update of these cases, oldest first: Map(grievance id -> rows).
export async function loadUpdates(env, ids) {
  const out = new Map();
  if (!ids || !ids.length) return out;
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM case_updates WHERE grievance_id IN (SELECT value FROM json_each(?)) ORDER BY created_at ASC, rowid ASC"
    ).bind(JSON.stringify(ids)).all();
    for (const r of results || []) {
      if (!out.has(r.grievance_id)) out.set(r.grievance_id, []);
      out.get(r.grievance_id).push(r);
    }
  } catch (e) { if (!/no such table/i.test(String(e && e.message))) throw e; }
  return out;
}

// How many people follow each case: Map(grievance id -> n).
export async function supporterCounts(env, ids) {
  const out = new Map();
  if (!ids || !ids.length) return out;
  try {
    const { results } = await env.DB.prepare(
      "SELECT grievance_id, COUNT(*) AS n FROM case_supporters WHERE grievance_id IN (SELECT value FROM json_each(?)) GROUP BY grievance_id"
    ).bind(JSON.stringify(ids)).all();
    for (const r of results || []) out.set(r.grievance_id, Number(r.n) || 0);
  } catch (e) { if (!/no such table/i.test(String(e && e.message))) throw e; }
  return out;
}

export function openQuestion(rows) {
  const q = (rows || []).filter((r) => r.kind === "QUESTION");
  const last = q[q.length - 1];
  return last && !last.answered_at ? last : null;
}

// What the office may do now with the questions on a case.
export function questionStatus(g, rows, nowMs) {
  const q = (rows || []).filter((r) => r.kind === "QUESTION");
  const open = openQuestion(rows);
  const hasEmail = !!(g && g.citizen_email && String(g.citizen_email).includes("@"));
  const live = g && (g.status === "OPEN" || g.status === "ACKNOWLEDGED");
  const age = open ? (nowMs || Date.now()) - ms(open.created_at) : 0;
  return {
    canAsk: !!(live && hasEmail && !open && q.length < QUESTION_MAX),
    why: !live ? "CLOSED" : !hasEmail ? "NO_EMAIL" : open ? "WAITING" : q.length >= QUESTION_MAX ? "LIMIT" : null,
    left: Math.max(0, QUESTION_MAX - q.length),
    canCloseNoInfo: !!(live && open && age >= NO_INFO_DAYS * DAY),
    closeFrom: open ? new Date(ms(open.created_at) + NO_INFO_DAYS * DAY).toISOString() : null,
  };
}

// The office's view of the updates (citizen answers with personal details hidden).
export function shapeUpdatesForOffice(rows, unitNames) {
  return (rows || []).map((r) => ({
    id: r.id, kind: r.kind, tier: r.tier || null, by: r.by_kind, byEmail: r.by_kind === "OFFICE" ? r.by_email || null : null, reason: r.reason || null,
    text: r.text || null, expectedBy: r.expected_by || null, at: r.created_at,
    from: r.from_unit ? (unitNames[r.from_unit] || r.from_unit) : null, to: r.to_unit ? (unitNames[r.to_unit] || r.to_unit) : null,
    answer: r.answer ? maskPersonal(r.answer) : null, answeredAt: r.answered_at || null,
  }));
}

// The citizen's view (no staff or office emails). Supporters see no questions.
export function shapeUpdatesForCitizen(rows, unitNames, supporter) {
  return (rows || []).filter((r) => !(supporter && r.kind === "QUESTION")).map((r) => ({
    id: r.id, kind: r.kind, tier: r.tier || null, by: r.by_kind, reason: r.reason || null, text: r.text || null,
    expectedBy: r.expected_by || null, at: r.created_at,
    to: r.to_unit ? (unitNames[r.to_unit] || null) : null,
    answer: supporter ? null : r.answer || null, answeredAt: r.answered_at || null,
  }));
}

export async function unitNamesFor(env, rows) {
  const ids = new Set();
  for (const r of rows || []) { if (r.from_unit) ids.add(r.from_unit); if (r.to_unit) ids.add(r.to_unit); }
  const out = {};
  if (!ids.size) return out;
  const { results } = await env.DB.prepare("SELECT id, name FROM local_units WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(Array.from(ids))).all();
  for (const u of results || []) out[u.id] = u.name;
  return out;
}

export async function addUpdate(env, row) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO case_updates (id, grievance_id, kind, tier, by_kind, by_email, reason, text, expected_by, from_unit, to_unit, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, row.grievanceId, row.kind, row.tier || null, row.byKind, row.byEmail || null, row.reason || null, row.text || null,
    row.expectedBy || null, row.fromUnit || null, row.toUnit || null, row.at || new Date().toISOString()).run();
  return id;
}

// A short, stable code for a case on the "already reported nearby" list,
// so the public list never carries a reference number or case id.
export async function supportKey(id) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("grieviq-support:" + id)));
  return Array.from(d.slice(0, 8)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function distanceM(aLat, aLng, bLat, bLng) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
