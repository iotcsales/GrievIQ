/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/sms-code   { phone }   (grieviq-82)
//
// When a super admin has switched on "SMS code before filing" (admin Misuse page; only possible
// once an SMS provider is set up), the complaint form asks for a 6-digit code sent to the
// citizen's phone. This sends it. Limits (each SMS costs money and could be used to annoy someone):
// 3 codes per number per 15 minutes, 10 per device a day. Codes work for 10 minutes, once
// (checked in grievances/submit.js). Codes are deleted when used or a day later.
import { smsRequired, sendSms, sixDigits, phone10 } from "../_shared/misuse.js";
import { checkDailyLimits, deviceParts } from "../_shared/daily-limit.js";

const json = (b, s, h) => new Response(JSON.stringify(b), { status: s || 200, headers: Object.assign({ "Content-Type": "application/json" }, h || {}) });

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  if (!(await smsRequired(env))) return json({ error: "SMS codes aren't used right now.", code: "OFF" }, 409);
  const ph = phone10(b && b.phone);
  if (!/^[6-9]\d{9}$/.test(ph)) return json({ error: "Please enter a valid 10-digit mobile number.", fields: { phone: "FORMAT" } }, 400);
  const now = Date.now();
  await env.DB.prepare("DELETE FROM grievance_otp WHERE purpose = 'SUBMIT' AND channel = 'SMS' AND (verified = 1 OR created_at < ?)").bind(new Date(now - 86400000).toISOString()).run();
  const recent = await env.DB.prepare("SELECT COUNT(*) n FROM grievance_otp WHERE phone = ? AND purpose = 'SUBMIT' AND channel = 'SMS' AND created_at >= ?").bind(ph, new Date(now - 15 * 60000).toISOString()).first();
  if (recent && recent.n >= 3) return json({ error: "Three codes have been sent to this number in the last 15 minutes. Please wait and try again.", code: "TOO_MANY" }, 429, { "Retry-After": "900" });
  const lim = await checkDailyLimits(env, [{ name: "sms-device", parts: deviceParts(request), max: 10 }]);
  if (!lim.ok) return json({ error: "Many codes have been sent from this device today. Please try again tomorrow.", code: "DAILY_LIMIT" }, 429, { "Retry-After": "3600" });
  const code = sixDigits();
  // A new code replaces any earlier unused one for this number.
  await env.DB.prepare("UPDATE grievance_otp SET otp_code = '', failed_attempts = 99 WHERE phone = ? AND purpose = 'SUBMIT' AND channel = 'SMS' AND verified = 0").bind(ph).run();
  await env.DB.prepare("INSERT INTO grievance_otp (id, phone, otp_code, purpose, verified, expires_at, created_at, channel, failed_attempts) VALUES (?, ?, ?, 'SUBMIT', 0, ?, ?, 'SMS', 0)")
    .bind(crypto.randomUUID(), ph, code, new Date(now + 10 * 60000).toISOString(), new Date(now).toISOString()).run();
  const sent = await sendSms(env, ph, code);
  if (!sent.ok) return json({ error: "We couldn't send the SMS just now. Please try again in a few minutes.", code: "SEND_FAILED" }, 502);
  return json({ sent: true, minutes: 10 });
}
