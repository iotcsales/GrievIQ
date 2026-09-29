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
// Checks (OWASP file upload guidance): real type read from the first bytes
// (JPEG, PNG or WEBP), size limits, file names chosen by us.

import { sniffImage, sha256Hex, validDhash } from "../../_shared/resolution-evidence.js";
import { FULL_MAX_BYTES, THUMB_MAX_BYTES, stripJpegMetadata } from "../../_shared/photo-store.js";

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
    return reply(200, { success: true, photo_id: id });
  } catch (err) {
    return reply(500, { error: "Photo upload failed. Please try again.", code: "FAILED" });
  }
}
