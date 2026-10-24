/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/dept/followups   Follow-up requests sent to a department office by
// state or district officials (grieviq-65). Officers read, acknowledge and
// reply; they never send. See _shared/followups.js.
// GET            -> { ready, counts, items }
// GET ?id=<id>   -> one request with every step (records that it was seen)
// POST { action: acknowledge | reply, id, text?, letterRef? }
import { getVerifiedOfficer, logDept } from "../../_shared/dept-auth.js";
import { followupsReady, listForOffice, out, eventsOf, counts, officeSide, getFollowup, acknowledge, reply, markSeen, officerActor, withNames } from "../../_shared/followups.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedOfficer(request, env, { allowPaused: true });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const o = auth.officer;
  if (!(await followupsReady(env))) return json({ ready: false, items: [], counts: null });
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const f = await getFollowup(env, id);
    if (!f || !officeSide(o, f)) return json({ error: "NOT_FOUND" }, 404);
    await markSeen(env, f, officerActor(o));
    return json({ item: (await withNames(env, [out(f, await eventsOf(env, f.id), "RECIPIENT")]))[0] });
  }
  const list = await listForOffice(env, o.office_id);
  return json({ ready: true, counts: counts(list, () => true), items: await withNames(env, list.map((f) => out(f, null, "RECIPIENT"))) });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedOfficer(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const o = auth.officer;
  if (!(await followupsReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const f = await getFollowup(env, b.id);
  if (!f || !officeSide(o, f)) return json({ error: "NOT_FOUND" }, 404);
  const origin = env.SITE_ORIGIN || new URL(request.url).origin;
  let r;
  if (b.action === "acknowledge") r = await acknowledge(env, origin, f, officerActor(o));
  else if (b.action === "reply") r = await reply(env, origin, f, officerActor(o), b);
  else return json({ error: "Unknown action." }, 400);
  if (r.status === 200) { try { await logDept(env, { officerId: o.id, email: o.email, officeId: o.office_id, action: "FOLLOWUP_" + String(b.action).toUpperCase(), detail: { ref: f.ref } }); } catch (e) { /* logging never blocks */ } }
  return json(r.body, r.status);
}
