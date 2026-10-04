// POST /api/feedback/submit   { category, message, email, trackingRef, lang, website, form_loaded_at }
//
// The citizen "Send feedback" form (problems or ideas about the app itself).
// The feedback is SAVED and read on the admin Feedback page. The super
// admins get a content-free email ("new feedback has arrived, sign in to
// read it"): the citizen's words and email never travel by email.
//
// Spam protection, like the complaint form: a hidden field people never
// fill ("website"), a minimum time on the page, and at most 5 a day from
// one connection (counted with a one-way daily fingerprint, never the
// network address). A bot gets the same "thank you" and nothing is saved.
// Feedback is deleted automatically one year after it was sent.

import { fingerprint, todaysSalt, istDay } from "../../_shared/daily-salt.js";
import { recipientName, greetingHtml, SAFETY_LINE } from "../../_shared/audit-office.js";
import { EMAIL_RE } from "../../_shared/contact-validation.js";

export const CATEGORIES = { "Bug": "BUG", "Confusing to use": "CONFUSING", "Suggestion": "SUGGESTION", "Something else": "OTHER",
  BUG: "BUG", CONFUSING: "CONFUSING", SUGGESTION: "SUGGESTION", OTHER: "OTHER" };
const PER_DAY = 5;
const ok = () => Response.json({ sent: true });
const bad = (error, fields, status) => Response.json({ error, fields }, { status: status || 400 });

function text(v, max) {
  if (v == null) return null;
  const s = String(v).normalize("NFC").replace(/\u0000/g, "").trim().slice(0, max);
  return s === "" ? null : s;
}
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

async function alertSuperAdmins(env, request) {
  if (!env.RESEND_API_KEY) return;
  let to = [];
  try {
    const { results } = await env.DB.prepare(
      "SELECT email FROM admin_users WHERE role = 'super_admin' AND COALESCE(status, 'PRESENT') <> 'LEFT'"
    ).all();
    to = (results || []).map((r) => r.email).filter(Boolean);
  } catch (e) { return; }
  const url = new URL(request.url).origin + "/admin-feedback.html";
  for (const addr of to) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.OTP_FROM_EMAIL || "onboarding@resend.dev", to: [addr], subject: "GrievIQ: new feedback from a citizen",
          html: greetingHtml(await recipientName(env, addr)) +
            "<p>A citizen has sent feedback about the GrievIQ app.</p>" +
            `<p>Sign in to GrievIQ to read it: <a href="${esc(url)}">${esc(url)}</a></p>` +
            "<p>For security, what they wrote is shown only after you sign in. " + SAFETY_LINE + "</p>",
        }),
      });
    } catch (e) { /* the email never blocks saving */ }
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  let b;
  try { b = await request.json(); } catch (e) { return bad("Invalid request body."); }

  // Bots: same answer, nothing saved.
  if (b.website || (typeof b.form_loaded_at === "number" && Date.now() - b.form_loaded_at < 2000)) return ok();

  const category = CATEGORIES[String(b.category || "")];
  const message = text(b.message, 2000);
  const email = text(b.email, 200);
  const ref = text(b.trackingRef, 40);
  const fields = {};
  if (!category) fields.category = "REQUIRED";
  if (email && !EMAIL_RE.test(email)) fields.email = "FORMAT";
  if (Object.keys(fields).length) return bad(fields.category ? "Please choose what this is about." : "Please check your email address, or leave it empty.", fields);
  const trackingRef = ref && /^[A-Za-z0-9\-]{3,40}$/.test(ref) ? ref.toUpperCase() : null;
  const lang = b.lang === "hi" ? "hi" : "en";

  const DB = env.DB;
  const day = istDay();
  try {
    // At most PER_DAY a day from one connection.
    await DB.prepare("DELETE FROM feedback_rate WHERE day < ?").bind(day).run();
    const salt = await todaysSalt(DB, day);
    const fp = await fingerprint(salt, ["feedback", request.headers.get("CF-Connecting-IP") || "", (request.headers.get("User-Agent") || "").slice(0, 300)]);
    await DB.prepare("INSERT INTO feedback_rate (fp, day, n) VALUES (?, ?, 1) ON CONFLICT(fp) DO UPDATE SET n = n + 1").bind(fp, day).run();
    const r = await DB.prepare("SELECT n FROM feedback_rate WHERE fp = ?").bind(fp).first();
    if (r && r.n > PER_DAY) return bad("You have sent a lot of feedback today. Please try again tomorrow.", null, 429);

    // Feedback older than a year is removed (privacy policy).
    await DB.prepare("DELETE FROM feedback WHERE created_at < datetime('now', '-365 days')").run();
    await DB.prepare("INSERT INTO feedback (id, category, message, email, tracking_ref, lang) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), category, message, email ? email.toLowerCase() : null, trackingRef, lang).run();
  } catch (e) {
    if (/no such table/i.test(String(e && e.message))) return bad("Feedback can't be saved right now. Please write to support@grieviq.in.", null, 503);
    throw e;
  }
  const p = alertSuperAdmins(env, request);
  if (typeof waitUntil === "function") waitUntil(p); else await p;
  return ok();
}
