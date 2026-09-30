// POST /api/grievances/[id]/resolution-photo   (representatives only)
//
// Uploads one "after" photo for a case the rep is about to mark resolved
// (item 7b). multipart/form-data: photo (the file), dhash (optional, the
// browser's 16-hex visual fingerprint, used only for "similar photo"
// warnings). The photo is stored privately (resolution-photos/ in R2, no
// public link) and joined to the resolution report when the rep submits
// "Mark resolved" (mark-resolved.js).
//
// Storage: a SEPARATE R2 bucket with no public access (binding
// PRIVATE_PHOTOS). The citizens' bucket (PHOTOS) has a public address, so
// "after" photos are never put there. If PRIVATE_PHOTOS isn't set up, the
// upload is refused with a clear message rather than stored publicly.
//
// Checks (OWASP file upload guidance): the rep must have jurisdiction over
// the case, the case must still be open, the file's real type is read from
// its first bytes (JPEG, PNG or WEBP only), 5 MB limit, file name chosen by
// us, and at most 6 photos waiting unattached per case.
//
// Also recorded for the warnings (never to block): the photo's own date and
// GPS (EXIF), an exact fingerprint (SHA-256), whether it matches a photo on
// another case (exactly, or visually similar), and whether it is one of the
// citizen's own "before" photos.
//
// Also accepted (item 7b-1 update): where the rep's phone was when adding
// the photo -- dev_status (OK / DENIED / UNAVAILABLE), dev_lat, dev_lng,
// dev_acc (metres) -- from the browser, asked for with their permission.
// Phones strip a photo's own location when uploading from a website, so
// this is the main location check. Only stored when inside a rough box
// around India.
//
// Item 7c: also accepts thumb, a small preview (JPEG, 320 px) made on the
// phone; the original is kept unchanged (its date and GPS are evidence).
// "One of the citizen's own photos" now also compares with the citizen's
// private photos (complaint_photos): same file, or a visually similar one.

import { getVerifiedRep } from "../../../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate } from "../../../_shared/jurisdiction.js";
import { readExif } from "../../../_shared/exif.js";
import { caseAccess, canWorkCases } from "../../../_shared/team.js";
import { photoMedia, legacyKey, legacyUrls, THUMB_MAX_BYTES } from "../../../_shared/photo-store.js";
import {
  sniffImage, sha256Hex, validDhash, hamming, SIMILAR_BITS, MAX_PHOTO_BYTES, photoWarnings, parseWard,
} from "../../../_shared/resolution-evidence.js";

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

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const g = await env.DB.prepare(
    `SELECT g.id, g.status, g.local_unit_id, g.created_at, g.pin_lat, g.pin_lng, g.photo_url, lu.ward_boundary_geojson
     FROM grievances g LEFT JOIN local_units lu ON lu.id = g.local_unit_id WHERE g.id = ?`
  ).bind(params.id).first();
  if (!g) return Response.json({ error: "Grievance not found" }, { status: 404 });
  if (g.status === "RESOLVED" || g.status === "CLOSED" || g.status === "PENDING_CONFIRMATION") {
    return Response.json({ error: "This case is already resolved or awaiting confirmation" }, { status: 409 });
  }

  // Item 8b: a field worker only for a case assigned to them.
  const access = await caseAccess(env, auth, g, getLocalUnitIdsForMandate);
  if (!access) return Response.json({ error: "You do not have jurisdiction over this case" }, { status: 403 });
  // Item 8c-1: an office assistant only looks.
  if (!canWorkCases(access.role)) return Response.json({ error: "Your role is view only.", code: "ROLE" }, { status: 403 });

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
    dupId, dupKind, matchesCitizen, auth.email, now, dev.lat, dev.lng, dev.acc, dev.status,
    thumbKey, thumb ? thumb.byteLength : null).run();

  const row = { taken_at: exif.takenAt, gps_lat: exif.lat, gps_lng: exif.lng, dup_grievance_id: dupId, dup_kind: dupKind, matches_citizen: matchesCitizen, created_at: now,
    dev_lat: dev.lat, dev_lng: dev.lng, dev_accuracy: dev.acc, dev_status: dev.status };
  const warnings = photoWarnings(g, row, parseWard(g.ward_boundary_geojson)).map((w) => { const c = Object.assign({}, w); delete c.otherCaseId; return c; });
  const media = await photoMedia(env, { id, thumb_key: thumbKey }, "r");
  return Response.json({ id, url: media.url, thumbUrl: media.thumbUrl, takenAt: exif.takenAt, warnings });
}
