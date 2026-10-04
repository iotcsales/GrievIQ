// POST /api/admin/import-ward-boundaries
//
// Imports ward polygon boundaries from a GeoJSON file (e.g. the Lucknow
// wards layer from bharatlas.com) and attaches them to matching rows in
// local_units, matched by ward name (case-insensitive).
//
// This endpoint only UPDATES existing local_units rows — it never creates
// new ones. A ward name in the GeoJSON with no matching local_units row
// is reported back as "unmatched," not an error; that's expected until
// every real ward has been entered via the jurisdiction CSV importer.
//
// IMPORTANT: this GeoJSON's CRS is CRS84, meaning each coordinate pair is
// [longitude, latitude] — NOT [latitude, longitude]. The point-in-polygon
// resolver must use the same order or every lookup will be wrong.
//
// Protected by Cloudflare Access, same as import-jurisdiction.js.

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
import { areasReady, getArea } from "../../_shared/areas.js";

// Areas: a boundary file is for one area (city or district), chosen on the
// page, and ward names are matched only within it -- so "Ward 1" in one
// city can never receive another city's shape.
//
// Ward maps from different sources name their columns differently; the
// ward name and number are read from the first of these that is present
// (any capitalisation).
const NAME_KEYS = ["ward name", "ward_name", "wardname", "ward", "name", "ward_name_en", "wardname_en"];
const NUM_KEYS = ["ward num", "ward_num", "ward_no", "wardno", "ward number", "ward_number", "number", "no"];
function pick(props, keys) {
  const lower = {};
  for (const k of Object.keys(props || {})) lower[k.toLowerCase().trim()] = props[k];
  for (const k of keys) if (lower[k] != null && String(lower[k]).trim() !== "") return lower[k];
  return null;
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "run_import");
  if (!auth.ok) {
  return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const ready = await areasReady(env);
  let area = null;
  if (ready) {
    area = body.areaId ? await getArea(env, body.areaId) : null;
    if (!area) return Response.json({ error: "Choose the area (city or district) this file is for.", fields: { areaId: "REQUIRED" } }, { status: 400 });
  }

  const geojsonText = body.geojson;
  if (!geojsonText || typeof geojsonText !== "string") {
    return Response.json({ error: "No GeoJSON content provided." }, { status: 400 });
  }

  let geojson;
  try {
    geojson = JSON.parse(geojsonText);
  } catch {
    return Response.json(
      { error: "Could not parse the file as JSON — is it a valid .geojson file?" },
      { status: 400 }
    );
  }

  const features = Array.isArray(geojson.features) ? geojson.features : null;
  if (!features || features.length === 0) {
    return Response.json({ error: "GeoJSON has no features." }, { status: 400 });
  }

  const matched = [];
  const unmatched = [];
  const errors = [];

  for (const feature of features) {
    try {
      const props = feature.properties || {};
      const wardName = String(pick(props, NAME_KEYS) || "").trim();
      const wardNumRaw = pick(props, NUM_KEYS);
      const wardNum = wardNumRaw == null || isNaN(Number(wardNumRaw)) ? null : Number(wardNumRaw);

      if (!wardName) {
        errors.push("A feature is missing a Ward Name — skipped.");
        continue;
      }

      const existing = await env.DB.prepare(
        `SELECT id FROM local_units WHERE LOWER(name) = LOWER(?)${area ? " AND area_id = ?" : ""}`
      )
        .bind(...[wardName].concat(area ? [area.id] : []))
        .first();

      if (!existing) {
        unmatched.push(wardName);
        continue;
      }

      const geometryJson = JSON.stringify(feature.geometry);

      await env.DB.prepare(
        `UPDATE local_units SET ward_boundary_geojson = ?, ward_num = ? WHERE id = ?`
      )
        .bind(geometryJson, wardNum ?? null, existing.id)
        .run();

      matched.push(wardName);
    } catch (featErr) {
      errors.push(`"${pick(feature && feature.properties, NAME_KEYS) || "unknown"}": ${featErr.message || "unknown error"}`);
    }
  }

    await env.DB.prepare(
    `INSERT INTO admin_events (id, actor_email, action, target, detail)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    auth.email,
    "import_ward_boundaries",
    area ? area.id : "local_units",
    JSON.stringify({
      area: area ? area.id : null,
      featuresInFile: features.length,
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
    })
  ).run();
  return Response.json({
    success: true,
    summary: {
      featuresInFile: features.length,
      matchedCount: matched.length,
      matched,
      unmatchedCount: unmatched.length,
      unmatchedSample: unmatched.slice(0, 15),
      errors,
    },
  });
}