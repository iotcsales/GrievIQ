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
      `SELECT tracking_ref, description, status, current_tier, created_at, acknowledged_at, resolved_at, citizen_email
       FROM grievances WHERE tracking_ref = ?`
    ).bind(trackingRef).first();

    if (!grievance || grievance.citizen_email.toLowerCase() !== email.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Case not found for this email' }), { status: 404 });
    }

    return new Response(JSON.stringify({ verified: true, case: grievance }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Unexpected error', detail: err.message }), { status: 500 });
  }
}