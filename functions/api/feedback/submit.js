export async function onRequestPost({ request, env }) {
  try {
    const { category, message, email, trackingRef } = await request.json();

    if (!category) {
      return new Response(JSON.stringify({ error: 'category is required' }), { status: 400 });
    }

    const bodyLines = [
      `<p><strong>Category:</strong> ${category}</p>`,
      trackingRef ? `<p><strong>Related case:</strong> ${trackingRef}</p>` : '',
      email ? `<p><strong>From:</strong> ${email}</p>` : '<p><strong>From:</strong> not provided</p>',
      message ? `<p><strong>Message:</strong></p><p>${message}</p>` : '<p><em>No additional message provided.</em></p>',
    ].join('');

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.OTP_FROM_EMAIL || 'onboarding@resend.dev',
        to: ['feedback@grieviq.in'],
        subject: `GrievIQ feedback: ${category}`,
        html: `<h2>New feedback received</h2>${bodyLines}`,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      return new Response(JSON.stringify({ error: 'Failed to send feedback', detail: errText }), { status: 502 });
    }

    return new Response(JSON.stringify({ sent: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Unexpected error', detail: err.message }), { status: 500 });
  }
}