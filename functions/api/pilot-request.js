/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/pilot-request.js
//
// POST /api/pilot-request (public, grieviq-39): "Request a free pilot" on
// /for-offices. { name, office, place, mobile, email?, consent: true, lang,
// website (hidden; people never fill it), form_loaded_at }
//
// Saved for the admin "Pilot requests" page. The contact address in Prices
// & site details gets a content-free email ("a new pilot request has
// arrived; sign in to read it"): the person's details never travel by
// email. Consent is recorded with the exact wording shown. Requests are
// deleted one year after they were sent (privacy policy). Spam: hidden
// field, minimum time on the page, 5 a day from one connection and 2 a day
// for one mobile number (one-way daily fingerprints only).

import { checkDailyLimits, deviceParts } from "../_shared/daily-limit.js";
import { liveVersion } from "../_shared/site-settings.js";
import { sendEmailNow } from "../_shared/dept-auth.js";

export const OFFICE_KINDS = ["PRADHAN", "COUNCILLOR", "MAYOR", "MLA", "MP", "DEPARTMENT", "OTHER"];
export const CONSENT_TEXT = {
  en: "I agree that IOTC may use these details only to contact me about a GrievIQ pilot. They will not be shared or used for anything else.",
  hi: "मैं सहमत हूँ कि IOTC इन विवरणों का उपयोग केवल GrievIQ पायलट के संबंध में मुझसे संपर्क हेतु करेगा। इन्हें साझा या किसी अन्य उद्देश्य हेतु उपयोग नहीं किया जाएगा।",
};
const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,}$/i;
const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
function text(v, max) { return v == null ? "" : String(v).normalize("NFC").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1); }
export function indianMobile(v) {
  const d = String(v || "").replace(/[\s\-()]/g, "").replace(/^(\+91|0091|91(?=\d{10}$)|0(?=\d{10}$))/, "");
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

export async function onRequestPost(context) {
  const { request, env } = context;
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  if (b.website || (typeof b.form_loaded_at === "number" && Date.now() - b.form_loaded_at < 2000)) return json({ sent: true });

  const lang = b.lang === "hi" ? "hi" : "en";
  const name = text(b.name, 80), place = text(b.place, 160), email = text(b.email, 120).toLowerCase();
  const office = String(b.office || "").toUpperCase();
  const mobile = indianMobile(b.mobile);
  const fields = {};
  if (name.length < 2) fields.name = "REQUIRED"; else if (name.length > 80) fields.name = "LENGTH";
  if (!OFFICE_KINDS.includes(office)) fields.office = "REQUIRED";
  if (place.length < 3) fields.place = "REQUIRED"; else if (place.length > 160) fields.place = "LENGTH";
  if (!String(b.mobile || "").trim()) fields.mobile = "REQUIRED"; else if (!mobile) fields.mobile = "FORMAT";
  if (email && (email.length > 120 || !EMAIL_RE.test(email))) fields.email = "FORMAT";
  if (b.consent !== true) fields.consent = "REQUIRED";
  if (Object.keys(fields).length) return json({ error: "CHECK_FIELDS", fields }, 400);

  const lim = await checkDailyLimits(env, [
    { name: "pilot-device", parts: deviceParts(request), max: 5 },
    { name: "pilot-mobile", parts: [mobile], max: 2 },
  ]);
  if (!lim.ok) return json({ error: "DAILY_LIMIT", which: lim.hit === "pilot-mobile" ? "MOBILE" : "DEVICE" }, 429);

  const now = new Date().toISOString();
  try {
    await env.DB.prepare("DELETE FROM pilot_requests WHERE created_at < ?").bind(new Date(Date.now() - 365 * 86400000).toISOString()).run();
    await env.DB.prepare(
      "INSERT INTO pilot_requests (id, created_at, name, office_kind, place, mobile, email, lang, consent_at, consent_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), now, name, office, place, mobile, email || null, lang, now, CONSENT_TEXT[lang]).run();
  } catch (e) {
    if (/no such table/i.test(String(e && e.message))) return json({ error: "NOT_READY" }, 503);
    throw e;
  }
  // A content-free alert to the published contact address.
  const live = await liveVersion(env);
  const to = live.data.company && live.data.company.supportEmail;
  if (to) {
    const url = new URL(request.url).origin + "/admin-pilot-requests.html";
    const p = sendEmailNow(env, to, "GrievIQ: new pilot request",
      "<p>A new request for a GrievIQ pilot has arrived from the For offices page.</p>" +
      `<p>Sign in to read it and call back: <a href="${esc(url)}">${esc(url)}</a></p>` +
      "<p>For privacy, the person's details are shown only after you sign in.</p>").catch(() => {});
    if (typeof context.waitUntil === "function") context.waitUntil(p); else await p;
  }
  return json({ sent: true, callbackEn: live.data.company.callbackEn, callbackHi: live.data.company.callbackHi });
}
