/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/admin/notices.js   (grieviq-55)
//
// "Public notices" for GrievIQ staff.
// GET  (view_notices: super, operations, auditor)
//   -> { ready, canManage, today, enabled, checks, counts, notices, pauses, states, areas }
// POST (manage_notices: super, operations), { action, ... }
//   approve     { id, checks: { PUBLIC_INFO, NO_PARTY, NO_PRAISE, NO_CITIZEN, TRUTHFUL, LETTER? }, verifiedHow? }
//               grieviq-56: with an authority letter, LETTER is ticked and
//               verifiedHow says how it was checked (10+ letters)
//               every check ticked; makes the bill (price as quoted)
//   reject      { id, reason }       (5+ letters; the office is told why, nothing charged)
//   takedown    { id, reason }       a paid notice stops at once (10+ letters; the office is told)
//   pause_add   { label, state, areaId?, from, to }   Model Code of Conduct period
//   pause_remove { id, reason }      entered by mistake, or the period was cut short
// Every action goes to admin_events.

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { liveVersion, istToday } from "../../_shared/site-settings.js";
import { noticesReady, noticeSettings, activePauses, noticeOut, approveNotice, logNotice, emailNoticeOffice, CHECKS, LETTER_CATEGORIES, lettersReady, realDate, addDays, stateOf } from "../../_shared/notices.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const clean = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max + 1);

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_notices");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const canManage = allows(auth, "manage_notices");
  if (!(await noticesReady(env))) return json({ ready: false, canManage });
  const today = istToday();
  const s = (await liveVersion(env)).data;
  const pauses = await activePauses(env);
  const { results } = await env.DB.prepare("SELECT * FROM notices ORDER BY requested_at DESC LIMIT 400").all();
  const rows = results || [];
  const billIds = rows.map((n) => n.bill_id).filter(Boolean);
  const bills = {};
  if (billIds.length) for (const b of (await env.DB.prepare("SELECT * FROM bills WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(billIds)).all()).results || []) bills[b.id] = b;
  const notices = rows.map((n) => noticeOut(n, pauses, today, bills[n.bill_id]));
  const counts = {};
  for (const n of notices) counts[n.state] = (counts[n.state] || 0) + 1;
  const { results: ar } = await env.DB.prepare("SELECT id, name, state FROM areas ORDER BY state, name").all();
  const areas = (ar || []).map((a) => ({ id: a.id, name: a.name, state: a.state }));
  const { results: pr } = await env.DB.prepare("SELECT * FROM notice_pauses ORDER BY from_on DESC LIMIT 100").all();
  return json({
    ready: true, canManage, today, enabled: noticeSettings(s).enabled, checks: CHECKS, counts, notices, letterCategories: LETTER_CATEGORIES, letters: await lettersReady(env),
    pauses: (pr || []).map((p) => ({ id: p.id, label: p.label, state: p.state, areaId: p.area_id, from: p.from_on, to: p.to_on, createdBy: p.created_by, createdAt: p.created_at,
      removedAt: p.removed_at, removedBy: p.removed_by, removeReason: p.remove_reason, now: !p.removed_at && p.from_on <= today && today <= p.to_on })),
    states: Array.from(new Set(areas.map((a) => a.state).filter(Boolean))), areas,
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_notices");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await noticesReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const origin = new URL(request.url).origin, now = new Date().toISOString(), today = istToday();

  if (b.action === "pause_add") {
    const f = {};
    const label = clean(b.label, 120), state = clean(b.state, 80), areaId = clean(b.areaId, 80), from = clean(b.from, 10), to = clean(b.to, 10);
    if (label.length < 5) f.label = "REQUIRED"; else if (label.length > 120) f.label = "LENGTH";
    const areas = (await env.DB.prepare("SELECT id, state FROM areas").all()).results || [];
    if (!areas.some((a) => a.state === state)) f.state = "REQUIRED";
    if (areaId && !areas.some((a) => a.id === areaId && a.state === state)) f.areaId = "WRONG_STATE";
    if (!realDate(from)) f.from = "DATE";
    if (!realDate(to)) f.to = "DATE"; else if (realDate(from) && to < from) f.to = "BEFORE_START"; else if (realDate(from) && to > addDays(from, 180)) f.to = "TOO_LONG";
    if (realDate(to) && to < today) f.to = "PAST";
    if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO notice_pauses (id, label, state, area_id, from_on, to_on, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, label, state, areaId || null, from, to, auth.email, now).run();
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), auth.email, "notice_pause_added", areaId || state, JSON.stringify({ id, label, state, areaId: areaId || null, from, to })).run();
    return json({ ok: true, id });
  }
  if (b.action === "pause_remove") {
    const p = await env.DB.prepare("SELECT * FROM notice_pauses WHERE id = ? AND removed_at IS NULL").bind(String(b.id || "")).first();
    if (!p) return json({ error: "NOT_FOUND" }, 404);
    const reason = clean(b.reason, 300);
    if (reason.length < 5) return json({ error: "CHECK_FIELDS", fields: { reason: "REQUIRED" } }, 400);
    await env.DB.prepare("UPDATE notice_pauses SET removed_at = ?, removed_by = ?, remove_reason = ? WHERE id = ?").bind(now, auth.email, reason, p.id).run();
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), auth.email, "notice_pause_removed", p.area_id || p.state, JSON.stringify({ id: p.id, label: p.label, reason })).run();
    return json({ ok: true });
  }

  const n = await env.DB.prepare("SELECT * FROM notices WHERE id = ?").bind(String(b.id || "")).first();
  if (!n) return json({ error: "NOT_FOUND" }, 404);
  if (b.action === "approve") {
    if (n.status !== "PENDING") return json({ error: "ALREADY_DECIDED", status: n.status }, 409);
    const r = await approveNotice(env, n, auth.email, b.checks, origin, b.verifiedHow);
    return json(r.body, r.status);
  }
  if (b.action === "reject") {
    if (n.status !== "PENDING") return json({ error: "ALREADY_DECIDED", status: n.status }, 409);
    const reason = clean(b.reason, 300);
    if (reason.length < 5) return json({ error: "CHECK_FIELDS", fields: { reason: "REQUIRED" } }, 400);
    await env.DB.prepare("UPDATE notices SET status = 'REJECTED', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ? AND status = 'PENDING'").bind(auth.email, now, reason, n.id).run();
    await logNotice(env, auth.email, "notice_rejected", n, { reason });
    await emailNoticeOffice(env, origin, n, "REJECTED", reason);
    return json({ ok: true, status: "REJECTED" });
  }
  if (b.action === "takedown") {
    const st = stateOf(n, await activePauses(env), today);
    if (n.status !== "PAID" || st === "ENDED") return json({ error: "NOT_RUNNING" }, 409);
    const reason = clean(b.reason, 300);
    if (reason.length < 10) return json({ error: "CHECK_FIELDS", fields: { reason: "SHORT" } }, 400);
    await env.DB.prepare("UPDATE notices SET status = 'TAKEN_DOWN', ended_by = ?, ended_at = ?, end_reason = ? WHERE id = ? AND status = 'PAID'").bind(auth.email, now, reason, n.id).run();
    await logNotice(env, auth.email, "notice_taken_down", n, { reason, was: st });
    await emailNoticeOffice(env, origin, n, "TAKEN_DOWN", reason);
    return json({ ok: true, status: "TAKEN_DOWN" });
  }
  return json({ error: "Unknown action." }, 400);
}
