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

const VALID_DEPARTMENTS = [
  "Water Supply",
  "Electricity",
  "Sanitation / Garbage",
  "Roads & Public Works",
  "Health",
  "Legal / Land Records",
  "Other",
];

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

  // Confirm this rep actually has jurisdiction over this case's local unit --
  // same check used by grievances.js, mark-resolved.js, and acknowledge.js.
  let hasAccess = false;
  for (const mandate of auth.mandates) {
    const unitIds = await getLocalUnitIdsForMandate(env, mandate);
    if (unitIds.includes(grievance.local_unit_id)) {
      hasAccess = true;
      break;
    }
  }
  if (!hasAccess) {
    return Response.json({ error: "You do not have jurisdiction over this case" }, { status: 403 });
  }

  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO grievance_events (id, grievance_id, event_type, actor, reason, note, created_at)
     VALUES (?, ?, 'FOLLOW_UP', ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), grievanceId, auth.email, department, note, now).run();

  return Response.json({ department, note, createdAt: now });
}