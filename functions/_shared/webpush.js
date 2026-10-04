// functions/_shared/webpush.js
//
// Phone and computer notifications ("web push") without any paid service.
//
// Standards:
//   - RFC 8030  Generic Event Delivery Using HTTP Push (the browser's push
//               service: Google for Chrome/Android, Apple for iPhone, Mozilla).
//   - RFC 8291  Message Encryption for Web Push (aes128gcm): the message is
//               encrypted for the one browser that subscribed, so the push
//               service carries it but can't read it.
//   - RFC 8292  VAPID: each request is signed with GrievIQ's own key pair
//               (env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY), so only
//               GrievIQ can send to its subscribers.
//
// Only the browser's built-in crypto (WebCrypto) is used.

const enc = new TextEncoder();

export function b64uToBytes(s) {
  const t = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64u(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

// A P-256 key from its raw public point (65 bytes) and, for a private key,
// its 32-byte secret d.
function jwkFrom(pubRaw, dRaw) {
  const jwk = { kty: "EC", crv: "P-256", x: bytesToB64u(pubRaw.slice(1, 33)), y: bytesToB64u(pubRaw.slice(33, 65)), ext: true };
  if (dRaw) jwk.d = bytesToB64u(dRaw);
  return jwk;
}

// RFC 8291 section 3-4: encrypts `plaintext` (bytes) for one subscription.
// opts.asPrivate / opts.asPublic / opts.salt are only for the RFC's test
// example; normally a fresh key pair and salt are made for every message.
export async function encryptPayload(plaintext, p256dh, authSecret, opts) {
  const o = opts || {};
  const uaPublic = typeof p256dh === "string" ? b64uToBytes(p256dh) : p256dh;
  const auth = typeof authSecret === "string" ? b64uToBytes(authSecret) : authSecret;
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || auth.length < 16) throw new Error("BAD_SUBSCRIPTION_KEYS");
  let asPrivateKey, asPublic;
  if (o.asPrivate && o.asPublic) {
    asPublic = b64uToBytes(o.asPublic);
    asPrivateKey = await crypto.subtle.importKey("jwk", jwkFrom(asPublic, b64uToBytes(o.asPrivate)), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  } else {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    asPrivateKey = pair.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  }
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPrivateKey, 256));
  const ikm = await hkdf(auth, ecdh, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = o.salt ? b64uToBytes(o.salt) : crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // One record: the message, then the 0x02 "last record" delimiter.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));
  const rs = 4096;
  const header = concat(salt, new Uint8Array([(rs >>> 24) & 255, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255, asPublic.length]), asPublic);
  return concat(header, cipher);
}

// RFC 8292: the signed token for one push service (its origin).
export async function vapidHeader(endpoint, env, nowSec) {
  const pub = b64uToBytes(env.VAPID_PUBLIC_KEY);
  const d = b64uToBytes(env.VAPID_PRIVATE_KEY);
  const key = await crypto.subtle.importKey("jwk", jwkFrom(pub, d), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const now = nowSec || Math.floor(Date.now() / 1000);
  const head = bytesToB64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = bytesToB64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: now + 12 * 3600, sub: env.VAPID_SUBJECT || "mailto:support@grieviq.in" })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head + "." + body)));
  return "vapid t=" + head + "." + body + "." + bytesToB64u(sig) + ", k=" + env.VAPID_PUBLIC_KEY;
}

export function pushConfigured(env) {
  return !!(env && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

// Sends one message. Returns { ok, gone, status }: `gone` means the browser
// has unsubscribed (404/410) and the subscription should be removed.
export async function sendPush(env, sub, message, opts) {
  if (!pushConfigured(env)) return { ok: false, gone: false, status: 0, error: "NOT_CONFIGURED" };
  try {
    const endpoint = String(sub.endpoint || "");
    if (!/^https:\/\//.test(endpoint)) return { ok: false, gone: true, status: 0, error: "BAD_ENDPOINT" };
    const body = await encryptPayload(enc.encode(JSON.stringify(message)), sub.p256dh, sub.auth);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidHeader(endpoint, env),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String((opts && opts.ttl) || 86400),
        Urgency: (opts && opts.urgency) || "normal",
        ...(message && message.tag ? { Topic: String(message.tag).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) } : {}),
      },
      body,
    });
    return { ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410, status: res.status };
  } catch (e) {
    return { ok: false, gone: false, status: 0, error: String((e && e.message) || e).slice(0, 120) };
  }
}
