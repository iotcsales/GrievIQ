// functions/_shared/get-verified-rep.js
//
// Verifies the caller's Cloudflare Access JWT, then looks up which
// jurisdiction tier(s) that email actually represents — by checking it
// against the rep_email / mayor_email / mla_email / mp_email columns
// across local_units, municipal_bodies, mla_constituencies, and
// mp_constituencies.
//
// Unlike GovernIQ's getVerifiedUser (which looks up a single role from
// one users table), a GrievIQ rep isn't assigned a role by an office
// admin — their authority comes from which real jurisdiction row lists
// their email. A person could in principle hold more than one mandate
// (rare, but not impossible — e.g. someone who is both a local rep and
// separately named as a test MLA in seed data), so this returns an array
// of mandates rather than assuming exactly one.

import { verifyAccessJwt } from "./verify-access-jwt.js";

/**
 * @param {Request} request
 * @param {object} env - expects ACCESS_TEAM_DOMAIN, ACCESS_AUD, DB
 * @returns {Promise<
 *   { ok: true, email: string, mandates: Array<{tier: string, id: string, name: string}> }
 *   | { ok: false, status: number, error: string }
 * >}
 */
export async function getVerifiedRep(request, env) {
  let email;
  try {
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    const payload = await verifyAccessJwt(token, {
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      aud: env.ACCESS_AUD,
    });
    email = String(payload.email || "").toLowerCase();
    if (!email) {
      return { ok: false, status: 401, error: "No email in Access token" };
    }
  } catch (err) {
    return { ok: false, status: 401, error: (err && err.message) || "Unauthorized" };
  }

  const mandates = [];

  const localUnits = await env.DB.prepare(
    "SELECT id, name, unit_type FROM local_units WHERE rep_email = ?"
  ).bind(email).all();
  for (const row of localUnits.results) {
    mandates.push({
      tier: "LOCAL",
      id: row.id,
      name: row.name,
      label: row.unit_type === "URBAN" ? "Corporator" : "Gram Pradhan",
    });
  }

  const municipalBodies = await env.DB.prepare(
    "SELECT id, name FROM municipal_bodies WHERE mayor_email = ?"
  ).bind(email).all();
  for (const row of municipalBodies.results) {
    mandates.push({ tier: "MAYOR", id: row.id, name: row.name, label: "Mayor" });
  }

  const mlaConstituencies = await env.DB.prepare(
    "SELECT id, name FROM mla_constituencies WHERE mla_email = ?"
  ).bind(email).all();
  for (const row of mlaConstituencies.results) {
    mandates.push({ tier: "MLA", id: row.id, name: row.name, label: "MLA" });
  }

  const mpConstituencies = await env.DB.prepare(
    "SELECT id, name FROM mp_constituencies WHERE mp_email = ?"
  ).bind(email).all();
  for (const row of mpConstituencies.results) {
    mandates.push({ tier: "MP", id: row.id, name: row.name, label: "MP" });
  }

  if (mandates.length === 0) {
    return { ok: false, status: 403, error: "NOT_PROVISIONED" };
  }

  return { ok: true, email, mandates };
}
