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
//
// Item 7d: a reopened case needs a fresh acknowledgement from the level now
// responsible (the level it was sent to, or higher if it has escalated
// since). A lower level can still see it, but can't acknowledge it.

import { getVerifiedRep } from "../../../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate, resolveChain } from "../../../_shared/jurisdiction.js";
import { computeEscalation } from "../../../_shared/escalation.js";
import { caseAccess, canManageCases, logTeam, onBehalfOf } from "../../../_shared/team.js";

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
  // Jurisdiction and role (item 8b): acknowledging is for the
  // representative or office manager, not a field worker.
  const access = await caseAccess(env, auth, grievance, getLocalUnitIdsForMandate);
  if (!access) {
    return Response.json({ error: "You do not have jurisdiction over this case" }, { status: 403 });
  }
  if (!canManageCases(access.role)) {
    return Response.json({ error: "Only the representative or office manager can acknowledge a case.", code: "ROLE" }, { status: 403 });
  }

  if (grievance.reopened_at) {
    const [chain, category] = await Promise.all([
      resolveChain(env, grievance.local_unit_id),
      env.DB.prepare("SELECT * FROM grievance_categories WHERE id = ?").bind(grievance.category_id).first(),
    ]);
    if (chain && category) {
      const current = computeEscalation(grievance, category, chain.tiers).currentTierIndex;
      const mine = chain.tiers.findIndex((x) => x.tier === access.mandate.tier);
      if (mine < current) {
        return Response.json({ error: "This case was reopened and is now with a higher level, which needs to acknowledge it.", code: "HIGHER_LEVEL" }, { status: 403 });
      }
    }
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

  await logTeam(env, { officeTier: access.mandate.tier, officeId: access.mandate.id, actor: auth.email, actorRole: access.role,
    onBehalf: onBehalfOf(access.mandate, auth), action: "ACKNOWLEDGED", grievanceId });
  return Response.json({ acknowledgedAt: now });
}