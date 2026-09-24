// functions/api/admin/exceptions.js
//
// Admin exceptions queue: every unresolved case that needs attention
// across ALL wards -- not acknowledged in time, escalated past the first
// tier, disputed by the citizen, or in legal review. Uses the exact same
// computeEscalation / visibleTiers rules the rep console uses, so admin
// and reps can never disagree about what is overdue or who is responsible.
//
// Cases awaiting the citizen's confirmation (PENDING_CONFIRMATION) are
// excluded -- the next move there is the citizen's, not a rep's.
//
// A dispute counts only while it is the latest substantive event (same
// rule as the rep console); admin nudges are ignored for that check.
//
// Gated behind exceptions_queue (super_admin, operations_admin).

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
import { resolveChain } from "../../_shared/jurisdiction.js";
import { computeEscalation, visibleTiers } from "../../_shared/escalation.js";

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "exceptions_queue");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { results: grievanceRows } = await env.DB.prepare(
    `SELECT * FROM grievances
     WHERE status NOT IN ('RESOLVED', 'CLOSED', 'PENDING_CONFIRMATION')
     ORDER BY created_at ASC`
  ).all();

  // One query for every event on these open cases, joined rather than
  // passed as an id list -- avoids D1's per-query bound-parameter limit.
  const { results: eventRows } = await env.DB.prepare(
    `SELECT e.grievance_id, e.event_type, e.actor, e.reason, e.note, e.created_at
     FROM grievance_events e
     JOIN grievances g ON g.id = e.grievance_id
     WHERE g.status NOT IN ('RESOLVED', 'CLOSED', 'PENDING_CONFIRMATION')
     ORDER BY e.created_at ASC, e.rowid ASC`
  ).all();

  const eventsByGrievance = new Map();
  for (const ev of eventRows) {
    if (!eventsByGrievance.has(ev.grievance_id)) {
      eventsByGrievance.set(ev.grievance_id, []);
    }
    eventsByGrievance.get(ev.grievance_id).push(ev);
  }

  const chainCache = new Map();
  const categoryCache = new Map();
  const exceptions = [];

  for (const g of grievanceRows) {
    let chain = chainCache.get(g.local_unit_id);
    if (chain === undefined) {
      chain = await resolveChain(env, g.local_unit_id);
      chainCache.set(g.local_unit_id, chain);
    }

    let category = categoryCache.get(g.category_id);
    if (category === undefined) {
      category = await env.DB.prepare(
        "SELECT * FROM grievance_categories WHERE id = ?"
      ).bind(g.category_id).first();
      categoryCache.set(g.category_id, category);
    }

    if (!chain || !category) continue;

    const result = computeEscalation(g, category, chain.tiers);

    const events = eventsByGrievance.get(g.id) || [];
    const substantive = events.filter((e) => e.event_type !== "ADMIN_NUDGE");
    const latest = substantive.length ? substantive[substantive.length - 1] : null;
    const nudges = events.filter((e) => e.event_type === "ADMIN_NUDGE");
    const lastNudge = nudges.length ? nudges[nudges.length - 1] : null;

    const flags = [];
    if (result.ackOverdue) flags.push("ACK_OVERDUE");
    if (result.currentTierIndex > 0) flags.push("ESCALATED");
    if (latest && latest.event_type === "CITIZEN_DISPUTED") flags.push("DISPUTED");
    if (result.needsLegalReview) flags.push("LEGAL_REVIEW");
    if (flags.length === 0) continue;

    const responsible = visibleTiers(chain.tiers, result.currentTierIndex).map((t) => ({
      tier: t.tier,
      label: t.label,
      name: t.name || null,
      hasEmail: !!t.email,
    }));

    const isDisputed = flags.includes("DISPUTED");

    exceptions.push({
      id: g.id,
      trackingRef: g.tracking_ref,
      description: g.description,
      status: g.status,
      localUnit: {
        id: chain.localUnit.id,
        name: chain.localUnit.name,
        type: chain.localUnit.unit_type,
      },
      category: { id: category.id, name: category.name },
      createdAt: g.created_at,
      elapsedDays: Math.round((result.elapsedHours / 24) * 10) / 10,
      flags,
      currentTier: result.currentTier.tier,
      currentTierLabel: result.currentTier.label,
      currentTierIndex: result.currentTierIndex,
      tierCount: chain.tiers.length,
      responsible,
      disputeReason: isDisputed ? latest.reason : null,
      disputeNote: isDisputed ? latest.note : null,
      nudgeCount: nudges.length,
      lastNudgeAt: lastNudge ? lastNudge.created_at : null,
      lastNudgeBy: lastNudge ? lastNudge.actor : null,
    });
  }

  // Oldest open cases first -- the longest-waiting citizens come first.
  exceptions.sort((a, b) => b.elapsedDays - a.elapsedDays);

  return Response.json({
    exceptions,
    generatedAt: new Date().toISOString(),
  });
}