// POST /api/dept/reply   A department officer's reply on a case forwarded to
// their office (approved 9 Oct 2026). The same replies the representative's
// office can record (_shared/dept-steps.js):
//   { id, kind: SCHEDULED | IN_PROGRESS | DONE_CLAIMED | NOT_OURS | CANT_DO,
//     expectedDate?, suggestedDepartment?, note?, photoIds? (Work done, 0-3) }
// A department never closes a case: "Work done" sends it to the
// representative's field check. The representative's office is told at once
// (notice DEPT_REPLY) and the citizen's Track page shows the step.
import { getVerifiedOfficer, logDept } from "../../_shared/dept-auth.js";
import { officerMaySee } from "../../_shared/dept-cases.js";
import { activeDeptKeys } from "../../_shared/departments.js";
import { STEP, REPLY_KINDS, NOTE_MAX, CANT_DO_MIN, addStep, latestStep, istToday, validDate } from "../../_shared/dept-steps.js";
import { notifyDeptReply } from "../../_shared/notify.js";

const MAX_PHOTOS = 3;
const json = (b, s) => Response.json(b, { status: s || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env, waitUntil }) {
  const auth = await getVerifiedOfficer(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Invalid request." }, 400); }
  const o = auth.officer;
  const g = await officerMaySee(env, o, String(b.id || ""));
  if (!g) return json({ error: "NOT_FOUND" }, 404);
  if (g.status !== "OPEN" && g.status !== "ACKNOWLEDGED") return json({ error: "This case is already resolved.", code: "CLOSED" }, 409);
  const kind = String(b.kind || "");
  if (!REPLY_KINDS.includes(kind)) return json({ error: "Unknown reply.", fields: { kind: "REQUIRED" } }, 400);
  const last = await latestStep(env, g.id);
  if (!last || last.kind === STEP.NOT_OURS) return json({ error: "This case is no longer with your office.", code: "REFORWARD" }, 409);

  const fields = {};
  const note = b.note == null ? "" : String(b.note).replace(/\s+/g, " ").trim();
  if (note.length > NOTE_MAX) fields.note = "LENGTH";
  let expectedDate = null, suggested = null;
  if (kind === STEP.SCHEDULED) {
    expectedDate = String(b.expectedDate || "");
    if (!expectedDate) fields.expectedDate = "REQUIRED";
    else if (!validDate(expectedDate)) fields.expectedDate = "FORMAT";
    else if (expectedDate < istToday()) fields.expectedDate = "PAST";
    else if (expectedDate > istToday(Date.now() + 365 * 86400000)) fields.expectedDate = "TOO_FAR";
  }
  if (kind === STEP.NOT_OURS && b.suggestedDepartment) {
    suggested = String(b.suggestedDepartment);
    if (!(await activeDeptKeys(env)).includes(suggested)) fields.suggestedDepartment = "FORMAT";
  }
  if (kind === STEP.CANT_DO && note.length < CANT_DO_MIN) fields.note = fields.note || "REASON";
  let photoIds = [];
  if (kind === STEP.DONE_CLAIMED && Array.isArray(b.photoIds)) {
    photoIds = Array.from(new Set(b.photoIds.map(String)));
    if (photoIds.length > MAX_PHOTOS) fields.photos = "TOO_MANY_PHOTOS";
    for (const pid of photoIds.slice(0, MAX_PHOTOS)) {
      const p = await env.DB.prepare("SELECT id FROM resolution_photos WHERE id = ? AND grievance_id = ? AND report_id IS NULL AND LOWER(uploaded_by) = ?")
        .bind(pid, g.id, String(o.email).toLowerCase()).first();
      if (!p) { fields.photos = "PHOTO_MISSING"; break; }
    }
  }
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);

  const now = new Date().toISOString();
  let photoReportId = null;
  if (photoIds.length) {
    // Kept as evidence beside the step (never shown as a resolution).
    photoReportId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO resolution_reports (id, grievance_id, note, no_photo_reason, created_by, created_at, review_status, submitted_role)
       VALUES (?, ?, ?, NULL, ?, ?, 'FIELD_CHECK', 'DEPARTMENT')`
    ).bind(photoReportId, g.id, note || "Photos from the department", String(o.email).toLowerCase(), now).run();
    for (const pid of photoIds) {
      await env.DB.prepare("UPDATE resolution_photos SET report_id = ? WHERE id = ? AND grievance_id = ? AND report_id IS NULL").bind(photoReportId, pid, g.id).run();
    }
  }
  await addStep(env, { grievance_id: g.id, kind, department: last.department, office_id: last.office_id, office_name: last.office_name,
    expected_date: expectedDate, suggested_department: suggested, note: note || null, photo_report_id: photoReportId,
    actor: String(o.email).toLowerCase(), actor_role: "DEPARTMENT", by_office_tier: "DEPT", by_office_id: o.office_id, created_at: now });
  await logDept(env, { officerId: o.id, email: o.email, officeId: o.office_id, action: "REPLIED", grievanceId: g.id, detail: { kind, expectedDate, suggested, photos: photoIds.length || undefined } });
  const p = notifyDeptReply(env, new URL(request.url).origin, g, { kind, officer: o.name, office: last.office_name || o.office_name_en, dept: last.department, expectedDate }).catch(() => {});
  if (typeof waitUntil === "function") waitUntil(p); else await p;
  return json({ ok: true, kind });
}
