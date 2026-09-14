// functions/api/grievances/[id]/escalation.js
//
// TEMPORARY DEBUG ENDPOINT — no authentication yet. This exists purely to
// verify the escalation engine (jurisdiction.js + escalation.js) computes
// the right tier against real seeded data, before any real citizen intake
// or representative dashboard is built on top of it. This route should be
// replaced or locked down before real citizen data ever passes through
// this app — returning full grievance detail with no auth check is fine
// for now because the only data in the database is the test row we just
// seeded, not a real citizen's information.

import { resolveChain } from "../../../_shared/jurisdiction.js";
import { computeEscalation, visibleTiers } from "../../../_shared/escalation.js";

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;

  const grievance = await env.DB.prepare(
    "SELECT * FROM grievances WHERE id = ?"
  ).bind(id).first();
  if (!grievance) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const category = await env.DB.prepare(
    "SELECT * FROM grievance_categories WHERE id = ?"
  ).bind(grievance.category_id).first();
  if (!category) {
    return Response.json({ error: "CATEGORY_NOT_FOUND" }, { status: 500 });
  }

  const chain = await resolveChain(env, grievance.local_unit_id);
  if (!chain) {
    return Response.json({ error: "JURISDICTION_NOT_FOUND" }, { status: 500 });
  }

  const result = computeEscalation(grievance, category, chain.tiers);
  const visible = visibleTiers(chain.tiers, result.currentTierIndex);

  return Response.json({
    grievance: {
      id: grievance.id,
      trackingRef: grievance.tracking_ref,
      status: grievance.status,
      createdAt: grievance.created_at,
    },
    localUnit: { id: chain.localUnit.id, name: chain.localUnit.name, type: chain.localUnit.unit_type },
    category: {
      id: category.id,
      name: category.name,
      ackSlaHours: category.ack_sla_hours,
      resolutionSlaHours: category.resolution_sla_hours,
    },
    elapsedHours: Math.round(result.elapsedHours * 10) / 10,
    elapsedDays: Math.round((result.elapsedHours / 24) * 10) / 10,
    ackOverdue: result.ackOverdue,
    needsLegalReview: result.needsLegalReview,
    fullChain: chain.tiers,
    currentTier: result.currentTier,
    visibleTiers: visible,
  });
}
