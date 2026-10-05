// functions/_shared/geo.js
//
// Point-in-polygon for ward boundaries. Shared by /api/resolve-ward (which
// ward is this spot in?) and /api/grievances/submit (is the saved pin really
// inside the ward the complaint is filed for?), so both always agree.
//
// IMPORTANT: ward_boundary_geojson is stored in CRS84 order, meaning each
// coordinate pair is [longitude, latitude] -- NOT [lat, lng]. All
// comparisons use x = longitude, y = latitude to match that.
//
// Ray casting, applied per ring with an even-odd toggle so holes (interior
// rings) are handled correctly. Polygon and MultiPolygon are supported,
// since some wards are split into disconnected areas.

export function pointInRing(x, y, ring) {
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

export function pointInGeometry(x, y, geometry) {
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

// How far a point is from the nearest edge of a ward boundary, in metres
// (Oct 2026: so "outside the ward" can say by how much). Uses a flat
// projection around the point, accurate to well under 1% at ward scale.
// x = longitude, y = latitude, as above.
export function metresToBoundary(x, y, geometry) {
  if (!geometry) return null;
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  const R = 6371008.8, rad = Math.PI / 180;
  const kx = Math.cos(y * rad) * rad * R, ky = rad * R;      // metres per degree here
  let best = Infinity;
  for (const poly of polys) for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ax = (ring[j][0] - x) * kx, ay = (ring[j][1] - y) * ky;
      const bx = (ring[i][0] - x) * kx, by = (ring[i][1] - y) * ky;
      const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      const px = ax + t * dx, py = ay + t * dy;
      const d = Math.sqrt(px * px + py * py);
      if (d < best) best = d;
    }
  }
  return best === Infinity ? null : best;
}
