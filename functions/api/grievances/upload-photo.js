// POST /api/grievances/upload-photo
// Public, unauthenticated endpoint. The complaint form (submit.html) calls
// it once per photo before /api/grievances/submit.
//
// Item 7c (Sept 2026): the citizen's photos are now private.
//   - The phone shrinks each photo (at most 1600 px) and makes a small
//     preview (320 px) before upload (public/photo-tools.js). Redrawing
//     removes the photo's hidden details (date, GPS, camera); anything left
//     in a JPEG is stripped here as well.
//   - Both files go to the private bucket PRIVATE_PHOTOS (no public
//     address) and are shown only through short-lived signed links.
//   - Returns a photo id. submit.js attaches it to the complaint; an upload
//     never attached is removed after 2 days (photo-store.js).
//
// multipart/form-data: photo (full size), thumb (preview), dhash (optional
// 16-hex visual fingerprint, used to catch a citizen's photo being sent back
// as an "after" photo), width, height.
//
// Oct 2026 (photo checks, flag never block): also dev_status / dev_lat /
// dev_lng / dev_accuracy (where the phone was when the photo was added, if
// the citizen allowed it) and exif (the original photo's camera-details
// block, read here for its date, GPS and whether a camera made it, then
// thrown away). Positions are kept only until the complaint is filed; see
// _shared/citizen-photo-checks.js.
//
// Oct 2026 fix: capture = CAMERA ("Take a photo") or GALLERY.
//
// Checks (OWASP file upload guidance): real type read from the first bytes
// (JPEG, PNG or WEBP), size limits, file names chosen by us.

import { sniffImage, sha256Hex, validDhash } from "../../_shared/resolution-evidence.js";
import { FULL_MAX_BYTES, THUMB_MAX_BYTES, stripJpegMetadata } from "../../_shared/photo-store.js";
import { readExif } from "../../_shared/exif.js";

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function dim(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= 10000 ? n : null;
}

export async function onRequestPost({ request, env }) {
  if (!env.PRIVATE_PHOTOS) {
    return reply(503, { error: "Photos can't be added right now. You can file the complaint without them.", code: "STORAGE_NOT_SET" });
  }
  let form;
  try { form = await request.formData(); } catch (e) { return reply(400, { error: "No photo was provided.", code: "NO_FILE" }); }
  const file = form.get("photo");
  const thumbFile = form.get("thumb");
  if (!file || typeof file === "string") return reply(400, { error: "No photo was provided.", code: "NO_FILE" });
  if (file.size > FULL_MAX_BYTES) return reply(400, { error: "Photo must be smaller than 3 MB.", code: "TOO_BIG" });

  let buf = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(buf.subarray(0, 16));
  if (!type) return reply(400, { error: "Only JPG, PNG or WEBP photos can be added.", code: "BAD_TYPE" });
  if (type === "image/jpeg") buf = stripJpegMetadata(buf);

  let thumb = null;
  if (thumbFile && typeof thumbFile !== "string" && thumbFile.size > 0 && thumbFile.size <= THUMB_MAX_BYTES) {
    const t = new Uint8Array(await thumbFile.arrayBuffer());
    if (sniffImage(t.subarray(0, 16)) === "image/jpeg") thumb = stripJpegMetadata(t);
  }

  // Oct 2026: photo checks (see the header). Nothing here can stop the upload.
  const num = (v, max) => { const n = Number(v); return v != null && v !== "" && isFinite(n) && Math.abs(n) <= max ? n : null; };
  const devStatus = ["OK", "DENIED", "UNAVAILABLE", "TIMEOUT", "UNSUPPORTED"].includes(String(form.get("dev_status") || "")) ? String(form.get("dev_status")) : null;
  const devLat = devStatus === "OK" ? num(form.get("dev_lat"), 90) : null;
  const devLng = devStatus === "OK" ? num(form.get("dev_lng"), 180) : null;
  const devAcc = devStatus === "OK" ? Math.max(0, Math.min(100000, Math.round(Number(form.get("dev_accuracy")) || 0))) : null;
  let ex = { takenAt: null, lat: null, lng: null, hasCamera: false }, exifSent = false;
  const exifFile = form.get("exif");
  if (exifFile && typeof exifFile !== "string" && exifFile.size > 0 && exifFile.size <= 70000) {
    exifSent = true;
    try { ex = readExif((await exifFile.arrayBuffer())); } catch (e) { /* unreadable: treated as no details */ }
  } else if (String(form.get("exif_none") || "") === "1") exifSent = true;

  try {
    const id = crypto.randomUUID();
    const key = "complaint-photos/" + id + "." + EXT[type];
    const thumbKey = thumb ? "complaint-photos/" + id + "-thumb.jpg" : null;
    await env.PRIVATE_PHOTOS.put(key, buf, { httpMetadata: { contentType: type } });
    if (thumb) await env.PRIVATE_PHOTOS.put(thumbKey, thumb, { httpMetadata: { contentType: "image/jpeg" } });
    await env.DB.prepare(
      `INSERT INTO complaint_photos
         (id, grievance_id, position, r2_key, thumb_key, content_type, byte_size, thumb_size, width, height, sha256, dhash, source, created_at)
       VALUES (?, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPLOAD', ?)`
    ).bind(id, key, thumbKey, type, buf.byteLength, thumb ? thumb.byteLength : null,
      dim(form.get("width")), dim(form.get("height")), await sha256Hex(buf),
      validDhash(String(form.get("dhash") || "").toLowerCase()), new Date().toISOString()).run();
    try {
      await env.DB.prepare(
        "UPDATE complaint_photos SET dev_status = ?, dev_lat = ?, dev_lng = ?, dev_accuracy = ?, gps_lat = ?, gps_lng = ?, taken_at = ?, has_camera = ? WHERE id = ?"
      ).bind(devStatus, devLat, devLng, devAcc, ex.lat, ex.lng, ex.takenAt, exifSent ? (ex.hasCamera ? 1 : 0) : null, id).run();
    } catch (e) { /* photo-check columns not added yet (part19): the photo is still saved */ }
    // Which button added it (part20). Only a hint for the checks: it can't
    // block anything, so a faked value gains nothing beyond a missing warning.
    const capture = ["CAMERA", "GALLERY"].includes(String(form.get("capture") || "")) ? String(form.get("capture")) : null;
    if (capture) {
      try { await env.DB.prepare("UPDATE complaint_photos SET capture_kind = ? WHERE id = ?").bind(capture, id).run(); }
      catch (e) { /* part20 not run yet */ }
    }
    return reply(200, { success: true, photo_id: id });
  } catch (err) {
    return reply(500, { error: "Photo upload failed. Please try again.", code: "FAILED" });
  }
}
