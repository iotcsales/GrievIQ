// /api/dept/rules   "Rules for officers" (grieviq-37).
// GET  -> { version, accepted: { version, at } | null, pending }
// POST { version } -> the signed-in officer accepts the current rules
//      (recorded on the officer and in the department access log).
import { getVerifiedOfficer, logDept } from "../../_shared/dept-auth.js";
import { RULES_VERSION, rulesPending } from "../../_shared/dept-rules.js";

const json = (b, s) => Response.json(b, { status: s || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedOfficer(request, env, { allowRules: true });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const o = auth.officer;
  return json({ version: RULES_VERSION, pending: rulesPending(o),
    accepted: o.rules_version ? { version: o.rules_version, at: o.rules_accepted_at || null } : null });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedOfficer(request, env, { allowRules: true });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  if (String(b.version || "") !== RULES_VERSION) return json({ error: "The rules have changed. Please read them again.", code: "VERSION" }, 409);
  if (b.agree !== true) return json({ error: "Please tick the box to continue.", fields: { agree: "REQUIRED" } }, 400);
  const o = auth.officer, now = new Date().toISOString();
  try {
    await env.DB.prepare("UPDATE dept_officers SET rules_version = ?, rules_accepted_at = ? WHERE id = ?").bind(RULES_VERSION, now, o.id).run();
  } catch (e) {
    if (/no such column/i.test(String(e && e.message))) return json({ ok: true, notSetUp: true });
    throw e;
  }
  await logDept(env, { officerId: o.id, email: o.email, officeId: o.office_id, action: "RULES_ACCEPTED", detail: { version: RULES_VERSION } });
  return json({ ok: true, version: RULES_VERSION, at: now });
}
