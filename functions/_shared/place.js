// functions/_shared/place.js
//
// Public information about ONE ward/village, for the citizen Home page's
// "Where is the problem?" card and for ward links (grieviq.in/<area>/<ward>,
// e.g. grieviq.in/lucknow/hazratganj-ramtirth).
//
// Returns only what is public and useful before filing:
//   - the ward's name, type, municipal body, city
//   - whether it can take complaints yet (a ward representative email is on file)
//   - WHO handles complaints here: each level's label and NAME only.
//     Phone numbers and emails are never returned (approved Sept 2026).
//   - a 30-day snapshot: complaints filed and resolved -- counts only.

import { resolveChain } from "./jurisdiction.js";
import { settleOverdueConfirmations } from "./confirmation.js";
import { PILOT_AREA, areasReady } from "./areas.js";

// Kept for anything that imported the old name.
export const PILOT_CITY = PILOT_AREA;

// The area (city or district) a ward belongs to; PILOT_AREA before the
// areas update. Areas not yet live are not public: null.
async function areaOf(env, localUnitId) {
  if (!(await areasReady(env))) return PILOT_AREA;
  const a = await env.DB.prepare(
    "SELECT a.id, a.name, a.state, a.kind, a.slug, a.live FROM local_units lu JOIN areas a ON a.id = lu.area_id WHERE lu.id = ?"
  ).bind(localUnitId).first();
  return a && a.live ? a : null;
}

// Readable ward link part, e.g. "Hazratganj - Ramtirth" -> "hazratganj-ramtirth".
// Names in Devanagari give an empty slug; those wards use their id instead.
export function wardSlug(name) {
  return String(name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function has(v) { return v != null && String(v).trim() !== ""; }

export async function placeInfo(env, localUnitId) {
  const chain = await resolveChain(env, localUnitId);
  if (!chain) return null;
  const lu = chain.localUnit;
  const area = await areaOf(env, lu.id);
  if (!area) return null;
  // Close any case whose confirmation time has run out, so the 30-day
  // "resolved" count includes it (item 7a).
  await settleOverdueConfirmations(env);

  const counts = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS filed,
       SUM(CASE WHEN status IN ('RESOLVED', 'CLOSED') AND resolved_at IS NOT NULL
                 AND REPLACE(REPLACE(resolved_at, 'T', ' '), 'Z', '') >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS resolved
     FROM grievances WHERE local_unit_id = ?`
  ).bind(lu.id).first();

  // Use the readable name in the link only if no other ward in the same
  // area shares it.
  let slug = wardSlug(lu.name);
  if (slug) {
    const ready = await areasReady(env);
    const { results: all } = ready
      ? await env.DB.prepare("SELECT id, name FROM local_units WHERE area_id = ?").bind(area.id).all()
      : await env.DB.prepare("SELECT id, name FROM local_units").all();
    if ((all || []).some((r) => r.id !== lu.id && wardSlug(r.name) === slug)) slug = "";
  }
  return {
    id: lu.id,
    name: lu.name,
    type: lu.unit_type,                                   // URBAN / RURAL
    slug: slug || null,
    link: "/" + area.slug + "/" + (slug || encodeURIComponent(lu.id)),
    areaSlug: area.slug,
    city: area.name,
    state: area.state,
    block: lu.block || null,
    municipalBody: chain.municipalBody ? chain.municipalBody.name : null,
    mlaConstituency: chain.mla ? chain.mla.name : null,
    mpConstituency: chain.mp ? chain.mp.name : null,
    localities: lu.localities || null,
    openForFiling: has(lu.rep_email),
    // Names only -- never phone or email.
    levels: chain.tiers.map((t) => ({ tier: t.tier, label: t.label, name: has(t.name) ? String(t.name).trim() : null })),
    last30Days: { filed: (counts && counts.filed) || 0, resolved: (counts && counts.resolved) || 0 },
  };
}

// Finds a ward from a link part: its readable slug, or its id, within one
// live area (areaSlug; any live area if not given).
// Returns { id } or { ambiguous: [{id,name}] } or null.
export async function findWardBySlug(env, part, areaSlugPart) {
  const p = String(part || "").trim().toLowerCase();
  if (!p) return null;
  const ready = await areasReady(env);
  const a = String(areaSlugPart || "").trim().toLowerCase();
  const scope = ready ? " JOIN areas ar ON ar.id = lu.area_id AND ar.live = 1" + (a ? " AND ar.slug = ?" : "") : "";
  const scopeBinds = ready && a ? [a] : [];
  if (!ready && a && a !== PILOT_AREA.slug) return null;
  const byId = await env.DB.prepare("SELECT lu.id FROM local_units lu" + scope + " WHERE lu.id = ?").bind(...scopeBinds, decodeURIComponent(p)).first();
  if (byId) return { id: byId.id };
  const { results } = await env.DB.prepare(
    `SELECT lu.id, lu.name, lu.unit_type, mla.name AS mla_name
     FROM local_units lu LEFT JOIN mla_constituencies mla ON mla.id = lu.mla_constituency_id` + scope
  ).bind(...scopeBinds).all();
  const hits = (results || []).filter((r) => wardSlug(r.name) === p);
  if (hits.length === 1) return { id: hits[0].id };
  // Same name in more than one place: let the person choose, with enough
  // detail (type and assembly constituency) to tell them apart.
  if (hits.length > 1) return { ambiguous: hits.map((h) => ({ id: h.id, name: h.name, type: h.unit_type, mla: h.mla_name || null, detail: [h.unit_type === "RURAL" ? "Rural" : "Urban", h.mla_name].filter(Boolean).join(", ") })) };
  return null;
}
