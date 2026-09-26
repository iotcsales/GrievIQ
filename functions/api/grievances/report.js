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
import { getLocalUnitIdsForMandate, resolveChain, mandateScope } from "../../_shared/jurisdiction.js";
import { computeEscalation } from "../../_shared/escalation.js";

// Timestamps in this table come in two shapes: full ISO strings with a
// "T" and trailing "Z" (e.g. from newer writes), and legacy plain
// "YYYY-MM-DD HH:MM:SS" UTC strings with neither. Appending "Z" to an
// already-ISO string produces an invalid double-Z timestamp that
// silently parses to NaN -- so only convert the legacy shape.
function toUtcMs(iso) {
  if (iso.indexOf("T") !== -1) {
    return new Date(iso).getTime();
  }
  return new Date(iso.replace(" ", "T") + "Z").getTime();
}

function hoursBetween(startIso, endIso) {
  const start = toUtcMs(startIso);
  const end = toUtcMs(endIso);
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
  // Optional ward filter: one local unit id. Only honoured if it lies
  // inside the chosen scope's own wards (checked below).
  const ward = url.searchParams.get("ward") || null;

  // "all" unions local units across every mandate the rep holds, the
  // same pattern grievances.js uses -- each unit still remembers which
  // specific mandate covers it, since escalation-past-my-tier is
  // computed relative to that unit's own mandate, not one shared tier.
  const wantsAll = mandateId === "all";

  let mandate = auth.mandates[0];
  let unitToMandate = null;
  let unitIds;

  if (wantsAll) {
    unitToMandate = new Map();
    for (const m of auth.mandates) {
      const ids = await getLocalUnitIdsForMandate(env, m);
      for (const id of ids) {
        if (!unitToMandate.has(id)) unitToMandate.set(id, m);
      }
    }
    unitIds = Array.from(unitToMandate.keys());
  } else {
    if (mandateId) {
      const found = auth.mandates.find((m) => m.id === mandateId);
      if (found) mandate = found;
    }
    unitIds = await getLocalUnitIdsForMandate(env, mandate);
  }

  const responseMandate = wantsAll ? { id: "all", name: "All wards", label: "" } : mandate;

  // A rep can only filter to a ward inside the scope they are viewing --
  // never to someone else's area.
  if (ward && !unitIds.includes(ward)) {
    return Response.json({ error: "That ward is not in the areas you are viewing." }, { status: 403 });
  }

  if (unitIds.length === 0) {
    return Response.json({
      mandate: responseMandate,
      from: from || null,
      to: to || null,
      stats: {
        totalCases: 0, avgAckHours: null, avgResolveHours: null,
        resolvedCount: 0, disputeRate: null, escalationRate: null, noFollowupCount: 0,
        byCategory: {}, byLocalUnit: {}, byStatus: {},
      },
      ward: null,
      wards: [],
      cases: [],
    });
  }

  // Fetch one mandate at a time, scoped by a JOIN on the jurisdiction
  // tables (see mandateScope) rather than "IN (?,?,...)" lists of ward or
  // case ids -- D1 caps bound parameters at about 100 per query, which an
  // MP or large MLA mandate would exceed.
  const mandatesToQuery = wantsAll ? auth.mandates : [mandate];
  let dateClause = "";
  const dateBinds = [];
  if (from) { dateClause += " AND g.created_at >= ?"; dateBinds.push(from); }
  if (to) { dateClause += " AND g.created_at <= ?"; dateBinds.push(to + " 23:59:59"); }

  const grievanceById = new Map();
  const disputedIds = new Set();
  const followupEventIds = new Set();
  const followupCounts = new Map();
  // Every ward in the scope that has cases in the date range, with counts
  // -- lists the options for the ward filter, so it is built before the
  // ward filter is applied.
  const wardMap = new Map();

  for (const m of mandatesToQuery) {
    const s = mandateScope(m);

    const { results: gRows } = await env.DB.prepare(
      `SELECT g.* FROM grievances g ${s.join} WHERE ${s.where} ${dateClause} ORDER BY g.created_at ASC`
    ).bind(...s.binds, ...dateBinds).all();
    for (const g of gRows) {
      if (!grievanceById.has(g.id)) grievanceById.set(g.id, g);
    }

    const { results: wRows } = await env.DB.prepare(
      `SELECT g.local_unit_id AS id, lu_w.name AS name, COUNT(*) AS n
       FROM grievances g JOIN local_units lu_w ON lu_w.id = g.local_unit_id ${s.join}
       WHERE ${s.where} ${dateClause} GROUP BY g.local_unit_id, lu_w.name`
    ).bind(...s.binds, ...dateBinds).all();
    for (const w of wRows) {
      if (!wardMap.has(w.id)) wardMap.set(w.id, { id: w.id, name: w.name, count: w.n });
    }

    const { results: disputeEvents } = await env.DB.prepare(
      `SELECT DISTINCT e.grievance_id FROM grievance_events e
       JOIN grievances g ON g.id = e.grievance_id ${s.join}
       WHERE e.event_type = 'CITIZEN_DISPUTED' AND ${s.where}`
    ).bind(...s.binds).all();
    disputeEvents.forEach((row) => disputedIds.add(row.grievance_id));

    const { results: followupEvents } = await env.DB.prepare(
      `SELECT e.id, e.grievance_id FROM grievance_events e
       JOIN grievances g ON g.id = e.grievance_id ${s.join}
       WHERE e.event_type = 'FOLLOW_UP' AND ${s.where}`
    ).bind(...s.binds).all();
    for (const row of followupEvents) {
      if (followupEventIds.has(row.id)) continue; // counted once even if two mandates cover it
      followupEventIds.add(row.id);
      followupCounts.set(row.grievance_id, (followupCounts.get(row.grievance_id) || 0) + 1);
    }
  }

  const grievanceRows = Array.from(grievanceById.values())
    .filter((g) => !ward || g.local_unit_id === ward)
    .sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
  );

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

    const myTierForThisUnit = unitToMandate ? unitToMandate.get(g.local_unit_id).tier : mandate.tier;
    const myTierIndex = chain.tiers.findIndex((t) => t.tier === myTierForThisUnit);
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
    mandate: responseMandate,
    from: from || null,
    to: to || null,
    stats,
    ward: ward ? (wardMap.get(ward) || { id: ward, name: ward, count: 0 }) : null,
    wards: Array.from(wardMap.values()).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    cases: caseRows,
  });
}