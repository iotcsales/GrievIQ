/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/gov/followups   Follow-up requests on the government dashboards (grieviq-65).
// See _shared/followups.js for the rules.
// GET                       -> { ready, on, counts, items, options }
// GET ?id=<id>              -> one request with every step (opening it as a
//                              recipient records that it was seen)
// GET ?preview=1&toKind&toId&figure[&subject=SELF|DEPT&subjectOfficeId]
//                           -> the figure as it stands now, for the form
// POST { action: create | acknowledge | reply | close, ... }
// Every action is written to gov_view_log as well (can't be changed).
import { getVerifiedGovUser, logGov } from "../../_shared/gov-auth.js";
import {
  followupsReady, listForGov, out, eventsOf, counts, sendOptions, senderSide, recipientSide, createFollowup,
  getFollowup, acknowledge, reply, closeFollowup, markSeen, govActor, stateRow, districtRow, withNames,
} from "../../_shared/followups.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const origin = (env, request) => env.SITE_ORIGIN || new URL(request.url).origin;

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const auth = await getVerifiedGovUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const u = auth.user;
  if (!(await followupsReady(env))) return json({ ready: false, on: false, items: [], counts: null });
  if (q.get("id")) {
    const f = await getFollowup(env, q.get("id"));
    const side = f ? (senderSide(u, f) ? "SENDER" : recipientSide(u, f) ? "RECIPIENT" : null) : null;
    if (!f || !side) { await logGov(env, { userId: u.id, email: u.email, action: "REFUSED", scope: "followup:" + q.get("id") }); return json({ error: "NOT_FOUND" }, 404); }
    if (side === "RECIPIENT") await markSeen(env, f, govActor(u, await stateRow(env, u.state_id), await districtRow(env, u.district_id)));
    await logGov(env, { userId: u.id, email: u.email, action: "FU_VIEWED", scope: "followup:" + f.ref });
    return json({ item: (await withNames(env, [out(f, await eventsOf(env, f.id), side)]))[0] });
  }
  if (q.get("preview") === "1") {
    const r = await createFollowup(env, origin(env, request), u, {
      toKind: q.get("toKind"), toId: q.get("toId"), subject: q.get("subject"), subjectOfficeId: q.get("subjectOfficeId"), figure: q.get("figure"),
    }, { preview: true });
    return json(r.body, r.status);
  }
  const list = await listForGov(env, u);
  const options = await sendOptions(env, u);
  return json({
    ready: true, on: options.on, options,
    counts: counts(list, (f) => recipientSide(u, f)),
    items: await withNames(env, list.map((f) => out(f, null, senderSide(u, f) ? "SENDER" : "RECIPIENT"))),
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedGovUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const u = auth.user;
  if (!(await followupsReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const o = origin(env, request);
  if (b.action === "create") {
    const r = await createFollowup(env, o, u, b);
    if (r.status === 200) await logGov(env, { userId: u.id, email: u.email, action: "FU_CREATED", scope: "followup:" + r.body.ref });
    return json(r.body, r.status);
  }
  const f = await getFollowup(env, b.id);
  if (!f) return json({ error: "NOT_FOUND" }, 404);
  const st = await stateRow(env, u.state_id), d = await districtRow(env, u.district_id);
  let r;
  if (b.action === "acknowledge" || b.action === "reply") {
    if (!recipientSide(u, f)) { await logGov(env, { userId: u.id, email: u.email, action: "REFUSED", scope: "followup:" + f.ref }); return json({ error: "NOT_YOURS" }, 403); }
    r = b.action === "acknowledge" ? await acknowledge(env, o, f, govActor(u, st, d)) : await reply(env, o, f, govActor(u, st, d), b);
  } else if (b.action === "close") {
    if (!senderSide(u, f)) { await logGov(env, { userId: u.id, email: u.email, action: "REFUSED", scope: "followup:" + f.ref }); return json({ error: "NOT_YOURS" }, 403); }
    r = await closeFollowup(env, o, f, u, b);
  } else return json({ error: "Unknown action." }, 400);
  if (r.status === 200) await logGov(env, { userId: u.id, email: u.email, action: "FU_" + String(b.action).toUpperCase(), scope: "followup:" + f.ref });
  return json(r.body, r.status);
}
