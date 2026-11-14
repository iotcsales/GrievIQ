/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/dept/quiet-hours   (grieviq-89) The department office's quiet hours,
// from the bell on the department dashboard (same rules as /api/quiet-hours).
// Any active officer of the office can change them; the change is logged.
import { getVerifiedOfficer } from "../../_shared/dept-auth.js";
import { json } from "../../_shared/notice-box.js";
import { quietSetting, saveQuiet } from "../../_shared/alerts.js";

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedOfficer(request, env, { noTouch: true, allowPaused: true });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const o = auth.officer;
  return json({ offices: [Object.assign({ tier: "DEPT", id: String(o.office_id), name: o.office_name_en || "", canChange: true }, await quietSetting(env, "DEPT", o.office_id))] });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedOfficer(request, env, { allowPaused: true });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const o = auth.officer;
  const r = await saveQuiet(env, "DEPT", o.office_id, b, "dept:" + o.id);
  if (r.fields) return json({ error: "CHECK_FIELDS", fields: r.fields }, 400);
  try {
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), o.email, "office_quiet_hours", "DEPT:" + o.office_id, JSON.stringify(b.off === true ? { off: true } : { from: b.from, to: b.to })).run();
  } catch (e) { /* ignore */ }
  return json({ ok: true, setting: await quietSetting(env, "DEPT", o.office_id) });
}
