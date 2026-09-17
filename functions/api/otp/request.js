export async function onRequestPost({ request, env }) {
  try {
    const { email, trackingRef } = await request.json();

    if (!email || !trackingRef) {
      return new Response(JSON.stringify({ error: 'email and trackingRef are required' }), { status: 400 });
    }

    const grievance = await env.DB.prepare(
      'SELECT id, citizen_email FROM grievances WHERE tracking_ref = ?'
    ).bind(trackingRef).first();

    if (!grievance) {
      return new Response(JSON.stringify({ error: 'No grievance found for that tracking reference' }), { status: 404 });
    }

    if (!grievance.citizen_email || grievance.citizen_email.toLowerCase() !== email.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Email does not match the one on file for this case' }), { status: 403 });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await env.DB.prepare(
      `INSERT INTO grievance_otp (id, phone, email, otp_code, purpose, channel, verified, expires_at, created_at)
       VALUES (?, '', ?, ?, 'STATUS_CHECK', 'EMAIL', 0, ?, ?)`
    ).bind(crypto.randomUUID(), email, code, expiresAt, new Date().toISOString()).run();

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.OTP_FROM_EMAIL || 'onboarding@resend.dev',
        to: [email],
        subject: `Your GrievIQ verification code: ${code}`,
        html: `<p>Your code to check status for case <strong>${trackingRef}</strong> is:</p><h2>${code}</h2><p>This code expires in 10 minutes.</p>`,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      return new Response(JSON.stringify({ error: 'Failed to send email', detail: errText }), { status: 502 });
    }

    return new Response(JSON.stringify({ sent: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Unexpected error', detail: err.message }), { status: 500 });
  }
}