// functions/api/otp/request.js
//
// Citizen "Track my reports", step 1: request a 6-digit code by email.
//
// Security (OWASP Authentication / Anti-automation guidance):
//  - Always the same reply, whether or not the email has any reports, so
//    the endpoint can't be used to find out who has used GrievIQ.
//  - At most 3 code requests per email per 15 minutes (429 after that).
//    A code row is recorded for every request, even for emails with no
//    reports, so the limit behaves identically either way.
//  - Codes come from the platform's secure random generator.
//  - Requesting a new code cancels any earlier unused one.
//  - The email is sent in the background (waitUntil), so response time
//    doesn't reveal whether an email was actually sent.
//  - Housekeeping: used/expired codes are wiped and day-old rows deleted
//    on every request, matching the Privacy Policy.
//
// trackingRef is optional: it only names the report to open after the
// code is verified (e.g. from a "your case was resolved" link).

const MAX_REQUESTS_PER_WINDOW = 3;
const WINDOW_MINUTES = 15;
const CODE_TTL_MINUTES = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GENERIC_REPLY = {
  sent: true,
  message: "If this email has reports with GrievIQ, we've sent a 6-digit code to it.",
};

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function secureSixDigitCode() {
  // Rejection sampling avoids modulo bias.
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / 900000) * 900000;
  let n;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return String(100000 + (n % 900000));
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid request." }, 400);
    }

    const email = String(body.email || "").trim().toLowerCase();
    const lang = body.lang === "hi" ? "hi" : "en";
    if (!email || !EMAIL_RE.test(email) || email.length > 200) {
      return json({ error: "Enter a valid email address." }, 400);
    }

    const nowIso = new Date().toISOString();

    // Housekeeping (see header comment).
    await env.DB.prepare(
      "UPDATE grievance_otp SET otp_code = '' WHERE otp_code != '' AND expires_at < ?"
    ).bind(nowIso).run();
    await env.DB.prepare(
      "DELETE FROM grievance_otp WHERE created_at < ?"
    ).bind(isoMinutesAgo(24 * 60)).run();

    // Rate limit per email.
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM grievance_otp
       WHERE LOWER(email) = ? AND purpose = 'STATUS_CHECK' AND created_at >= ?`
    ).bind(email, isoMinutesAgo(WINDOW_MINUTES)).first();
    if (recent && recent.n >= MAX_REQUESTS_PER_WINDOW) {
      return json({
        error: "TOO_MANY_REQUESTS",
        message: `Too many codes requested. Please wait ${WINDOW_MINUTES} minutes and try again.`,
      }, 429);
    }

    // Only the newest code should work.
    await env.DB.prepare(
      `UPDATE grievance_otp SET otp_code = ''
       WHERE LOWER(email) = ? AND purpose = 'STATUS_CHECK' AND verified = 0 AND otp_code != ''`
    ).bind(email).run();

    const code = secureSixDigitCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO grievance_otp (id, phone, email, otp_code, purpose, channel, verified, expires_at, created_at)
       VALUES (?, '', ?, ?, 'STATUS_CHECK', 'EMAIL', 0, ?, ?)`
    ).bind(crypto.randomUUID(), email, code, expiresAt, nowIso).run();

    const has = await env.DB.prepare(
      "SELECT 1 AS ok FROM grievances WHERE LOWER(citizen_email) = ? LIMIT 1"
    ).bind(email).first();

    if (has) {
      const send = fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.OTP_FROM_EMAIL || "onboarding@resend.dev",
          to: [email],
          subject: lang === "hi" ? `आपका GrievIQ कोड: ${code}` : `Your GrievIQ code: ${code}`,
          html: lang === "hi"
            ? `<p>GrievIQ पर अपनी शिकायतें देखने के लिए यह कोड प्रयोग करें:</p>` +
              `<h2 style="letter-spacing:4px">${code}</h2>` +
              `<p>यह ${CODE_TTL_MINUTES} मिनट में समाप्त हो जाएगा और केवल एक बार प्रयोग किया जा सकता है।</p>` +
              `<p>यदि आपने यह कोड नहीं माँगा है, तो इस ईमेल को अनदेखा करें।</p>`
            : `<p>Use this code to see your GrievIQ reports:</p>` +
              `<h2 style="letter-spacing:4px">${code}</h2>` +
              `<p>It expires in ${CODE_TTL_MINUTES} minutes and can be used once.</p>` +
              `<p>If you didn't ask for this code, you can ignore this email.</p>`,
        }),
      }).catch(() => {});
      if (typeof context.waitUntil === "function") context.waitUntil(send);
      else await send;
    }

    return json(GENERIC_REPLY, 200);
  } catch (err) {
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
