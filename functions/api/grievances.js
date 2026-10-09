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

import { deptTypes, namesOf } from "../_shared/departments.js";
import { getVerifiedRep } from "../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate, resolveChain, mandateScope } from "../_shared/jurisdiction.js";
import { computeEscalation, visibleTiers } from "../_shared/escalation.js";
import { timeLimitStatus } from "../_shared/time-limits.js";
import { settleOverdueConfirmations, resolutionKind, awaitingStaffCheck } from "../_shared/confirmation.js";
import { shapeResolution, parseWard } from "../_shared/resolution-evidence.js";
import { photoMedia, complaintPhotoList } from "../_shared/photo-store.js";
import { shapeReopen } from "../_shared/reopen.js";
import { ROLE, canManageCases, isViewOnly, officeKey, jobProfile, WORKLOAD_WARN } from "../_shared/team.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Map every local unit this rep has any mandate over to which of their
  // mandate tiers covers it — a rep only ever checks visibility against
  // their own tier for cases under that specific mandate.
  //
  // Speed (Sept 2026): the database is far from most visitors, so every
  // round trip costs time. The unit lookups run side by side, and all the
  // case queries go in ONE batch (one round trip) instead of 4 per mandate
  // one after another; ward chains are looked up side by side too.
  // Closing overdue confirmations (item 7a) runs alongside the unit
  // lookups and finishes before any case is read.
  const [unitLists] = await Promise.all([
    Promise.all(auth.mandates.map((m) => getLocalUnitIdsForMandate(env, m))),
    settleOverdueConfirmations(env),
  ]);
  const unitToMandate = new Map();
  auth.mandates.forEach((mandate, i) => {
    for (const unitId of unitLists[i]) {
      if (!unitToMandate.has(unitId)) {
        unitToMandate.set(unitId, mandate);
      }
    }
  });

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
  // Latest resolution report per case, and its photos (item 7b).
  const reportByGrievance = new Map();
  const photosByReport = new Map();
  // Latest GrievIQ staff check per case (item 7b-2).
  const checkByGrievance = new Map();
  // The citizen's private photos per case (item 7c).
  const complaintPhotosByGrievance = new Map();
  // Latest reopening per case (item 7d).
  const reopenByGrievance = new Map();
  // Item 8b: fix reports waiting for approval (or sent back), and who each
  // case is assigned to.
  const pendingByGrievance = new Map();
  const sentBackByGrievance = new Map();
  const assignmentByGrievance = new Map();
  const stmts = [env.DB.prepare("SELECT * FROM grievance_categories")];
  for (const mandate of auth.mandates) {
    const s = mandateScope(mandate);
    stmts.push(
      env.DB.prepare(
        `SELECT g.* FROM grievances g ${s.join} WHERE ${s.where} ORDER BY g.created_at ASC`
      ).bind(...s.binds),
      env.DB.prepare(
        `SELECT e.*, e.rowid AS event_rowid FROM grievance_events e
         JOIN grievances g ON g.id = e.grievance_id ${s.join}
         WHERE ${s.where}`
      ).bind(...s.binds),
      env.DB.prepare(
        `SELECT rr.*, rr.rowid AS report_rowid FROM resolution_reports rr
         JOIN grievances g ON g.id = rr.grievance_id ${s.join}
         WHERE ${s.where}`
      ).bind(...s.binds),
      env.DB.prepare(
        `SELECT rp.* FROM resolution_photos rp
         JOIN grievances g ON g.id = rp.grievance_id ${s.join}
         WHERE rp.report_id IS NOT NULL AND ${s.where}
         ORDER BY rp.created_at ASC, rp.rowid ASC`
      ).bind(...s.binds),
      env.DB.prepare(
        `SELECT rc.grievance_id, rc.method, rc.outcome, rc.note, rc.checked_at, rc.rowid AS check_rowid FROM resolution_checks rc
         JOIN grievances g ON g.id = rc.grievance_id ${s.join}
         WHERE ${s.where}`
      ).bind(...s.binds),
      env.DB.prepare(
        `SELECT cp.* FROM complaint_photos cp
         JOIN grievances g ON g.id = cp.grievance_id ${s.join}
         WHERE ${s.where}`
      ).bind(...s.binds),
      env.DB.prepare(
        `SELECT ro.*, ro.rowid AS reopen_rowid FROM grievance_reopens ro
         JOIN grievances g ON g.id = ro.grievance_id ${s.join}
         WHERE ${s.where}`
      ).bind(...s.binds),
      env.DB.prepare(
        `SELECT ca.* FROM case_assignments ca
         JOIN grievances g ON g.id = ca.grievance_id ${s.join}
         WHERE ca.ended_at IS NULL AND ${s.where}`
      ).bind(...s.binds)
    );
  }
  const batch = await env.DB.batch(stmts);
  const categoryById = new Map((batch[0].results || []).map((c) => [c.id, c]));
  for (let i = 1; i < batch.length; i += 8) {
    for (const g of batch[i].results || []) {
      if (!grievanceById.has(g.id)) grievanceById.set(g.id, g);
    }
    for (const e of batch[i + 1].results || []) {
      if (!eventById.has(e.id)) eventById.set(e.id, e);
    }
    for (const r of batch[i + 2].results || []) {
      if (r.review_status === "PENDING") { pendingByGrievance.set(r.grievance_id, r); continue; }
      if (r.review_status === "SENT_BACK") {
        const sb = sentBackByGrievance.get(r.grievance_id);
        if (!sb || r.created_at > sb.created_at) sentBackByGrievance.set(r.grievance_id, r);
        continue;
      }
      const prev = reportByGrievance.get(r.grievance_id);
      if (!prev || r.created_at > prev.created_at || (r.created_at === prev.created_at && r.report_rowid > prev.report_rowid)) {
        reportByGrievance.set(r.grievance_id, r);
      }
    }
    for (const p of batch[i + 3].results || []) {
      if (!photosByReport.has(p.report_id)) photosByReport.set(p.report_id, []);
      const list = photosByReport.get(p.report_id);
      if (!list.some((x) => x.id === p.id)) list.push(p);
    }
    for (const k of batch[i + 4].results || []) {
      const prev = checkByGrievance.get(k.grievance_id);
      if (!prev || k.checked_at > prev.checked_at || (k.checked_at === prev.checked_at && k.check_rowid > prev.check_rowid)) {
        checkByGrievance.set(k.grievance_id, k);
      }
    }
    for (const cp of batch[i + 5].results || []) {
      if (!complaintPhotosByGrievance.has(cp.grievance_id)) complaintPhotosByGrievance.set(cp.grievance_id, []);
      const list = complaintPhotosByGrievance.get(cp.grievance_id);
      if (!list.some((x) => x.id === cp.id)) list.push(cp);
    }
    for (const ro of batch[i + 6].results || []) {
      const prev = reopenByGrievance.get(ro.grievance_id);
      if (!prev || ro.reopened_at > prev.reopened_at || (ro.reopened_at === prev.reopened_at && ro.reopen_rowid > prev.reopen_rowid)) {
        reopenByGrievance.set(ro.grievance_id, ro);
      }
    }
    for (const ca of batch[i + 7].results || []) {
      const prev = assignmentByGrievance.get(ca.grievance_id);
      if (!prev || ca.assigned_at > prev.assigned_at) assignmentByGrievance.set(ca.grievance_id, ca);
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

  // Every ward chain needed, looked up side by side.
  const chainCache = new Map();
  const neededUnits = Array.from(new Set(grievanceRows.map((x) => x.local_unit_id)));
  const chains = await Promise.all(neededUnits.map((u) => resolveChain(env, u)));
  neededUnits.forEach((u, i) => chainCache.set(u, chains[i]));
  const visible = [];

  for (const grievance of grievanceRows) {
    const myMandate = unitToMandate.get(grievance.local_unit_id);
    const myTier = myMandate.tier;
    // Item 8b: a field worker sees only the cases assigned to them in that office.
    const myRole = myMandate.role || ROLE.REP;
    const assignment = assignmentByGrievance.get(grievance.id) || null;
    if (myRole === ROLE.FW && !(assignment && assignment.assignee_email === auth.email &&
        assignment.office_tier === myMandate.tier && assignment.office_id === myMandate.id)) continue;

    const chain = chainCache.get(grievance.local_unit_id);
    if (!chain) continue;

    const category = categoryById.get(grievance.category_id);
    if (!category) continue;

    const result = computeEscalation(grievance, category, chain.tiers);
    const visibleChain = visibleTiers(chain.tiers, result.currentTierIndex);

    // Can this rep see it at all? True once escalation has reached (or
    // started at, for LOCAL) their tier.
    const iSeeIt = visibleChain.some((t) => t.tier === myTier);
    if (!iSeeIt) continue;

    const myTierIndex = chain.tiers.findIndex((t) => t.tier === myTier);
    // Time limits for THIS rep's level, from the same shared rule the
    // citizen status page uses (_shared/time-limits.js).
    const limits = timeLimitStatus(grievance, category, chain.tiers, result);
    const myLimits = limits.tiers[myTierIndex] || null;
    const isUnresolved = grievance.status !== "RESOLVED" && grievance.status !== "CLOSED";
    const grievanceEvents = eventsByGrievance.get(grievance.id) || [];
    const substantiveEvents = grievanceEvents.filter((e) => e.event_type !== 'ADMIN_NUDGE'); const latestEvent = substantiveEvents.length ? substantiveEvents[substantiveEvents.length - 1] : null; const nudgeEvents = grievanceEvents.filter((e) => e.event_type === 'ADMIN_NUDGE');
    const followupEvents = grievanceEvents.filter((e) => e.event_type === 'FOLLOW_UP');
    const latestFollowup = followupEvents.length ? followupEvents[followupEvents.length - 1] : null;

    // The citizen's photos (item 7c): private, with a preview for the list,
    // plus any old public links not moved yet.
    // Item 8c-1: an office assistant gets previews only, never full size.
    const viewOnly = isViewOnly(myRole);
    const photos = previewOnly(await complaintPhotoList(env, grievance, complaintPhotosByGrievance.get(grievance.id), true), viewOnly);

    const report = reportByGrievance.get(grievance.id) || null;
    const resolution = report
      ? previewOnlyReport(await shapeResolution(grievance, report, photosByReport.get(report.id) || [], "rep", (p) => photoMedia(env, p, "r"), null, parseWard(chain.localUnit.ward_boundary_geojson)), viewOnly)
      : null;

    // Item 8b: a fix report waiting for approval, or the last one sent back.
    const pendingRow = pendingByGrievance.get(grievance.id) || null;
    const pendingReport = pendingRow
      ? previewOnlyReport(await shapeResolution(grievance, pendingRow, photosByReport.get(pendingRow.id) || [], "rep", (p) => photoMedia(env, p, "r"), null, parseWard(chain.localUnit.ward_boundary_geojson)), viewOnly)
      : null;
    const sentBackRow = sentBackByGrievance.get(grievance.id) || null;
    const sentBack = sentBackRow && !pendingRow && (!report || sentBackRow.created_at > report.created_at) && grievance.status !== "RESOLVED" && grievance.status !== "CLOSED"
      ? { note: sentBackRow.review_note || "", by: sentBackRow.reviewed_by, at: sentBackRow.reviewed_at, submittedBy: sentBackRow.created_by }
      : null;

    visible.push({
      id: grievance.id,
      // Item 8b: this person's role for the case, and the team workflow.
      myRole,
      viewOnly,
      officeKey: officeKey(myMandate.tier, myMandate.id),
      assignment: assignment ? { email: assignment.assignee_email, by: assignment.assigned_by, at: assignment.assigned_at } : null,
      pendingReport,
      sentBack,
      canApprove: Boolean(pendingRow && canManageCases(myRole) && pendingRow.created_by !== auth.email),
      trackingRef: grievance.tracking_ref,
      description: grievance.description,
      retentionRemovedAt: grievance.retention_removed_at || null,   // item 9d
      locationDetail: grievance.location_detail || null,
      // Where the problem is (pin saved at filing, Sept 2026). For the case's
      // representatives only -- never returned by any public/citizen endpoint.
      pin: grievance.pin_lat != null && grievance.pin_lng != null
        ? { lat: Number(grievance.pin_lat), lng: Number(grievance.pin_lng) }
        : null,
      photos,
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
      // Past the time limit at this rep's level (same rule as the citizen
      // ladder): green until the limit passes, then red.
      isLate: Boolean(myLimits && myLimits.slaBreached),
      isCurrentLevel: Boolean(myLimits && myLimits.current),
      ackDueAt: limits.ackDueAt,
      respondDueAt: myLimits ? myLimits.dueAt : null,
      // Per-level flags for the ladder dots, in chain order.
      tierLate: limits.tiers.map((t) => Boolean(t.slaBreached)),
      // Department suggested for this issue type (admin-managed column on
      // grievance_categories; null when there's no clear match).
      suggestedDepartment: category.suggested_department || null,
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
      // Item 7a: when a case waiting for the citizen closes by itself, and
      // how a closed case was resolved (CONFIRMED / NOT_CONFIRMED / NO_EMAIL).
      confirmBy: limits.confirmBy,
      resolutionKind: resolutionKind(grievance),
      // What the rep said was done, with "after" photos and warnings (item 7b).
      resolution,
      // Item 7d: reopened by the citizen (or staff for them): when, why, and
      // which level it went to.
      reopen: shapeReopen(reopenByGrievance.get(grievance.id) || null, "rep"),
      // Item 7b-2: no citizen email, so GrievIQ staff check the fix; and the
      // latest staff check (shown when they found it not fixed).
      awaitingStaffCheck: awaitingStaffCheck(grievance),
      staffCheck: checkByGrievance.has(grievance.id)
        ? (({ outcome, method, note, checked_at }) => ({ outcome, method, note: note || null, at: checked_at }))(checkByGrievance.get(grievance.id))
        : null,
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

  // Item 8b: the field workers of each office this person manages cases
  // for (for the "Assign to" list). Item 8c-1: with their job profile and
  // workload (open jobs; overdue = past the time limit at the office's level).
  const teams = {};
  const managed = auth.mandates.filter((m) => canManageCases(m.role || ROLE.REP));
  if (managed.length) {
    try {
      const res = await env.DB.batch(managed.flatMap((m) => [
        env.DB.prepare(
          "SELECT * FROM office_team WHERE office_tier = ? AND office_id = ? AND status = 'ACTIVE' AND role = 'FIELD_WORKER' ORDER BY member_name"
        ).bind(m.tier, m.id),
        env.DB.prepare(
          `SELECT ca.assignee_email AS email, COUNT(*) AS n FROM case_assignments ca JOIN grievances g ON g.id = ca.grievance_id
           WHERE ca.office_tier = ? AND ca.office_id = ? AND ca.ended_at IS NULL
             AND g.status NOT IN ('RESOLVED', 'CLOSED', 'PENDING_CONFIRMATION')
           GROUP BY ca.assignee_email`
        ).bind(m.tier, m.id),
      ]));
      managed.forEach((m, i) => {
        const key = officeKey(m.tier, m.id);
        const openBy = new Map((res[i * 2 + 1].results || []).map((r) => [String(r.email).toLowerCase(), Number(r.n)]));
        teams[key] = (res[i * 2].results || [])
          .filter((r) => String(r.confirmed_by_rep_email || "").toLowerCase() === String(m.officeRepEmail || auth.email).toLowerCase())
          .map((r) => {
            const email = String(r.member_email).toLowerCase();
            const overdue = visible.filter((c) => c.officeKey === key && c.assignment && c.assignment.email === email &&
              c.isLate && c.status !== "RESOLVED" && c.status !== "CLOSED" && c.status !== "PENDING_CONFIRMATION").length;
            const job = jobProfile(r);
            return { email: r.member_email, name: r.member_name, designation: job.designation, designationOther: job.designationOther,
              wards: job.wards, issueTypes: job.issueTypes, available: job.available, open: openBy.get(email) || 0, overdue };
          });
      });
    } catch (e) { /* team tables not there yet */ }
  }

  // grieviq-25: the department types (managed by admins) for "Forward to
  // department", and every type's names so old follow-ups show correctly.
  const types = await deptTypes(env);
  return Response.json({
    departments: types.filter((t) => !t.retired).map((t) => t.key),
    deptNames: namesOf(types),
    email: auth.email,
    mandates: auth.mandates.map(({ tier, id, name, label, role }) => ({ tier, id, name, label, role: role || ROLE.REP })),
    grievances: visible,
    teams,
    workloadWarn: WORKLOAD_WARN,
  });
}

// Item 8c-1: for an office assistant, the preview stands in for the photo.
function previewOnly(list, on) {
  if (!on) return list;
  return (list || []).map((p) => {
    if (p.legacy) return Object.assign({}, p, { url: null, thumbUrl: null, previewOnly: true });
    // No separate preview (older photos): nothing rather than the full size.
    const preview = !p.removed && p.thumbUrl === p.url ? null : p.thumbUrl || null;
    return Object.assign({}, p, { url: preview, thumbUrl: preview, previewOnly: true });
  });
}
function previewOnlyReport(r, on) {
  if (!on || !r) return r;
  return Object.assign({}, r, { photos: previewOnly(r.photos, true) });
}
