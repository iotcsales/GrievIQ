// functions/api/grievances/[id]/add-followup.js
//
// Rep-only endpoint (behind Cloudflare Access) that logs a follow-up on a
// grievance -- which department it's been forwarded to, plus an optional
// free-text note. This does NOT change status, current_tier, or
// acknowledged_at; a follow-up is a separate progress signal.
//
// "Currently forwarded to" is never a stored column on grievances -- it is
// always read as the most recent FOLLOW_UP event's `reason` field, by
// whoever displays it (dashboard, citizen status page, report). This
// mirrors the fix already applied this session for stale dispute banners:
// derive from the latest event, never trust a column that can go stale.
//
// Expects JSON body: { department: string, note?: string }
// Departments stage 3 (grieviq-29): also { officeId?: directory office,
// officeName?: an office not in the directory, channel: how it was contacted }.
// Recorded as the case's FORWARDED department step (case_dept_steps), which
// starts the department's target time. The FOLLOW_UP event stays as before.

import { getVerifiedRep } from "../../../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate } from "../../../_shared/jurisdiction.js";
import { activeDeptKeys } from "../../../_shared/departments.js";
import { caseAccess, canManageCases, logTeam, onBehalfOf } from "../../../_shared/team.js";
import { STEP, CHANNELS, addStep, stepsReady } from "../../../_shared/dept-steps.js";
import { dashboardOffices } from "../../../_shared/dept-auth.js";
import { notifyDeptForwarded } from "../../../_shared/notify.js";

// The list is managed by admins (grieviq-25, _shared/departments.js); a
// retired department can't be chosen for a new follow-up.

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const grievanceId = params.id;

  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const department = String(body.department || "").trim();
  const note = body.note ? String(body.note).trim() : null;

  const VALID_DEPARTMENTS = await activeDeptKeys(env);
  if (!VALID_DEPARTMENTS.includes(department)) {
    return Response.json(
      { error: "department must be one of: " + VALID_DEPARTMENTS.join(", ") },
      { status: 400 }
    );
  }

  const grievance = await env.DB.prepare(
    "SELECT * FROM grievances WHERE id = ?"
  ).bind(grievanceId).first();

  if (!grievance) {
    return Response.json({ error: "Grievance not found" }, { status: 404 });
  }

  // Jurisdiction and role (item 8b): forwarding is for the representative
  // or office manager, not a field worker.
  const access = await caseAccess(env, auth, grievance, getLocalUnitIdsForMandate);
  if (!access) {
    return Response.json({ error: "You do not have jurisdiction over this case" }, { status: 403 });
  }
  if (!canManageCases(access.role)) {
    return Response.json({ error: "Only the representative or office manager can forward a case.", code: "ROLE" }, { status: 403 });
  }

  // Departments stage 3: which office, and how it was contacted.
  const ready = await stepsReady(env);
  let office = null;
  const channel = String(body.channel || "").toUpperCase();
  if (ready) {
    const fields = {};
    if (!CHANNELS.includes(channel)) fields.channel = "REQUIRED";
    if (body.officeId) {
      const o = await env.DB.prepare("SELECT id, name_en, departments, wards, area_id, retired_at FROM dept_offices WHERE id = ?").bind(String(body.officeId)).first();
      const unit = await env.DB.prepare("SELECT area_id FROM local_units WHERE id = ?").bind(grievance.local_unit_id).first();
      let depts = [], wards = null;
      try { if (o) { depts = JSON.parse(o.departments) || []; wards = o.wards ? JSON.parse(o.wards) : null; } } catch (e) { depts = []; }
      if (!o || o.retired_at || (unit && o.area_id !== (unit.area_id || "lucknow")) || !depts.includes(department) || (wards && !wards.includes(grievance.local_unit_id))) fields.office = "NOT_FOUND";
      else office = { id: o.id, name: o.name_en };
    } else if (body.officeName != null && String(body.officeName).trim() !== "") {
      const nm = String(body.officeName).replace(/\s+/g, " ").trim();
      if (nm.length < 3 || nm.length > 120) fields.officeName = "LENGTH";
      else office = { id: null, name: nm };
    }
    // grieviq-34: "GrievIQ department dashboard" only for an office whose officers use it.
    if (!fields.channel && !fields.office) {
      if (office && office.id) office.dashboard = (await dashboardOffices(env, [office.id])).has(String(office.id));
      if (channel === "DASHBOARD" && !(office && office.dashboard)) fields.channel = "NO_DASHBOARD";
    }
    if (Object.keys(fields).length) return Response.json({ error: "Please check the highlighted fields.", fields }, { status: 400 });
  }
  if (note && note.length > 500) return Response.json({ error: "Keep the note to 500 characters.", fields: { note: "LENGTH" } }, { status: 400 });

  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO grievance_events (id, grievance_id, event_type, actor, reason, note, created_at)
     VALUES (?, ?, 'FOLLOW_UP', ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), grievanceId, auth.email, department, note, now).run();

  let stepId = null;
  if (ready) {
    stepId = await addStep(env, { grievance_id: grievanceId, kind: STEP.FORWARDED, department, office_id: office ? office.id : null,
      office_name: office ? office.name : null, channel, note, actor: auth.email, actor_role: access.role,
      by_office_tier: access.mandate.tier, by_office_id: access.mandate.id, created_at: now });
  }
  await logTeam(env, { officeTier: access.mandate.tier, officeId: access.mandate.id, actor: auth.email, actorRole: access.role,
    onBehalf: onBehalfOf(access.mandate, auth), action: "FORWARDED", grievanceId, detail: { department, office: office ? office.name : null, channel: channel || null } });
  // grieviq-34: the office's dashboard officers are emailed at once (however
  // the representative's office also contacted them).
  if (stepId && office && office.dashboard) {
    const p = notifyDeptForwarded(env, new URL(request.url).origin, office.id, stepId).catch(() => {});
    if (typeof context.waitUntil === "function") context.waitUntil(p); else await p;
  }
  return Response.json({ department, note, createdAt: now, officersEmailed: !!(stepId && office && office.dashboard) });
}