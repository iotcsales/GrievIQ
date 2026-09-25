// functions/api/otp/verify.js
//
// Citizen "Track my reports", step 2.
//
// POST { email, code, trackingRef? }
//   Checks the code. On success returns every report filed with that
//   email (newest first) and, if trackingRef names one of them, that
//   report's full detail too.
//
// POST { email, trackingRef, open: true }
//   Opens one report without a new code, provided this email was
//   verified in the last 15 minutes (the same window the confirm and
//   dispute buttons use).
//
// Security (OWASP): a code stops working after 5 wrong guesses; codes are
// single-use and wiped from the database once used; wrong or expired
// codes get the same kind of reply whatever the email.
//
// The single-report detail ("case") keeps exactly the shape the status
// page already used, so the tested detail view is unchanged.

import { resolveChain } from "../../_shared/jurisdiction.js";
import { computeEscalation } from "../../_shared/escalation.js";

const MAX_WRONG_GUESSES = 5;
const VERIFIED_WINDOW_MINUTES = 15;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

async function listReports(env, email) {
  const { results } = await env.DB.prepare(
    `SELECT g.tracking_ref, g.status, g.description, g.created_at,
            lu.name AS ward_name, c.name AS category_name
     FROM grievances g
     LEFT JOIN local_units lu ON lu.id = g.local_unit_id
     LEFT JOIN grievance_categories c ON c.id = g.category_id
     WHERE LOWER(g.citizen_email) = ?
     ORDER BY g.created_at DESC`
  ).bind(email).all();
  return results.map((r) => ({
    trackingRef: r.tracking_ref,
    status: r.status,
    description: String(r.description || "").slice(0, 140),
    wardName: r.ward_name || "",
    category: r.category_name || "",
    createdAt: r.created_at,
  }));
}

// Unchanged from the previous verify.js, moved into a function.
async function buildCaseDetail(env, grievance) {
  const chain = await resolveChain(env, grievance.local_unit_id);
  if (!chain) return { error: "Could not resolve jurisdiction for this case" };

  const category = await env.DB.prepare(
    "SELECT * FROM grievance_categories WHERE id = ?"
  ).bind(grievance.category_id).first();
  if (!category) return { error: "Could not resolve category for this case" };

  const { results: followupRows } = await env.DB.prepare(
    `SELECT reason, note, actor, created_at FROM grievance_events
     WHERE grievance_id = ? AND event_type = 'FOLLOW_UP'
     ORDER BY created_at ASC, rowid ASC`
  ).bind(grievance.id).all();
  const latestFollowup = followupRows.length ? followupRows[followupRows.length - 1] : null;

  const { results: nudgeRows } = await env.DB.prepare(
    "SELECT created_at FROM grievance_events WHERE grievance_id = ? AND event_type = 'ADMIN_NUDGE' ORDER BY created_at ASC, rowid ASC"
  ).bind(grievance.id).all();

  const result = computeEscalation(grievance, category, chain.tiers);
  const isUnresolved = grievance.status !== "RESOLVED" && grievance.status !== "CLOSED";

  // A level is "past its usual response time" only when it really is:
  //  - levels the case has already escalated past (escalation only
  //    happens once the time limit has run out), or
  //  - the current level, if the case still hasn't been acknowledged
  //    within the acknowledgement time limit.
  // Otherwise the current level is simply "currently handling this case".
  // (Previously every level that could see an unresolved case was shown
  // as late, even minutes after filing.)
  // Deadlines, from the category's own time limits (TATs):
  //  - acknowledgement: filed + ack_sla_hours
  //  - resolution at level i: filed + resolution_sla_hours x (i + 1);
  //    when it passes, the case escalates to the next level.
  // Categories with no resolution limit (e.g. land disputes) go to
  // legal review instead and have no resolution deadline.
  const createdStr = String(grievance.created_at || "");
  const createdMs = createdStr.indexOf("T") !== -1
    ? new Date(createdStr).getTime()
    : new Date(createdStr.replace(" ", "T") + "Z").getTime();
  const HOUR = 3600000;
  const slaHours = category.resolution_sla_hours || null;
  const lastIndex = chain.tiers.length - 1;
  const ackDueAt = !grievance.acknowledged_at && category.ack_sla_hours && !isNaN(createdMs)
    ? new Date(createdMs + category.ack_sla_hours * HOUR).toISOString()
    : null;

  // The top level has nowhere to escalate to, so it turns red once its
  // own time has run out (resolution limit x number of levels).
  const lastLevelOverdue = isUnresolved && slaHours &&
    result.currentTierIndex === lastIndex &&
    result.elapsedHours >= slaHours * chain.tiers.length;

  // A level is "past its usual response time" only when it really is:
  //  - levels the case has already escalated past (escalation only
  //    happens once the time limit has run out),
  //  - the current level, if the case still hasn't been acknowledged
  //    within the acknowledgement time limit, or
  //  - the top level, once its own time has run out.
  // Otherwise the current level is simply "currently handling this case".
  const tiers = chain.tiers.map((t, i) => {
    const isCurrent = i === result.currentTierIndex;
    return {
      tier: t.tier,
      label: t.label,
      visible: i <= result.currentTierIndex,
      current: isCurrent && isUnresolved,
      slaBreached: isUnresolved && (
        i < result.currentTierIndex ||
        (isCurrent && result.ackOverdue) ||
        (isCurrent && lastLevelOverdue)
      ),
      dueAt: isCurrent && isUnresolved && slaHours && !isNaN(createdMs)
        ? new Date(createdMs + slaHours * (i + 1) * HOUR).toISOString()
        : null,
    };
  });

  return {
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
      ackDueAt,
      reminderCount: nudgeRows.length,
      lastReminderAt: nudgeRows.length ? nudgeRows[nudgeRows.length - 1].created_at : null,
      currentDepartment: latestFollowup ? latestFollowup.reason : null,
      followupHistory: followupRows.map((e) => ({
        department: e.reason,
        note: e.note,
        actor: e.actor,
        createdAt: e.created_at,
      })),
    },
  };
}

async function caseForEmail(env, email, trackingRef) {
  const grievance = await env.DB.prepare(
    `SELECT id, tracking_ref, description, status, current_tier, created_at, acknowledged_at, resolved_at,
            citizen_email, local_unit_id, category_id
     FROM grievances WHERE tracking_ref = ?`
  ).bind(trackingRef).first();
  if (!grievance || !grievance.citizen_email || grievance.citizen_email.toLowerCase() !== email) {
    return { error: "Case not found for this email", status: 404 };
  }
  const built = await buildCaseDetail(env, grievance);
  if (built.error) return { error: built.error, status: 500 };
  return built;
}

export async function onRequestPost({ request, env }) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid request." }, 400);
    }

    const email = String(body.email || "").trim().toLowerCase();
    const trackingRef = body.trackingRef ? String(body.trackingRef).trim().toUpperCase() : "";
    if (!email) return json({ error: "email is required" }, 400);

    // ---- Open one report inside the verified window (no new code) ----
    if (body.open) {
      if (!trackingRef) return json({ error: "trackingRef is required" }, 400);
      const recent = await env.DB.prepare(
        `SELECT id FROM grievance_otp
         WHERE LOWER(email) = ? AND purpose = 'STATUS_CHECK' AND verified = 1 AND verified_at >= ?
         LIMIT 1`
      ).bind(email, isoMinutesAgo(VERIFIED_WINDOW_MINUTES)).first();
      if (!recent) {
        return json({ error: "VERIFY_AGAIN", message: "For your security, please verify your email again." }, 401);
      }
      const found = await caseForEmail(env, email, trackingRef);
      if (found.error) return json({ error: found.error }, found.status);
      return json({ verified: true, case: found.case });
    }

    // ---- Check a code ----
    const code = String(body.code || "").replace(/\D/g, "");
    if (code.length !== 6) return json({ error: "Enter all 6 digits of the code." }, 400);

    const row = await env.DB.prepare(
      `SELECT id, otp_code, expires_at, failed_attempts FROM grievance_otp
       WHERE LOWER(email) = ? AND purpose = 'STATUS_CHECK' AND verified = 0 AND otp_code != ''
       ORDER BY created_at DESC LIMIT 1`
    ).bind(email).first();

    const nowIso = new Date().toISOString();
    if (!row || row.expires_at < nowIso) {
      return json({ error: "EXPIRED", message: "That code has expired or is no longer valid. Send a new one." }, 401);
    }
    if ((row.failed_attempts || 0) >= MAX_WRONG_GUESSES) {
      await env.DB.prepare("UPDATE grievance_otp SET otp_code = '' WHERE id = ?").bind(row.id).run();
      return json({ error: "TOO_MANY_ATTEMPTS", message: "Too many wrong attempts. Send a new code." }, 429);
    }

    if (code !== row.otp_code) {
      const attempts = (row.failed_attempts || 0) + 1;
      if (attempts >= MAX_WRONG_GUESSES) {
        await env.DB.prepare(
          "UPDATE grievance_otp SET failed_attempts = ?, otp_code = '' WHERE id = ?"
        ).bind(attempts, row.id).run();
        return json({ error: "TOO_MANY_ATTEMPTS", message: "Too many wrong attempts. Send a new code." }, 429);
      }
      await env.DB.prepare(
        "UPDATE grievance_otp SET failed_attempts = ? WHERE id = ?"
      ).bind(attempts, row.id).run();
      const left = MAX_WRONG_GUESSES - attempts;
      return json({
        error: "INCORRECT",
        message: `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`,
      }, 401);
    }

    // Correct: single use -- mark verified and wipe the code itself.
    await env.DB.prepare(
      "UPDATE grievance_otp SET verified = 1, verified_at = ?, otp_code = '' WHERE id = ?"
    ).bind(nowIso, row.id).run();

    const reports = await listReports(env, email);
    const out = { verified: true, reports };
    if (trackingRef && reports.some((r) => r.trackingRef === trackingRef)) {
      const found = await caseForEmail(env, email, trackingRef);
      if (!found.error) out.case = found.case;
    }
    return json(out);
  } catch (err) {
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
