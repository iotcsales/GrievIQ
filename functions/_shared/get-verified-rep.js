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
import { sessionEmail } from "./rep-session.js";
import { teamMandates, ROLE } from "./team.js";

// Item 8a (Sept 2026): who is signed in comes first from our own "Sign in
// with Google" session (_shared/rep-session.js). During the switch-over a
// Cloudflare Access login is still accepted, so nobody is locked out while
// the rep console is being moved off Access.

/**
 * @param {Request} request
 * @param {object} env - expects DB; ACCESS_TEAM_DOMAIN and ACCESS_AUD for the Access fallback
 * @returns {Promise<
 *   { ok: true, email: string, mandates: Array<{tier: string, id: string, name: string}>, via: "google" | "access" }
 *   | { ok: false, status: number, error: string }
 * >}
 */
export async function getVerifiedRep(request, env, opts) {
  let email = null, via = null;
  try {
    email = await sessionEmail(request, env, opts);
    if (email) via = "google";
  } catch (e) {
    email = null; // sessions table not there yet: fall back to Access
  }
  if (!email) {
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return { ok: false, status: 401, error: "SIGNED_OUT" };
    try {
      const payload = await verifyAccessJwt(token, {
        teamDomain: env.ACCESS_TEAM_DOMAIN,
        aud: env.ACCESS_AUD,
      });
      email = String(payload.email || "").toLowerCase();
      via = "access";
      if (!email) {
        return { ok: false, status: 401, error: "No email in Access token" };
      }
    } catch (err) {
      return { ok: false, status: 401, error: (err && err.message) || "Unauthorized" };
    }
  }

  const mandates = await lookupMandates(env, email);
  if (mandates.length === 0) {
    return { ok: false, status: 403, error: "NOT_PROVISIONED" };
  }
  return { ok: true, email, mandates, via };
}

// Which offices (ward, municipal body, MLA or MP constituency) list this
// email as their representative.
export async function lookupMandates(env, emailIn) {
  const email = String(emailIn || "").toLowerCase();
  const mandates = [];

  // One round trip for all the lookups (Sept 2026 speed-up). Item 8b: also
  // the offices where this person is on the representative's team.
  let teamRes = { results: [] };
  let localUnits, municipalBodies, mlaConstituencies, mpConstituencies;
  const own = [
    env.DB.prepare("SELECT id, name, unit_type FROM local_units WHERE rep_email = ?").bind(email),
    env.DB.prepare("SELECT id, name FROM municipal_bodies WHERE mayor_email = ?").bind(email),
    env.DB.prepare("SELECT id, name FROM mla_constituencies WHERE mla_email = ?").bind(email),
    env.DB.prepare("SELECT id, name FROM mp_constituencies WHERE mp_email = ?").bind(email),
  ];
  try {
    [localUnits, municipalBodies, mlaConstituencies, mpConstituencies, teamRes] = await env.DB.batch(own.concat([
      env.DB.prepare("SELECT * FROM office_team WHERE LOWER(member_email) = ? AND status = 'ACTIVE'").bind(email),
    ]));
  } catch (e) {
    // Team table not created yet: representatives only.
    [localUnits, municipalBodies, mlaConstituencies, mpConstituencies] = await env.DB.batch(own);
  }
  for (const row of localUnits.results || []) {
    mandates.push({
      tier: "LOCAL",
      id: row.id,
      name: row.name,
      label: row.unit_type === "URBAN" ? "Corporator" : "Gram Pradhan",
      role: ROLE.REP, officeRepEmail: email,
    });
  }
  for (const row of municipalBodies.results || []) {
    mandates.push({ tier: "MAYOR", id: row.id, name: row.name, label: "Mayor", role: ROLE.REP, officeRepEmail: email });
  }
  for (const row of mlaConstituencies.results || []) {
    mandates.push({ tier: "MLA", id: row.id, name: row.name, label: "MLA", role: ROLE.REP, officeRepEmail: email });
  }
  for (const row of mpConstituencies.results || []) {
    mandates.push({ tier: "MP", id: row.id, name: row.name, label: "MP", role: ROLE.REP, officeRepEmail: email });
  }

  // Team memberships come after the person's own offices (so their own
  // role wins where both apply), and never duplicate an office.
  for (const m of await teamMandates(env, email, teamRes.results || [])) {
    if (!mandates.some((x) => x.tier === m.tier && x.id === m.id)) mandates.push(m);
  }
  return mandates;
}
