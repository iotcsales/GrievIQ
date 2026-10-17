/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/gov.js   (grieviq-48)
//
// Groundwork for the government dashboard (part32-gov.sql):
//   - states and districts with their official LGD codes (Local Government
//     Directory, NIC), so every figure can be matched to the state's own
//     systems;
//   - issue types grouped under the ISO 37120:2018 city-service themes;
//   - government users (state and district officials), added by the super
//     admin only on a letter from the state, with a yearly review date;
//   - representatives' offices that chose to share their own figures.
//     Neutrality rule (approved 16 Oct 2026): the state sees government
//     departments in full; representatives' offices only as totals by
//     district, unless the office itself chooses to share.
// Before part32 is run every helper answers "not ready" and nothing breaks.

// ISO 37120:2018 themes (the 19 themes of the standard), in its order.
export const THEMES = [
  "ECONOMY", "EDUCATION", "ENERGY", "ENVIRONMENT", "FINANCE", "GOVERNANCE", "HEALTH", "HOUSING",
  "POPULATION", "RECREATION", "SAFETY", "SOLID_WASTE", "SPORT_CULTURE", "TELECOM", "TRANSPORT",
  "AGRICULTURE", "URBAN_PLANNING", "WASTEWATER", "WATER",
];

export const GOV_LEVELS = ["NATIONAL", "STATE", "DISTRICT"];   // NATIONAL: grieviq-51 (a Union ministry)
export const REVIEW_DAYS = 365;                     // access is reviewed every year (NIST AC-2(3))
export const LGD_RE = /^\d{1,6}$/;
export const NAME_RE = /^[\p{L}\p{M}0-9 .,'()&\/\-]{2,80}$/u;

function missing(e) { return /no such (table|column)/i.test(String(e && e.message)); }

let ready = null;
export async function govReady(env) {
  if (ready === true) return true;
  try {
    await env.DB.prepare("SELECT id FROM states LIMIT 1").first();
    await env.DB.prepare("SELECT id FROM gov_users LIMIT 1").first();
    await env.DB.prepare("SELECT district_id FROM areas LIMIT 1").first();
    ready = true;
    return true;
  } catch (e) {
    if (missing(e)) return false;
    throw e;
  }
}
export function _resetGovCache() { ready = null; }

// Official government email: ends in gov.in or nic.in (GIGW; the same
// domains the Government of India's own email service uses).
export function isOfficialEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[a-z0-9.-]+$/.test(e)) return false;
  const d = e.split("@")[1];
  return d === "gov.in" || d === "nic.in" || d.endsWith(".gov.in") || d.endsWith(".nic.in");
}

export function slug(text) {
  return String(text || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

export async function listStates(env) {
  const { results } = await env.DB.prepare("SELECT id, name_en, name_hi, lgd_code, kind, demo FROM states ORDER BY kind, name_en").all();
  return (results || []).map((r) => ({ id: r.id, nameEn: r.name_en, nameHi: r.name_hi, lgd: r.lgd_code, kind: r.kind, demo: !!r.demo }));
}
export async function listDistricts(env) {
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.state_id, d.name_en, d.name_hi, d.lgd_code, COUNT(a.id) AS areas
       FROM districts d LEFT JOIN areas a ON a.district_id = d.id
      GROUP BY d.id ORDER BY d.name_en`
  ).all();
  return (results || []).map((r) => ({ id: r.id, stateId: r.state_id, nameEn: r.name_en, nameHi: r.name_hi, lgd: r.lgd_code, areas: Number(r.areas) || 0 }));
}

// Whether a representative's office shares its own figures with the state.
export async function officeShare(env, tier, id) {
  try {
    const r = await env.DB.prepare("SELECT share, changed_at, changed_by FROM office_gov_share WHERE office_tier = ? AND office_id = ?").bind(tier, id).first();
    return { ready: true, on: !!(r && r.share), at: r ? r.changed_at : null, by: r ? r.changed_by : null };
  } catch (e) {
    if (missing(e)) return { ready: false, on: false, at: null, by: null };
    throw e;
  }
}
export async function setOfficeShare(env, tier, id, name, on, actor) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO office_gov_share (office_tier, office_id, office_name, share, changed_at, changed_by) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (office_tier, office_id) DO UPDATE SET office_name = excluded.office_name, share = excluded.share, changed_at = excluded.changed_at, changed_by = excluded.changed_by`
  ).bind(tier, id, name || null, on ? 1 : 0, now, actor).run();
  return now;
}

export function addDays(day, n) {
  return new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}
export function istToday() { return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); }
export function realDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ""))) return false;
  const t = Date.parse(d + "T00:00:00Z");
  return !isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
}
