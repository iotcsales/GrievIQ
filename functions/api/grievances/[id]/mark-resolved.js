// functions/api/grievances/[id]/mark-resolved.js
//
// Rep-only action: marks a grievance as resolved. If the citizen has an
// email on file, the case moves to PENDING_CONFIRMATION and an email
// invites them to confirm the fix via /status — it isn't final until
// they say so. If there's no email (phone-only citizen — a known MVP gap
// that resolves once SMS/phone OTP ships), there's no way to reach them
// for confirmation, so the case goes straight to RESOLVED.
//
// Item 7a (Sept 2026): while the case waits for the citizen, escalation is
// paused. If the citizen doesn't reply within CONFIRM_DAYS it closes as
// "Resolved (not confirmed by citizen)" -- the email says so, with the date.
//
// Item 7b (Sept 2026): the rep must say what was done. JSON body:
//   { note: 10-1000 characters,
//     photoIds: up to 3 ids from /resolution-photo uploads for this case,
//     noPhotoReason: 10-300 characters, required when there are no photos }
// Saved as a resolution report (resolution_reports), with the photos
// joined to it (resolution_photos.report_id).

import { getVerifiedRep } from "../../../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate, resolveChain } from "../../../_shared/jurisdiction.js";
import { computeEscalation } from "../../../_shared/escalation.js";
import { CONFIRM_DAYS, confirmDeadline } from "../../../_shared/confirmation.js";
import { NOTE_MIN, NOTE_MAX, REASON_MIN, REASON_MAX, MAX_PHOTOS } from "../../../_shared/resolution-evidence.js";

function escHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// "4 Oct 2026" / "4 अक्तू॰ 2026" in India time, for the email.
function emailDate(iso, lang) {
  try {
    return new Date(iso).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN",
      { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  } catch (e) {
    return String(iso).slice(0, 10);
  }
}
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

  // ---- What was done (item 7b) ----
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const note = String(body.note || "").trim();
  const photoIds = Array.isArray(body.photoIds) ? Array.from(new Set(body.photoIds.map(String))).slice(0, MAX_PHOTOS + 1) : [];
  const noPhotoReason = String(body.noPhotoReason || "").trim();
  const fieldErrors = {};
  if (note.length < NOTE_MIN || note.length > NOTE_MAX) fieldErrors.note = "NOTE_LENGTH";
  if (photoIds.length > MAX_PHOTOS) fieldErrors.photos = "TOO_MANY_PHOTOS";
  if (photoIds.length === 0 && (noPhotoReason.length < REASON_MIN || noPhotoReason.length > REASON_MAX)) fieldErrors.photos = "PHOTO_OR_REASON";
  if (Object.keys(fieldErrors).length) {
    return Response.json({ error: "Please say what was done, and add a photo or the reason there isn't one.", fields: fieldErrors }, { status: 400 });
  }
  for (const pid of photoIds) {
    const p = await env.DB.prepare(
      "SELECT id FROM resolution_photos WHERE id = ? AND grievance_id = ? AND report_id IS NULL"
    ).bind(pid, grievanceId).first();
    if (!p) {
      return Response.json({ error: "One of the photos couldn't be found. Please add it again.", fields: { photos: "PHOTO_MISSING" } }, { status: 400 });
    }
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

  const reportId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO resolution_reports (id, grievance_id, note, no_photo_reason, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(reportId, grievanceId, note, photoIds.length ? null : noPhotoReason, auth.email, now).run();
  for (const pid of photoIds) {
    await env.DB.prepare(
      "UPDATE resolution_photos SET report_id = ? WHERE id = ? AND grievance_id = ? AND report_id IS NULL"
    ).bind(reportId, pid, grievanceId).run();
  }
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
    const byDate = emailDate(confirmDeadline(now), grievance.lang);
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
             <p>जनप्रतिनिधि के अनुसार की गई कार्यवाही: <em>${escHtml(note)}</em></p>
             <p>कृपया "मेरी शिकायतों की स्थिति" पृष्ठ पर जाकर अपना ईमेल दर्ज करें और बताएँ कि क्या समस्या वास्तव में हल हुई है:</p>
             <p><a href="${statusUrl}">${statusUrl}</a></p>
             <p>यदि ${byDate} तक (${CONFIRM_DAYS} दिन में) आपका उत्तर नहीं मिलता, तो शिकायत "निस्तारित (नागरिक द्वारा पुष्टि नहीं)" के रूप में बंद कर दी जाएगी।</p>`
          : `<p>The representative handling your case <strong>${grievance.tracking_ref}</strong> has marked it as resolved.</p>
             <p>What the representative says was done: <em>${escHtml(note)}</em></p>
             <p>Please visit our status page and enter your email to confirm whether this actually fixed the problem:</p>
             <p><a href="${statusUrl}">${statusUrl}</a></p>
             <p>If we don't hear from you by ${byDate} (${CONFIRM_DAYS} days), the case will be closed as "Resolved (not confirmed by citizen)".</p>`,
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