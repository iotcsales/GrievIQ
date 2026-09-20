// functions/api/grievances/report.js
//
// Rep-facing aggregation endpoint for the performance/audit report (P5).
// Given a rep's chosen mandate and an optional date range, returns
// summary statistics plus the underlying case-level rows, so the same
// data can back both the on-screen report and a CSV export.
//
// Dispute rate and escalation rate are always included and never
// filterable out — GrievIQ's accountability value depends on these
// numbers being visible by default, not something a rep can opt out of
// showing.

import { getVerifiedRep } from "../../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate, resolveChain } from "../../_shared/jurisdiction.js";
import { computeEscalation } from "../../_shared/escalation.js";

function hoursBetween(startIso, endIso) {
  const start = new Date(startIso.replace(" ", "T") + "Z").getTime();
  const end = new Date(endIso.replace(" ", "T") + "Z").getTime();
  return (end - start) / (1000 * 60 * 60);
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const mandateId = url.searchParams.get("mandateId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let mandate = auth.mandates[0];
  if (mandateId) {
    const found = auth.mandates.find((m) => m.id === mandateId);
    if (found) mandate = found;
  }

  const unitIds = await getLocalUnitIdsForMandate(env, mandate);
  if (unitIds.length === 0) {
    return Response.json({
      mandate,
      from: from || null,
      to: to || null,
      stats: {
        totalCases: 0, avgAckHours: null, avgResolveHours: null,
        resolvedCount: 0, disputeRate: null, escalationRate: null, noFollowupCount: 0,
        byCategory: {}, byLocalUnit: {}, byStatus: {},
      },
      cases: [],
    });
  }

  const placeholders = unitIds.map(() => "?").join(",");
  const params = [...unitIds];
  let dateClause = "";
  if (from) { dateClause += " AND created_at >= ?"; params.push(from); }
  if (to) { dateClause += " AND created_at <= ?"; params.push(to + " 23:59:59"); }

  const { results: grievanceRows } = await env.DB.prepare(
    `SELECT * FROM grievances WHERE local_unit_id IN (${placeholders}) ${dateClause} ORDER BY created_at ASC`
  ).bind(...params).all();

  const grievanceIds = grievanceRows.map((g) => g.id);
  const disputedIds = new Set();
  if (grievanceIds.length > 0) {
    const ph2 = grievanceIds.map(() => "?").join(",");
    const { results: disputeEvents } = await env.DB.prepare(
      `SELECT DISTINCT grievance_id FROM grievance_events WHERE event_type = 'CITIZEN_DISPUTED' AND grievance_id IN (${ph2})`
    ).bind(...grievanceIds).all();
          disputeEvents.forEach((r) => disputedIds.add(r.grievance_id));
    }

    const followupCounts = new Map();
    if (grievanceIds.length > 0) {
      const ph3 = grievanceIds.map(() => "?").join(",");
      const { results: followupEvents } = await env.DB.prepare(
        `SELECT grievance_id FROM grievance_events WHERE event_type = 'FOLLOW_UP' AND grievance_id IN (${ph3})`
      ).bind(...grievanceIds).all();
      followupEvents.forEach((r) => followupCounts.set(r.grievance_id, (followupCounts.get(r.grievance_id) || 0) + 1));
    }

  const categoryCache = new Map();
  const chainCache = new Map();

  let totalAckHours = 0, ackCount = 0;
  let totalResolveHours = 0, resolveCount = 0;
  let escalatedCount = 0;
  let disputedResolvedCount = 0;

  const byCategory = new Map();
  const byLocalUnit = new Map();
  const byStatus = new Map();
  const caseRows = [];

  for (const g of grievanceRows) {
    let category = categoryCache.get(g.category_id);
    if (category === undefined) {
      category = await env.DB.prepare("SELECT * FROM grievance_categories WHERE id = ?").bind(g.category_id).first();
      categoryCache.set(g.category_id, category);
    }
    let chain = chainCache.get(g.local_unit_id);
    if (chain === undefined) {
      chain = await resolveChain(env, g.local_unit_id);
      chainCache.set(g.local_unit_id, chain);
    }
    if (!category || !chain) continue;

    if (g.acknowledged_at) {
      totalAckHours += hoursBetween(g.created_at, g.acknowledged_at);
      ackCount++;
    }

    const isFinal = g.status === "RESOLVED" || g.status === "CLOSED";
    if (g.resolved_at && isFinal) {
      totalResolveHours += hoursBetween(g.created_at, g.resolved_at);
      resolveCount++;
      if (disputedIds.has(g.id)) disputedResolvedCount++;
    }

    const myTierIndex = chain.tiers.findIndex((t) => t.tier === mandate.tier);
    const result = computeEscalation(g, category, chain.tiers);
    if (result.currentTierIndex > myTierIndex) escalatedCount++;

    byCategory.set(category.name, (byCategory.get(category.name) || 0) + 1);
    byLocalUnit.set(chain.localUnit.name, (byLocalUnit.get(chain.localUnit.name) || 0) + 1);
    byStatus.set(g.status, (byStatus.get(g.status) || 0) + 1);

    caseRows.push({
      trackingRef: g.tracking_ref,
      category: category.name,
      localUnit: chain.localUnit.name,
      status: g.status,
      createdAt: g.created_at,
      acknowledgedAt: g.acknowledged_at || null,
      resolvedAt: g.resolved_at || null,
      disputed: disputedIds.has(g.id),
      followupCount: followupCounts.get(g.id) || 0,
      });
  }

  const stats = {
    totalCases: grievanceRows.length,
    avgAckHours: ackCount ? Math.round((totalAckHours / ackCount) * 10) / 10 : null,
    avgResolveHours: resolveCount ? Math.round((totalResolveHours / resolveCount) * 10) / 10 : null,
    resolvedCount: resolveCount,
    disputeRate: resolveCount ? Math.round((disputedResolvedCount / resolveCount) * 1000) / 10 : null,
    escalationRate: grievanceRows.length ? Math.round((escalatedCount / grievanceRows.length) * 1000) / 10 : null,
    noFollowupCount: grievanceRows.filter((g) => !followupCounts.has(g.id)).length,
    byCategory: Object.fromEntries(byCategory),
    byLocalUnit: Object.fromEntries(byLocalUnit),
    byStatus: Object.fromEntries(byStatus),
  };

  return Response.json({
    mandate,
    from: from || null,
    to: to || null,
    stats,
    cases: caseRows,
  });
}