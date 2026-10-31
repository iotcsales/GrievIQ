/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/misuse.js (grieviq-82): controls against misuse of the complaint service.
//
//  - maskPersonal(text): phone numbers, email addresses and ID numbers a citizen types into a
//    complaint are hidden from representatives' offices and departments (DPDP Act: data
//    minimisation). GrievIQ staff still see the words as written.
//  - screenText(text): abusive words and threats (English, Hindi, Hinglish). The citizen is warned
//    before sending (public/text-screen.js has the same lists); a complaint sent anyway is flagged
//    for GrievIQ staff, never blocked.
//  - Filing restrictions: a one-way fingerprint of a phone number (last 10 digits) or an email, so
//    the restriction can be checked without keeping the number itself.
//  - Switches (part53 app_switches): SMS_FILING turns on a one-time code by SMS before filing. It can
//    only be turned on once an SMS provider is set up (SMS_AUTH_KEY, SMS_TEMPLATE_ID) and a test SMS
//    has gone through.
//  - sendSms: MSG91's Flow API (DLT-registered template), or, in the test server, a log file.

export const REPORT_REASONS = ["FALSE", "ABUSIVE", "DUPLICATE", "OUTSIDE", "OTHER"];
export const RESTRICT_DAYS = [30, 90, 365];
export const NOTE_MAX = 500;
const DAY = 86400000;

// ---- hiding personal details typed into a complaint ----
const HIDDEN = "[hidden · छिपाया]";
export function maskPersonal(text) {
  if (!text) return text;
  return String(text)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, HIDDEN)
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, HIDDEN)                                   // PAN
    .replace(/(?<![\d])\d(?:[\s-]?\d){11}(?![\d])/g, HIDDEN)                      // Aadhaar-like 12 digits
    .replace(/(?<![\d])(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?![\d])/g, HIDDEN); // Indian mobiles, any grouping
}

// ---- abusive words and threats ----
// Kept short and strong so ordinary complaints are never flagged. The same lists are in
// public/text-screen.js (a test checks that they match).
export const ABUSIVE = ["fuck", "fucking", "motherfucker", "bastard", "bitch", "asshole", "madarchod", "maderchod", "bhenchod", "behenchod", "bhenchod", "chutiya", "chutiye", "harami", "haramzada", "haramkhor", "randi", "gandu", "kamina", "kutte ki", "suar ki",
  "मादरचोद", "बहनचोद", "भेनचोद", "चूतिया", "चुतिया", "हरामी", "हरामज़ादा", "हरामजादा", "हरामखोर", "रंडी", "गांडू", "कमीना", "कुत्ते की", "सूअर की"];
// Not "aag laga" (fire): "someone set the garbage on fire" is a real complaint.
export const THREATS = ["kill you", "i will kill", "will kill you", "shoot you", "bomb you", "jaan se maar", "jaan se mar", "maar dunga", "maar denge", "mar dunga", "maar daalunga", "maar dalunga", "dekh lunga",
  "जान से मार", "मार दूंगा", "मार दूँगा", "मार देंगे", "मार डालूंगा", "मार डालूँगा", "देख लूंगा", "देख लूँगा"];
function has(text, list) {
  const t = " " + String(text || "").toLowerCase().replace(/\s+/g, " ") + " ";
  return list.some((w) => /[a-z]/.test(w)
    ? new RegExp("(^|[^a-z])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z]|$)").test(t)
    : t.includes(w));
}
export function screenText(text) {
  const flags = [];
  if (has(text, ABUSIVE)) flags.push("ABUSIVE");
  if (has(text, THREATS)) flags.push("THREAT");
  return flags;
}

// ---- fingerprints for restrictions ----
export function phone10(p) { return String(p || "").replace(/\D/g, "").slice(-10); }
async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
export async function restrictionKey(kind, value) {
  const v = kind === "PHONE" ? phone10(value) : String(value || "").trim().toLowerCase();
  if (!v || (kind === "PHONE" && v.length !== 10)) return null;
  return { hash: await sha("GIQ-RESTRICT|" + kind + "|" + v), hint: kind === "PHONE" ? "…" + v.slice(-4) : "…" + v.slice(-4) };
}
// The active restriction (if any) for this phone number or email, now.
export async function activeRestriction(env, phone, email) {
  try {
    const now = new Date().toISOString();
    for (const [kind, v] of [["PHONE", phone], ["EMAIL", email]]) {
      if (!v) continue;
      const k = await restrictionKey(kind, v);
      if (!k) continue;
      const r = await env.DB.prepare("SELECT id, ends_at FROM filing_restrictions WHERE value_hash = ? AND status = 'ACTIVE' AND ends_at > ? ORDER BY ends_at DESC LIMIT 1").bind(k.hash, now).first();
      if (r) return r;
    }
  } catch (e) { if (!/no such table/i.test(String(e && e.message))) throw e; }
  return null;
}
export function endsAt(startIso, days) { return new Date(Date.parse(startIso) + days * DAY).toISOString(); }

// ---- switches ----
export async function getSwitch(env, key) {
  try { const r = await env.DB.prepare("SELECT value, changed_by, changed_at, detail FROM app_switches WHERE key = ?").bind(key).first(); return r || null; }
  catch (e) { return null; }
}
export function smsConfigured(env) { return !!(env.SMS_AUTH_KEY && env.SMS_TEMPLATE_ID) || !!env.SMS_TEST_LOG; }
// SMS before filing is required only when switched on AND a provider is set up.
export async function smsRequired(env) {
  if (!smsConfigured(env)) return false;
  const s = await getSwitch(env, "SMS_FILING");
  return !!(s && s.value === "ON");
}

// ---- sending an SMS ----
// MSG91 Flow API: POST {SMS_URL or https://control.msg91.com/api/v5/flow} with header authkey and
// { template_id, recipients: [{ mobiles: "91XXXXXXXXXX", <SMS_VAR or "otp">: code }] }. The template
// must be registered on DLT (TRAI) with the sender ID. Returns { ok, error? }.
export async function sendSms(env, phone, code) {
  const to = "91" + phone10(phone);
  if (env.SMS_TEST_LOG) { await env.SMS_TEST_LOG(to, code); return { ok: true }; }
  if (!env.SMS_AUTH_KEY || !env.SMS_TEMPLATE_ID) return { ok: false, error: "NOT_CONFIGURED" };
  const rec = { mobiles: to }; rec[env.SMS_VAR || "otp"] = code;
  const body = { template_id: env.SMS_TEMPLATE_ID, short_url: "0", recipients: [rec] };
  if (env.SMS_SENDER) body.sender = env.SMS_SENDER;
  try {
    const r = await fetch(env.SMS_URL || "https://control.msg91.com/api/v5/flow", { method: "POST", headers: { authkey: env.SMS_AUTH_KEY, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch (e) { /* not json */ }
    if (!r.ok || (j && String(j.type || "").toLowerCase() === "error")) return { ok: false, error: "PROVIDER", detail: j && (j.message || j.msg) ? String(j.message || j.msg).slice(0, 200) : "HTTP " + r.status };
    return { ok: true };
  } catch (e) { return { ok: false, error: "NETWORK" }; }
}
export function sixDigits() {
  const buf = new Uint32Array(1), limit = Math.floor(0xffffffff / 900000) * 900000;
  let n; do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= limit);
  return String(100000 + (n % 900000));
}
