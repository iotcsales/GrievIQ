// functions/_shared/areas.js
//
// Areas: the cities and districts GrievIQ covers. Every ward or village
// belongs to one area (local_units.area_id). Citizens see an area's wards
// and villages only once the area is switched on ("live"), so a city that
// is still being set up never appears half-finished.
//
// Before the database update (helpers/part14-areas.sql) has been run there
// is no areas table: everything then behaves as before -- one city,
// Lucknow, live -- so pushing the code first can never break the site.

export const PILOT_AREA = { id: "lucknow", slug: "lucknow", name: "Lucknow", state: "Uttar Pradesh", kind: "CITY", live: 1 };

// The 28 states and 8 union territories, for the "State" list.
export const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
  "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

// Link names that are already GrievIQ pages or system paths, so an area
// can never take them (grieviq.in/<area>/<ward>).
export const RESERVED_SLUGS = new Set([
  "api", "admin", "rep", "about", "help", "privacy", "terms", "status", "submit", "feedback", "accessibility",
  "policies", "sitemap", "signed-out", "index", "cdn-cgi", "well-known", "assets", "static", "images", "img",
  "favicon", "icon", "manifest", "site", "i18n", "auth", "login", "logout", "www", "grieviq",
]);

export function areaSlug(name) {
  return String(name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}

export function isMissingSchema(e) {
  return /no such (table|column)/i.test(String(e && e.message));
}

// All areas (or live ones only), each with its counts. [] before the update
// means "not set up": callers use PILOT_AREA then.
export async function listAreas(env, opts) {
  const liveOnly = !!(opts && opts.liveOnly);
  try {
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.name, a.state, a.kind, a.slug, a.live, a.created_at, a.created_by, a.live_changed_at, a.live_changed_by,
              COUNT(lu.id) AS units,
              SUM(CASE WHEN lu.unit_type = 'URBAN' THEN 1 ELSE 0 END) AS urban,
              SUM(CASE WHEN lu.unit_type = 'RURAL' THEN 1 ELSE 0 END) AS rural,
              SUM(CASE WHEN COALESCE(TRIM(lu.rep_email), '') <> '' THEN 1 ELSE 0 END) AS with_email,
              SUM(CASE WHEN lu.ward_boundary_geojson IS NOT NULL THEN 1 ELSE 0 END) AS with_boundary
         FROM areas a LEFT JOIN local_units lu ON lu.area_id = a.id
        ${liveOnly ? "WHERE a.live = 1" : ""}
        GROUP BY a.id ORDER BY a.live DESC, a.name ASC`
    ).all();
    return (results || []).map((r) => ({
      id: r.id, name: r.name, state: r.state, kind: r.kind, slug: r.slug, live: !!r.live,
      createdAt: r.created_at, createdBy: r.created_by, liveChangedAt: r.live_changed_at, liveChangedBy: r.live_changed_by,
      units: Number(r.units) || 0, urban: Number(r.urban) || 0, rural: Number(r.rural) || 0,
      withEmail: Number(r.with_email) || 0, withBoundary: Number(r.with_boundary) || 0,
    }));
  } catch (e) {
    if (isMissingSchema(e)) return null;
    throw e;
  }
}

export async function getArea(env, idOrSlug) {
  const v = String(idOrSlug || "").trim().toLowerCase();
  if (!v || v.length > 60) return null;
  try {
    const r = await env.DB.prepare("SELECT id, name, state, kind, slug, live FROM areas WHERE id = ? OR slug = ?").bind(v, v).first();
    return r ? { id: r.id, name: r.name, state: r.state, kind: r.kind, slug: r.slug, live: !!r.live } : null;
  } catch (e) {
    if (isMissingSchema(e)) return v === PILOT_AREA.slug ? Object.assign({}, PILOT_AREA, { live: true }) : null;
    throw e;
  }
}

// SQL fragment limiting local_units (alias lu) to live areas, or "" before
// the update. Usage: `... FROM local_units lu ${await liveJoin(env)} WHERE ...`
let schemaReady = null;
export async function areasReady(env) {
  if (schemaReady === true) return true;
  try {
    await env.DB.prepare("SELECT area_id FROM local_units LIMIT 1").first();
    await env.DB.prepare("SELECT id FROM areas LIMIT 1").first();
    schemaReady = true;
    return true;
  } catch (e) {
    if (isMissingSchema(e)) return false;
    throw e;
  }
}
export async function liveJoin(env, alias) {
  const a = alias || "lu";
  return (await areasReady(env)) ? `JOIN areas ar ON ar.id = ${a}.area_id AND ar.live = 1` : "";
}
// For tests: forget the cached answer.
export function _resetAreasCache() { schemaReady = null; }
