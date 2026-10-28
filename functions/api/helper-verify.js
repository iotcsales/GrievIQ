/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/helper-verify?h=GIQ-H-0001&t=<minute>.<signature>   (public; grieviq-74)
// GET ...&photo=1                                             the card photo
//
// What a citizen sees after scanning a Community helper's digital ID card
// with their OWN phone. The QR value changes every minute and works for 3
// minutes (_shared/helpers.js cardToken), so a screenshot or a copied card
// soon stops working. Answers:
//   { valid: true, ref, place, since, photo }   a genuine helper, active now
//   { valid: false, reason }   EXPIRED (an old QR: ask for the card again),
//                              BAD (not a GrievIQ card), NOT_ACTIVE, NOT_FOUND
// Never the helper's name, mobile or email. The card photo is given only
// with a valid, current QR (never for a typed number), and only once GrievIQ
// staff have confirmed it. At most 120 checks a day from one device.

import { helpersReady, helperRefOk, stateOf, electionPause, cardTokenCheck } from "../_shared/helpers.js";
import { istToday } from "../_shared/site-settings.js";
import { checkDailyLimits, deviceParts } from "../_shared/daily-limit.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const ref = String(url.searchParams.get("h") || "").toUpperCase().replace(/\s+/g, "").slice(0, 20);
  const t = String(url.searchParams.get("t") || "").slice(0, 40);
  const wantPhoto = url.searchParams.get("photo") === "1";
  if (!helperRefOk(ref)) return json({ valid: false, reason: "BAD" }, 400);
  if (!(await helpersReady(env))) return json({ valid: false, reason: "NOT_FOUND" });
  if (!wantPhoto) {
    const lim = await checkDailyLimits(env, [{ name: "helper-verify", parts: deviceParts(request), max: 120 }]);
    if (!lim.ok) return json({ valid: false, reason: "TOO_MANY" }, 429);
  }
  const tok = await cardTokenCheck(env, ref, t);
  if (tok !== "OK") return wantPhoto ? new Response(null, { status: 404 }) : json({ valid: false, reason: tok, ref });
  let h = null;
  try { h = await env.DB.prepare("SELECT h.*, lu.name AS unit_name, ar.name AS area_name FROM helpers h LEFT JOIN local_units lu ON lu.id = h.unit_id LEFT JOIN areas ar ON ar.id = h.area_id WHERE h.ref = ?").bind(ref).first(); }
  catch (e) { h = null; }
  if (!h) return wantPhoto ? new Response(null, { status: 404 }) : json({ valid: false, reason: "NOT_FOUND", ref });
  const today = istToday();
  const pause = await electionPause(env, h, today);
  const st = stateOf(h, today, pause);
  const active = h.status === "ACTIVE" && st.canHelp;
  const photoOk = active && h.card_key && h.card_status === "OK" && !!env.PRIVATE_PHOTOS;
  if (wantPhoto) {
    if (!photoOk) return new Response(null, { status: 404 });
    const obj = await env.PRIVATE_PHOTOS.get(h.card_key);
    if (!obj) return new Response(null, { status: 404 });
    return new Response(obj.body, { headers: { "Content-Type": /\.png$/.test(h.card_key) ? "image/png" : /\.webp$/.test(h.card_key) ? "image/webp" : "image/jpeg", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
  }
  if (!active) return json({ valid: false, reason: "NOT_ACTIVE", ref, election: !!pause });
  return json({ valid: true, ref, place: [h.unit_name, h.area_name].filter(Boolean).join(", "), since: String(h.approved_at || "").slice(0, 7), photo: !!photoOk, checkedAt: new Date().toISOString() });
}
