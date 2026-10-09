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

import { getVerifiedRep } from "../../../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate } from "../../../_shared/jurisdiction.js";
import { activeDeptKeys } from "../../../_shared/departments.js";
import { caseAccess, canManageCases, logTeam, onBehalfOf } from "../../../_shared/team.js";

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

  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO grievance_events (id, grievance_id, event_type, actor, reason, note, created_at)
     VALUES (?, ?, 'FOLLOW_UP', ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), grievanceId, auth.email, department, note, now).run();

  await logTeam(env, { officeTier: access.mandate.tier, officeId: access.mandate.id, actor: auth.email, actorRole: access.role,
    onBehalf: onBehalfOf(access.mandate, auth), action: "FORWARDED", grievanceId, detail: { department } });
  return Response.json({ department, note, createdAt: now });
}