/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/subscriptions.js
//
// Office subscriptions (grieviq-46, approved 12 Oct 2026).
// Each office (a representative's office, or a department office) has one
// status, worked out from its dates every time it is needed:
//   PILOT          free pilot between pilot_start and pilot_end
//   COMPLIMENTARY  departments only, until a date, with a written reason
//   ACTIVE         paid up to paid_through
//   DUE_SOON       paid, ending within the reminder days (settings)
//   GRACE          unpaid, up to the grace days after the last covered date
//   PAUSED         unpaid after grace, or paused by the super admin: VIEW ONLY
//   ENDED          ended by the super admin: no access
// Citizens are never affected: complaints are still filed, delivered and
// moved up on time whatever the office's status. A paused office can still
// see its complaints, read messages, reply to the auditor and pay its bill.
// An office with no record yet is a pilot ending on the settings'
// defaultPilotEnd (offices already using GrievIQ when this was installed).
// Storage: part30 (office_subscriptions, subscription_events).

import { liveVersion, istToday } from "./site-settings.js";

export const STATUSES = ["PILOT", "COMPLIMENTARY", "ACTIVE", "DUE_SOON", "GRACE", "PAUSED", "ENDED"];
export const FULL_USE = ["PILOT", "COMPLIMENTARY", "ACTIVE", "DUE_SOON", "GRACE"];
const DAY = 86400000;
export function addDays(s, n) { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY); }
export function officeKey(type, tier, id) { return type + "|" + (tier || "") + "|" + id; }

export function subSettings(s) {
  const x = (s && s.subscriptions) || {};
  return {
    reminderDays: Number.isInteger(x.reminderDays) ? x.reminderDays : 7,
    graceDays: Number.isInteger(x.graceDays) ? x.graceDays : 7,
    defaultPilotEnd: /^\d{4}-\d{2}-\d{2}$/.test(x.defaultPilotEnd || "") ? x.defaultPilotEnd : "2026-12-31",
  };
}

// The status of one office today. row = its office_subscriptions row or null.
export function statusOf(row, cfg, today) {
  today = today || istToday();
  const r = row || {};
  if (r.ended_at) return { status: "ENDED", until: null, reason: r.end_reason || "" };
  if (r.paused_by_admin) return { status: "PAUSED", until: null, byAdmin: true, reason: r.pause_reason || "" };
  const pilotEnd = row ? r.pilot_end : cfg.defaultPilotEnd;
  const pilotStart = row ? r.pilot_start : null;
  if (r.complimentary_until && r.complimentary_until >= today) return { status: "COMPLIMENTARY", until: r.complimentary_until, reason: r.complimentary_reason || "" };
  if (r.paid_through && r.paid_through >= today) {
    return { status: daysBetween(today, r.paid_through) < cfg.reminderDays ? "DUE_SOON" : "ACTIVE", until: r.paid_through };
  }
  if (pilotEnd && pilotEnd >= today && (!pilotStart || pilotStart <= today)) return { status: "PILOT", until: pilotEnd, pilotEnding: daysBetween(today, pilotEnd) < 14 };
  // Nothing covers today: grace after the last covered day, then paused.
  const covered = [r.paid_through, pilotEnd, r.complimentary_until].filter(Boolean).filter((d) => d < today).sort().pop();
  if (covered) {
    const graceUntil = addDays(covered, cfg.graceDays);
    if (today <= graceUntil) return { status: "GRACE", until: covered, graceUntil };
    return { status: "PAUSED", until: covered, graceUntil };
  }
  // A pilot that hasn't started yet counts as a pilot (the office was let in early).
  if (pilotStart && pilotStart > today) return { status: "PILOT", until: pilotEnd };
  return { status: "PAUSED", until: null };
}

export async function subsReady(env) {
  try { await env.DB.prepare("SELECT 1 FROM office_subscriptions LIMIT 1").all(); return true; } catch (e) { return false; }
}
// Rows for these office keys, as a Map key -> row (empty before part30).
export async function rowsFor(env, keys) {
  const out = new Map();
  if (!keys.length) return out;
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM office_subscriptions WHERE (office_type || '|' || office_tier || '|' || office_id) IN (SELECT value FROM json_each(?))"
    ).bind(JSON.stringify(keys)).all();
    for (const r of results || []) out.set(officeKey(r.office_type, r.office_tier, r.office_id), r);
  } catch (e) { /* before part30: nobody is paused */ }
  return out;
}
// Status for each of a representative's offices (mandates).
export async function statusForMandates(env, mandates) {
  const keys = mandates.map((m) => officeKey("REP", m.tier, m.id));
  const rows = await rowsFor(env, keys);
  if (!(await subsReady(env))) return new Map(keys.map((k) => [k, { status: "PILOT", until: null, notReady: true }]));
  const cfg = subSettings((await liveVersion(env)).data);
  const today = istToday();
  return new Map(keys.map((k) => [k, statusOf(rows.get(k) || null, cfg, today)]));
}
export async function statusForDept(env, officeId) {
  if (!(await subsReady(env))) return { status: "PILOT", until: null, notReady: true };
  const rows = await rowsFor(env, [officeKey("DEPT", "", officeId)]);
  const cfg = subSettings((await liveVersion(env)).data);
  return statusOf(rows.get(officeKey("DEPT", "", officeId)) || null, cfg);
}
export function canAct(st) { return !st || FULL_USE.includes(st.status); }

export async function logSub(env, key, actor, action, detail) {
  await env.DB.prepare("INSERT INTO subscription_events (id, office_key, at, actor, action, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), key, new Date().toISOString(), actor, action, detail == null ? null : JSON.stringify(detail)).run();
}
// Create the office's row if it has none, starting from what statusOf assumed.
export async function ensureRow(env, type, tier, id, name, actor, cfg) {
  const row = await env.DB.prepare("SELECT * FROM office_subscriptions WHERE office_type = ? AND office_tier = ? AND office_id = ?").bind(type, tier || "", id).first();
  if (row) return row;
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO office_subscriptions (office_type, office_tier, office_id, office_name, pilot_end, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(type, tier || "", id, name || id, cfg.defaultPilotEnd, now, actor).run();
  return await env.DB.prepare("SELECT * FROM office_subscriptions WHERE office_type = ? AND office_tier = ? AND office_id = ?").bind(type, tier || "", id).first();
}
// After a payment is confirmed: paid up to the end of that bill's period.
export async function applyPayment(env, bill, actor) {
  if (bill && bill.kind === "NOTICE") return;   // grieviq-55: a notice's bill is not a plan payment
  if (!(await subsReady(env))) return;
  const cfg = subSettings((await liveVersion(env)).data);
  const tier = bill.office_type === "DEPT" ? "" : bill.office_tier;
  const row = await ensureRow(env, bill.office_type, tier, bill.office_id, bill.office_name, actor, cfg);
  const paid = !row.paid_through || bill.period_to > row.paid_through ? bill.period_to : row.paid_through;
  await env.DB.prepare("UPDATE office_subscriptions SET paid_through = ?, plan_id = ?, last_notice = NULL, updated_at = ?, updated_by = ? WHERE office_type = ? AND office_tier = ? AND office_id = ?")
    .bind(paid, bill.plan_id, new Date().toISOString(), actor, bill.office_type, tier, bill.office_id).run();
  await logSub(env, officeKey(bill.office_type, tier, bill.office_id), actor, "PAID_THROUGH", { bill: bill.ref, paidThrough: paid });
}
