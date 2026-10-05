// functions/_shared/resolve-case.js
//
// Marking a case resolved (moved here from mark-resolved.js in item 8b so a
// field worker's approved fix report goes through exactly the same steps):
// the case waits for the citizen (PENDING_CONFIRMATION, escalation paused)
// or, with no email, for a GrievIQ staff check; the timeline records who
// marked it; the citizen is emailed what was done and the deadline.

import { CONFIRM_DAYS, confirmDeadline } from "./confirmation.js";
import { pushCitizen } from "./citizen-push.js";

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
// Returns { status, warning?, detail? }. actorEmail is who marked it
// resolved (the representative or office manager who approved it).
export async function finalizeResolution(env, request, grievance, currentTier, note, actorEmail) {
  const grievanceId = grievance.id;
  const now = new Date().toISOString();
  const hasEmail = !!grievance.citizen_email;
  // Both wait: the citizen confirms by email, or GrievIQ staff check (item 7b-2).
  const newStatus = "PENDING_CONFIRMATION";

  await env.DB.prepare(
    `UPDATE grievances
     SET status = ?, current_tier = ?, resolved_at = ?, updated_at = ?
     WHERE id = ?`
  ).bind(newStatus, currentTier, now, now, grievanceId).run();

  await env.DB.prepare(
    `INSERT INTO grievance_events (id, grievance_id, event_type, actor, created_at)
     VALUES (?, ?, 'MARKED_RESOLVED', ?, ?)`
  ).bind(crypto.randomUUID(), grievanceId, actorEmail, now).run();

  // Citizen phone updates (Oct 2026), if the citizen turned them on.
  await pushCitizen(env, grievance, "FIXED", { hasEmail }, "FIX:" + grievanceId + ":" + now);

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
      return { status: newStatus, warning: "Case marked resolved, but the citizen notification email failed to send", detail: errText };
    }
  }

  return { status: newStatus };
}
