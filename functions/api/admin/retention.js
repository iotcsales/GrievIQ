// /api/admin/retention   (item 9d: data retention; rules in _shared/retention.js)
//
// GET                    what is due now, notices, cases on hold, the next
//                        30 days and the retention register (super admin,
//                        auditor)
// POST { action: "run" }                       run now (super admin)
// POST { action: "hold" | "release", ref, reason }   (super admin)

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import { retentionOverview, runRetention, setHold, MANUAL_BATCH } from "../../_shared/retention.js";

const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_retention");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let data;
  try { data = await retentionOverview(env); } catch (e) { return json({ error: "The retention tables aren't set up yet.", code: "NOT_SET_UP" }, 503); }
  return json(Object.assign({ role: auth.role, canManage: (auth.roles || [auth.role]).some((r) => (PERMISSIONS.manage_retention || []).includes(r)), generatedAt: new Date().toISOString() }, data));
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_retention");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const action = String(body.action || "");
  if (action === "run") {
    const done = await runRetention(env, { limit: MANUAL_BATCH, actor: auth.email, kind: "MANUAL", request });
    return json({ ok: true, done });
  }
  if (action === "hold" || action === "release") {
    const r = await setHold(env, auth.email, body.ref, action === "hold", body.reason);
    if (!r.ok) return json({ error: r.error, fields: r.fields }, r.status);
    return json({ ok: true, ref: r.ref });
  }
  return json({ error: "Unknown action." }, 400);
}
