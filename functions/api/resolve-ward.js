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
// Point-in-polygon uses the standard ray-casting algorithm, applied
// per ring with an even-odd toggle so holes (interior rings) are
// handled correctly. Both Polygon and MultiPolygon geometries are
// supported, since some wards may be split into disconnected areas.
//
// A point outside every known ward boundary is NOT an error — it's
// a normal, expected outcome (address just outside city limits, a
// gap between ward boundaries, etc). The caller (submit.html) is
// expected to fall back to the manual locality search in that case.
//
// Public endpoint — no Cloudflare Access check. Citizens are not
// logged in when they submit a grievance.

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInGeometry(x, y, geometry) {
  if (!geometry) return false;

  if (geometry.type === "Polygon") {
    let inside = false;
    for (const ring of geometry.coordinates) {
      if (pointInRing(x, y, ring)) inside = !inside;
    }
    return inside;
  }

  if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      let inside = false;
      for (const ring of polygon) {
        if (pointInRing(x, y, ring)) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }

  return false;
}

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
    `SELECT id, name, ward_boundary_geojson FROM local_units WHERE ward_boundary_geojson IS NOT NULL`
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
      });
    }
  }

  // No match is a normal outcome, not an error — the caller should
  // fall back to manual locality search.
  return Response.json({ matched: false });
}