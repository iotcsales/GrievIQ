// functions/_shared/contact-validation.js
//
// ONE set of rules for a representative's contact details (name, phone,
// email), used wherever they are saved: the admin Jurisdiction page's
// direct edits now, and data-entry operators' change requests (both when
// a request is made and again when it is approved).
//
// Rules (OWASP input validation: check format, length and type on the
// server, never trust the page):
//   - name:  up to 120 characters
//   - phone: an Indian number -- a 10-digit mobile starting 6-9, or any
//            number written with the trunk 0 (e.g. 0522 2234567) or +91;
//            spaces, dashes and brackets are ignored
//   - email: name@example.com form, up to 200 characters
// A field left empty means "no value on file" and is stored as null.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, maxLen) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  return v === "" ? null : v.slice(0, maxLen);
}

// input: { name, phone, email } -- any field may be missing (= not being set)
// returns { ok: true, values } with only the fields that were given, or
//         { ok: false, field, error }
export function validateContact(input) {
  const values = {};
  if (input.name !== undefined) {
    const name = clean(input.name, 200);
    if (name && name.length > 120) {
      return { ok: false, field: "name", error: "Keep the name to 120 characters or fewer." };
    }
    values.name = name;
  }
  if (input.phone !== undefined) {
    const phone = clean(input.phone, 60);
    if (phone) {
      const msg = "Enter a valid Indian phone number: a 10-digit mobile starting with 6, 7, 8 or 9 " +
        "(for example 9876543210), or a landline with its STD code (for example 0522 2234567).";
      if (!/^[+\d\s\-()]+$/.test(phone) || phone.length > 40) {
        return { ok: false, field: "phone", error: msg };
      }
      // Indian numbering plan: a mobile is 10 digits starting 6-9; any
      // number may be written with the trunk "0" or the country code "91".
      const digits = phone.replace(/\D/g, "");
      let ok = false;
      if (digits.length === 10) ok = /^[6-9]/.test(digits);                          // mobile
      else if (digits.length === 11 && digits[0] === "0") ok = /^[1-9]/.test(digits.slice(1));   // 0 + STD/mobile
      else if (digits.length === 12 && digits.startsWith("91")) ok = /^[1-9]/.test(digits.slice(2)); // +91 ...
      if (!ok) return { ok: false, field: "phone", error: msg };
    }
    values.phone = phone;
  }
  if (input.email !== undefined) {
    const email = clean(input.email, 400);
    if (email) {
      if (email.length > 200 || !EMAIL_RE.test(email)) {
        return { ok: false, field: "email", error: "Enter the email address in the format name@example.com." };
      }
    }
    values.email = email;
  }
  return { ok: true, values };
}

// ---------------------------------------------------------------------
// Email domain checks (approved Sept 2026)
// ---------------------------------------------------------------------
// 1. suggestEmail(): "Did you mean ...?" for near-misses of common email
//    providers (e.g. amit@gail.com -> amit@gmail.com). Only ever a
//    suggestion -- the page lets the person keep what they typed. The same
//    function is copied into the admin pages that collect emails.
// 2. emailDomainCanReceive(): asks DNS (Cloudflare's own DNS-over-HTTPS
//    service) whether the domain after @ can receive email: it needs mail
//    servers (MX), or at least an address (RFC 5321 implicit MX), and must
//    not have a "null MX" (RFC 7505: this domain accepts no email).
//    If the lookup itself fails or times out, the save is allowed -- a
//    network hiccup must never block work.

export const COMMON_EMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "yahoo.co.in", "yahoo.in", "ymail.com",
  "outlook.com", "hotmail.com", "live.com", "rediffmail.com", "icloud.com",
  "protonmail.com", "proton.me",
];

// Optimal string alignment distance (Damerau-Levenshtein with adjacent swaps).
function editDistance(a, b) {
  const d = [];
  for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
  for (let j = 0; j <= b.length; j++) { d[0][j] = j; }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

export function suggestEmail(email) {
  const at = String(email || "").lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || COMMON_EMAIL_DOMAINS.includes(domain)) return null;
  let best = null, bestDist = 99;
  for (const d of COMMON_EMAIL_DOMAINS) {
    const dist = editDistance(domain, d);
    const limit = d.length >= 9 ? 2 : 1;
    if (dist <= limit && dist < bestDist) { best = d; bestDist = dist; }
  }
  return best ? local + "@" + best : null;
}

async function dohQuery(name, type, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(
      "https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(name) + "&type=" + type,
      { headers: { accept: "application/dns-json" }, signal: ctrl.signal }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// returns { ok: true } or { ok: false, error }
export async function emailDomainCanReceive(email, timeoutMs = 3000) {
  const domain = String(email || "").split("@").pop().trim().toLowerCase();
  if (!domain) return { ok: true };
  const bad = { ok: false, error: "The email domain \"" + domain + "\" can't receive email. Check the part after @." };
  const mx = await dohQuery(domain, "MX", timeoutMs);
  if (!mx) return { ok: true };                       // lookup failed: don't block
  if (mx.Status === 3) return bad;                    // NXDOMAIN: domain doesn't exist
  if (mx.Status !== 0) return { ok: true };           // DNS trouble: don't block
  const mxRecords = (mx.Answer || []).filter((a) => a.type === 15);
  if (mxRecords.length) {
    const nullMx = mxRecords.every((a) => /^\s*0\s+\.?\s*$/.test(String(a.data)));
    return nullMx ? bad : { ok: true };
  }
  // No MX: mail can still go to the domain's own address (RFC 5321).
  const a = await dohQuery(domain, "A", timeoutMs);
  if (!a) return { ok: true };
  if ((a.Answer || []).some((r) => r.type === 1)) return { ok: true };
  const aaaa = await dohQuery(domain, "AAAA", timeoutMs);
  if (!aaaa) return { ok: true };
  if ((aaaa.Answer || []).some((r) => r.type === 28)) return { ok: true };
  return bad;
}
