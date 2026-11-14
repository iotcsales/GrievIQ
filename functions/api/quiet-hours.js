/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/quiet-hours   (grieviq-89) An office's quiet hours, from the bell in the rep console.
// During them, phone alerts that aren't about danger wait until they end
// (they are in the bell at once). Danger-to-life complaints and their
// reminders always come at once. Default 10 pm to 7 am India time.
// GET  -> { offices: [{ tier, id, name, label, from, to, off, isDefault, canChange }] }
// POST { tier, id, from, to } or { tier, id, off: true }   the representative or an office manager
import { getVerifiedRep } from "../_shared/get-verified-rep.js";
import { json } from "../_shared/notice-box.js";
import { ROLE } from "../_shared/team.js";
import { quietSetting, saveQuiet } from "../_shared/alerts.js";

const may = (m) => m.role === ROLE.REP || m.role === ROLE.OM;

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedRep(request, env, { noTouch: true, allowPaused: true });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const offices = [];
  for (const m of auth.mandates || []) {
    if (!may(m)) continue;
    offices.push(Object.assign({ tier: m.tier, id: String(m.id), name: m.name, label: m.label, canChange: true }, await quietSetting(env, m.tier, m.id)));
  }
  return json({ offices });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedRep(request, env, { allowPaused: true });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const m = (auth.mandates || []).find((x) => x.tier === String(b.tier || "") && String(x.id) === String(b.id || ""));
  if (!m || !may(m)) return json({ error: "Only the representative or an office manager can change this." }, 403);
  const r = await saveQuiet(env, m.tier, m.id, b, auth.email);
  if (r.fields) return json({ error: "CHECK_FIELDS", fields: r.fields }, 400);
  try {
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), auth.email, "office_quiet_hours", m.tier + ":" + m.id, JSON.stringify(b.off === true ? { off: true } : { from: b.from, to: b.to })).run();
  } catch (e) { /* ignore */ }
  return json({ ok: true, setting: await quietSetting(env, m.tier, m.id) });
}
