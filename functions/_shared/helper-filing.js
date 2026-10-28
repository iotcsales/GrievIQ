/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/helper-filing.js
//
// Community helpers, part 2 (grieviq-73): filing a complaint for a citizen.
// Storage: part47 (helper_filings; grievances.helper_id, helper_removed_at).
//
//   1. An active helper fills in the usual complaint form for the citizen
//      (/submit?helper=1), with the citizen's own mobile number and, if they
//      have one, their email. The same checks as any complaint apply.
//   2. Nothing reaches the representative yet. The citizen must confirm they
//      asked for it:
//        - with an email: a 6-digit code (and a link) goes to the CITIZEN's
//          email. They tell the helper the code, or open the link and press
//          "Yes, send it". 3 days; then GrievIQ staff call them instead.
//        - without an email: GrievIQ staff phone the citizen first.
//      Up to 7 days in all, then it is dropped (and the helper is told).
//   3. Confirmed: it is filed like any complaint (the citizen gets the usual
//      email if they gave one). The office sees "Filed with help from a
//      Community helper", never who. The citizen can remove the helper from
//      it at any time on the Track page; the helper then can't see it.
// Limits and checks: 15 filings a day per helper; never the helper's own
// mobile or email; repeated similar text, or the same citizen mobile again
// and again, is flagged for GrievIQ staff. A citizen saying "I didn't ask"
// (by link, on the call, or when removing the helper), or staff finding a
// filing false, is a strike; 3 strikes pause the helper automatically
// (they can appeal). Representatives can't approve, block or see helpers.

import { checkComplaint, createComplaint, heldPayload, NOTICE_VERSION } from "./file-complaint.js";
import { istToday } from "./site-settings.js";
import { sha256Hex } from "./rep-session.js";
import { sendEmailNow } from "./dept-auth.js";
import { logHelper, adminLog, tellStaff, emailHelper, stateOf, electionPause, maskMobile } from "./helpers.js";

export const DAILY_FILINGS = 15;
export const CODE_DAYS = 3;
export const CALL_DAYS = 7;
export const CODE_TRIES = 5;
export const CODES_MAX = 3;
export const STRIKES_LIMIT = 3;
export const SIMILAR_DAYS = 30;
export const SAME_PHONE_MAX = 3;      // the same citizen mobile more than this in 30 days is flagged
const HELD = (id) => "held:" + id;
const escH = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let ready = null;
export async function filingsReady(env) {
  if (ready === true) return true;
  try { await env.DB.prepare("SELECT 1 FROM helper_filings LIMIT 1").all(); ready = true; return true; } catch (e) { return false; }
}

function sixDigits() { const u = new Uint32Array(1); crypto.getRandomValues(u); return String(u[0] % 1000000).padStart(6, "0"); }
function token() { const u = new Uint8Array(24); crypto.getRandomValues(u); let s = ""; u.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
export function maskEmail(e) { const [a, d] = String(e || "").split("@"); return d ? a.slice(0, 1) + "•••@" + d : ""; }
// The words of a description (3+ letters, lower case, unique, sorted): two
// descriptions sharing most of their words are "similar".
export function textSig(t) {
  return Array.from(new Set(String(t || "").toLowerCase().normalize("NFC").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3))).sort().slice(0, 80).join(" ");
}
export function similarity(a, b) {
  const A = new Set(String(a || "").split(" ").filter(Boolean)), B = new Set(String(b || "").split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach((w) => { if (B.has(w)) n++; });
  return n / (A.size + B.size - n);
}

// ---- strikes ----
export async function addStrike(env, origin, helperId, why, actor) {
  await env.DB.prepare("UPDATE helpers SET strikes = strikes + 1, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), helperId).run();
  const h = await env.DB.prepare("SELECT * FROM helpers WHERE id = ?").bind(helperId).first();
  if (!h) return;
  await logHelper(env, h.id, actor || "system", "STRIKE", { why, strikes: h.strikes });
  if (h.strikes >= STRIKES_LIMIT && ["ACTIVE", "LAPSED"].includes(h.status)) {
    const now = new Date().toISOString();
    const reason = "Paused automatically: " + h.strikes + " complaints were reported as not asked for or false. GrievIQ staff will look into it.";
    const r = await env.DB.prepare(`UPDATE helpers SET status = 'SUSPENDED', action_by = 'system', action_at = ?, action_reason = ?, appeal_text = NULL, appeal_at = NULL, appeal_by = NULL, appeal_decided_at = NULL, appeal_result = NULL, appeal_note = NULL, updated_at = ?
      WHERE id = ? AND status IN ('ACTIVE','LAPSED')`).bind(now, reason, now, h.id).run();
    if (r.meta && r.meta.changes === 1) {
      await logHelper(env, h.id, "system", "AUTO_PAUSED", { strikes: h.strikes });
      await adminLog(env, "system", "helper_auto_paused", h.ref || h.id, { strikes: h.strikes });
      await emailHelper(env, origin, h, "GrievIQ: your Community helper role is paused",
        ["Your Community helper role has been paused automatically, because " + h.strikes + " complaints you filed were reported as not asked for, or found to be false.", "GrievIQ staff will look into it. You can appeal once, within 30 days, on your Community helper page."]);
      await tellStaff(env, origin, "GrievIQ: a Community helper was paused automatically", "A Community helper reached " + STRIKES_LIMIT + " strikes and was paused automatically.");
    }
  } else {
    await tellStaff(env, origin, "GrievIQ: a Community helper filing was reported", "A complaint filed by a Community helper was reported as not asked for, or found to be false.");
  }
}

// ---- the code to the citizen ----
async function sendCode(env, origin, f, h, p) {
  const code = sixDigits(), link = token(), now = new Date().toISOString();
  await env.DB.prepare("UPDATE helper_filings SET code_hash = ?, code_tries = 0, codes_sent = codes_sent + 1, code_sent_at = ?, link_hash = ? WHERE id = ?")
    .bind(await sha256Hex(f.id + ":" + code), now, await sha256Hex(link), f.id).run();
  const url = origin + "/consent?k=" + encodeURIComponent(link);
  const cat = await env.DB.prepare("SELECT name FROM grievance_categories WHERE id = ?").bind(p.category_id).first();
  const unit = await env.DB.prepare("SELECT name FROM local_units WHERE id = ?").bind(p.local_unit_id).first();
  const about = String(p.description || "").slice(0, 160) + (String(p.description || "").length > 160 ? "…" : "");
  const hi = p.lang === "hi";
  const subject = hi ? "क्या आपने यह शिकायत दर्ज करने को कहा था? — GrievIQ" : "Did you ask for this complaint to be filed? — GrievIQ";
  const html = hi
    ? `<p>सामुदायिक सहायक <b>${escH(h.ref)}</b> ने आपके लिए एक शिकायत दर्ज की है: ${escH(cat ? cat.name : "")}, ${escH(unit ? unit.name : "")}।</p><p style="color:#555">“${escH(about)}”</p>
       <p>यदि आपने उनसे यह करने को कहा था, तो उन्हें यह कोड बताएँ: <b style="font-size:20px;letter-spacing:2px">${code}</b></p><p>या यहाँ खोलें: <a href="${escH(url)}">${escH(url)}</a></p>
       <p>यदि आपने नहीं कहा था, तो यही लिंक खोलें और <b>मैंने यह नहीं कहा था</b> दबाएँ। आपकी पुष्टि के बिना यह शिकायत किसी को नहीं भेजी जाएगी। यह कोड ${CODE_DAYS} दिन तक मान्य है।</p><p style="color:#666">GrievIQ नागरिकों के लिए निःशुल्क है। सहायक कभी पैसे नहीं माँगते।</p>`
    : `<p>Community helper <b>${escH(h.ref)}</b> has filed a complaint for you: ${escH(cat ? cat.name : "")}, ${escH(unit ? unit.name : "")}.</p><p style="color:#555">“${escH(about)}”</p>
       <p>If you asked them to, tell them this code: <b style="font-size:20px;letter-spacing:2px">${code}</b></p><p>Or open: <a href="${escH(url)}">${escH(url)}</a></p>
       <p>If you didn't ask, open the same link and press <b>I didn't ask for this</b>. Nothing is sent to anyone without your confirmation. The code works for ${CODE_DAYS} days.</p><p style="color:#666">GrievIQ is free for citizens. Helpers never ask for money.</p>`;
  try { await sendEmailNow(env, p.citizen_email, subject, html); } catch (e) { /* the helper can send it again */ }
  return { code, link };
}

// ---- 1. filing ----
// Returns { status, body }.
export async function fileForCitizen(env, origin, h, input) {
  if (!(await filingsReady(env))) return { status: 409, body: { error: "NOT_READY" } };
  const today = istToday();
  const pause = await electionPause(env, h, today);
  const st = stateOf(h, today, pause);
  if (pause) return { status: 409, body: { error: "ELECTION_PAUSE" } };
  if (!st.canHelp) return { status: 409, body: { error: "CANT_HELP" } };
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM helper_filings WHERE helper_id = ? AND day = ?").bind(h.id, today).first();
  if (n && n.n >= DAILY_FILINGS) return { status: 429, body: { error: "HELPER_LIMIT", max: DAILY_FILINGS } };
  const checked = await checkComplaint(env, Object.assign({}, input, { consent: input && input.consent === true }));
  if (!checked.ok) return { status: checked.status, body: checked.body };
  const v = checked.v;
  // The citizen's own details, never the helper's.
  const hm = String(h.mobile || "").slice(-10), cm = v.phone.slice(-10);
  if (cm === hm) return { status: 400, body: { error: "SELF", field: "phone" } };
  if (v.email && v.email.toLowerCase() === String(h.email).toLowerCase()) return { status: 400, body: { error: "SELF", field: "email" } };
  // The same complaint twice from this helper today.
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const phoneHash = await sha256Hex("giq-phone|" + cm), sig = textSig(v.description);
  const since = new Date(Date.now() - SIMILAR_DAYS * 86400000).toISOString();
  const { results: recent } = await env.DB.prepare("SELECT id, phone_hash, text_sig FROM helper_filings WHERE helper_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 300").bind(h.id, since).all();
  const flags = [];
  if ((recent || []).some((r) => r.text_sig && similarity(r.text_sig, sig) >= 0.8)) flags.push("SIMILAR_TEXT");
  if ((recent || []).filter((r) => r.phone_hash === phoneHash).length >= SAME_PHONE_MAX) flags.push("SAME_PHONE");
  const payload = heldPayload(v);
  const hasEmail = !!v.email;
  await env.DB.prepare(`INSERT INTO helper_filings (id, helper_id, created_at, day, unit_id, category_id, payload, phone_hash, text_sig, has_email, status, flags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, h.id, now, today, v.local_unit_id, v.category_id, JSON.stringify(payload), phoneHash, sig, hasEmail ? 1 : 0, hasEmail ? "WAITING_CODE" : "WAITING_CALL", flags.length ? JSON.stringify(flags) : null).run();
  // Keep the photos for this filing (not cleaned up as unused while it waits).
  if (v.photoIds.length) {
    await env.DB.batch(v.photoIds.map((pid) => env.DB.prepare("UPDATE complaint_photos SET grievance_id = ? WHERE id = ? AND grievance_id IS NULL").bind(HELD(id), pid)));
  }
  await logHelper(env, h.id, h.email, "FILED_FOR_CITIZEN", { filing: id, unit: v.local_unit_id, email: hasEmail, flags });
  const f = { id };
  if (hasEmail) await sendCode(env, origin, f, h, payload);
  else await tellStaff(env, origin, "GrievIQ: a citizen to call (Community helper filing)", "A Community helper filed a complaint for a citizen with no email. Please call the citizen to confirm before it is sent.");
  if (flags.length) await tellStaff(env, origin, "GrievIQ: a Community helper filing was flagged", "A Community helper filing was flagged for a look (similar text or the same mobile number again).");
  return { status: 200, body: { ok: true, filing: { id, status: hasEmail ? "WAITING_CODE" : "WAITING_CALL", email: maskEmail(v.email), mobile: maskMobile(cm) } } };
}

// ---- 2-3. confirming, closing ----
// The citizen confirmed (code, link or call): filed now, like any complaint.
export async function confirmFiling(env, origin, f, via, actor, waitUntil) {
  if (!["WAITING_CODE", "WAITING_CALL"].includes(f.status) || !f.payload) return { error: "STATE" };
  // Claim it first, so it is filed only once.
  const now = new Date().toISOString();
  const claim = await env.DB.prepare("UPDATE helper_filings SET status = 'SENT', consent_via = ?, decided_at = ?, decided_by = ?, code_hash = NULL, link_hash = NULL WHERE id = ? AND status IN ('WAITING_CODE','WAITING_CALL')")
    .bind(via, now, actor, f.id).run();
  if (!claim.meta || claim.meta.changes !== 1) return { error: "STATE" };
  const checked = await checkComplaint(env, JSON.parse(f.payload));
  if (!checked.ok) {
    // The ward can't take complaints any more, for example: nothing is filed.
    await closeFiling(env, f, "CANCELLED", "system", "Could not be filed: " + String(checked.body.code || checked.body.error || "").slice(0, 120), "SENT");
    return { error: "CANT_FILE", detail: checked.body };
  }
  const made = await createComplaint(env, checked.v, { origin, helperId: f.helper_id, consentAt: now, notice: NOTICE_VERSION + "+helper-" + via.toLowerCase(), heldKey: HELD(f.id), waitUntil });
  if (made.error) { await env.DB.prepare("UPDATE helper_filings SET status = ?, decided_at = NULL, consent_via = NULL WHERE id = ?").bind(f.status, f.id).run(); return { error: "TRY_AGAIN" }; }
  await env.DB.prepare("UPDATE helper_filings SET grievance_id = ?, payload = NULL WHERE id = ?").bind(made.id, f.id).run();
  await logHelper(env, f.helper_id, actor, "FILING_SENT", { filing: f.id, via, ref: made.trackingRef });
  return { ok: true, trackingRef: made.trackingRef, grievanceId: made.id };
}
// Not sent: the complaint's details are deleted now, and its photos let go.
export async function closeFiling(env, f, status, actor, note, from) {
  const now = new Date().toISOString();
  const r = from
    ? await env.DB.prepare("UPDATE helper_filings SET status = ?, payload = NULL, code_hash = NULL, link_hash = NULL, decided_at = ?, decided_by = ?, note = ? WHERE id = ? AND status = ?").bind(status, now, actor, note || null, f.id, from).run()
    : await env.DB.prepare("UPDATE helper_filings SET status = ?, payload = NULL, code_hash = NULL, link_hash = NULL, decided_at = ?, decided_by = ?, note = ? WHERE id = ? AND status IN ('WAITING_CODE','WAITING_CALL')").bind(status, now, actor, note || null, f.id).run();
  if (!r.meta || r.meta.changes !== 1) return false;
  await env.DB.prepare("UPDATE complaint_photos SET grievance_id = NULL WHERE grievance_id = ?").bind(HELD(f.id)).run();
  await logHelper(env, f.helper_id, actor, "FILING_" + status, { filing: f.id });
  return true;
}

// The code the citizen gave the helper. Returns { status, body }.
export async function checkCode(env, origin, f, code, waitUntil) {
  if (f.status !== "WAITING_CODE" || !f.code_hash) return { status: 409, body: { error: "STATE" } };
  if (f.code_tries >= CODE_TRIES) return { status: 429, body: { error: "TOO_MANY_ATTEMPTS" } };
  if (!/^[0-9]{6}$/.test(String(code || ""))) return { status: 400, body: { error: "CHECK_FIELDS", fields: { code: "FORMAT" } } };
  if (Date.now() - Date.parse(f.code_sent_at) > CODE_DAYS * 86400000) return { status: 409, body: { error: "EXPIRED" } };
  if ((await sha256Hex(f.id + ":" + code)) !== f.code_hash) {
    await env.DB.prepare("UPDATE helper_filings SET code_tries = code_tries + 1 WHERE id = ?").bind(f.id).run();
    return { status: 400, body: { error: "CHECK_FIELDS", fields: { code: "WRONG" }, left: Math.max(0, CODE_TRIES - f.code_tries - 1) } };
  }
  const r = await confirmFiling(env, origin, f, "CODE", "citizen (code)", waitUntil);
  if (r.error) return { status: 409, body: { error: r.error } };
  return { status: 200, body: { ok: true, trackingRef: r.trackingRef } };
}
export async function resendCode(env, origin, f, h) {
  if (f.status !== "WAITING_CODE" || !f.payload) return { status: 409, body: { error: "STATE" } };
  if (f.codes_sent >= CODES_MAX) return { status: 429, body: { error: "TOO_MANY" } };
  if (f.code_sent_at && Date.now() - Date.parse(f.code_sent_at) < 60000) return { status: 429, body: { error: "WAIT" } };
  await sendCode(env, origin, f, h, JSON.parse(f.payload));
  await logHelper(env, h.id, h.email, "CODE_SENT_AGAIN", { filing: f.id });
  return { status: 200, body: { ok: true } };
}

// ---- what the helper sees of their filings ----
export async function filingsFor(env, helperIds) {
  if (!helperIds.length || !(await filingsReady(env))) return [];
  const { results } = await env.DB.prepare(
    `SELECT f.*, c.name AS category_name, lu.name AS unit_name, g.tracking_ref, g.status AS g_status, g.helper_removed_at
     FROM helper_filings f LEFT JOIN grievance_categories c ON c.id = f.category_id LEFT JOIN local_units lu ON lu.id = f.unit_id LEFT JOIN grievances g ON g.id = f.grievance_id
     WHERE f.helper_id IN (SELECT value FROM json_each(?)) AND f.removed_at IS NULL AND g.helper_removed_at IS NULL ORDER BY f.created_at DESC LIMIT 100`
  ).bind(JSON.stringify(helperIds)).all();
  return (results || []).map((f) => {
    const p = f.payload ? JSON.parse(f.payload) : null;
    return { id: f.id, status: f.status, createdAt: f.created_at, category: f.category_name || f.category_id, unit: f.unit_name || f.unit_id,
      email: p ? maskEmail(p.citizen_email) : null, mobile: p ? maskMobile(String(p.citizen_phone).slice(-10)) : null,
      codesLeft: Math.max(0, CODES_MAX - f.codes_sent), codeTriesLeft: Math.max(0, CODE_TRIES - f.code_tries),
      ref: f.status === "SENT" ? f.tracking_ref : null, caseStatus: f.status === "SENT" ? f.g_status : null };
  });
}
export async function todayCount(env, helperId) {
  if (!(await filingsReady(env))) return 0;
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM helper_filings WHERE helper_id = ? AND day = ?").bind(helperId, istToday()).first();
  return n ? n.n : 0;
}

// ---- the hourly job ----
export async function runHelperFilings(env, origin, nowMs) {
  const out = { toCall: 0, expired: 0 };
  if (!(await filingsReady(env))) return out;
  // No code in 3 days: GrievIQ staff call the citizen instead.
  const { results: late } = await env.DB.prepare("SELECT * FROM helper_filings WHERE status = 'WAITING_CODE' AND created_at < ? LIMIT 100").bind(new Date(nowMs - CODE_DAYS * 86400000).toISOString()).all();
  for (const f of late || []) {
    const r = await env.DB.prepare("UPDATE helper_filings SET status = 'WAITING_CALL', code_hash = NULL, link_hash = NULL WHERE id = ? AND status = 'WAITING_CODE'").bind(f.id).run();
    if (r.meta && r.meta.changes === 1) { out.toCall++; await logHelper(env, f.helper_id, "system", "FILING_TO_CALL", { filing: f.id }); }
  }
  if (out.toCall) await tellStaff(env, origin, "GrievIQ: citizens to call (Community helper filings)", "Some Community helper filings were not confirmed by email in " + CODE_DAYS + " days. Please call the citizens.");
  // 7 days without the citizen's confirmation: dropped.
  const { results: old } = await env.DB.prepare("SELECT * FROM helper_filings WHERE status IN ('WAITING_CODE','WAITING_CALL') AND created_at < ? LIMIT 100").bind(new Date(nowMs - CALL_DAYS * 86400000).toISOString()).all();
  for (const f of old || []) {
    if (await closeFiling(env, f, "EXPIRED", "system", "Not confirmed by the citizen in " + CALL_DAYS + " days")) {
      out.expired++;
      const h = await env.DB.prepare("SELECT * FROM helpers WHERE id = ?").bind(f.helper_id).first();
      if (h) await emailHelper(env, origin, h, "GrievIQ: a complaint you filed was not confirmed", ["A complaint you filed for a citizen was not confirmed by them within " + CALL_DAYS + " days, so it was not sent and its details were deleted."]);
    }
  }
  return out;
}
