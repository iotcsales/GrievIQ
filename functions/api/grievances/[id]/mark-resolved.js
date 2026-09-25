// functions/api/grievances/[id]/mark-resolved.js
//
// Rep-only action: marks a grievance as resolved. If the citizen has an
// email on file, the case moves to PENDING_CONFIRMATION and an email
// invites them to confirm the fix via /status — it isn't final until
// they say so. If there's no email (phone-only citizen — a known MVP gap
// that resolves once SMS/phone OTP ships), there's no way to reach them
// for confirmation, so the case goes straight to RESOLVED.

import { getVerifiedRep } from "../../../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate, resolveChain } from "../../../_shared/jurisdiction.js";
import { computeEscalation } from "../../../_shared/escalation.js";
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

  if (grievance.status === "RESOLVED" || grievance.status === "CLOSED" || grievance.status === "PENDING_CONFIRMATION") {
    return Response.json({ error: "This case is already resolved or awaiting confirmation" }, { status: 409 });
  }

  // Confirm this rep actually has jurisdiction over this case's local unit —
  // same check grievances.js uses to decide visibility.
  let hasAccess = false;
  for (const mandate of auth.mandates) {
    const unitIds = await getLocalUnitIdsForMandate(env, mandate);
    if (unitIds.includes(grievance.local_unit_id)) {
      hasAccess = true;
      break;
    }
  }
  if (!hasAccess) {
    return Response.json({ error: "You do not have jurisdiction over this case" }, { status: 403 });
  }

  const chain = await resolveChain(env, grievance.local_unit_id);
  const category = await env.DB.prepare(
    "SELECT * FROM grievance_categories WHERE id = ?"
  ).bind(grievance.category_id).first();

  if (!chain || !category) {
    return Response.json({ error: "Could not resolve jurisdiction or category for this case" }, { status: 500 });
  }

  const result = computeEscalation(grievance, category, chain.tiers);
  const now = new Date().toISOString();
  const hasEmail = !!grievance.citizen_email;
  const newStatus = hasEmail ? "PENDING_CONFIRMATION" : "RESOLVED";

  await env.DB.prepare(
    `UPDATE grievances
     SET status = ?, current_tier = ?, resolved_at = ?, updated_at = ?
     WHERE id = ?`
  ).bind(newStatus, result.currentTier.tier, now, now, grievanceId).run();

  await env.DB.prepare(
    `INSERT INTO grievance_events (id, grievance_id, event_type, actor, created_at)
     VALUES (?, ?, 'MARKED_RESOLVED', ?, ?)`
  ).bind(crypto.randomUUID(), grievanceId, auth.email, now).run();

  if (hasEmail) {
    const statusUrl = new URL(request.url).origin + "/status?ref=" + encodeURIComponent(grievance.tracking_ref);
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.OTP_FROM_EMAIL || "onboarding@resend.dev",
        to: [grievance.citizen_email],
        subject: grievance.lang === "hi"
          ? `आपकी GrievIQ शिकायत ${grievance.tracking_ref} को निस्तारित बताया गया है`
          : `Your GrievIQ case ${grievance.tracking_ref} has been marked resolved`,
        html: grievance.lang === "hi"
          ? `<p>आपकी शिकायत <strong>${grievance.tracking_ref}</strong> पर कार्यवाही कर रहे जनप्रतिनिधि ने इसे निस्तारित बताया है।</p>
             <p>कृपया "मेरी शिकायतों की स्थिति" पृष्ठ पर जाकर अपना ईमेल दर्ज करें और बताएँ कि क्या समस्या वास्तव में हल हुई है:</p>
             <p><a href="${statusUrl}">${statusUrl}</a></p>`
          : `<p>The representative handling your case <strong>${grievance.tracking_ref}</strong> has marked it as resolved.</p>
             <p>Please visit our status page and enter your email to confirm whether this actually fixed the problem:</p>
             <p><a href="${statusUrl}">${statusUrl}</a></p>`,
      }),
    });

    if (!resendResponse.ok) {
      // The DB update already succeeded; email failure shouldn't roll that
      // back, but the rep should know the notification didn't go out.
      const errText = await resendResponse.text();
      return Response.json({
        status: newStatus,
        warning: "Case marked resolved, but the citizen notification email failed to send",
        detail: errText,
      }, { status: 200 });
    }
  }

  return Response.json({ status: newStatus });
}