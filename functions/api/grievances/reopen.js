// POST /api/grievances/reopen   (citizen, after the email code)
//
// Item 7d: the citizen reopens a resolved case, once, within 30 days of it
// closing. It goes one level up with a fresh clock (_shared/reopen.js).
// Body: { email, trackingRef, reason, note }. Same identity proof as
// confirm-resolution.js / dispute-resolution.js: the email was verified
// with a code in the last 15 minutes and the case belongs to it.

import { settleOverdueConfirmations } from "../../_shared/confirmation.js";
import { resolveChain } from "../../_shared/jurisdiction.js";
import { reopenStatus, readReopenInput, reopenCase } from "../../_shared/reopen.js";

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return reply(400, { error: "Invalid request body." }); }
  const email = String(body.email || "").trim();
  const trackingRef = String(body.trackingRef || "").trim();
  if (!email || !trackingRef) return reply(400, { error: "email and trackingRef are required" });

  const input = readReopenInput(body.reason, body.note);
  if (input.error) return reply(400, { error: input.error, code: "INVALID", fields: input.fields });

  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const recentOtp = await env.DB.prepare(
    `SELECT id FROM grievance_otp
     WHERE LOWER(email) = LOWER(?) AND purpose = 'STATUS_CHECK' AND verified = 1
     AND verified_at >= ?
     ORDER BY verified_at DESC LIMIT 1`
  ).bind(email, windowStart).first();
  if (!recentOtp) return reply(401, { error: "Please verify your email again before responding", code: "VERIFY_AGAIN" });

  // A case whose waiting time has run out is closed first.
  await settleOverdueConfirmations(env);

  const g = await env.DB.prepare("SELECT * FROM grievances WHERE tracking_ref = ?").bind(trackingRef).first();
  if (!g || !g.citizen_email || g.citizen_email.toLowerCase() !== email.toLowerCase()) {
    return reply(404, { error: "Case not found for this email" });
  }

  const st = reopenStatus(g);
  if (!st.can) {
    const msg = st.code === "ALREADY_REOPENED" ? "This case has already been reopened once."
      : st.code === "TOO_LATE" ? "The time to reopen this case has passed."
      : "This case isn't closed, so it can't be reopened.";
    return reply(409, { error: msg, code: st.code });
  }

  const chain = await resolveChain(env, g.local_unit_id);
  if (!chain) return reply(500, { error: "Could not find who handles this area." });

  const done = await reopenCase(env, g, chain, input, { actor: "citizen" });
  if (!done.ok) return reply(409, { error: "This case can't be reopened now. Refresh the page.", code: done.code });
  return reply(200, { reopened: true, toTier: done.toTier, toLabel: done.toLabel, atTop: done.atTop });
}
