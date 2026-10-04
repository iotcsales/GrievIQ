// functions/[area]/[slug].js
//
// Readable ward links: grieviq.in/<area>/<ward-name> (or /<area>/<ward-id>),
// e.g. grieviq.in/lucknow/hazratganj-ramtirth. <area> is a live area's link
// name (see _shared/areas.js); any other two-part address is not ours and
// passes straight through to the site's files.
// Serves the normal Home page (public/index.html), whose script already reads
// the link and shows the ward. Before sending it, the page head is adjusted
// so the link behaves properly when shared or searched (approved Sept 2026):
//   - known ward:   title, description and link preview (Open Graph, used by
//                   WhatsApp) name the ward -- names only, never phone/email,
//                   no counts (previews are cached for a long time);
//                   "canonical" tag gives each ward one address.
//   - id link for a ward that has a readable name: permanent redirect (301)
//                   to the readable link.
//   - two wards share the name: Home unchanged (it asks which one).
//   - unknown link: real "not found" (404) status, Home shows its
//                   "That ward link wasn't found" message, and search
//                   engines are told not to index it.
// Previews are in English: the server can't know a visitor's language (it
// is stored on their device); the page itself still switches to Hindi.
// If the database can't be reached, Home is served unchanged (it copes).

import { findWardBySlug, placeInfo } from "../_shared/place.js";
import { getArea } from "../_shared/areas.js";

function escAttr(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Replace the <title> and description, and add preview tags before </head>.
function adjustHead(html, { title, description, canonical, noindex }) {
  let out = html;
  if (title) {
    out = out.replace(/(<title\b[^>]*>)[\s\S]*?(<\/title>)/i, (m, a, b) => a + escAttr(title) + b);
  }
  if (description) {
    out = out.replace(/<meta\s+name=["']description["'][^>]*>/i,
      '<meta name="description" content="' + escAttr(description) + '">');
  }
  // The home page carries general link-preview tags; this ward's own
  // replace them (crawlers read the first of each).
  if (title && canonical) out = out.replace(/<meta\s+(?:property=["']og:[^"']*["']|name=["']twitter:[^"']*["'])[^>]*>\s*/gi, "");
  const tags = [];
  if (canonical) tags.push('<link rel="canonical" href="' + escAttr(canonical) + '">');
  if (title && canonical) {
    tags.push(
      '<meta property="og:type" content="website">',
      '<meta property="og:site_name" content="GrievIQ">',
      '<meta property="og:locale" content="en_IN">',
      '<meta property="og:title" content="' + escAttr(title) + '">',
      '<meta property="og:description" content="' + escAttr(description || "") + '">',
      '<meta property="og:url" content="' + escAttr(canonical) + '">',
      '<meta property="og:image" content="' + escAttr(new URL("/og-image.png", canonical).toString()) + '">',
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      '<meta name="twitter:card" content="summary_large_image">'
    );
  }
  if (noindex) tags.push('<meta name="robots" content="noindex">');
  if (tags.length) out = out.replace(/<\/head>/i, tags.join("\n") + "\n</head>");
  return out;
}

async function homeHtml(env, url) {
  const res = await env.ASSETS.fetch(new Request(new URL("/", url).toString()));
  return { html: await res.text(), type: res.headers.get("Content-Type") || "text/html; charset=utf-8" };
}

function page(html, type, status, method) {
  return new Response(method === "HEAD" ? null : html, {
    status,
    headers: {
      "Content-Type": type,
      // Representative names can change: always check for a fresh copy.
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method;
  if (method !== "GET" && method !== "HEAD") return context.next();
  const url = new URL(request.url);
  const part = String(params.slug || "");
  const areaPart = String(params.area || "").toLowerCase();

  // Not one of our live areas (a file, an unknown address): not ours.
  let area = null;
  try { area = /^[a-z0-9-]{1,40}$/.test(areaPart) ? await getArea(env, areaPart) : null; } catch (e) { area = null; }
  if (!area || !area.live || area.slug !== areaPart) return context.next();

  let found = null;
  let info = null;
  let lookupFailed = false;
  try {
    found = await findWardBySlug(env, part, area.slug);
    if (found && found.id) info = await placeInfo(env, found.id);
  } catch (e) {
    // Bad encoding in the link (e.g. a lone "%") is an unknown link;
    // anything else means the database couldn't be reached.
    if (e instanceof URIError) found = null; else lookupFailed = true;
  }

  // Old id link, or different capitals: send to the one readable address.
  if (info && info.slug && part !== info.slug) {
    return Response.redirect(new URL(info.link, url).toString(), 301);
  }

  const { html, type } = await homeHtml(env, url);

  if (lookupFailed || (found && found.ambiguous)) return page(html, type, 200, method);

  if (!info) {
    return page(adjustHead(html, { noindex: true }), type, 404, method);
  }

  const where = [info.name, info.municipalBody].filter(Boolean).join(", ");
  const title = "Report civic problems in " + info.name + ", " + info.city + " · GrievIQ";
  const description = "Report problems like water supply, garbage, roads or street lights in " + where +
    ". GrievIQ sends your complaint to the elected representative for this " +
    (info.type === "RURAL" ? "village" : "ward") + " and moves it up if it isn't dealt with in time.";
  const canonical = url.origin + info.link;
  return page(adjustHead(html, { title, description, canonical }), type, 200, method);
}
