// POST /api/photo-place-check
// The complaint form's note under a photo the citizen just added: how far
// the phone was from the spot marked (or whether it was inside the chosen
// ward). Public; nothing is stored -- the real check is made again when the
// complaint is filed (functions/_shared/citizen-photo-checks.js).
//
// { local_unit_id, pin_lat?, pin_lng?, lat, lng, accuracy }
//   -> { where: NEAR|FAR|IN_WARD|OUTSIDE_WARD|ROUGH|NO_PLACE, metres, accuracy }

import { placeVerdict, wardShape } from "../_shared/citizen-photo-checks.js";

function json(body, status) { return Response.json(body, { status: status || 200, headers: { "Cache-Control": "no-store" } }); }
const coord = (v, max) => { const n = Number(v); return v != null && v !== "" && isFinite(n) && Math.abs(n) <= max ? n : null; };

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const lat = coord(b.lat, 90), lng = coord(b.lng, 180);
  if (lat == null || lng == null) return json({ error: "No location." }, 400);
  const pinLat = coord(b.pin_lat, 90), pinLng = coord(b.pin_lng, 180);
  const pin = pinLat != null && pinLng != null ? { lat: pinLat, lng: pinLng } : null;
  const ward = pin ? null : await wardShape(env, String(b.local_unit_id || "").slice(0, 80));
  const acc = Math.max(0, Math.min(100000, Math.round(Number(b.accuracy) || 0)));
  return json(placeVerdict(lat, lng, acc, pin, ward));
}
