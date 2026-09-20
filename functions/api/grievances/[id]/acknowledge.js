// functions/api/grievances/[id]/acknowledge.js
//
// Rep-only endpoint (behind Cloudflare Access) that marks a grievance as
// acknowledged -- setting acknowledged_at to now, purely so the ack-SLA
// clock in computeEscalation() has something real to compare against.
// This does NOT change status or current_tier; acknowledging is a
// separate signal from resolving ("I've seen this and am on it"), not
// a step in the escalation chain itself.
//
// No citizen email is sent here -- unlike mark-resolved.js, acknowledging
// is an internal/rep-side signal with no citizen-facing consequence.

import { getVerifiedRep } from "../../../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate } from "../../../_shared/jurisdiction.js";

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

  if (grievance.acknowledged_at) {
    return Response.json({ error: "This case has already been acknowledged" }, { status: 409 });
  }

  // Confirm this rep actually has jurisdiction over this case's local unit --
  // same check grievances.js and mark-resolved.js use to decide visibility.
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
    `UPDATE grievances
     SET acknowledged_at = ?, updated_at = ?
     WHERE id = ?`
  ).bind(now, now, grievanceId).run();

  await env.DB.prepare(
    `INSERT INTO grievance_events (id, grievance_id, event_type, actor, created_at)
     VALUES (?, ?, 'ACKNOWLEDGED', ?, ?)`
  ).bind(crypto.randomUUID(), grievanceId, auth.email, now).run();

  return Response.json({ acknowledgedAt: now });
}