// functions/_shared/rep-session.js
//
// Sign-in sessions for the rep console (item 8a, "Sign in with Google").
//
// Standards followed:
//   - NIST SP 800-63B-4 (AAL2): signed out after 1 hour without activity
//     (IDLE_MINUTES) and 24 hours at most (ABSOLUTE_HOURS), whatever happens.
//   - OWASP Session Management Cheat Sheet: a long random session id (256
//     bits from the cryptographic generator) in a cookie that page scripts
//     can't read (HttpOnly), sent only over HTTPS (Secure), not sent on
//     cross-site form posts (SameSite=Lax), and locked to this site
//     (__Host- prefix, Path=/, no Domain). Only a SHA-256 of the id is
//     stored, so a copy of the database can't be used to sign in. Sessions
//     can be ended on the server (sign out; later: removing a team member).
//
// Every sign-in, sign-out and refused sign-in is recorded in
// rep_auth_events (NIST AU-2).

export const COOKIE = "__Host-giq_rep";
export const IDLE_MINUTES = 60;
export const ABSOLUTE_HOURS = 24;
const TOUCH_EVERY_MS = 5 * 60 * 1000; // record activity at most every 5 minutes

const enc = new TextEncoder();

export function randomToken(bytes) {
  const u = new Uint8Array(bytes || 32);
  crypto.getRandomValues(u);
  let s = "";
  u.forEach((x) => { s += String.fromCharCode(x); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function cookieHeader(name, value, maxAgeSeconds) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`;
}

export function clearCookieHeader(name) {
  return `${name}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function clientInfo(request) {
  return {
    ip: request.headers.get("CF-Connecting-IP") || null,
    ua: String(request.headers.get("User-Agent") || "").slice(0, 200) || null,
  };
}

export async function logAuthEvent(env, request, email, event, detail) {
  try {
    const c = clientInfo(request);
    await env.DB.prepare(
      "INSERT INTO rep_auth_events (id, email, event, detail, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), email || null, event, detail == null ? null : JSON.stringify(detail), c.ip, c.ua, new Date().toISOString()).run();
  } catch (e) {
    // Logging must never block signing in or out.
  }
}

// Creates a session; returns the Set-Cookie header value.
export async function createSession(env, request, email) {
  const token = randomToken(32);
  const now = Date.now();
  const c = clientInfo(request);
  await env.DB.prepare(
    `INSERT INTO rep_sessions (id_hash, email, created_at, last_seen_at, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(await sha256Hex(token), email, new Date(now).toISOString(), new Date(now).toISOString(),
    new Date(now + ABSOLUTE_HOURS * 3600000).toISOString(), c.ip, c.ua).run();
  return cookieHeader(COOKIE, token, ABSOLUTE_HOURS * 3600);
}

// The signed-in email for this request, or null. Ends the session if it
// has been idle too long or reached its absolute limit.
// opts.noTouch: a background check (the notification bell) that must not
// count as activity, so the 60-minute idle sign-out still happens.
export async function sessionEmail(request, env, opts) {
  const token = readCookie(request, COOKIE);
  if (!token || token.length < 20 || token.length > 100) return null;
  const idHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    "SELECT email, last_seen_at, expires_at, ended_at FROM rep_sessions WHERE id_hash = ?"
  ).bind(idHash).first();
  if (!row || row.ended_at) return null;
  const now = Date.now();
  const last = new Date(row.last_seen_at).getTime();
  const expired = now >= new Date(row.expires_at).getTime();
  const idle = now - last >= IDLE_MINUTES * 60000;
  if (expired || idle) {
    await env.DB.prepare("UPDATE rep_sessions SET ended_at = ?, end_reason = ? WHERE id_hash = ? AND ended_at IS NULL")
      .bind(new Date(now).toISOString(), expired ? "ABSOLUTE_TIMEOUT" : "IDLE_TIMEOUT", idHash).run();
    return null;
  }
  if (!(opts && opts.noTouch) && now - last >= TOUCH_EVERY_MS) {
    await env.DB.prepare("UPDATE rep_sessions SET last_seen_at = ? WHERE id_hash = ?").bind(new Date(now).toISOString(), idHash).run();
  }
  return String(row.email).toLowerCase();
}

// Ends this browser's session (sign out). Returns the email it belonged to.
export async function endSession(request, env, reason) {
  const token = readCookie(request, COOKIE);
  if (!token) return null;
  const idHash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT email FROM rep_sessions WHERE id_hash = ? AND ended_at IS NULL").bind(idHash).first();
  await env.DB.prepare("UPDATE rep_sessions SET ended_at = ?, end_reason = ? WHERE id_hash = ? AND ended_at IS NULL")
    .bind(new Date().toISOString(), reason || "SIGNED_OUT", idHash).run();
  return row ? row.email : null;
}

// Ends every session of one person (for removing a team member later).
export async function endAllSessions(env, email, reason) {
  await env.DB.prepare("UPDATE rep_sessions SET ended_at = ?, end_reason = ? WHERE LOWER(email) = ? AND ended_at IS NULL")
    .bind(new Date().toISOString(), reason || "ENDED_BY_ADMIN", String(email || "").toLowerCase()).run();
}

// Housekeeping: sign-in attempts and ended sessions are removed after 90
// days (the events log keeps the record). Never throws.
export async function tidySessions(env) {
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM oauth_states WHERE created_at < ?").bind(new Date(Date.now() - 3600000).toISOString()),
      env.DB.prepare("DELETE FROM rep_sessions WHERE expires_at < ?").bind(new Date(Date.now() - 90 * 86400000).toISOString()),
    ]);
  } catch (e) { /* ignore */ }
}
