// functions/_shared/citizen-photo-checks.js
//
// Checks on citizens' complaint photos (approved Oct 2026): FLAG, NEVER BLOCK.
// Someone far away could file a complaint with a picture from the internet;
// these signals help the representative and GrievIQ staff spot that and
// verify before acting. A genuine complaint is never refused because of them
// (people report later, from elsewhere, or without sharing location).
//
// Signals:
//   - where the citizen's phone was when the photo was added (with
//     permission), compared with the complaint's spot (map pin) or, without
//     a pin, its ward boundary
//   - the photo's own location, when the phone kept it (rare on the web)
//   - no camera details at all (often a screenshot or a downloaded picture)
//   - a camera date long before the complaint
//   - the same or a very similar photo on another complaint
//
// Privacy (DPDP Act 2023, data minimisation): the phone's position and the
// photo's GPS are held only until the complaint is filed; then only the
// distance, the accuracy and the verdict are kept, and the positions are
// deleted. Photos never attached to a complaint are removed after 2 days.

import { metresBetween, parseWard, hamming, SIMILAR_BITS } from "./resolution-evidence.js";
import { pointInGeometry, metresToBoundary } from "./geo.js";

export const CITIZEN_FAR_METRES = 1000;  // address-search pins can be a few hundred metres off
export const ROUGH_METRES = 1000;        // a location this rough can't be judged
export const OLD_PHOTO_DAYS = 30;

function num(v) { const n = Number(v); return v != null && v !== "" && isFinite(n) ? n : null; }
function toMs(v) { if (!v) return NaN; let s = String(v); if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s = s.replace(" ", "T") + "Z"; return Date.parse(s); }

// Where a point is relative to the complaint's place. Returns
// { where: NEAR|FAR|IN_WARD|OUTSIDE_WARD|ROUGH|NO_PLACE, metres, accuracy }.
export function placeVerdict(lat, lng, accuracy, pin, ward) {
  const acc = accuracy == null ? 0 : Math.round(Number(accuracy) || 0);
  if (acc > ROUGH_METRES) return { where: "ROUGH", metres: null, accuracy: acc };
  if (pin && num(pin.lat) != null && num(pin.lng) != null) {
    const m = Math.round(metresBetween(Number(pin.lat), Number(pin.lng), lat, lng));
    return { where: m - acc > CITIZEN_FAR_METRES ? "FAR" : "NEAR", metres: m, accuracy: acc };
  }
  if (ward) {
    if (pointInGeometry(lng, lat, ward)) return { where: "IN_WARD", metres: null, accuracy: acc };
    const d = metresToBoundary(lng, lat, ward);
    return { where: "OUTSIDE_WARD", metres: d == null ? null : Math.round(d), accuracy: acc };
  }
  return { where: "NO_PLACE", metres: null, accuracy: acc };
}

export async function wardShape(env, unitId) {
  if (!unitId) return null;
  try {
    const u = await env.DB.prepare("SELECT ward_boundary_geojson FROM local_units WHERE id = ?").bind(String(unitId)).first();
    return u ? parseWard(u.ward_boundary_geojson) : null;
  } catch (e) { return null; }
}

// When the complaint is filed: work out each new photo's checks against the
// final spot, look for the same photo on other complaints, then delete the
// positions. Never throws (a complaint is never lost over a check).
export async function checkAttachedPhotos(env, g) {
  try {
    const { results: rows } = await env.DB.prepare("SELECT * FROM complaint_photos WHERE grievance_id = ? AND checked_at IS NULL").bind(g.id).all();
    if (!rows || !rows.length) return 0;
    const pin = num(g.pin_lat) != null && num(g.pin_lng) != null ? { lat: g.pin_lat, lng: g.pin_lng } : null;
    const ward = pin ? null : await wardShape(env, g.local_unit_id);
    const now = new Date().toISOString();
    for (const p of rows) {
      let dev = { where: null, metres: null, accuracy: p.dev_accuracy };
      if (p.dev_status === "OK" && num(p.dev_lat) != null && num(p.dev_lng) != null) dev = placeVerdict(Number(p.dev_lat), Number(p.dev_lng), p.dev_accuracy, pin, ward);
      let gps = { where: null, metres: null };
      if (num(p.gps_lat) != null && num(p.gps_lng) != null) gps = placeVerdict(Number(p.gps_lat), Number(p.gps_lng), 0, pin, ward);
      // The same (or a very similar) picture on another complaint.
      let dup = null;
      if (p.sha256) {
        const same = await env.DB.prepare("SELECT grievance_id FROM complaint_photos WHERE sha256 = ? AND grievance_id IS NOT NULL AND grievance_id <> ? LIMIT 1").bind(p.sha256, g.id).first();
        if (same) dup = { id: same.grievance_id, kind: "exact" };
      }
      if (!dup && p.dhash) {
        const { results: others } = await env.DB.prepare(
          "SELECT grievance_id, dhash FROM complaint_photos WHERE dhash IS NOT NULL AND grievance_id IS NOT NULL AND grievance_id <> ? ORDER BY created_at DESC LIMIT 3000"
        ).bind(g.id).all();
        const hit = (others || []).find((o) => hamming(o.dhash, p.dhash) <= SIMILAR_BITS);
        if (hit) dup = { id: hit.grievance_id, kind: "similar" };
      }
      await env.DB.prepare(
        `UPDATE complaint_photos SET dev_where = ?, dev_distance_m = ?, dev_accuracy = ?, gps_where = ?, gps_distance_m = ?,
           dup_grievance_id = ?, dup_kind = ?, checked_at = ?, dev_lat = NULL, dev_lng = NULL, gps_lat = NULL, gps_lng = NULL
         WHERE id = ?`
      ).bind(dev.where, dev.metres, dev.accuracy == null ? null : Math.round(Number(dev.accuracy) || 0), gps.where, gps.metres,
        dup ? dup.id : null, dup ? dup.kind : null, now, p.id).run();
    }
    return rows.length;
  } catch (e) { return 0; }
}

// The signals shown to representatives and GrievIQ staff under a citizen's
// photo. Photos from before Oct 2026 (never checked) show nothing.
export function citizenPhotoWarnings(p, filedAt) {
  const out = [];
  if (!p || !p.checked_at) return out;
  const acc = p.dev_accuracy;
  switch (p.dev_where) {
    case "NEAR": out.push({ code: "C_DEV_NEAR", level: "info", metres: p.dev_distance_m, accuracy: acc }); break;
    case "FAR": out.push({ code: "C_DEV_FAR", level: "warn", metres: p.dev_distance_m, accuracy: acc }); break;
    case "IN_WARD": out.push({ code: "C_DEV_IN_WARD", level: "info", accuracy: acc }); break;
    case "OUTSIDE_WARD": out.push({ code: "C_DEV_OUTSIDE_WARD", level: "warn", metres: p.dev_distance_m, accuracy: acc }); break;
    case "ROUGH": out.push({ code: "C_DEV_ROUGH", level: "info", accuracy: acc }); break;
    case "NO_PLACE": out.push({ code: "C_DEV_NO_PLACE", level: "info" }); break;
    default:
      if (p.dev_status === "TIMEOUT" || p.dev_status === "UNAVAILABLE") out.push({ code: "C_DEV_NO_FIX", level: "info" });
      else if (p.dev_status && p.dev_status !== "OK") out.push({ code: "C_DEV_NOT_SHARED", level: "info" });
  }
  // Taken with "Take a photo" while filing (Oct 2026 fix). iPhone removes the
  // camera details from these, so the "no camera details" check doesn't apply.
  const live = p.capture_kind === "CAMERA";
  if (live) out.push({ code: "C_CAMERA_LIVE", level: "info" });
  switch (p.gps_where) {
    case "NEAR": out.push({ code: "C_GPS_NEAR", level: "info", metres: p.gps_distance_m }); break;
    case "FAR": out.push({ code: "C_GPS_FAR", level: "warn", metres: p.gps_distance_m }); break;
    case "IN_WARD": out.push({ code: "C_GPS_IN_WARD", level: "info" }); break;
    case "OUTSIDE_WARD": out.push({ code: "C_GPS_OUTSIDE_WARD", level: "warn", metres: p.gps_distance_m }); break;
    default: break;
  }
  if (!live && Number(p.has_camera) === 0 && !p.taken_at) out.push({ code: "C_NO_CAMERA", level: "warn" });
  const taken = toMs(p.taken_at), filed = toMs(filedAt);
  if (!isNaN(taken) && !isNaN(filed) && taken < filed - OLD_PHOTO_DAYS * 86400000) out.push({ code: "C_OLD_PHOTO", level: "warn", takenAt: p.taken_at });
  if (p.dup_grievance_id) out.push({ code: "C_DUP", level: "warn", kind: p.dup_kind || "exact" });
  return out;
}

// SQL condition (photos table alias cp, complaint alias g) for "this photo
// has a warning", for the dashboard count.
export const WARN_SQL = `(cp.dev_where IN ('FAR','OUTSIDE_WARD') OR cp.gps_where IN ('FAR','OUTSIDE_WARD') OR cp.dup_grievance_id IS NOT NULL
  OR (cp.has_camera = 0 AND cp.taken_at IS NULL AND COALESCE(cp.capture_kind, '') <> 'CAMERA')
  OR (cp.taken_at IS NOT NULL AND datetime(cp.taken_at) < datetime(REPLACE(REPLACE(g.created_at, 'T', ' '), 'Z', ''), '-${OLD_PHOTO_DAYS} days')))`;
