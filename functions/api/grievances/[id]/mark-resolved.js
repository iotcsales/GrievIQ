// functions/api/grievances/[id]/mark-resolved.js
//
// Rep-only action: marks a grievance as resolved. If the citizen has an
// email on file, the case moves to PENDING_CONFIRMATION and an email
// invites them to confirm the fix via /status — it isn't final until
// they say so. If there's no email, the case also waits
// (PENDING_CONFIRMATION): GrievIQ staff check the fix from the photos or by
// calling the citizen (item 7b-2, admin Checks page). Before 7b-2 it went
// straight to RESOLVED.
//
// Item 7a (Sept 2026): while the case waits for the citizen, escalation is
// paused. If the citizen doesn't reply within CONFIRM_DAYS it closes as
// "Resolved (not confirmed by citizen)" -- the email says so, with the date.
//
// Item 7b (Sept 2026): the rep must say what was done. JSON body:
//   { note: 10-1000 characters,
//     photoIds: up to 3 ids from /resolution-photo uploads for this case,
//     noPhotoReason: 10-300 characters, required when there are no photos }
// Saved as a resolution report (resolution_reports), with the photos
// joined to it (resolution_photos.report_id).
//
// Item 8b (Sept 2026): the representative's team.
//   - Representative or office manager: marks it resolved, as before (the
//     steps are in _shared/resolve-case.js). A fix report still waiting for
//     approval is closed as "sent back" with a note saying so.
//   - Field worker (only on a case assigned to them): the same form submits
//     a fix report for approval instead (review_status PENDING); nothing
//     changes for the citizen until the representative or office manager
//     approves it (review-report.js).
// Every action goes in the team activity log.

import { getVerifiedRep } from "../../../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate, resolveChain } from "../../../_shared/jurisdiction.js";
import { computeEscalation } from "../../../_shared/escalation.js";
import { NOTE_MIN, NOTE_MAX, REASON_MIN, REASON_MAX, MAX_PHOTOS } from "../../../_shared/resolution-evidence.js";
import { finalizeResolution } from "../../../_shared/resolve-case.js";
import { caseAccess, canWorkCases, ROLE, logTeam, onBehalfOf } from "../../../_shared/team.js";

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const grievanceId = params.id;

  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const grievance = await env.DB.prepare(
    "SELECT * FROM grievances WHERE id = ?"
  ).bind(grievanceId).first();

  if (!grievance) {
    return Response.json({ error: "Grievance not found" }, { status: 404 });
  }

  if (grievance.status === "RESOLVED" || grievance.status === "CLOSED" || grievance.status === "PENDING_CONFIRMATION") {
    return Response.json({ error: "This case is already resolved or awaiting confirmation" }, { status: 409 });
  }

  // Jurisdiction and role for this case (item 8b): a field worker only for
  // a case assigned to them.
  const access = await caseAccess(env, auth, grievance, getLocalUnitIdsForMandate);
  if (!access) {
    return Response.json({ error: "You do not have jurisdiction over this case" }, { status: 403 });
  }
  // Item 8c-1: an office assistant only looks.
  if (!canWorkCases(access.role)) {
    return Response.json({ error: "Your role is view only.", code: "ROLE" }, { status: 403 });
  }
  const isFieldWorker = access.role === ROLE.FW;

  // ---- What was done (item 7b) ----
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const note = String(body.note || "").trim();
  const photoIds = Array.isArray(body.photoIds) ? Array.from(new Set(body.photoIds.map(String))).slice(0, MAX_PHOTOS + 1) : [];
  const noPhotoReason = String(body.noPhotoReason || "").trim();
  const fieldErrors = {};
  if (note.length < NOTE_MIN || note.length > NOTE_MAX) fieldErrors.note = "NOTE_LENGTH";
  if (photoIds.length > MAX_PHOTOS) fieldErrors.photos = "TOO_MANY_PHOTOS";
  if (photoIds.length === 0 && (noPhotoReason.length < REASON_MIN || noPhotoReason.length > REASON_MAX)) fieldErrors.photos = "PHOTO_OR_REASON";
  if (Object.keys(fieldErrors).length) {
    return Response.json({ error: "Please say what was done, and add a photo or the reason there isn't one.", fields: fieldErrors }, { status: 400 });
  }
  for (const pid of photoIds) {
    const p = await env.DB.prepare(
      "SELECT id FROM resolution_photos WHERE id = ? AND grievance_id = ? AND report_id IS NULL"
    ).bind(pid, grievanceId).first();
    if (!p) {
      return Response.json({ error: "One of the photos couldn't be found. Please add it again.", fields: { photos: "PHOTO_MISSING" } }, { status: 400 });
    }
  }

  const pending = await env.DB.prepare(
    "SELECT id, created_by FROM resolution_reports WHERE grievance_id = ? AND review_status = 'PENDING' LIMIT 1"
  ).bind(grievanceId).first();
  if (isFieldWorker && pending) {
    return Response.json({ error: "A fix report for this case is already waiting for approval.", code: "REPORT_PENDING" }, { status: 409 });
  }

  const chain = await resolveChain(env, grievance.local_unit_id);
  const category = await env.DB.prepare(
    "SELECT * FROM grievance_categories WHERE id = ?"
  ).bind(grievance.category_id).first();

  if (!chain || !category) {
    return Response.json({ error: "Could not resolve jurisdiction or category for this case" }, { status: 500 });
  }

  const result = computeEscalation(grievance, category, chain.tiers);
  const now = new Date().toISOString();
  const reportId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO resolution_reports (id, grievance_id, note, no_photo_reason, created_by, created_at, review_status, submitted_role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(reportId, grievanceId, note, photoIds.length ? null : noPhotoReason, auth.email, now,
    isFieldWorker ? "PENDING" : null, access.role).run();
  for (const pid of photoIds) {
    await env.DB.prepare(
      "UPDATE resolution_photos SET report_id = ? WHERE id = ? AND grievance_id = ? AND report_id IS NULL"
    ).bind(reportId, pid, grievanceId).run();
  }

  const teamBase = { officeTier: access.mandate.tier, officeId: access.mandate.id, actor: auth.email, actorRole: access.role,
    onBehalf: onBehalfOf(access.mandate, auth), grievanceId };

  if (isFieldWorker) {
    await logTeam(env, { ...teamBase, action: "FIX_REPORT_SUBMITTED", detail: { reportId, photos: photoIds.length } });
    return Response.json({ status: "SUBMITTED_FOR_APPROVAL", reportId });
  }

  // Marked resolved directly: a report still waiting for approval is closed.
  if (pending) {
    await env.DB.prepare(
      "UPDATE resolution_reports SET review_status = 'SENT_BACK', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND review_status = 'PENDING'"
    ).bind(auth.email, now, "Case marked resolved directly with a new report.", pending.id).run();
  }
  const out = await finalizeResolution(env, request, grievance, result.currentTier.tier, note, auth.email);
  await logTeam(env, { ...teamBase, action: "MARKED_RESOLVED", detail: { reportId } });
  return Response.json(out);
}
