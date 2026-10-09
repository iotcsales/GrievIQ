// POST /api/grievances/[id]/dept-step   (Departments stage 3)
//
// The representative's office records what the department said, or what the
// field check found when the department said the work was done.
//
// Body: { kind, expectedDate?, suggestedDepartment?, note?, photoIds? }
//   Department's reply (representative or office manager):
//     SCHEDULED    expectedDate (YYYY-MM-DD, today to a year ahead) required
//     IN_PROGRESS
//     DONE_CLAIMED -> the case now needs a field check
//     NOT_OURS     suggestedDepartment optional; the case goes back to be
//                  forwarded to the right office (never closed: DARPG rule)
//     CANT_DO      note (the department's reason) required, 10+ characters
//   Field check that did NOT find it fixed (field worker on an assigned case,
//   office manager or representative), only after DONE_CLAIMED:
//     CHECK_PARTLY / CHECK_NOT_FIXED   note (what you saw) 10+ characters and
//     1-3 photos from /resolution-photo (camera photos, location-checked).
//     The case goes back to the department and its clock restarts.
//   ("Fixed" is recorded by marking the case resolved / the approved fix report.)
// Nothing here changes the representative's own time limit or escalation.

import { getVerifiedRep } from "../../../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate } from "../../../_shared/jurisdiction.js";
import { caseAccess, canManageCases, canWorkCases, logTeam, onBehalfOf } from "../../../_shared/team.js";
import { activeDeptKeys } from "../../../_shared/departments.js";
import { MAX_PHOTOS } from "../../../_shared/resolution-evidence.js";
import {
  STEP, REPLY_KINDS, CHECK_KINDS, NOTE_MAX, CANT_DO_MIN, CHECK_NOTE_MIN, addStep, latestStep, stepsReady, istToday, validDate,
} from "../../../_shared/dept-steps.js";

const json = (body, status) => Response.json(body, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env, params }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await stepsReady(env))) return json({ error: "This isn't set up yet. Run the database update part23-department-step.sql.", code: "NOT_SET_UP" }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const kind = String(body.kind || "");
  if (!REPLY_KINDS.includes(kind) && !CHECK_KINDS.includes(kind)) return json({ error: "Unknown step.", code: "KIND" }, 400);

  const g = await env.DB.prepare("SELECT * FROM grievances WHERE id = ?").bind(String(params.id || "")).first();
  if (!g) return json({ error: "Case not found." }, 404);
  if (["RESOLVED", "CLOSED", "PENDING_CONFIRMATION"].includes(g.status)) return json({ error: "This case is already resolved.", code: "CLOSED" }, 409);
  const access = await caseAccess(env, auth, g, getLocalUnitIdsForMandate);
  if (!access) return json({ error: "You do not have access to this case." }, 403);

  const last = await latestStep(env, g.id);
  const isCheck = CHECK_KINDS.includes(kind);
  if (isCheck) {
    if (!canWorkCases(access.role)) return json({ error: "Your role is view only.", code: "ROLE" }, 403);
    if (!last || last.kind !== STEP.DONE_CLAIMED) return json({ error: "A field check is recorded after the department says the work is done.", code: "NO_CLAIM" }, 409);
  } else {
    if (!canManageCases(access.role)) return json({ error: "Only the representative or office manager records the department's reply.", code: "ROLE" }, 403);
    if (!last) return json({ error: "Forward the case to a department first.", code: "NOT_FORWARDED" }, 409);
    if (last.kind === STEP.NOT_OURS) return json({ error: "The department said it isn't theirs: forward it to the right office first.", code: "REFORWARD" }, 409);
  }

  const fields = {};
  const note = body.note == null ? "" : String(body.note).replace(/\s+/g, " ").trim();
  if (note.length > NOTE_MAX) fields.note = "LENGTH";
  let expectedDate = null, suggested = null;
  if (kind === STEP.SCHEDULED) {
    expectedDate = String(body.expectedDate || "");
    const today = istToday();
    const max = istToday(Date.now() + 365 * 86400000);
    if (!expectedDate) fields.expectedDate = "REQUIRED";
    else if (!validDate(expectedDate)) fields.expectedDate = "FORMAT";
    else if (expectedDate < today) fields.expectedDate = "PAST";
    else if (expectedDate > max) fields.expectedDate = "TOO_FAR";
  }
  if (kind === STEP.NOT_OURS && body.suggestedDepartment) {
    suggested = String(body.suggestedDepartment);
    if (!(await activeDeptKeys(env)).includes(suggested)) fields.suggestedDepartment = "FORMAT";
  }
  if (kind === STEP.CANT_DO && note.length < CANT_DO_MIN) fields.note = fields.note || "REASON";
  let photoIds = [];
  if (isCheck) {
    if (note.length < CHECK_NOTE_MIN) fields.note = fields.note || "CHECK_NOTE";
    photoIds = Array.isArray(body.photoIds) ? Array.from(new Set(body.photoIds.map(String))) : [];
    if (!photoIds.length) fields.photos = "PHOTO_REQUIRED";
    else if (photoIds.length > MAX_PHOTOS) fields.photos = "TOO_MANY_PHOTOS";
    for (const pid of photoIds.slice(0, MAX_PHOTOS)) {
      const p = await env.DB.prepare("SELECT id FROM resolution_photos WHERE id = ? AND grievance_id = ? AND report_id IS NULL").bind(pid, g.id).first();
      if (!p) { fields.photos = "PHOTO_MISSING"; break; }
    }
  }
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);

  const now = new Date().toISOString();
  // A failed field check keeps its photos as evidence: a held report (not a
  // resolution, never shown as one) that the photos are joined to.
  let photoReportId = null;
  if (isCheck) {
    photoReportId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO resolution_reports (id, grievance_id, note, no_photo_reason, created_by, created_at, review_status, submitted_role)
       VALUES (?, ?, ?, NULL, ?, ?, 'FIELD_CHECK', ?)`
    ).bind(photoReportId, g.id, note, auth.email, now, access.role).run();
    for (const pid of photoIds) {
      await env.DB.prepare("UPDATE resolution_photos SET report_id = ? WHERE id = ? AND grievance_id = ? AND report_id IS NULL")
        .bind(photoReportId, pid, g.id).run();
    }
  }
  await addStep(env, { grievance_id: g.id, kind, department: last.department, office_id: last.office_id, office_name: last.office_name,
    expected_date: expectedDate, suggested_department: suggested, note: note || null, photo_report_id: photoReportId,
    actor: auth.email, actor_role: access.role, by_office_tier: access.mandate.tier, by_office_id: access.mandate.id, created_at: now });
  await logTeam(env, { officeTier: access.mandate.tier, officeId: access.mandate.id, actor: auth.email, actorRole: access.role,
    onBehalf: onBehalfOf(access.mandate, auth), action: "DEPT_" + kind, grievanceId: g.id,
    detail: { department: last.department, office: last.office_name || null, expectedDate, suggested, photos: photoIds.length || undefined } });
  return json({ ok: true, kind });
}
