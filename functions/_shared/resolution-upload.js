// functions/_shared/resolution-upload.js
//
// Storing one "after" photo (moved out of api/grievances/[id]/resolution-photo.js
// in grieviq-32 so the department dashboard uses exactly the same checks).
// See that file's header for what is checked and recorded. The caller has
// already checked who may add a photo to this case.
//   g: { id, status, local_unit_id, created_at, pin_lat, pin_lng, photo_url, ward_boundary_geojson }

import { readExif } from "./exif.js";
import { photoMedia, legacyKey, legacyUrls, THUMB_MAX_BYTES } from "./photo-store.js";
import {
  sniffImage, sha256Hex, validDhash, hamming, SIMILAR_BITS, MAX_PHOTO_BYTES, photoWarnings, parseWard,
} from "./resolution-evidence.js";


function readDevice(form) {
  const status = String(form.get("dev_status") || "").toUpperCase();
  if (status === "DENIED" || status === "UNAVAILABLE") return { status, lat: null, lng: null, acc: null };
  if (status !== "OK") return { status: null, lat: null, lng: null, acc: null };
  const lat = Number(form.get("dev_lat")), lng = Number(form.get("dev_lng")), acc = Number(form.get("dev_acc"));
  if (!isFinite(lat) || !isFinite(lng) || lat < 6 || lat > 38 || lng < 68 || lng > 98) return { status: "UNAVAILABLE", lat: null, lng: null, acc: null };
  return { status: "OK", lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, acc: isFinite(acc) && acc >= 0 ? Math.min(Math.round(acc), 100000) : null };
}

const MAX_UNATTACHED = 6;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Old public photos not yet moved to private storage (before 7c).
function citizenPhotoKeys(photoUrl) {
  return legacyUrls(photoUrl).map(legacyKey).filter(Boolean);
}


export async function storeResolutionPhoto(env, g, request, uploadedBy) {
  if (!env.PRIVATE_PHOTOS) {
    return Response.json({ error: "Photo storage isn't set up yet. Please tell GrievIQ support.", code: "STORAGE_NOT_SET" }, { status: 503 });
  }

  let form;
  try { form = await request.formData(); } catch (e) { return Response.json({ error: "No photo was provided.", code: "NO_FILE" }, { status: 400 }); }
  const file = form.get("photo");
  if (!file || typeof file === "string") return Response.json({ error: "No photo was provided.", code: "NO_FILE" }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES) return Response.json({ error: "Photo must be smaller than 5 MB.", code: "TOO_BIG" }, { status: 400 });

  const buf = await file.arrayBuffer();
  const type = sniffImage(new Uint8Array(buf, 0, Math.min(16, buf.byteLength)));
  if (!type) return Response.json({ error: "Only JPG, PNG or WEBP photos can be added.", code: "BAD_TYPE" }, { status: 400 });

  const waiting = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM resolution_photos WHERE grievance_id = ? AND report_id IS NULL"
  ).bind(g.id).first();
  if (waiting && waiting.n >= MAX_UNATTACHED) {
    return Response.json({ error: "Too many photos are waiting for this case. Reload the page and try again.", code: "TOO_MANY" }, { status: 400 });
  }

  const sha = await sha256Hex(buf);
  const dhash = validDhash(String(form.get("dhash") || "").toLowerCase());
  const exif = type === "image/jpeg" ? readExif(buf) : { takenAt: null, lat: null, lng: null };
  const dev = readDevice(form);

  // Same photo already used on another case?
  let dupId = null, dupKind = null;
  const exact = await env.DB.prepare(
    "SELECT grievance_id FROM resolution_photos WHERE sha256 = ? AND grievance_id <> ? LIMIT 1"
  ).bind(sha, g.id).first();
  if (exact) { dupId = exact.grievance_id; dupKind = "exact"; }
  else if (dhash) {
    const { results } = await env.DB.prepare(
      "SELECT grievance_id, dhash FROM resolution_photos WHERE dhash IS NOT NULL AND grievance_id <> ? ORDER BY created_at DESC LIMIT 20000"
    ).bind(g.id).all();
    const hit = (results || []).find((r) => hamming(r.dhash, dhash) <= SIMILAR_BITS);
    if (hit) { dupId = hit.grievance_id; dupKind = "similar"; }
  }

  // One of the citizen's own "before" photos, sent back as the "after"?
  let matchesCitizen = 0;
  const { results: citizenRows } = await env.DB.prepare(
    "SELECT sha256, dhash FROM complaint_photos WHERE grievance_id = ?"
  ).bind(g.id).all();
  for (const c of citizenRows || []) {
    if (c.sha256 === sha || (dhash && c.dhash && hamming(c.dhash, dhash) <= SIMILAR_BITS)) { matchesCitizen = 1; break; }
  }
  for (const k of matchesCitizen ? [] : citizenPhotoKeys(g.photo_url)) {
    try {
      const obj = await env.PHOTOS.get(k);
      if (obj && obj.size === buf.byteLength && (await sha256Hex(await obj.arrayBuffer())) === sha) { matchesCitizen = 1; break; }
    } catch (e) { /* can't read it: no match */ }
  }

  // Small preview made on the phone (optional: older phones may not make one).
  let thumb = null;
  const thumbFile = form.get("thumb");
  if (thumbFile && typeof thumbFile !== "string" && thumbFile.size > 0 && thumbFile.size <= THUMB_MAX_BYTES) {
    const t = await thumbFile.arrayBuffer();
    if (sniffImage(new Uint8Array(t, 0, Math.min(16, t.byteLength))) === "image/jpeg") thumb = t;
  }

  const id = crypto.randomUUID();
  const key = "resolution-photos/" + id + "." + EXT[type];
  const thumbKey = thumb ? "resolution-photos/" + id + "-thumb.jpg" : null;
  await env.PRIVATE_PHOTOS.put(key, buf, { httpMetadata: { contentType: type } });
  if (thumb) await env.PRIVATE_PHOTOS.put(thumbKey, thumb, { httpMetadata: { contentType: "image/jpeg" } });
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO resolution_photos
       (id, grievance_id, report_id, r2_key, content_type, byte_size, sha256, dhash, taken_at, gps_lat, gps_lng,
        dup_grievance_id, dup_kind, matches_citizen, uploaded_by, created_at,
        dev_lat, dev_lng, dev_accuracy, dev_status, thumb_key, thumb_size)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, g.id, key, type, buf.byteLength, sha, dhash, exif.takenAt, exif.lat, exif.lng,
    dupId, dupKind, matchesCitizen, uploadedBy, now, dev.lat, dev.lng, dev.acc, dev.status,
    thumbKey, thumb ? thumb.byteLength : null).run();

  const row = { taken_at: exif.takenAt, gps_lat: exif.lat, gps_lng: exif.lng, dup_grievance_id: dupId, dup_kind: dupKind, matches_citizen: matchesCitizen, created_at: now,
    dev_lat: dev.lat, dev_lng: dev.lng, dev_accuracy: dev.acc, dev_status: dev.status };
  const warnings = photoWarnings(g, row, parseWard(g.ward_boundary_geojson)).map((w) => { const c = Object.assign({}, w); delete c.otherCaseId; return c; });
  const media = await photoMedia(env, { id, thumb_key: thumbKey }, "r");
  return Response.json({ id, url: media.url, thumbUrl: media.thumbUrl, takenAt: exif.takenAt, warnings });
}
