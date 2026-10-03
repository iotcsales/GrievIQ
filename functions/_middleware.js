// functions/_middleware.js
//
// Readiness review, gap 6: security headers on every response, pages and
// API alike (Cloudflare's _headers file does not reach Functions responses,
// so this is the one place they are set). Follows the GIGW 3.0 security
// chapter / OWASP secure headers guidance.
//
// A response that already sets one of these (for example the photo
// endpoint's stricter sandbox CSP) keeps its own value.
//
// Two content security policies:
//  - STRICT, for every page and response that doesn't show a map: only
//    GrievIQ itself, plus Google Fonts for the citizen pages' typefaces.
//  - MAPS, only for the pages that show a Google map (home, the
//    complaint form, the representatives' console, the admin visitor map): Google's own published
//    allowlist for the Maps JavaScript API, including the 'unsafe-eval' it
//    requires (developers.google.com/maps/documentation/javascript/content-security-policy),
//    plus cdnjs for the console's PDF export.
// Scripts and styles written inside the pages still need 'unsafe-inline';
// moving them to files is a later hardening step.
const COMMON = ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "upgrade-insecure-requests"];
export const CSP_STRICT = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
].concat(COMMON).join("; ");
export const CSP_MAPS = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.ggpht.com https://*.googleusercontent.com blob: https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com",
  "connect-src 'self' https://*.googleapis.com https://*.google.com https://*.gstatic.com data: blob:",
  "frame-src https://*.google.com",
  "worker-src 'self' blob:",
].concat(COMMON).join("; ");
// Kept for anything that imported the old name.
export const CSP = CSP_STRICT;
const MAP_PAGES = /^\/(index(\.html)?|submit(\.html)?|rep(\.html)?|admin-visitors(\.html)?)?$/;
export function cspFor(pathname) { return MAP_PAGES.test(pathname || "/") ? CSP_MAPS : CSP_STRICT; }

export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Location only for GrievIQ's own pages (pin "use my location", proof
  // photos); microphone only for GrievIQ's own pages (speaking a complaint
  // instead of typing it, asked for only when the citizen taps the button).
  // Camera and the rest are not used: taking a photo through the file
  // picker needs no camera permission.
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=(self), payment=(), usb=(), serial=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export function withSecurityHeaders(res, pathname) {
  const headers = new Headers(res.headers);
  if (!headers.has("Content-Security-Policy")) headers.set("Content-Security-Policy", cspFor(pathname));
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export async function onRequest(context) {
  const res = await context.next();
  // Responses that must pass through untouched (e.g. protocol upgrades).
  if (res.status === 101 || res.webSocket) return res;
  return withSecurityHeaders(res, new URL(context.request.url).pathname);
}
