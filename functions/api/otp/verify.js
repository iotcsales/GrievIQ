import { resolveChain } from "../../_shared/jurisdiction.js";
import { computeEscalation } from "../../_shared/escalation.js";

export async function onRequestPost({ request, env }) {
  try {
    const { email, trackingRef, code } = await request.json();

    if (!email || !trackingRef || !code) {
      return new Response(JSON.stringify({ error: 'email, trackingRef and code are required' }), { status: 400 });
    }

    const otpRow = await env.DB.prepare(
      `SELECT id, expires_at FROM grievance_otp
       WHERE email = ? AND otp_code = ? AND purpose = 'STATUS_CHECK'
       ORDER BY created_at DESC LIMIT 1`
    ).bind(email, code).first();

    if (!otpRow) {
      return new Response(JSON.stringify({ error: 'Incorrect code' }), { status: 401 });
    }

    if (new Date(otpRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Code has expired, please request a new one' }), { status: 401 });
    }

    await env.DB.prepare('UPDATE grievance_otp SET verified = 1 WHERE id = ?').bind(otpRow.id).run();

    const grievance = await env.DB.prepare(
      `SELECT id, tracking_ref, description, status, current_tier, created_at, acknowledged_at, resolved_at,
              citizen_email, local_unit_id, category_id
       FROM grievances WHERE tracking_ref = ?`
    ).bind(trackingRef).first();

    if (!grievance || !grievance.citizen_email || grievance.citizen_email.toLowerCase() !== email.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Case not found for this email' }), { status: 404 });
    }

    const chain = await resolveChain(env, grievance.local_unit_id);
    if (!chain) {
      return new Response(JSON.stringify({ error: 'Could not resolve jurisdiction for this case' }), { status: 500 });
    }

    const category = await env.DB.prepare(
      "SELECT * FROM grievance_categories WHERE id = ?"
    ).bind(grievance.category_id).first();
    if (!category) {
      return new Response(JSON.stringify({ error: 'Could not resolve category for this case' }), { status: 500 });
    }

    const { results: followupRows } = await env.DB.prepare(
      `SELECT reason, note, actor, created_at FROM grievance_events
       WHERE grievance_id = ? AND event_type = 'FOLLOW_UP'
       ORDER BY created_at ASC, rowid ASC`
    ).bind(grievance.id).all();
    const latestFollowup = followupRows.length ? followupRows[followupRows.length - 1] : null;

    const result = computeEscalation(grievance, category, chain.tiers);
    const isUnresolved = grievance.status !== 'RESOLVED' && grievance.status !== 'CLOSED';

    const tiers = chain.tiers.map((t, i) => ({
      tier: t.tier,
      label: t.label,
      visible: i <= result.currentTierIndex,
      // Past-SLA red state: this tier is actively overdue if it's part of
      // the visible chain and the case is still unresolved. Mirrors the
      // rep dashboard's isRedIndicator, just per-tier for the citizen view.
      slaBreached: i <= result.currentTierIndex && isUnresolved,
    }));

    return new Response(JSON.stringify({
      verified: true,
      case: {
        trackingRef: grievance.tracking_ref,
        description: grievance.description,
        status: grievance.status,
        localUnitName: chain.localUnit.name,
        createdAt: grievance.created_at,
        acknowledgedAt: grievance.acknowledged_at,
        resolvedAt: grievance.resolved_at,
        elapsedDays: Math.round((result.elapsedHours / 24) * 10) / 10,
        ackOverdue: result.ackOverdue,
        needsLegalReview: result.needsLegalReview,
        currentTierIndex: result.currentTierIndex,
        tiers,
        currentDepartment: latestFollowup ? latestFollowup.reason : null,
        followupHistory: followupRows.map((e) => ({
          department: e.reason,
          note: e.note,
          actor: e.actor,
          createdAt: e.created_at,
        })),
      },
    }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Unexpected error', detail: err.message }), { status: 500 });
  }
}