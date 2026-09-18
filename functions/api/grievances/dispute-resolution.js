// functions/api/grievances/dispute-resolution.js
//
// Citizen-facing: disputes a PENDING_CONFIRMATION case, reopening it.
// Escalation resumes based on total elapsed time since the case was
// originally filed — it does not reset to zero, consistent with the
// rest of the app's "additive, never a handoff" escalation philosophy.
// Same OTP-reuse identity proof as confirm-resolution.js.

const VALID_REASONS = ['NOT_FIXED', 'PARTIALLY_FIXED', 'CAME_BACK', 'WRONG_ISSUE', 'OTHER'];

export async function onRequestPost({ request, env }) {
  try {
    const { email, trackingRef, reason, note } = await request.json();

    if (!email || !trackingRef || !reason) {
      return new Response(JSON.stringify({ error: 'email, trackingRef and reason are required' }), { status: 400 });
    }

    if (!VALID_REASONS.includes(reason)) {
      return new Response(JSON.stringify({ error: 'Invalid reason code' }), { status: 400 });
    }

    if (reason === 'OTHER' && (!note || !note.trim())) {
      return new Response(JSON.stringify({ error: 'Please add a short note for "Other"' }), { status: 400 });
    }

    const recentOtp = await env.DB.prepare(
      `SELECT id FROM grievance_otp
       WHERE email = ? AND purpose = 'STATUS_CHECK' AND verified = 1
       AND created_at >= datetime('now', '-15 minutes')
       ORDER BY created_at DESC LIMIT 1`
    ).bind(email).first();

    if (!recentOtp) {
      return new Response(JSON.stringify({ error: 'Please verify your email again before responding' }), { status: 401 });
    }

    const grievance = await env.DB.prepare(
      'SELECT id, status, citizen_email FROM grievances WHERE tracking_ref = ?'
    ).bind(trackingRef).first();

    if (!grievance || !grievance.citizen_email || grievance.citizen_email.toLowerCase() !== email.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Case not found for this email' }), { status: 404 });
    }

    if (grievance.status !== 'PENDING_CONFIRMATION') {
      return new Response(JSON.stringify({ error: 'This case is not awaiting confirmation' }), { status: 409 });
    }

    const trimmedNote = note ? note.trim().slice(0, 200) : null;
    const now = new Date().toISOString();

    await env.DB.prepare(
      `UPDATE grievances
       SET status = 'OPEN', resolved_at = NULL,
           citizen_dispute_reason = ?, citizen_dispute_note = ?, updated_at = ?
       WHERE id = ?`
    ).bind(reason, trimmedNote, now, grievance.id).run();

    return new Response(JSON.stringify({ disputed: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Unexpected error', detail: err.message }), { status: 500 });
  }
}