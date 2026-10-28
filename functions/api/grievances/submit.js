/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/grievances/submit
// Public, unauthenticated endpoint. Citizens submit a new grievance here.
// No login required. Basic spam protection via honeypot + minimum fill-time.
//
// Sept 2026 (location-first Home, Part 3):
//  - Complaints are refused for a ward that can't take them yet (no ward
//    representative email on file) -- the same rule as the Home page
//    (_shared/place.js openForFiling) and /api/resolve-ward open_for_filing.
//  - An optional pin (pin_lat, pin_lng) is saved with the complaint, rounded
//    to 5 decimal places (about 1 metre). It is kept only if it lies inside
//    the chosen ward's boundary (when that boundary is on file); otherwise it
//    is dropped, so a wrong spot is never saved. Shown to representatives
//    only, never publicly.
//  - Tracking numbers come from the cryptographic random generator.
//
// Item 7c: photos are uploaded privately first (upload-photo.js) and sent
// here as photo_ids (at most 3). They are attached to the new complaint
// only if they are not already attached to another. photo_url is no longer
// written (it held public links before 7c).

import { checkDailyLimits, deviceParts, COMPLAINTS_PER_PHONE, COMPLAINTS_PER_DEVICE } from "../../_shared/daily-limit.js";
import { makeFilingPass } from "../../_shared/citizen-push.js";
// grieviq-73: the checks and the saving moved to _shared/file-complaint.js
// (shared with Community helpers' filings), unchanged.
import { checkComplaint, createComplaint, generateTrackingRef, nextSteps, NOTICE_VERSION } from "../../_shared/file-complaint.js";
export { NOTICE_VERSION };

const jsonRes = (b, status, extra) => new Response(JSON.stringify(b), { status: status || 200, headers: Object.assign({ "Content-Type": "application/json" }, extra || {}) });

export async function onRequestPost({ request, env, waitUntil }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonRes({ error: "Invalid request body." }, 400);
  }
  const { citizen_phone, website, form_loaded_at } = body || {};

  // --- Silent bot handling: pretend success, insert nothing ---
  const tookTooLittleTime =
    typeof form_loaded_at === "number" &&
    Date.now() - form_loaded_at < 3000; // under 3 seconds is not human
  if (website || tookTooLittleTime) {
    return jsonRes({ success: true, tracking_ref: generateTrackingRef(), next: nextSteps({ ack_sla_hours: 48, resolution_sla_hours: 72 }) });
  }

  try {
    const checked = await checkComplaint(env, body);
    if (!checked.ok) return jsonRes(checked.body, checked.status);
    const v = checked.v;

    // grieviq-36: daily limits, per phone number and per device. Checked
    // only for a complaint that would otherwise be filed; the form keeps
    // everything the citizen typed.
    const lim = await checkDailyLimits(env, [
      { name: "complaint-phone", parts: [String(citizen_phone).replace(/\D/g, "").slice(-10)], max: COMPLAINTS_PER_PHONE },
      { name: "complaint-device", parts: deviceParts(request), max: COMPLAINTS_PER_DEVICE },
    ]);
    if (!lim.ok) {
      const byPhone = lim.hit === "complaint-phone";
      return jsonRes({
        error: byPhone
          ? "You've filed " + lim.max + " complaints today with this phone number. To keep GrievIQ fair for everyone, the limit is " + lim.max + " a day. Please try again tomorrow. If it's urgent, call your representative's office."
          : "Many complaints have been filed today from this device. Please try again tomorrow. If it's urgent, call your representative's office.",
        code: "DAILY_LIMIT", which: byPhone ? "PHONE" : "DEVICE", max: lim.max,
      }, 429, { "Retry-After": "3600" });
    }

    const made = await createComplaint(env, v, { origin: env.SITE_ORIGIN || new URL(request.url).origin, waitUntil });
    if (made.error) return jsonRes({ error: "Could not generate a tracking reference. Please try again." }, 500);
    // "Get updates on this phone" (Oct 2026): a one-time pass, valid 24
    // hours, so only the person who just filed can turn updates on here.
    const updatesPass = await makeFilingPass(env, made.id);
    return jsonRes({ success: true, tracking_ref: made.trackingRef, next: nextSteps(v.category), updates_pass: updatesPass || undefined,
      // grieviq-57: the member chosen couldn't take complaints just now, so any member can take it.
      seat_fallback: made.seatFallback || undefined });
  } catch (err) {
    return jsonRes({ error: "Submission failed. Please try again." }, 500);
  }
}
