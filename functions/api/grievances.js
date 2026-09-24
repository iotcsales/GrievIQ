// functions/api/grievances.js
//
// Returns the list of grievances visible to the currently logged-in
// representative, based on their jurisdiction mandate(s) from
// get-verified-rep.js. Visibility follows the same additive escalation
// rule as the single-case debug endpoint: a rep sees a case once it has
// escalated to reach their tier, and keeps seeing it — with its own red
// indicator staying on — for as long as it remains unresolved, even after
// it has escalated further above them. Escalation adds visibility, it
// doesn't hand the case off.
//
// A rep can in principle hold more than one mandate (see
// get-verified-rep.js); this endpoint unions the visible cases across all
// of them.

import { getVerifiedRep } from "../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate, resolveChain, mandateScope } from "../_shared/jurisdiction.js";
import { computeEscalation, visibleTiers } from "../_shared/escalation.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Map every local unit this rep has any mandate over to which of their
  // mandate tiers covers it — a rep only ever checks visibility against
  // their own tier for cases under that specific mandate.
  const unitToMandate = new Map();
  for (const mandate of auth.mandates) {
    const unitIds = await getLocalUnitIdsForMandate(env, mandate);
    for (const unitId of unitIds) {
      if (!unitToMandate.has(unitId)) {
        unitToMandate.set(unitId, mandate);
      }
    }
  }

  const allUnitIds = Array.from(unitToMandate.keys());
  if (allUnitIds.length === 0) {
    return Response.json({ email: auth.email, mandates: auth.mandates, grievances: [] });
  }

  // Fetch cases and their events one mandate at a time, scoped by a JOIN
  // on the jurisdiction tables (see mandateScope) rather than an
  // "IN (?,?,...)" list of ward ids -- D1 caps bound parameters at about
  // 100 per query, which an MP or large MLA mandate would exceed.
  const grievanceById = new Map();
  const eventById = new Map();
  for (const mandate of auth.mandates) {
    const s = mandateScope(mandate);
    const { results: gRows } = await env.DB.prepare(
      `SELECT g.* FROM grievances g ${s.join} WHERE ${s.where} ORDER BY g.created_at ASC`
    ).bind(...s.binds).all();
    for (const g of gRows) {
      if (!grievanceById.has(g.id)) grievanceById.set(g.id, g);
    }
    const { results: eRows } = await env.DB.prepare(
      `SELECT e.*, e.rowid AS event_rowid FROM grievance_events e
       JOIN grievances g ON g.id = e.grievance_id ${s.join}
       WHERE ${s.where}`
    ).bind(...s.binds).all();
    for (const e of eRows) {
      if (!eventById.has(e.id)) eventById.set(e.id, e);
    }
  }

  const grievanceRows = Array.from(grievanceById.values()).sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
  );

  // Group every event under its grievance, oldest first -- so each
  // grievance's list ends with its single most recent event. This is what
  // decides whether a dispute banner is still current, rather than
  // trusting columns that never get cleared.
  const eventsByGrievance = new Map();
  const sortedEvents = Array.from(eventById.values()).sort((a, b) => {
    if (a.created_at < b.created_at) return -1;
    if (a.created_at > b.created_at) return 1;
    return a.event_rowid - b.event_rowid;
  });
  for (const event of sortedEvents) {
    if (!eventsByGrievance.has(event.grievance_id)) {
      eventsByGrievance.set(event.grievance_id, []);
    }
    eventsByGrievance.get(event.grievance_id).push(event);
  }

  const chainCache = new Map();
  const categoryCache = new Map();
  const visible = [];

  for (const grievance of grievanceRows) {
    const myMandate = unitToMandate.get(grievance.local_unit_id);
    const myTier = myMandate.tier;

    let chain = chainCache.get(grievance.local_unit_id);
    if (chain === undefined) {
      chain = await resolveChain(env, grievance.local_unit_id);
      chainCache.set(grievance.local_unit_id, chain);
    }
    if (!chain) continue;

    let category = categoryCache.get(grievance.category_id);
    if (category === undefined) {
      category = await env.DB.prepare(
        "SELECT * FROM grievance_categories WHERE id = ?"
      ).bind(grievance.category_id).first();
      categoryCache.set(grievance.category_id, category);
    }
    if (!category) continue;

    const result = computeEscalation(grievance, category, chain.tiers);
    const visibleChain = visibleTiers(chain.tiers, result.currentTierIndex);

    // Can this rep see it at all? True once escalation has reached (or
    // started at, for LOCAL) their tier.
    const iSeeIt = visibleChain.some((t) => t.tier === myTier);
    if (!iSeeIt) continue;

    const myTierIndex = chain.tiers.findIndex((t) => t.tier === myTier);
    const isUnresolved = grievance.status !== "RESOLVED" && grievance.status !== "CLOSED";
    const grievanceEvents = eventsByGrievance.get(grievance.id) || [];
    const substantiveEvents = grievanceEvents.filter((e) => e.event_type !== 'ADMIN_NUDGE'); const latestEvent = substantiveEvents.length ? substantiveEvents[substantiveEvents.length - 1] : null; const nudgeEvents = grievanceEvents.filter((e) => e.event_type === 'ADMIN_NUDGE');
    const followupEvents = grievanceEvents.filter((e) => e.event_type === 'FOLLOW_UP');
    const latestFollowup = followupEvents.length ? followupEvents[followupEvents.length - 1] : null;

    // photo_url is stored as a JSON array string (see
    // functions/api/grievances/submit.js) — parse defensively since it
    // may be null for older test rows or malformed if ever hand-edited.
    let photoUrls = [];
    if (grievance.photo_url) {
      try {
        const parsed = JSON.parse(grievance.photo_url);
        if (Array.isArray(parsed)) photoUrls = parsed;
      } catch {
        photoUrls = [];
      }
    }

    visible.push({
      id: grievance.id,
      trackingRef: grievance.tracking_ref,
      description: grievance.description,
      locationDetail: grievance.location_detail || null,
      photoUrls,
      status: grievance.status,
      localUnit: {
        id: chain.localUnit.id,
        name: chain.localUnit.name,
        type: chain.localUnit.unit_type,
      },
      category: { id: category.id, name: category.name },
      createdAt: grievance.created_at,
      elapsedDays: Math.round((result.elapsedHours / 24) * 10) / 10,
      ackOverdue: result.ackOverdue,
      needsLegalReview: result.needsLegalReview,
      viewingAsTier: myTier,
      mandateId: myMandate.id,
      // Red indicator: stays on for this rep as long as the case is
      // unresolved, regardless of whether it has since escalated further
      // above them — visibility here means responsibility, not a handoff.
      isRedIndicator: isUnresolved,
      hasEscalatedPastMyTier: result.currentTierIndex > myTierIndex,
      currentTopTier: result.currentTier.tier,
      // Full tier sequence for this case's chain (3 or 4 tiers depending
      // on rural/urban/Mayor status) plus how far up it currently sits —
      // lets the UI draw an honest escalation ladder without needing to
      // know the chain length in advance.
      chainTierList: chain.tiers.map((t) => t.tier),
      currentTierIndex: result.currentTierIndex,
      citizenDisputeReason: latestEvent && latestEvent.event_type === 'CITIZEN_DISPUTED' ? latestEvent.reason : null,
      citizenDisputeNote: latestEvent && latestEvent.event_type === 'CITIZEN_DISPUTED' ? latestEvent.note : null,
      citizenDisputeAt: latestEvent && latestEvent.event_type === 'CITIZEN_DISPUTED' ? latestEvent.created_at : null,
      resolvedAt: grievance.resolved_at || null,
      acknowledgedAt: grievance.acknowledged_at || null,
      currentDepartment: latestFollowup ? latestFollowup.reason : null,
      adminNudges: nudgeEvents.map((e) => ({ note: e.note, createdAt: e.created_at })), followupHistory: followupEvents.map((e) => ({
        department: e.reason,
        note: e.note,
        actor: e.actor,
        createdAt: e.created_at,
      })),
    });
}

  return Response.json({
    email: auth.email,
    mandates: auth.mandates,
    grievances: visible,
  });
}
