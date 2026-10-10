// functions/api/notifications.js
//
// The notification bell in the rep console (approved Oct 2026).
//
// GET  -> { unread, items, push: { configured, key, devices } }
//         Checking the bell doesn't count as activity, so the 60-minute
//         idle sign-out still happens (NIST SP 800-63B).
// POST { action: "read", ids: [...] | all: true }
// POST { action: "seen", ids: [...] }  -> the person opened the bell list and saw
//         these (no 6-hour reminder email for them); the automatic check
//         every minute never counts as seen
// POST { action: "subscribe", subscription: {endpoint, keys:{p256dh, auth}}, lang, device }
// POST { action: "unsubscribe", endpoint }
// POST { action: "test" }  -> sends a test notification to this person's devices
//
// A person only ever sees and changes their own notices and devices.
// Device addresses must belong to a known browser push service (Google,
// Apple, Mozilla, Microsoft), so GrievIQ never posts to arbitrary sites.

import { getVerifiedRep } from "../_shared/get-verified-rep.js";
import { noticeBoxGet, noticeBoxPost, json, allowedEndpoint } from "../_shared/notice-box.js";

export { allowedEndpoint };

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedRep(request, env, { noTouch: true });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  return noticeBoxGet(env, auth.email);
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  return noticeBoxPost(env, auth.email, body, "/rep");
}
