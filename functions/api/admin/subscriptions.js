/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/admin/subscriptions.js   (grieviq-46)
//
// "Subscriptions": every office that can use GrievIQ, with its plan status.
// GET  (view_subscriptions: super, operations, auditor)
//        -> { offices: [...], counts }        ?summary=1 -> counts only
//        ?key=<type|tier|id> -> one office's history
// POST (manage_subscriptions: super admin), { action, type, tier, id, reason, ... }
//   set_pilot      { start?, end }     pilot dates (start empty = already started)
//   set_plan       { planId }          the plan the hourly job bills
//   extend         { days }            paid-up date moved on by that many days
//   complimentary  { until }           department offices only ("" removes it)
//   pause | resume | end | reopen
// Every action needs a reason (5-300 letters) and is kept in
// subscription_events (cannot be changed) and the admin log.

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { liveVersion, istToday } from "../../_shared/site-settings.js";
import { repOffice, realDate, planBillFilter } from "../../_shared/billing.js";
import { subsReady, subSettings, statusOf, officeKey, ensureRow, logSub, addDays } from "../../_shared/subscriptions.js";
import { allOffices } from "../../_shared/subscription-run.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const clean = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max + 1);
const ATTENTION = ["DUE_SOON", "GRACE", "PAUSED"];

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_subscriptions");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const canManage = allows(auth, "manage_subscriptions");
  if (!(await subsReady(env))) return json({ ready: false, canManage, offices: [], counts: {} });
  const url = new URL(request.url);
  const live = await liveVersion(env);
  const cfg = subSettings(live.data);
  const today = istToday();

  const key = url.searchParams.get("key");
  if (key) {
    const { results } = await env.DB.prepare("SELECT at, actor, action, detail FROM subscription_events WHERE office_key = ? ORDER BY at DESC LIMIT 100").bind(key).all();
    return json({ history: (results || []).map((r) => ({ at: r.at, actor: r.actor, action: r.action, detail: r.detail ? JSON.parse(r.detail) : null })) });
  }

  const offices = await allOffices(env);
  const { results: rows } = await env.DB.prepare("SELECT * FROM office_subscriptions").all();
  const byKey = new Map((rows || []).map((r) => [officeKey(r.office_type, r.office_tier, r.office_id), r]));
  // Offices with a record but no longer listed above (e.g. email removed) still show.
  for (const r of rows || []) {
    const k = officeKey(r.office_type, r.office_tier, r.office_id);
    if (!offices.some((o) => officeKey(o.type, o.tier, o.id) === k)) offices.push({ type: r.office_type, tier: r.office_tier, id: r.office_id, name: r.office_name, label: r.office_type === "DEPT" ? "Department office" : ({ LOCAL: "LOCAL", MAYOR: "Mayor", MLA: "MLA", MP: "MP" }[r.office_tier] || "LOCAL"), noAccess: true });
  }
  let bills = [];
  try {
    const { results } = await env.DB.prepare("SELECT office_type, office_tier, office_id, ref, status, period_to, total, auto, sent_at, issued_at FROM bills WHERE 1 = 1" + (await planBillFilter(env)) + " ORDER BY issued_at DESC").all();
    bills = results || [];
  } catch (e) { bills = []; }
  const counts = {};
  const out = offices.map((o) => {
    const k = officeKey(o.type, o.tier, o.id);
    const r = byKey.get(k) || null;
    const st = statusOf(r, cfg, today);
    counts[st.status] = (counts[st.status] || 0) + 1;
    if (st.pilotEnding) counts.PILOT_ENDING = (counts.PILOT_ENDING || 0) + 1;
    const mine = bills.filter((b) => b.office_type === o.type && (o.type === "DEPT" || b.office_tier === o.tier) && b.office_id === o.id);
    const last = mine[0] || null;
    return {
      key: k, type: o.type, tier: o.tier, id: o.id, name: o.name, label: o.label, noAccess: !!o.noAccess,
      status: st.status, until: st.until || null, graceUntil: st.graceUntil || null, pilotEnding: !!st.pilotEnding, byAdmin: !!st.byAdmin, reason: st.reason || "",
      planId: r ? r.plan_id : null, pilotStart: r ? r.pilot_start : null, pilotEnd: r ? r.pilot_end : cfg.defaultPilotEnd,
      paidThrough: r ? r.paid_through : null, complimentaryUntil: r ? r.complimentary_until : null, hasRecord: !!r,
      lastBill: last ? { ref: last.ref, status: last.status, total: last.total, periodTo: last.period_to, waiting: !!last.auto && !last.sent_at } : null,
    };
  });
  counts.ATTENTION = ATTENTION.reduce((n, s) => n + (counts[s] || 0), 0) + (counts.PILOT_ENDING || 0);
  if (url.searchParams.get("summary")) return json({ ready: true, counts });
  const plans = live.data.plans.filter((p) => !p.retired && p.billing !== "QUOTE").map((p) => ({ id: p.id, nameEn: p.nameEn, nameHi: p.nameHi, billing: p.billing }));
  return json({ ready: true, canManage, today, settings: cfg, plans, counts, offices: out });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_subscriptions");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await subsReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const type = b.type === "DEPT" ? "DEPT" : b.type === "REP" ? "REP" : null;
  if (!type) return json({ error: "NOT_FOUND" }, 404);
  const tier = type === "DEPT" ? "" : String(b.tier || "");
  let name = null;
  if (type === "REP") { const o = await repOffice(env, tier, b.id); if (!o) return json({ error: "NOT_FOUND" }, 404); name = o.name; }
  else { const d = await env.DB.prepare("SELECT name_en FROM dept_offices WHERE id = ?").bind(String(b.id || "")).first(); if (!d) return json({ error: "NOT_FOUND" }, 404); name = d.name_en; }
  const id = String(b.id);
  const f = {};
  const reason = clean(b.reason, 300);
  if (reason.length < 5) f.reason = "REQUIRED"; else if (reason.length > 300) f.reason = "LENGTH";
  const live = await liveVersion(env);
  const cfg = subSettings(live.data);
  const today = istToday();
  const now = new Date().toISOString();
  const row = await ensureRow(env, type, tier, id, name, auth.email, cfg);
  const set = {};
  let detail = { reason };
  switch (b.action) {
    case "set_pilot": {
      const start = clean(b.start, 10), end = clean(b.end, 10);
      if (start && !realDate(start)) f.start = "DATE";
      if (!end) f.end = "REQUIRED"; else if (!realDate(end)) f.end = "DATE"; else if (start && realDate(start) && end < start) f.end = "BEFORE_START";
      set.pilot_start = start || null; set.pilot_end = end; detail = Object.assign(detail, { from: { start: row.pilot_start, end: row.pilot_end }, to: { start: start || null, end } });
      break;
    }
    case "set_plan": {
      const plan = live.data.plans.find((p) => p.id === String(b.planId || "") && !p.retired && p.billing !== "QUOTE");
      if (!plan) f.planId = "REQUIRED";
      set.plan_id = plan ? plan.id : null; detail.plan = plan ? plan.id : null; detail.before = row.plan_id;
      break;
    }
    case "extend": {
      const days = Number(b.days);
      if (!Number.isInteger(days) || days < 1 || days > 366) f.days = "RANGE";
      const base = [row.paid_through, row.pilot_end, addDays(today, -1)].filter(Boolean).sort().pop();
      set.paid_through = addDays(base, Number.isInteger(days) ? days : 0); detail = Object.assign(detail, { days, before: row.paid_through, after: set.paid_through });
      break;
    }
    case "complimentary": {
      if (type !== "DEPT") return json({ error: "DEPT_ONLY" }, 400);
      const until = clean(b.until, 10);
      if (until && !realDate(until)) f.until = "DATE"; else if (until && until < today) f.until = "PAST";
      set.complimentary_until = until || null; set.complimentary_reason = until ? reason : null; detail.until = until || null;
      break;
    }
    case "pause": set.paused_by_admin = 1; set.pause_reason = reason; break;
    case "resume": set.paused_by_admin = 0; set.pause_reason = null; break;
    case "end": set.ended_at = now; set.end_reason = reason; break;
    case "reopen": set.ended_at = null; set.end_reason = null; break;
    default: return json({ error: "Unknown action." }, 400);
  }
  if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
  const cols = Object.keys(set);
  await env.DB.prepare("UPDATE office_subscriptions SET " + cols.map((c) => c + " = ?").join(", ") + ", last_notice = NULL, updated_at = ?, updated_by = ? WHERE office_type = ? AND office_tier = ? AND office_id = ?")
    .bind(...cols.map((c) => set[c]), now, auth.email, type, tier, id).run();
  const key = officeKey(type, tier, id);
  await logSub(env, key, auth.email, b.action.toUpperCase(), detail);
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), auth.email, "subscription_" + b.action, name, JSON.stringify(Object.assign({ office: key }, detail))).run();
  const after = await env.DB.prepare("SELECT * FROM office_subscriptions WHERE office_type = ? AND office_tier = ? AND office_id = ?").bind(type, tier, id).first();
  const st = statusOf(after, cfg, today);
  return json({ ok: true, status: st.status, until: st.until || null });
}
