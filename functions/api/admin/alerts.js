/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/admin/alerts.js   (grieviq-89)
//
// "Needs you now": the urgent items for the signed-in staff member, and
// their alert settings (storage: part58).
// GET  ?bar=1  the open items they can take (the red bar on every admin page)
// GET          the same, plus their settings, phone alerts on this account,
//              GrievIQ's working hours and (super admin) the last 30 days
// POST { action: "take", id }            I'll take it (first one wins)
//      { action: "pref", kind, on }      switch one kind off/on (danger kinds can't be switched off)
//      { action: "subscribe" | "unsubscribe" | "test" | "lang", ... }   phone alerts (who = "staff:<email>")
//      { action: "hours", days, from, to }  working hours (super admin)
// Every alert is content-free: the bar shows the kind, the place or ward and
// how long it has waited; details open on the item's own page.

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { noticeBoxPost } from "../../_shared/notice-box.js";
import { pushConfigured } from "../../_shared/webpush.js";
import { logEvent } from "../../_shared/handover.js";
import {
  STAFF_KINDS, KIND_ORDER, rolesSee, readHours, inHours, nextWorkStart, validHm, workDone, markDone, staffNames, alertWhere, alertsReady,
} from "../../_shared/alerts.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const toMs = (v) => { const s = String(v || ""); return s.indexOf("T") !== -1 ? Date.parse(s) : Date.parse(s.replace(" ", "T") + "Z"); };

async function openItems(env, auth) {
  const kinds = KIND_ORDER.filter((k) => rolesSee(auth.roles || [auth.role], k));
  if (!kinds.length) return [];
  const { results } = await env.DB.prepare("SELECT * FROM staff_alerts WHERE done_at IS NULL AND kind IN (SELECT value FROM json_each(?)) ORDER BY created_at LIMIT 50")
    .bind(JSON.stringify(kinds)).all();
  const now = Date.now();
  const rows = [];
  for (const a of results || []) {
    const reason = await workDone(env, a);           // done on its own page: stop at once
    if (reason) { await markDone(env, a.kind, a.item_id, reason); continue; }
    rows.push(a);
  }
  const names = await staffNames(env, Array.from(new Set(rows.map((a) => a.taken_by).filter(Boolean))));
  const me = String(auth.email).toLowerCase();
  const out = [];
  for (const a of rows) {
    const since = a.alerted_at || a.created_at;
    out.push({
      id: a.id, kind: a.kind, danger: !!a.always, page: STAFF_KINDS[a.kind].page,
      where: await alertWhere(env, a),
      arrivedAt: a.created_at, waitingMin: Math.max(0, Math.floor((now - toMs(since)) / 60000)),
      alerting: !!a.alerted_at && !a.taken_by, waitsForHours: !a.alerted_at, releaseAt: a.release_at,
      takenBy: a.taken_by ? (a.taken_by === me ? "ME" : names[a.taken_by] || a.taken_by) : null, mine: a.taken_by === me, takenAt: a.taken_at,
      superToo: !!a.escalated_at,
    });
  }
  // Danger first, then the oldest.
  out.sort((x, y) => (y.danger - x.danger) || (KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind)) || (y.waitingMin - x.waitingMin));
  return out;
}

async function lastMonth(env) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { results } = await env.DB.prepare("SELECT * FROM staff_alerts WHERE created_at >= ? ORDER BY created_at DESC LIMIT 500").bind(since).all();
  const rows = results || [];
  const by = {};
  for (const k of KIND_ORDER) by[k] = { kind: k, count: 0, taken: [], missedHour: 0 };
  for (const a of rows) {
    const b = by[a.kind]; if (!b) continue;
    b.count++;
    if (a.taken_at && a.alerted_at) b.taken.push(Math.max(0, Math.round((toMs(a.taken_at) - toMs(a.alerted_at)) / 60000)));
    if (a.escalated_at) b.missedHour++;
  }
  const summary = KIND_ORDER.map((k) => {
    const t = by[k].taken.sort((x, y) => x - y);
    return { kind: k, count: by[k].count, typicalMin: t.length ? t[Math.floor((t.length - 1) / 2)] : null, missedHour: by[k].missedHour };
  });
  const names = await staffNames(env, Array.from(new Set(rows.slice(0, 30).map((a) => a.taken_by).filter(Boolean))));
  const recent = rows.slice(0, 30).map((a) => ({
    kind: a.kind, arrivedAt: a.created_at, takenBy: a.taken_by ? names[a.taken_by] || a.taken_by : null,
    takeMin: a.taken_at && a.alerted_at ? Math.max(0, Math.round((toMs(a.taken_at) - toMs(a.alerted_at)) / 60000)) : null,
    superToo: !!a.escalated_at, done: a.done_reason || null,
  }));
  return { summary, recent };
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "use_alerts");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await alertsReady(env))) return json({ ready: false, items: [] });
  const items = await openItems(env, auth);
  const url = new URL(request.url);
  if (url.searchParams.get("bar")) return json({ ready: true, items });
  const me = String(auth.email).toLowerCase();
  const kinds = KIND_ORDER.filter((k) => rolesSee(auth.roles || [auth.role], k));
  const { results: off } = await env.DB.prepare("SELECT kind FROM staff_alert_prefs WHERE email = ?").bind(me).all();
  const offSet = new Set((off || []).map((r) => r.kind));
  const dev = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE email = ?").bind("staff:" + me).first();
  const hours = await readHours(env);
  const now = Date.now();
  return json({
    ready: true, items,
    kinds: kinds.map((k) => ({ kind: k, on: STAFF_KINDS[k].always || !offSet.has(k), locked: STAFF_KINDS[k].always })),
    push: { configured: pushConfigured(env), key: env.VAPID_PUBLIC_KEY || null, devices: (dev && dev.n) || 0 },
    hours, hoursOnNow: inHours(hours, now), nextStart: inHours(hours, now) ? null : new Date(nextWorkStart(hours, now)).toISOString(),
    canHours: allows(auth, "manage_alert_hours"),
    log: allows(auth, "manage_alert_hours") ? await lastMonth(env) : null,
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "use_alerts");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await alertsReady(env))) return json({ error: "Alerts aren't set up yet (part58).", code: "NOT_READY" }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const me = String(auth.email).toLowerCase();
  const now = new Date().toISOString();
  const action = String(b.action || "");

  if (action === "take") {
    const a = await env.DB.prepare("SELECT * FROM staff_alerts WHERE id = ?").bind(String(b.id || "")).first();
    if (!a || !rolesSee(auth.roles || [auth.role], a.kind)) return json({ error: "NOT_FOUND" }, 404);
    if (a.done_at) return json({ error: "Already done.", code: "DONE" }, 409);
    const r = await env.DB.prepare("UPDATE staff_alerts SET taken_by = ?, taken_at = ? WHERE id = ? AND taken_by IS NULL AND done_at IS NULL").bind(me, now, a.id).run();
    if (!(r.meta && r.meta.changes > 0)) {
      const cur = await env.DB.prepare("SELECT taken_by FROM staff_alerts WHERE id = ?").bind(a.id).first();
      const names = await staffNames(env, cur && cur.taken_by ? [cur.taken_by] : []);
      return json({ error: "Someone has already taken it.", code: "TAKEN", takenBy: cur && cur.taken_by === me ? "ME" : (cur && (names[cur.taken_by] || cur.taken_by)) || null }, 409);
    }
    await logEvent(env, me, "alert_taken", a.id, { kind: a.kind });
    return json({ ok: true, page: STAFF_KINDS[a.kind].page });
  }

  if (action === "pref") {
    const kind = String(b.kind || "");
    if (!STAFF_KINDS[kind] || !rolesSee(auth.roles || [auth.role], kind)) return json({ error: "CHECK_FIELDS", fields: { kind: "UNKNOWN" } }, 400);
    if (STAFF_KINDS[kind].always) return json({ error: "Alerts about danger to life can't be switched off.", code: "LOCKED" }, 400);
    if (b.on === false) await env.DB.prepare("INSERT OR REPLACE INTO staff_alert_prefs (email, kind, off_at) VALUES (?, ?, ?)").bind(me, kind, now).run();
    else await env.DB.prepare("DELETE FROM staff_alert_prefs WHERE email = ? AND kind = ?").bind(me, kind).run();
    await logEvent(env, me, "alert_pref", kind, { on: b.on !== false });
    return json({ ok: true });
  }

  if (action === "hours") {
    if (!allows(auth, "manage_alert_hours")) return json({ error: "Only the super admin can change working hours." }, 403);
    const days = Array.isArray(b.days) ? Array.from(new Set(b.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort() : [];
    const fields = {};
    if (!days.length) fields.days = "REQUIRED";
    if (!validHm(b.from)) fields.from = "TIME";
    if (!validHm(b.to)) fields.to = "TIME";
    if (!fields.from && !fields.to && String(b.from) >= String(b.to)) fields.to = "AFTER";
    if (Object.keys(fields).length) return json({ error: "CHECK_FIELDS", fields }, 400);
    const before = await readHours(env);
    const v = JSON.stringify({ days, from: b.from, to: b.to });
    await env.DB.prepare("INSERT INTO admin_settings (key, value, updated_by, updated_at) VALUES ('staff_alert_hours', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
      .bind(v, me, now).run();
    // Items waiting for working hours start at the new time.
    const { results } = await env.DB.prepare("SELECT id, created_at FROM staff_alerts WHERE done_at IS NULL AND alerted_at IS NULL AND always = 0").all();
    const hours = { days, from: b.from, to: b.to };
    for (const a of results || []) {
      await env.DB.prepare("UPDATE staff_alerts SET release_at = ? WHERE id = ?").bind(new Date(nextWorkStart(hours, Date.now())).toISOString(), a.id).run();
    }
    await logEvent(env, me, "alert_hours", "staff_alert_hours", { before, after: hours });
    return json({ ok: true, hours });
  }

  if (["subscribe", "unsubscribe", "test", "lang"].includes(action)) {
    return noticeBoxPost(env, "staff:" + me, b, "/admin-alerts.html");
  }
  return json({ error: "Unknown action." }, 400);
}
