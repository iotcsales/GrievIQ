// functions/_shared/dept-auth.js
//
// Department dashboard (grieviq-32): signing in department officers with a
// 6-digit code sent to their official email (approved 9 Oct 2026 -- many
// government addresses, e.g. nic.in, are not Google accounts).
//
// Standards followed (as for the rep console, _shared/rep-session.js):
//   - NIST SP 800-63B-4: one-time codes from the cryptographic generator,
//     valid 10 minutes, single use, 5 wrong tries at most; sessions end after
//     1 hour without activity and 8 hours at most (a working day).
//   - OWASP Authentication / Session Management: the same reply whether or
//     not the email belongs to an officer; at most 3 codes per email per 15
//     minutes; only SHA-256 hashes of codes and session ids are stored; the
//     session cookie is HttpOnly, Secure, SameSite=Strict, __Host- prefixed.
// An officer can sign in only while: their record is active, their office
// is in the directory (not retired), and the office's agreement with GrievIQ
// is recorded and not ended.

import { randomToken, sha256Hex, readCookie } from "./rep-session.js";

export const COOKIE = "__Host-giq_dept";
export const IDLE_MINUTES = 60;
export const ABSOLUTE_HOURS = 8;
export const CODE_MINUTES = 10;
export const CODE_TRIES = 5;
export const CODES_PER_WINDOW = 3;
export const WINDOW_MINUTES = 15;
const TOUCH_EVERY_MS = 5 * 60 * 1000;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isMissingDeptTables(e) {
  return /no such table:?\s*dept_(officers|agreements|codes|sessions|access_log)/i.test(String(e && e.message));
}
export async function officersReady(env) {
  try { await env.DB.prepare("SELECT id FROM dept_officers LIMIT 1").first(); return true; }
  catch (e) { if (isMissingDeptTables(e)) return false; throw e; }
}

export function sixDigitCode() {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / 900000) * 900000;
  let n;
  do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= limit);
  return String(100000 + (n % 900000));
}

function cookie(value, maxAge) {
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAge))}`;
}
export function clearCookie() { return `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`; }

export async function logDept(env, row) {
  try {
    await env.DB.prepare(
      "INSERT INTO dept_access_log (id, officer_id, email, office_id, action, grievance_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), row.officerId || null, row.email || null, row.officeId || null, row.action, row.grievanceId || null,
      row.detail == null ? null : JSON.stringify(row.detail), new Date().toISOString()).run();
  } catch (e) { /* logging never blocks the work */ }
}

// The active officer for an email, with their office and its agreement, if
// they may use GrievIQ now; otherwise null.
export async function activeOfficerByEmail(env, email) {
  const row = await env.DB.prepare(
    `SELECT o.*, d.name_en AS office_name_en, d.name_hi AS office_name_hi, d.area_id, d.departments AS office_departments, d.retired_at AS office_retired,
            a.signed_on AS agr_signed_on, a.ended_at AS agr_ended
     FROM dept_officers o JOIN dept_offices d ON d.id = o.office_id LEFT JOIN dept_agreements a ON a.office_id = o.office_id
     WHERE LOWER(o.email) = ? AND o.status = 'ACTIVE' ORDER BY o.added_at DESC LIMIT 1`
  ).bind(String(email || "").toLowerCase()).first();
  return row && usable(row) ? row : null;
}
function usable(row) { return row && row.status === "ACTIVE" && !row.office_retired && row.agr_signed_on && !row.agr_ended; }

// Step 1: a code by email. Returns { ok, status, body } and, when a code was
// made for a real officer, { send: { to, code } } for the caller to email.
export async function requestCode(env, emailIn) {
  const email = String(emailIn || "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 200) return { status: 400, body: { error: "Enter a valid email address.", fields: { email: "FORMAT" } } };
  const now = Date.now();
  await env.DB.prepare("DELETE FROM dept_codes WHERE created_at < ?").bind(new Date(now - 86400000).toISOString()).run();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM dept_codes WHERE email = ? AND created_at >= ?")
    .bind(email, new Date(now - WINDOW_MINUTES * 60000).toISOString()).first();
  if (recent && recent.n >= CODES_PER_WINDOW) return { status: 429, body: { error: "TOO_MANY", minutes: WINDOW_MINUTES } };
  // Only the newest code works.
  await env.DB.prepare("UPDATE dept_codes SET used_at = ? WHERE email = ? AND used_at IS NULL").bind(new Date(now).toISOString(), email).run();
  const code = sixDigitCode();
  await env.DB.prepare("INSERT INTO dept_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), email, await sha256Hex(email + ":" + code), new Date(now + CODE_MINUTES * 60000).toISOString(), new Date(now).toISOString()).run();
  const officer = await activeOfficerByEmail(env, email);
  return { status: 200, body: { sent: true }, send: officer ? { to: email, code, officer } : null };
}

// Step 2: check the code; on success a session. Returns { status, body, cookie? }.
export async function verifyCode(env, emailIn, codeIn) {
  const email = String(emailIn || "").trim().toLowerCase();
  const code = String(codeIn || "").replace(/\D/g, "");
  if (code.length !== 6) return { status: 400, body: { error: "CODE_FORMAT" } };
  const now = Date.now();
  const row = await env.DB.prepare("SELECT * FROM dept_codes WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(email).first();
  if (!row || Date.parse(row.expires_at) < now) return { status: 401, body: { error: "EXPIRED" } };
  if (row.failed_attempts >= CODE_TRIES) {
    await env.DB.prepare("UPDATE dept_codes SET used_at = ? WHERE id = ?").bind(new Date(now).toISOString(), row.id).run();
    return { status: 429, body: { error: "TOO_MANY_TRIES" } };
  }
  if ((await sha256Hex(email + ":" + code)) !== row.code_hash) {
    const tries = row.failed_attempts + 1;
    await env.DB.prepare("UPDATE dept_codes SET failed_attempts = ?, used_at = CASE WHEN ? >= ? THEN ? ELSE used_at END WHERE id = ?")
      .bind(tries, tries, CODE_TRIES, new Date(now).toISOString(), row.id).run();
    return tries >= CODE_TRIES ? { status: 429, body: { error: "TOO_MANY_TRIES" } } : { status: 401, body: { error: "INCORRECT", triesLeft: CODE_TRIES - tries } };
  }
  await env.DB.prepare("UPDATE dept_codes SET used_at = ? WHERE id = ?").bind(new Date(now).toISOString(), row.id).run();
  const officer = await activeOfficerByEmail(env, email);
  // A correct code for someone who isn't (or is no longer) an officer gets
  // the same answer as an expired code: nothing to learn from it.
  if (!officer) return { status: 401, body: { error: "EXPIRED" } };
  const token = randomToken(32);
  await env.DB.prepare("INSERT INTO dept_sessions (id_hash, officer_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256Hex(token), officer.id, new Date(now).toISOString(), new Date(now).toISOString(), new Date(now + ABSOLUTE_HOURS * 3600000).toISOString()).run();
  await env.DB.prepare("UPDATE dept_officers SET last_signed_in = ? WHERE id = ?").bind(new Date(now).toISOString(), officer.id).run();
  await logDept(env, { officerId: officer.id, email, officeId: officer.office_id, action: "SIGNED_IN" });
  return { status: 200, body: { ok: true }, cookie: cookie(token, ABSOLUTE_HOURS * 3600) };
}

// The signed-in officer for this request: { ok, officer } or { ok: false, status, error }.
export async function getVerifiedOfficer(request, env) {
  const token = readCookie(request, COOKIE);
  if (!token || token.length < 20 || token.length > 100) return { ok: false, status: 401, error: "SIGNED_OUT" };
  let s;
  try {
    s = await env.DB.prepare("SELECT * FROM dept_sessions WHERE id_hash = ?").bind(await sha256Hex(token)).first();
  } catch (e) {
    if (isMissingDeptTables(e)) return { ok: false, status: 401, error: "SIGNED_OUT" };
    throw e;
  }
  if (!s || s.ended_at) return { ok: false, status: 401, error: "SIGNED_OUT" };
  const now = Date.now();
  const expired = now >= Date.parse(s.expires_at), idle = now - Date.parse(s.last_seen_at) >= IDLE_MINUTES * 60000;
  if (expired || idle) {
    await env.DB.prepare("UPDATE dept_sessions SET ended_at = ?, end_reason = ? WHERE id_hash = ? AND ended_at IS NULL")
      .bind(new Date(now).toISOString(), expired ? "ABSOLUTE_TIMEOUT" : "IDLE_TIMEOUT", s.id_hash).run();
    return { ok: false, status: 401, error: "SIGNED_OUT" };
  }
  const officer = await env.DB.prepare(
    `SELECT o.*, d.name_en AS office_name_en, d.name_hi AS office_name_hi, d.area_id, d.departments AS office_departments, d.retired_at AS office_retired,
            a.signed_on AS agr_signed_on, a.ended_at AS agr_ended
     FROM dept_officers o JOIN dept_offices d ON d.id = o.office_id LEFT JOIN dept_agreements a ON a.office_id = o.office_id WHERE o.id = ?`
  ).bind(s.officer_id).first();
  if (!usable(officer)) {
    await env.DB.prepare("UPDATE dept_sessions SET ended_at = ?, end_reason = 'ACCESS_ENDED' WHERE id_hash = ?").bind(new Date(now).toISOString(), s.id_hash).run();
    return { ok: false, status: 401, error: "SIGNED_OUT" };
  }
  if (now - Date.parse(s.last_seen_at) >= TOUCH_EVERY_MS) {
    await env.DB.prepare("UPDATE dept_sessions SET last_seen_at = ? WHERE id_hash = ?").bind(new Date(now).toISOString(), s.id_hash).run();
  }
  return { ok: true, officer, sessionHash: s.id_hash };
}

export async function endSession(request, env) {
  const token = readCookie(request, COOKIE);
  if (!token) return null;
  const h = await sha256Hex(token);
  const s = await env.DB.prepare("SELECT officer_id FROM dept_sessions WHERE id_hash = ? AND ended_at IS NULL").bind(h).first();
  await env.DB.prepare("UPDATE dept_sessions SET ended_at = ?, end_reason = 'SIGNED_OUT' WHERE id_hash = ? AND ended_at IS NULL").bind(new Date().toISOString(), h).run();
  return s ? s.officer_id : null;
}

// Ends every session of these officers (removed, or their office's agreement ended).
export async function endOfficerSessions(env, officerIds, reason) {
  if (!officerIds || !officerIds.length) return;
  await env.DB.prepare("UPDATE dept_sessions SET ended_at = ?, end_reason = ? WHERE ended_at IS NULL AND officer_id IN (SELECT value FROM json_each(?))")
    .bind(new Date().toISOString(), reason, JSON.stringify(officerIds)).run();
}

// The sign-in code email (both languages; the code and nothing about any case).
export function codeEmail(code, origin) {
  const host = String(origin || "https://grieviq.in").replace(/^https?:\/\//, "");
  return {
    subject: "GrievIQ sign-in code: " + code + " · साइन-इन कोड",
    html: `<p>Your code to sign in to the GrievIQ department dashboard:</p><h2 style="letter-spacing:4px">${code}</h2>` +
      `<p>It works once, for ${CODE_MINUTES} minutes, on ${host}/dept only. If you didn't ask for it, ignore this email. GrievIQ never asks for this code by phone.</p>` +
      `<hr><p>GrievIQ विभाग डैशबोर्ड में साइन इन करने के लिए आपका कोड:</p><h2 style="letter-spacing:4px">${code}</h2>` +
      `<p>यह केवल एक बार, ${CODE_MINUTES} मिनट तक, केवल ${host}/dept पर काम करेगा। यदि आपने यह नहीं माँगा, तो इस ईमेल को अनदेखा करें। GrievIQ कभी फ़ोन पर यह कोड नहीं माँगता।</p>`,
  };
}

export async function sendEmailNow(env, to, subject, html) {
  if (!env.RESEND_API_KEY) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.OTP_FROM_EMAIL || "onboarding@resend.dev", to: [to], subject, html }),
    });
    return r.ok;
  } catch (e) { return false; }
}
