// functions/_shared/citizen-push.js
//
// Optional phone updates for citizens (approved Oct 2026).
//
// A citizen can ask for alerts about ONE complaint on their phone or
// computer (web push, same free system as the representatives'). No
// account, no name: the device address is tied to that complaint only.
//
// Alerts (never the complaint text, place or personal details):
//   ACK       acknowledged by the office
//   MOVED_UP  gone to the next level
//   FIXED     marked fixed (confirm within 7 days, or staff will call)
//   REMIND2   2 days left to confirm
//   CLOSED    complaint closed -- then the device address is deleted
//
// DPDP Act 2023: opt-in (pressing the button is the consent, recorded as
// consent_at), purpose-limited (this complaint only), deleted at closure
// or when turned off, at most 3 devices per complaint. Turning it on
// needs the one-time pass from filing (24 hours) or the Track page's
// email code, so knowing a reference number isn't enough.

import { sendPush, pushConfigured } from "./webpush.js";
import { sha256Hex, randomToken } from "./rep-session.js";

export const MAX_DEVICES_PER_CASE = 3;
export const FILING_PASS_HOURS = 24;
export const CONFIRM_DAYS = 7;
export const REMIND_DAYS_LEFT = 2;

const LEVEL_EN = { Corporator: "corporator", "Gram Pradhan": "gram pradhan", Mayor: "mayor's office", MLA: "MLA's office", MP: "MP's office" };
const LEVEL_HI = { Corporator: "पार्षद", "Gram Pradhan": "ग्राम प्रधान", Mayor: "महापौर कार्यालय", MLA: "विधायक कार्यालय", MP: "सांसद कार्यालय" };
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_HI = ["जन॰", "फ़र॰", "मार्च", "अप्रैल", "मई", "जून", "जुल॰", "अग॰", "सित॰", "अक्तू॰", "नव॰", "दिस॰"];
function day(ms, lang) { const d = new Date(ms + 5.5 * 3600000); return d.getUTCDate() + " " + (lang === "hi" ? MON_HI : MON_EN)[d.getUTCMonth()]; }
function toMs(v) { if (!v) return NaN; let s = String(v); if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s = s.replace(" ", "T") + "Z"; return Date.parse(s); }

// The text of an alert, in the language the citizen chose.
export function citizenText(kind, ref, data, lang) {
  const hi = lang === "hi";
  const d = data || {};
  const lvl = hi ? (LEVEL_HI[d.label] || d.label || "जनप्रतिनिधि") : (LEVEL_EN[d.label] || d.label || "representative");
  switch (kind) {
    case "ACK": return hi ? { title: "शिकायत स्वीकार की गई", body: ref + ": आपके " + lvl + " ने आपकी शिकायत स्वीकार कर ली है।" }
      : { title: "Complaint acknowledged", body: ref + ": your " + lvl + " has acknowledged your complaint." };
    case "MOVED_UP": return hi ? { title: "शिकायत आगे बढ़ी", body: ref + " अब आपके " + lvl + " को भेज दी गई है।" }
      : { title: "Complaint moved up", body: ref + " has gone to your " + lvl + "." };
    case "FIXED": return d.hasEmail
      ? (hi ? { title: "निस्तारित बताया गया — कृपया पुष्टि करें", body: ref + " को निस्तारित बताया गया है। कृपया 7 दिन में बताएँ कि क्या यह वास्तव में ठीक हुई।" }
        : { title: "Marked fixed — please confirm", body: ref + " is marked fixed. Please tell us within 7 days if it really is." })
      : (hi ? { title: "निस्तारित बताया गया", body: ref + " को निस्तारित बताया गया है। GrievIQ स्टाफ़ जाँच के लिए आपको फ़ोन करेगा।" }
        : { title: "Marked fixed", body: ref + " is marked fixed. GrievIQ staff will call you to check." });
    case "REMIND2": return hi ? { title: "पुष्टि के लिए 2 दिन बचे", body: (d.byHi || d.by) + " तक बताएँ कि क्या " + ref + " वास्तव में ठीक हुई, अन्यथा यह \"पुष्टि नहीं\" के रूप में बंद हो जाएगी।" }
      : { title: "2 days left to confirm", body: "Tell us by " + d.by + " if " + ref + " is really fixed, or it closes as not confirmed." };
    case "CLOSED": return hi ? { title: "शिकायत बंद", body: ref + " बंद कर दी गई है। GrievIQ का उपयोग करने के लिए धन्यवाद।" + (d.hasEmail ? " यदि यह वास्तव में ठीक नहीं हुई, तो आप 30 दिन में मेरी शिकायतें पृष्ठ पर इसे फिर से खोल सकते हैं।" : "") }
      : { title: "Complaint closed", body: ref + " is closed. Thank you for using GrievIQ." + (d.hasEmail ? " If it isn't really fixed, you can reopen it within 30 days on the Track page." : "") };
    case "ON": return hi ? { title: "अपडेट चालू हैं", body: ref + " के बारे में अपडेट इस डिवाइस पर आएँगे।" }
      : { title: "Updates are on", body: "Updates about " + ref + " will appear on this device." };
    default: return { title: "GrievIQ", body: ref };
  }
}

// Sends one update to every device that asked about this complaint, once
// (dedupe key). g needs id and tracking_ref. Never throws.
export async function pushCitizen(env, g, kind, data, key) {
  if (!pushConfigured(env) || !g || !g.id) return 0;
  try {
    const subs = (await env.DB.prepare("SELECT * FROM citizen_push WHERE grievance_id = ?").bind(g.id).all()).results || [];
    if (!subs.length) return 0;
    const fresh = await env.DB.prepare("INSERT OR IGNORE INTO citizen_push_sent (dedupe_key, grievance_id, sent_at) VALUES (?, ?, ?)")
      .bind(key || (kind + ":" + g.id), g.id, new Date().toISOString()).run();
    if (!(fresh && fresh.meta && fresh.meta.changes > 0)) return 0;
    return await sendToSubs(env, subs, g, kind, data);
  } catch (e) { return 0; }
}

async function sendToSubs(env, subs, g, kind, data) {
  let n = 0;
  const now = new Date().toISOString();
  for (const s of subs) {
    const t = citizenText(kind, g.tracking_ref, data, s.lang === "hi" ? "hi" : "en");
    const r = await sendPush(env, s, { title: t.title, body: t.body, url: "/status?ref=" + encodeURIComponent(g.tracking_ref), tag: "c-" + g.tracking_ref }, { urgency: kind === "FIXED" || kind === "REMIND2" ? "high" : "normal" });
    try {
      if (r.ok) { n++; await env.DB.prepare("UPDATE citizen_push SET last_ok_at = ?, fail_count = 0 WHERE id = ?").bind(now, s.id).run(); }
      else if (r.gone) await env.DB.prepare("DELETE FROM citizen_push WHERE id = ?").bind(s.id).run();
      else await env.DB.prepare("UPDATE citizen_push SET fail_count = fail_count + 1 WHERE id = ?").bind(s.id).run();
    } catch (e) { /* ignore */ }
  }
  return n;
}

// The welcome alert right after turning updates on (also proves it works).
export async function pushWelcome(env, sub, g) {
  return sendToSubs(env, [sub], g, "ON", {});
}

// ---- the one-time pass from filing ----
export async function makeFilingPass(env, grievanceId) {
  try {
    const token = randomToken(24);
    await env.DB.prepare(
      `INSERT INTO citizen_update_passes (grievance_id, pass_hash, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(grievance_id) DO UPDATE SET pass_hash = excluded.pass_hash, expires_at = excluded.expires_at`
    ).bind(grievanceId, await sha256Hex(token), new Date(Date.now() + FILING_PASS_HOURS * 3600000).toISOString()).run();
    return token;
  } catch (e) { return null; }   // table not there yet: the card simply isn't offered
}
export async function checkFilingPass(env, grievanceId, token) {
  if (!token || String(token).length > 100) return false;
  try {
    const row = await env.DB.prepare("SELECT pass_hash, expires_at FROM citizen_update_passes WHERE grievance_id = ?").bind(grievanceId).first();
    return !!row && row.expires_at > new Date().toISOString() && row.pass_hash === await sha256Hex(String(token));
  } catch (e) { return false; }
}

// ---- the hourly job ----
// 2 days left to confirm; closed complaints get the last alert and their
// device addresses are deleted; expired passes are removed. Never throws.
export async function citizenHourly(env, nowMs) {
  const now = nowMs || Date.now();
  const done = { reminders: 0, closed: 0 };
  try {
    const { results: waiting } = await env.DB.prepare(
      `SELECT g.id, g.tracking_ref, g.resolved_at FROM grievances g
       WHERE g.status = 'PENDING_CONFIRMATION' AND COALESCE(TRIM(g.citizen_email), '') <> '' AND g.resolved_at IS NOT NULL
         AND EXISTS (SELECT 1 FROM citizen_push c WHERE c.grievance_id = g.id)`
    ).all();
    for (const g of waiting || []) {
      const res = toMs(g.resolved_at);
      const by = res + CONFIRM_DAYS * 86400000;
      if (now >= by - REMIND_DAYS_LEFT * 86400000 && now < by) {
        if (await pushCitizen(env, g, "REMIND2", { by: day(by, "en"), byHi: day(by, "hi") }, "REM2:" + g.id + ":" + g.resolved_at)) done.reminders++;
      }
    }
    const { results: closed } = await env.DB.prepare(
      `SELECT g.id, g.tracking_ref, g.citizen_email, g.closed_at, g.resolved_at, g.retention_removed_at FROM grievances g
       WHERE (g.status IN ('RESOLVED', 'CLOSED') OR g.retention_removed_at IS NOT NULL)
         AND EXISTS (SELECT 1 FROM citizen_push c WHERE c.grievance_id = g.id)`
    ).all();
    for (const g of closed || []) {
      if (!g.retention_removed_at) {
        await pushCitizen(env, g, "CLOSED", { hasEmail: !!String(g.citizen_email || "").trim() }, "CLOSED:" + g.id + ":" + (g.closed_at || g.resolved_at || ""));
      }
      await env.DB.batch([
        env.DB.prepare("DELETE FROM citizen_push WHERE grievance_id = ?").bind(g.id),
        env.DB.prepare("DELETE FROM citizen_push_sent WHERE grievance_id = ?").bind(g.id),
      ]);
      done.closed++;
    }
    await env.DB.prepare("DELETE FROM citizen_update_passes WHERE expires_at < ?").bind(new Date(now).toISOString()).run();
  } catch (e) { done.error = true; }
  return done;
}
