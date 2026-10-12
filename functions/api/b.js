/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/b?h=<host>&p=<first path part>&k=c|s   (grieviq-45)
// A copy of GrievIQ running on another web address reports that address
// here (k=c: from a visitor's browser, once a day; k=s: from a copied
// server). Kept in copy_sightings for the admin page "Copies of GrievIQ".
// Only the address is kept: no IP address, no person, no citizen data.
// Answers 204 always (nothing to learn for whoever calls it).

const OWN = () => { const d = atob("Z3JpZXZpcS5pbg=="); return [d, "www." + d, atob("Z3JpZXZpcS5wYWdlcy5kZXY="), "localhost", "127.0.0.1"]; };
const HOST_RE = /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)*$/;
const MAX_HOSTS = 1000;
const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export function isOwnHost(h) {
  const own = OWN();
  return own.includes(h) || h.endsWith("." + own[2]);
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const host = String(u.searchParams.get("h") || "").toLowerCase().slice(0, 253);
  const path = String(u.searchParams.get("p") || "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
  const kind = u.searchParams.get("k") === "s" ? "server" : "browser";
  if (!HOST_RE.test(host) || isOwnHost(host)) return done();
  const country = String(request.headers.get("CF-IPCountry") || "").replace(/[^A-Z]/g, "").slice(0, 2) || null;
  const now = new Date().toISOString();
  try {
    const row = await env.DB.prepare("SELECT host, seen_by FROM copy_sightings WHERE host = ?").bind(host).first();
    if (row) {
      const by = row.seen_by.split(",").filter(Boolean); if (!by.includes(kind)) by.push(kind);
      await env.DB.prepare("UPDATE copy_sightings SET last_seen = ?, hits = hits + 1, last_path = ?, country = COALESCE(?, country), seen_by = ? WHERE host = ?")
        .bind(now, path || null, country, by.join(","), host).run();
    } else {
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM copy_sightings").first();
      if (n && n.n >= MAX_HOSTS) return done();
      await env.DB.prepare("INSERT INTO copy_sightings (host, first_seen, last_seen, hits, last_path, country, seen_by) VALUES (?, ?, ?, 1, ?, ?, ?)")
        .bind(host, now, now, path || null, country, kind).run();
    }
  } catch (e) { /* before part29, or a busy moment: nothing to do */ }
  return done();
}
