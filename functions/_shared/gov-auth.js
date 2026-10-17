/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/gov-auth.js   (grieviq-49)
//
// Signing in state and district officials to the government dashboard
// (grieviq.in/gov) with a 6-digit code sent to the email the super admin
// recorded from the state's letter. Same standards as the department
// dashboard (_shared/dept-auth.js):
//   - NIST SP 800-63B-4: codes from the cryptographic generator, valid 10
//     minutes, single use, 5 wrong tries at most; sessions end after 1 hour
//     without activity and 8 hours at most.
//   - OWASP: the same reply whether or not the email has access; at most 3
//     codes per email per 15 minutes; only SHA-256 hashes of codes and
//     session ids are stored; cookie HttpOnly, Secure, SameSite=Strict,
//     __Host- prefixed.
//   - NIST SP 800-53 AC-2(3): an account whose review is more than
//     GRACE_DAYS overdue can't sign in until the super admin reviews it.
// Every sign-in, sign-out and view is written to gov_view_log, which can't
// be changed or deleted (part32 triggers).

import { randomToken, sha256Hex, readCookie } from "./rep-session.js";
import { sixDigitCode, CODE_MINUTES, CODE_TRIES, CODES_PER_WINDOW, WINDOW_MINUTES, IDLE_MINUTES, ABSOLUTE_HOURS, EMAIL_RE } from "./dept-auth.js";
import { istToday, addDays } from "./gov.js";

export const COOKIE = "__Host-giq_gov";
export const GRACE_DAYS = 30;
const TOUCH_EVERY_MS = 5 * 60 * 1000;

function missing(e) { return /no such (table|column)/i.test(String(e && e.message)); }
export async function govLoginReady(env) {
  try { await env.DB.prepare("SELECT email_kind FROM gov_users LIMIT 1").first(); await env.DB.prepare("SELECT id FROM gov_codes LIMIT 1").first(); return true; }
  catch (e) { if (missing(e)) return false; throw e; }
}

function cookie(value, maxAge) {
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAge))}`;
}
export function clearCookie() { return `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`; }

export async function logGov(env, row) {
  try {
    await env.DB.prepare("INSERT INTO gov_view_log (id, at, user_id, email, action, scope, detail) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), new Date().toISOString(), row.userId || null, row.email || null, row.action, row.scope || null,
        row.detail == null ? null : JSON.stringify(row.detail)).run();
  } catch (e) { /* logging never blocks the work */ }
}

// May this account use the dashboard today?
export function usable(u, today) {
  return !!u && u.status === "ACTIVE" && addDays(u.review_by, GRACE_DAYS) >= (today || istToday());
}
export async function activeUserByEmail(env, email) {
  const u = await env.DB.prepare("SELECT * FROM gov_users WHERE email = ? AND status = 'ACTIVE' ORDER BY added_at DESC LIMIT 1")
    .bind(String(email || "").toLowerCase()).first();
  return usable(u) ? u : null;
}

export async function requestCode(env, emailIn) {
  const email = String(emailIn || "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 200) return { status: 400, body: { error: "FORMAT" } };
  const now = Date.now();
  await env.DB.prepare("DELETE FROM gov_codes WHERE created_at < ?").bind(new Date(now - 86400000).toISOString()).run();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM gov_codes WHERE email = ? AND created_at >= ?")
    .bind(email, new Date(now - WINDOW_MINUTES * 60000).toISOString()).first();
  if (recent && recent.n >= CODES_PER_WINDOW) return { status: 429, body: { error: "TOO_MANY", minutes: WINDOW_MINUTES } };
  await env.DB.prepare("UPDATE gov_codes SET used_at = ? WHERE email = ? AND used_at IS NULL").bind(new Date(now).toISOString(), email).run();
  const code = sixDigitCode();
  await env.DB.prepare("INSERT INTO gov_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), email, await sha256Hex("gov:" + email + ":" + code), new Date(now + CODE_MINUTES * 60000).toISOString(), new Date(now).toISOString()).run();
  const user = await activeUserByEmail(env, email);
  return { status: 200, body: { sent: true }, send: user ? { to: email, code } : null };
}

export async function verifyCode(env, emailIn, codeIn) {
  const email = String(emailIn || "").trim().toLowerCase();
  const code = String(codeIn || "").replace(/\D/g, "");
  if (code.length !== 6) return { status: 400, body: { error: "CODE_FORMAT" } };
  const now = Date.now();
  const row = await env.DB.prepare("SELECT * FROM gov_codes WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(email).first();
  if (!row || Date.parse(row.expires_at) < now) return { status: 401, body: { error: "EXPIRED" } };
  if (row.failed_attempts >= CODE_TRIES) {
    await env.DB.prepare("UPDATE gov_codes SET used_at = ? WHERE id = ?").bind(new Date(now).toISOString(), row.id).run();
    return { status: 429, body: { error: "TOO_MANY_TRIES" } };
  }
  if ((await sha256Hex("gov:" + email + ":" + code)) !== row.code_hash) {
    const tries = row.failed_attempts + 1;
    await env.DB.prepare("UPDATE gov_codes SET failed_attempts = ?, used_at = CASE WHEN ? >= ? THEN ? ELSE used_at END WHERE id = ?")
      .bind(tries, tries, CODE_TRIES, new Date(now).toISOString(), row.id).run();
    return tries >= CODE_TRIES ? { status: 429, body: { error: "TOO_MANY_TRIES" } } : { status: 401, body: { error: "INCORRECT", triesLeft: CODE_TRIES - tries } };
  }
  await env.DB.prepare("UPDATE gov_codes SET used_at = ? WHERE id = ?").bind(new Date(now).toISOString(), row.id).run();
  const user = await activeUserByEmail(env, email);
  if (!user) return { status: 401, body: { error: "EXPIRED" } };
  const token = randomToken(32);
  await env.DB.prepare("INSERT INTO gov_sessions (id_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256Hex(token), user.id, new Date(now).toISOString(), new Date(now).toISOString(), new Date(now + ABSOLUTE_HOURS * 3600000).toISOString()).run();
  await env.DB.prepare("UPDATE gov_users SET last_signed_in = ? WHERE id = ?").bind(new Date(now).toISOString(), user.id).run();
  await logGov(env, { userId: user.id, email, action: "SIGNED_IN", scope: user.level === "DISTRICT" ? "district:" + user.district_id : user.level === "NATIONAL" ? "country" : "state:" + user.state_id });
  return { status: 200, body: { ok: true }, cookie: cookie(token, ABSOLUTE_HOURS * 3600) };
}

// The signed-in official: { ok, user } or { ok: false, status, error }.
export async function getVerifiedGovUser(request, env) {
  const token = readCookie(request, COOKIE);
  if (!token || token.length < 20 || token.length > 100) return { ok: false, status: 401, error: "SIGNED_OUT" };
  let s;
  try { s = await env.DB.prepare("SELECT * FROM gov_sessions WHERE id_hash = ?").bind(await sha256Hex(token)).first(); }
  catch (e) { if (missing(e)) return { ok: false, status: 401, error: "SIGNED_OUT" }; throw e; }
  if (!s || s.ended_at) return { ok: false, status: 401, error: "SIGNED_OUT" };
  const now = Date.now();
  const expired = now >= Date.parse(s.expires_at), idle = now - Date.parse(s.last_seen_at) >= IDLE_MINUTES * 60000;
  if (expired || idle) {
    await env.DB.prepare("UPDATE gov_sessions SET ended_at = ?, end_reason = ? WHERE id_hash = ? AND ended_at IS NULL")
      .bind(new Date(now).toISOString(), expired ? "ABSOLUTE_TIMEOUT" : "IDLE_TIMEOUT", s.id_hash).run();
    return { ok: false, status: 401, error: "SIGNED_OUT" };
  }
  const user = await env.DB.prepare("SELECT * FROM gov_users WHERE id = ?").bind(s.user_id).first();
  if (!usable(user)) {
    await env.DB.prepare("UPDATE gov_sessions SET ended_at = ?, end_reason = 'ACCESS_ENDED' WHERE id_hash = ?").bind(new Date(now).toISOString(), s.id_hash).run();
    return { ok: false, status: 401, error: "SIGNED_OUT" };
  }
  if (now - Date.parse(s.last_seen_at) >= TOUCH_EVERY_MS) {
    await env.DB.prepare("UPDATE gov_sessions SET last_seen_at = ? WHERE id_hash = ?").bind(new Date(now).toISOString(), s.id_hash).run();
  }
  return { ok: true, user };
}

export async function endSession(request, env) {
  const token = readCookie(request, COOKIE);
  if (!token) return null;
  const h = await sha256Hex(token);
  const s = await env.DB.prepare("SELECT user_id FROM gov_sessions WHERE id_hash = ? AND ended_at IS NULL").bind(h).first();
  await env.DB.prepare("UPDATE gov_sessions SET ended_at = ?, end_reason = 'SIGNED_OUT' WHERE id_hash = ? AND ended_at IS NULL").bind(new Date().toISOString(), h).run();
  return s ? s.user_id : null;
}

export function codeEmail(code, origin, path) {
  const host = String(origin || "https://grieviq.in").replace(/^https?:\/\//, "") + (path === "/national" ? "/national" : path === "/state" ? "/state" : "/gov");
  return {
    subject: "GrievIQ sign-in code: " + code + " · साइन-इन कोड",
    html: `<p>Your code to sign in to the GrievIQ government dashboard:</p><h2 style="letter-spacing:4px">${code}</h2>` +
      `<p>It works once, for ${CODE_MINUTES} minutes, on ${host} only. If you didn't ask for it, ignore this email. GrievIQ never asks for this code by phone.</p>` +
      `<hr><p>GrievIQ सरकारी डैशबोर्ड में साइन इन करने के लिए आपका कोड:</p><h2 style="letter-spacing:4px">${code}</h2>` +
      `<p>यह केवल एक बार, ${CODE_MINUTES} मिनट तक, केवल ${host} पर काम करेगा। यदि आपने यह नहीं माँगा, तो इस ईमेल को अनदेखा करें। GrievIQ कभी फ़ोन पर यह कोड नहीं माँगता।</p>`,
  };
}
