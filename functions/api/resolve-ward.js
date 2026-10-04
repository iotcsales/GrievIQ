// POST /api/resolve-ward
//
// Given a citizen's { lat, lng }, determines which ward's polygon
// contains that point and returns its local_unit_id. Used by the
// citizen intake form after Google Places Autocomplete returns
// coordinates for the address they picked.
//
// IMPORTANT: ward_boundary_geojson is stored in CRS84 order, meaning
// each coordinate pair is [longitude, latitude] — NOT [lat, lng]. All
// comparisons below use x = longitude, y = latitude to match that.
//
// Point-in-polygon lives in functions/_shared/geo.js (ray casting, holes
// and MultiPolygon supported), shared with submit.js's pin check.
//
// A point outside every known ward boundary is NOT an error — it's
// a normal, expected outcome (address just outside city limits, a
// gap between ward boundaries, etc). The caller (submit.html) is
// expected to fall back to the manual locality search in that case.
//
// Public endpoint — no Cloudflare Access check. Citizens are not
// logged in when they submit a grievance.

import { pointInGeometry } from "../_shared/geo.js";
import { liveJoin } from "../_shared/areas.js";

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "lat and lng must be numbers." }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return Response.json({ error: "lat/lng out of valid range." }, { status: 400 });
  }

  const rows = await env.DB.prepare(
    // Only wards in areas that are live (switched on for citizens).
    `SELECT lu.id, lu.name, lu.localities, lu.rep_email, lu.ward_boundary_geojson FROM local_units lu ${await liveJoin(env)} WHERE lu.ward_boundary_geojson IS NOT NULL`
  ).all();

  for (const row of rows.results || []) {
    let geometry;
    try {
      geometry = JSON.parse(row.ward_boundary_geojson);
    } catch {
      continue; // corrupt row — skip rather than fail the whole lookup
    }

    if (pointInGeometry(lng, lat, geometry)) {
      return Response.json({
        matched: true,
        local_unit_id: row.id,
        local_unit_name: row.name,
        localities: row.localities || null,
        // A ward can be known (boundary on file) before it can take
        // complaints: that needs a ward representative email on file.
        open_for_filing: row.rep_email != null && String(row.rep_email).trim() !== "",
      });
    }
  }

  // No match is a normal outcome, not an error — the caller should
  // fall back to manual locality search.
  return Response.json({ matched: false });
}