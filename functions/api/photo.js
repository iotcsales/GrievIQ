// GET /api/photo?p=<photo id>&v=<variant>&e=<expiry>&s=<signature>
//
// Serves one private photo from the PRIVATE_PHOTOS R2 bucket (no public
// access of its own), but only with a valid, unexpired signed link
// (_shared/photo-links.js). Public path (no Cloudflare Access): the
// signature is the permission, and it is only ever handed out by pages that
// have already checked who is looking.
//
// Variants (item 7c): "" after photo full size (links made before 7c have
// no v), "t" after photo preview, "c" citizen's photo full size, "ct"
// citizen's photo preview. A preview that was never made falls back to the
// full-size file. A file removed under the retention policy
// (_shared/photo-store.js) answers 410 with a plain message.
//
// Security (OWASP file upload guidance): files are looked up by our own id,
// never by a path from the request; served with their stored image type,
// "nosniff", and a sandboxing Content-Security-Policy so a disguised file
// can't run as a page; kept out of shared caches.

import { checkLink } from "../_shared/photo-links.js";

function textReply(status, msg) {
  return new Response(msg, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("p") || "";
  const variant = url.searchParams.get("v") || "";
  const verdict = await checkLink(env, id, url.searchParams.get("e"), url.searchParams.get("s"), null, variant);
  if (verdict === "expired") {
    return textReply(410, "This photo link has expired. Go back to the page and refresh it to see the photo again.");
  }
  if (verdict !== "ok") return textReply(403, "This photo link isn't valid.");

  const table = variant === "c" || variant === "ct" ? "complaint_photos" : "resolution_photos";
  const wantThumb = variant === "t" || variant === "ct";
  const row = await env.DB.prepare(
    `SELECT r2_key, thumb_key, content_type, full_deleted_at, deleted_at FROM ${table} WHERE id = ?`
  ).bind(id).first();
  if (!row) return textReply(404, "Photo not found.");
  if (row.deleted_at) return textReply(410, "This photo was removed under GrievIQ's photo retention policy.");

  let key, type;
  if (wantThumb && row.thumb_key) { key = row.thumb_key; type = "image/jpeg"; }
  else if (!row.full_deleted_at) { key = row.r2_key; type = row.content_type; }
  else if (row.thumb_key) { key = row.thumb_key; type = "image/jpeg"; }
  else return textReply(410, "This photo was removed under GrievIQ's photo retention policy.");

  if (!env.PRIVATE_PHOTOS) return textReply(503, "Photo storage isn't set up yet.");
  const obj = await env.PRIVATE_PHOTOS.get(key);
  if (!obj) return textReply(404, "Photo not found.");

  return new Response(obj.body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Referrer-Policy": "no-referrer",
    },
  });
}
