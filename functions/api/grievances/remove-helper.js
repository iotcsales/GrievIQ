/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/grievances/remove-helper   (citizen, Track page; grieviq-73)
// { email, trackingRef, reason?: "DIDNT_ASK" | "NO_LONGER" | "OTHER" }
//
// The citizen removes the Community helper from their complaint. Proof of
// identity: the email code they entered on /status in the last 15 minutes
// (the same as confirming a fix). It can't be undone. At once the helper
// can't see the complaint any more, and gets a notice with no details of
// it. "I didn't ask this person for help" also warns GrievIQ staff and is a
// strike against the helper (3 strikes pause them). The complaint itself
// carries on exactly as before.

import { addStrike } from "../../_shared/helper-filing.js";
import { logHelper, emailHelper } from "../../_shared/helpers.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const REASONS = ["DIDNT_ASK", "NO_LONGER", "OTHER"];

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "BODY" }, 400); }
  const email = String((b && b.email) || "").trim().toLowerCase(), ref = String((b && b.trackingRef) || "").trim();
  if (!email || !ref) return json({ error: "email and trackingRef are required" }, 400);
  const reason = b.reason == null || b.reason === "" ? null : String(b.reason);
  if (reason && !REASONS.includes(reason)) return json({ error: "CHECK_FIELDS", fields: { reason: "UNKNOWN" } }, 400);
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const ok = await env.DB.prepare(
    "SELECT id FROM grievance_otp WHERE LOWER(email) = LOWER(?) AND purpose = 'STATUS_CHECK' AND verified = 1 AND verified_at >= ? ORDER BY verified_at DESC LIMIT 1"
  ).bind(email, windowStart).first();
  if (!ok) return json({ error: "VERIFY_AGAIN" }, 401);
  let g;
  try { g = await env.DB.prepare("SELECT id, citizen_email, helper_id, helper_removed_at FROM grievances WHERE tracking_ref = ?").bind(ref).first(); }
  catch (e) { return json({ error: "NOT_READY" }, 409); }
  if (!g || !g.citizen_email || g.citizen_email.toLowerCase() !== email) return json({ error: "NOT_FOUND" }, 404);
  if (!g.helper_id || g.helper_removed_at) return json({ error: "NO_HELPER" }, 409);
  const now = new Date().toISOString();
  const r = await env.DB.prepare("UPDATE grievances SET helper_removed_at = ? WHERE id = ? AND helper_removed_at IS NULL").bind(now, g.id).run();
  if (!r.meta || r.meta.changes !== 1) return json({ error: "NO_HELPER" }, 409);
  await env.DB.prepare("UPDATE helper_filings SET removed_at = ?, remove_reason = ? WHERE grievance_id = ?").bind(now, reason, g.id).run();
  const origin = new URL(request.url).origin;
  const h = await env.DB.prepare("SELECT * FROM helpers WHERE id = ?").bind(g.helper_id).first();
  if (h) {
    await logHelper(env, h.id, "citizen", "REMOVED_FROM_CASE", { reason });
    // A notice with no details of the complaint.
    await emailHelper(env, origin, h, "GrievIQ: a citizen removed you from a complaint",
      ["A citizen has removed you from a complaint you helped with. You can no longer see it on your Community helper page."]);
    if (reason === "DIDNT_ASK") await addStrike(env, origin, h.id, "NOT_ASKED_REMOVED");
  }
  return json({ ok: true });
}
