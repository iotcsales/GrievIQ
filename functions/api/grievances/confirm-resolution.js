// functions/api/grievances/confirm-resolution.js
//
// Citizen-facing: confirms a PENDING_CONFIRMATION case is actually fixed.
// Identity proof reuses the OTP verification the citizen already completed
// on /status moments earlier (grievance_otp.verified = 1, purpose =
// STATUS_CHECK, within the last 15 minutes) rather than asking for a
// second code.

export async function onRequestPost({ request, env }) {
  try {
    const { email, trackingRef } = await request.json();

    if (!email || !trackingRef) {
      return new Response(JSON.stringify({ error: 'email and trackingRef are required' }), { status: 400 });
    }

    // Verified in the last 15 minutes. Compared as ISO timestamps: the
    // previous check compared an ISO created_at against SQLite's
    // "YYYY-MM-DD HH:MM:SS" format, which let any verification from
    // earlier the same day pass.
    const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const recentOtp = await env.DB.prepare(
      `SELECT id FROM grievance_otp
       WHERE LOWER(email) = LOWER(?) AND purpose = 'STATUS_CHECK' AND verified = 1
       AND verified_at >= ?
       ORDER BY verified_at DESC LIMIT 1`
    ).bind(email, windowStart).first();

    if (!recentOtp) {
      return new Response(JSON.stringify({ error: 'Please verify your email again before confirming' }), { status: 401 });
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

    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE grievances
       SET status = 'RESOLVED', citizen_confirmed = 1, citizen_confirmed_at = ?, updated_at = ?
       WHERE id = ?`
    ).bind(now, now, grievance.id).run();

    await env.DB.prepare(
      `INSERT INTO grievance_events (id, grievance_id, event_type, actor, created_at)
       VALUES (?, ?, 'CITIZEN_CONFIRMED', 'citizen', ?)`
    ).bind(crypto.randomUUID(), grievance.id, now).run();

    return new Response(JSON.stringify({ confirmed: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Unexpected error', detail: err.message }), { status: 500 });
  }
}