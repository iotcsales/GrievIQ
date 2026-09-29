// functions/_shared/google-oidc.js
//
// "Sign in with Google" (item 8a) using OpenID Connect, authorization code
// flow, as recommended by the OAuth 2.0 Security Best Current Practice
// (RFC 9700) and Google's own guide:
//   - PKCE (S256) on every sign-in, plus the client secret, server side;
//   - a one-time "state" tied to this browser by a short-lived cookie
//     (stops sign-in forgery / login CSRF);
//   - a one-time "nonce" that must come back inside Google's ID token
//     (stops a token being replayed);
//   - the ID token is checked here, not trusted: RS256 signature against
//     Google's published keys, issuer, audience (our client id), expiry,
//     issued-at, nonce, and that Google has verified the email address.
// Only openid, email and profile are asked for; nothing else is read.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
export const STATE_COOKIE = "__Host-giq_oauth";
export const STATE_MINUTES = 10;
const CLOCK_SKEW_S = 300;

const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  new Uint8Array(bytes).forEach((x) => { s += String.fromCharCode(x); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s) {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function randomString(bytes) {
  const u = new Uint8Array(bytes || 32);
  crypto.getRandomValues(u);
  return b64url(u);
}
export async function pkceChallenge(verifier) {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(verifier)));
}

export function configured(env) {
  return !!(env && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(request) {
  return new URL(request.url).origin + "/api/auth/google/callback";
}

export function authorizeUrl(env, request, { state, nonce, challenge }) {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return AUTH_URL + "?" + p.toString();
}

// Exchanges the code for tokens. Returns the raw ID token.
export async function exchangeCode(env, request, code, verifier) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id_token) throw new Error("TOKEN_EXCHANGE_FAILED");
  return data.id_token;
}

let certCache = { keys: null, at: 0, ttl: 0 };
async function googleKeys(force) {
  const now = Date.now();
  if (!force && certCache.keys && now - certCache.at < certCache.ttl) return certCache.keys;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error("CERTS_UNAVAILABLE");
  const data = await res.json();
  const m = /max-age=(\d+)/.exec(res.headers.get("Cache-Control") || "");
  certCache = { keys: data.keys || [], at: now, ttl: Math.min(m ? Number(m[1]) * 1000 : 3600000, 6 * 3600000) };
  return certCache.keys;
}

// Checks Google's ID token. Returns { email, name, sub } or throws with a
// short reason code.
export async function verifyIdToken(env, idToken, expectedNonce, nowMs) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("MALFORMED");
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  } catch (e) { throw new Error("MALFORMED"); }
  if (header.alg !== "RS256" || !header.kid) throw new Error("BAD_ALG");

  let keys = await googleKeys(false);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) { keys = await googleKeys(true); jwk = keys.find((k) => k.kid === header.kid); }
  if (!jwk) throw new Error("UNKNOWN_KEY");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(parts[2]), enc.encode(parts[0] + "." + parts[1]));
  if (!ok) throw new Error("BAD_SIGNATURE");

  const now = Math.floor((nowMs || Date.now()) / 1000);
  if (!ISSUERS.includes(payload.iss)) throw new Error("BAD_ISSUER");
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.GOOGLE_CLIENT_ID)) throw new Error("BAD_AUDIENCE");
  if (aud.length > 1 && payload.azp !== env.GOOGLE_CLIENT_ID) throw new Error("BAD_AUDIENCE");
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_S < now) throw new Error("EXPIRED");
  if (typeof payload.iat !== "number" || payload.iat - CLOCK_SKEW_S > now) throw new Error("BAD_IAT");
  if (!expectedNonce || payload.nonce !== expectedNonce) throw new Error("BAD_NONCE");
  if (payload.email_verified !== true && payload.email_verified !== "true") throw new Error("EMAIL_NOT_VERIFIED");
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email) throw new Error("NO_EMAIL");
  return { email, name: String(payload.name || "").slice(0, 120), sub: String(payload.sub || "") };
}

// For tests only.
export function _resetKeyCache() { certCache = { keys: null, at: 0, ttl: 0 }; }
