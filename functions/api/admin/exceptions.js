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
// POST sends a nudge: "nudge, not act". It records an ADMIN_NUDGE event
// on the case timeline, emails every currently responsible rep who has
// an email on file (one email per unique address), and logs the action
// to admin_events. It never changes the case's status, tier or owner.
//
// Gated behind exceptions_queue (super_admin, operations_admin).
//
// The GET logic (which cases count) lives in _shared/exception-cases.js,
// shared with the admin dashboard so the two always agree.

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
import { findExceptionCases } from "../../_shared/exception-cases.js";
import { resolveChain } from "../../_shared/jurisdiction.js";
import { computeEscalation, visibleTiers } from "../../_shared/escalation.js";

const FINAL_OR_WAITING = ["RESOLVED", "CLOSED", "PENDING_CONFIRMATION"];

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function logEvent(env, actorEmail, action, target, detail) {
  await env.DB.prepare(
    `INSERT INTO admin_events (id, actor_email, action, target, detail)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    actorEmail,
    action,
    target,
    detail == null ? null : JSON.stringify(detail)
  ).run();
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "exceptions_queue");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Which cases count is defined once, in _shared/exception-cases.js,
  // and shared with the admin dashboard.
  const exceptions = await findExceptionCases(env);

  return Response.json({
    exceptions,
    generatedAt: new Date().toISOString(),
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "exceptions_queue");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const grievanceId = String(body.grievanceId || "");
  const note = body.note ? String(body.note).trim().slice(0, 500) : "";
  if (!grievanceId) {
    return Response.json({ error: "grievanceId is required." }, { status: 400 });
  }

  const g = await env.DB.prepare(
    "SELECT * FROM grievances WHERE id = ?"
  ).bind(grievanceId).first();
  if (!g) {
    return Response.json({ error: "Case not found." }, { status: 404 });
  }
  if (FINAL_OR_WAITING.includes(g.status)) {
    return Response.json({ error: "This case is resolved or awaiting the citizen, so it no longer needs a nudge." }, { status: 409 });
  }

  const chain = await resolveChain(env, g.local_unit_id);
  const category = await env.DB.prepare(
    "SELECT * FROM grievance_categories WHERE id = ?"
  ).bind(g.category_id).first();
  if (!chain || !category) {
    return Response.json({ error: "Could not resolve jurisdiction or category for this case." }, { status: 500 });
  }

  const result = computeEscalation(g, category, chain.tiers);
  const responsible = visibleTiers(chain.tiers, result.currentTierIndex);
  const now = new Date().toISOString();

  // 1. Timeline entry -- this is what the rep console and the citizen
  //    status page read.
  await env.DB.prepare(
    `INSERT INTO grievance_events (id, grievance_id, event_type, actor, note, created_at)
     VALUES (?, ?, 'ADMIN_NUDGE', ?, ?, ?)`
  ).bind(crypto.randomUUID(), g.id, auth.email, note || null, now).run();

  // 2. Emails -- one per unique address; reps without an email still
  //    see the nudge in their console.
  const days = Math.floor(result.elapsedHours / 24);
  const consoleUrl = new URL(request.url).origin + "/";
  const recipients = [];
  const byEmail = new Map();

  for (const t of responsible) {
    const who = { label: t.label, name: t.name || null };
    if (!t.email) {
      recipients.push({ ...who, status: "no_email" });
      continue;
    }
    const key = String(t.email).toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, { email: t.email, people: [] });
    byEmail.get(key).people.push(who);
  }

  for (const { email, people } of byEmail.values()) {
    let status = "sent";
    let detail = null;
    try {
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.OTP_FROM_EMAIL || "onboarding@resend.dev",
          to: [email],
          subject: `Reminder: GrievIQ case ${g.tracking_ref} needs your attention`,
          html:
            `<p>This is a reminder from the GrievIQ admin team about case <strong>${escapeHtml(g.tracking_ref)}</strong> ` +
            `in <strong>${escapeHtml(chain.localUnit.name)}</strong> (${escapeHtml(category.name)}), open for ${days} day${days === 1 ? "" : "s"}.</p>` +
            `<p><em>${escapeHtml(g.description)}</em></p>` +
            (note ? `<p><strong>Note from the admin team:</strong> ${escapeHtml(note)}</p>` : "") +
            `<p>Please sign in to your GrievIQ console to acknowledge or update this case: ` +
            `<a href="${consoleUrl}">${consoleUrl}</a></p>`,
        }),
      });
      if (!resendResponse.ok) {
        status = "email_failed";
        detail = await resendResponse.text();
      }
    } catch (err) {
      status = "email_failed";
      detail = (err && err.message) || "Network error";
    }
    for (const p of people) {
      recipients.push({ ...p, status, detail });
    }
  }

  // 3. Audit log.
  await logEvent(env, auth.email, "exception_nudged", g.id, {
    trackingRef: g.tracking_ref,
    note: note || null,
    recipients: recipients.map((r) => ({ label: r.label, name: r.name, status: r.status })),
  });

  return Response.json({ ok: true, trackingRef: g.tracking_ref, recipients });
}