/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/admin/followups   (grieviq-65)
// Follow-up requests between government officials, read only, for the
// super admin, operations admin and auditor (view_gov). Nobody at GrievIQ
// can write in a request, or read its words: they belong to the officials.
//   GET          -> { ready, items: [...last 300], settings }
//   GET ?id=<id> -> one request with every step
import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
import { followupsReady, out, eventsOf, getFollowup, settingsList, withNames } from "../../_shared/followups.js";

// The words of a request stay with the officials: GrievIQ staff see who,
// which figure, the dates and the status, never the note, replies or reasons.
function bare(x) { x.note = null; x.closedReason = null; if (x.events) x.events = x.events.map((e) => Object.assign(e, { text: null })); return x; }
const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_gov");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await followupsReady(env))) return json({ ready: false, items: [] });
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const f = await getFollowup(env, id);
    if (!f) return json({ error: "NOT_FOUND" }, 404);
    return json({ item: bare((await withNames(env, [out(f, await eventsOf(env, f.id), null)]))[0]) });
  }
  const { results } = await env.DB.prepare("SELECT * FROM followups ORDER BY updated_at DESC LIMIT 300").all();
  return json({ ready: true, items: (await withNames(env, (results || []).map((f) => out(f, null, null)))).map(bare), settings: await settingsList(env) });
}
