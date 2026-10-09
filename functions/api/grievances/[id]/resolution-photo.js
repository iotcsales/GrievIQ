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
import { caseAccess, canWorkCases } from "../../../_shared/team.js";
import { storeResolutionPhoto } from "../../../_shared/resolution-upload.js";

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

  return storeResolutionPhoto(env, g, request, auth.email);
}
