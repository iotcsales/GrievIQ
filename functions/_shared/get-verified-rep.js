/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
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

import { statusForMandates, officeKey, canAct } from "./subscriptions.js";
import { verifyAccessJwt } from "./verify-access-jwt.js";
import { sessionEmail } from "./rep-session.js";
import { teamMandates, ROLE } from "./team.js";
import { localTable, unitOf } from "./seats.js";

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

  let mandates = await lookupMandates(env, email);
  if (mandates.length === 0) {
    return { ok: false, status: 403, error: "NOT_PROVISIONED" };
  }
  // grieviq-46: an office whose plan is paused (or ended) is view only.
  // Changes (acknowledge, assign, forward, resolve, team...) are refused for
  // that office; reading, messages, the auditor, alerts and Billing still
  // work (opts.allowPaused). Citizens are never affected.
  const subs = await statusForMandates(env, mandates);
  mandates.forEach((m) => { m.sub = subs.get(officeKey("REP", m.tier, m.id)) || null; });
  mandates = mandates.filter((m) => !m.sub || m.sub.status !== "ENDED");
  if (!mandates.length) return { ok: false, status: 403, error: "OFFICE_ENDED" };
  const writing = !["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase());
  if (writing && !(opts && opts.allowPaused)) {
    const active = mandates.filter((m) => canAct(m.sub));
    if (!active.length) return { ok: false, status: 403, error: "OFFICE_PAUSED", mandates };
    return { ok: true, email, mandates: active, via, pausedOffices: mandates.filter((m) => !canAct(m.sub)) };
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
  // grieviq-57: every seat of a ward with several members is its own office.
  const lt = await localTable(env);
  const own = [
    env.DB.prepare(`SELECT * FROM ${lt} WHERE rep_email = ?`).bind(email),
    env.DB.prepare("SELECT * FROM municipal_bodies WHERE mayor_email = ?").bind(email),
    env.DB.prepare("SELECT * FROM mla_constituencies WHERE mla_email = ?").bind(email),
    env.DB.prepare("SELECT * FROM mp_constituencies WHERE mp_email = ?").bind(email),
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
    const multi = Number(row.seat_count) > 1;
    mandates.push({
      tier: "LOCAL",
      id: row.id,
      name: row.name,
      label: row.unit_type === "URBAN" ? "Corporator" : "Gram Pradhan",
      role: ROLE.REP, officeRepEmail: email, seat: row.seat_status || "ELECTED",
      unit: row.unit_id || unitOf(row.id), multi, seatLabel: multi ? (row.seat_label || "A") : null,
    });
  }
  for (const row of municipalBodies.results || []) {
    mandates.push({ tier: "MAYOR", id: row.id, name: row.name, label: "Mayor", role: ROLE.REP, officeRepEmail: email, seat: row.seat_status || "ELECTED" });
  }
  for (const row of mlaConstituencies.results || []) {
    mandates.push({ tier: "MLA", id: row.id, name: row.name, label: "MLA", role: ROLE.REP, officeRepEmail: email, seat: row.seat_status || "ELECTED" });
  }
  for (const row of mpConstituencies.results || []) {
    mandates.push({ tier: "MP", id: row.id, name: row.name, label: "MP", role: ROLE.REP, officeRepEmail: email, seat: row.seat_status || "ELECTED" });
  }

  // Team memberships come after the person's own offices (so their own
  // role wins where both apply), and never duplicate an office.
  for (const m of await teamMandates(env, email, teamRes.results || [])) {
    if (!mandates.some((x) => x.tier === m.tier && x.id === m.id)) mandates.push(m);
  }
  return mandates;
}
