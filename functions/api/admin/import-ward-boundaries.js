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
      const wardName = String(props["Ward Name"] || "").trim();
      const wardNum = props["Ward Num"];

      if (!wardName) {
        errors.push("A feature is missing a Ward Name — skipped.");
        continue;
      }

      const existing = await env.DB.prepare(
        `SELECT id FROM local_units WHERE LOWER(name) = LOWER(?)`
      )
        .bind(wardName)
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
      errors.push(`"${feature?.properties?.["Ward Name"] || "unknown"}": ${featErr.message || "unknown error"}`);
    }
  }

    await env.DB.prepare(
    `INSERT INTO admin_events (id, actor_email, action, target, detail)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    auth.email,
    "import_ward_boundaries",
    "local_units",
    JSON.stringify({
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