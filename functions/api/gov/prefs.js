/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET  /api/gov/prefs -> { ready, monthly, weekly }
// POST /api/gov/prefs { monthly?: bool, weekly?: bool }   (grieviq-50)
// The official's choice of report emails (off unless they turn it on). The
// emails say only that a report is ready; they carry no figures.
import { getVerifiedGovUser, logGov } from "../../_shared/gov-auth.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
async function read(env, id) {
  try { const r = await env.DB.prepare("SELECT monthly, weekly FROM gov_report_prefs WHERE user_id = ?").bind(id).first(); return { ready: true, monthly: !!(r && r.monthly), weekly: !!(r && r.weekly) }; }
  catch (e) { return { ready: false, monthly: false, weekly: false }; }
}
export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedGovUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  return json(await read(env, auth.user.id));
}
export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedGovUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Invalid request." }, 400); }
  const cur = await read(env, auth.user.id);
  if (!cur.ready) return json({ error: "NOT_READY" }, 409);
  const monthly = typeof b.monthly === "boolean" ? b.monthly : cur.monthly, weekly = typeof b.weekly === "boolean" ? b.weekly : cur.weekly;
  await env.DB.prepare(`INSERT INTO gov_report_prefs (user_id, monthly, weekly, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET monthly = excluded.monthly, weekly = excluded.weekly, updated_at = excluded.updated_at`)
    .bind(auth.user.id, monthly ? 1 : 0, weekly ? 1 : 0, new Date().toISOString()).run();
  await logGov(env, { userId: auth.user.id, email: auth.user.email, action: "EMAIL_CHOICE", detail: { monthly, weekly } });
  return json({ ok: true, monthly, weekly });
}
