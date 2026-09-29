// functions/_shared/photo-links.js
//
// Private photos (item 7b): "after" photos are never at a public address.
// Pages get a short-lived signed link, /api/photo?p=<photo id>&e=<expiry>&s=<signature>,
// made with HMAC-SHA256 and the secret env.PHOTO_LINK_SECRET (set in the
// Cloudflare dashboard, never in the code). A copied link stops working
// after LINK_MINUTES. Only pages that have already checked who is looking
// (rep console, citizen after the email code, admin) hand out links.
//
// If the secret isn't set, no links are made (photos show as unavailable)
// rather than making unsigned ones.
//
// Item 7c: one link format for every private photo. The variant says which
// file, and is part of what is signed, so a link can't be edited to open a
// different one:
//   ""    "after" photo, full size   (resolution_photos; links made before 7c)
//   "t"   "after" photo, small preview
//   "c"   citizen's photo, full size (complaint_photos)
//   "ct"  citizen's photo, small preview

export const LINK_MINUTES = 15;

const enc = new TextEncoder();

export const VARIANTS = ["", "t", "c", "ct"];

// The imported key is reused while the worker stays warm (a page can need
// hundreds of links).
let cached = { secret: null, key: null };
async function key(secret) {
  if (cached.secret !== secret) {
    cached = { secret, key: await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]) };
  }
  return cached.key;
}

function message(photoId, variant, exp) {
  return variant ? photoId + "." + variant + "." + exp : photoId + "." + exp;
}

function b64url(buf) {
  let s = "";
  new Uint8Array(buf).forEach((x) => { s += String.fromCharCode(x); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s) {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function linksEnabled(env) {
  return !!(env && env.PHOTO_LINK_SECRET && String(env.PHOTO_LINK_SECRET).length >= 16);
}

// Signed path for one photo, or null when links are not set up.
export async function photoLink(env, photoId, nowMs, variant) {
  if (!linksEnabled(env)) return null;
  const v = VARIANTS.includes(variant || "") ? (variant || "") : "";
  const exp = Math.floor((nowMs || Date.now()) / 1000) + LINK_MINUTES * 60;
  const sig = await crypto.subtle.sign("HMAC", await key(env.PHOTO_LINK_SECRET), enc.encode(message(photoId, v, exp)));
  return "/api/photo?p=" + encodeURIComponent(photoId) + (v ? "&v=" + v : "") + "&e=" + exp + "&s=" + b64url(sig);
}

// "ok" | "expired" | "bad"
export async function checkLink(env, photoId, exp, sig, nowMs, variant) {
  const v = variant || "";
  if (!VARIANTS.includes(v)) return "bad";
  if (!linksEnabled(env) || !photoId || !/^\d{1,12}$/.test(String(exp || "")) || !sig) return "bad";
  let raw;
  try { raw = fromB64url(sig); } catch (e) { return "bad"; }
  // crypto.subtle.verify compares in constant time.
  const ok = await crypto.subtle.verify("HMAC", await key(env.PHOTO_LINK_SECRET), raw, enc.encode(message(photoId, v, exp)));
  if (!ok) return "bad";
  return Number(exp) * 1000 < (nowMs || Date.now()) ? "expired" : "ok";
}
