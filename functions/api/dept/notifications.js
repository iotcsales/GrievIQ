// /api/dept/notifications   The bell on the department dashboard (grieviq-35).
// Same actions as the rep console's /api/notifications (see
// _shared/notice-box.js); an officer only ever sees and changes their own
// notices and devices, filed under "dept:<officer id>".
import { getVerifiedOfficer, officerRecipient } from "../../_shared/dept-auth.js";
import { noticeBoxGet, noticeBoxPost, json } from "../../_shared/notice-box.js";

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedOfficer(request, env, { noTouch: true });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  return noticeBoxGet(env, officerRecipient(auth.officer.id));
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedOfficer(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  return noticeBoxPost(env, officerRecipient(auth.officer.id), body, "/dept");
}
