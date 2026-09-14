// POST /api/admin/import-jurisdiction
//
// Bulk-imports jurisdiction data (MP constituencies, MLA constituencies,
// municipal bodies, local units) from a CSV, one row per ward/village.
// Parent records (MP, MLA, municipal body) that repeat across many rows
// are only created once, matched by name — re-running the same CSV updates
// existing rows rather than duplicating them.
//
// Protected by Cloudflare Access: requires a valid Access JWT (same
// mechanism as the rep dashboard). Anyone not logged in via Access gets
// rejected before any database work happens.

import { verifyAccessJwt } from "../../_shared/verify-access-jwt.js";

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Minimal CSV parser: handles quoted fields (with embedded commas and
// escaped "" quotes), \n and \r\n line endings. Good enough for the
// spreadsheet-exported CSVs this endpoint expects.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function clean(value) {
  const v = (value || "").trim();
  return v === "" ? null : v;
}

async function findOrCreateByName(env, table, name, extraFieldsOnCreate, extraFieldsOnUpdate) {
  const existing = await env.DB.prepare(
    `SELECT id FROM ${table} WHERE LOWER(name) = LOWER(?)`
  )
    .bind(name)
    .first();

  if (existing) {
    // Update any provided fields on the existing row (non-null values only).
    const updateKeys = Object.keys(extraFieldsOnUpdate).filter(
      (k) => extraFieldsOnUpdate[k] !== null && extraFieldsOnUpdate[k] !== undefined
    );
    if (updateKeys.length > 0) {
      const setClause = updateKeys.map((k) => `${k} = ?`).join(", ");
      await env.DB.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`)
        .bind(...updateKeys.map((k) => extraFieldsOnUpdate[k]), existing.id)
        .run();
    }
    return { id: existing.id, created: false };
  }

  const id = `${table.replace(/s$/, "")}-${slugify(name)}`;
  const keys = ["id", "name", ...Object.keys(extraFieldsOnCreate)];
  const values = [id, name, ...Object.values(extraFieldsOnCreate)];
  const placeholders = keys.map(() => "?").join(", ");
  await env.DB.prepare(
    `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`
  )
    .bind(...values)
    .run();

  return { id, created: true };
}

export async function onRequestPost({ request, env }) {
  try {
    const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
    await verifyAccessJwt(jwt, {
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      aud: env.ACCESS_AUD,
    });
  } catch (err) {
    return Response.json({ error: "Not authorized." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const csvText = body.csv;
  if (!csvText || typeof csvText !== "string") {
    return Response.json({ error: "No CSV content provided." }, { status: 400 });
  }

  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return Response.json({ error: "CSV has no data rows." }, { status: 400 });
  }

  const header = rows[0].map((h) => h.trim());
  const required = [
    "mp_constituency_name",
    "mla_constituency_name",
    "local_unit_name",
    "unit_type",
  ];
  const missing = required.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    return Response.json(
      { error: `CSV is missing required column(s): ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const colIndex = {};
  header.forEach((col, i) => (colIndex[col] = i));
  const get = (row, col) => (colIndex[col] !== undefined ? clean(row[colIndex[col]]) : null);

  const summary = {
    rowsProcessed: 0,
    mpCreated: 0,
    mlaCreated: 0,
    municipalBodyCreated: 0,
    localUnitsCreated: 0,
    localUnitsUpdated: 0,
    errors: [],
  };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNum = r + 1; // 1-indexed, matches what a person sees in a spreadsheet

    try {
      const mpName = get(row, "mp_constituency_name");
      const mlaName = get(row, "mla_constituency_name");
      const localUnitName = get(row, "local_unit_name");
      const unitType = (get(row, "unit_type") || "").toUpperCase();

      if (!mpName || !mlaName || !localUnitName) {
        summary.errors.push(`Row ${rowNum}: missing MP, MLA, or local unit name — skipped.`);
        continue;
      }
      if (unitType !== "RURAL" && unitType !== "URBAN") {
        summary.errors.push(`Row ${rowNum}: unit_type must be RURAL or URBAN, got "${unitType}" — skipped.`);
        continue;
      }

      // --- MP constituency ---
      const mp = await findOrCreateByName(
        env,
        "mp_constituencies",
        mpName,
        { mp_name: get(row, "mp_name"), mp_phone: get(row, "mp_phone"), mp_email: get(row, "mp_email") },
        { mp_name: get(row, "mp_name"), mp_phone: get(row, "mp_phone"), mp_email: get(row, "mp_email") }
      );
      if (mp.created) summary.mpCreated++;

      // --- MLA constituency ---
      const mla = await findOrCreateByName(
        env,
        "mla_constituencies",
        mlaName,
        {
          mp_constituency_id: mp.id,
          mla_name: get(row, "mla_name"),
          mla_phone: get(row, "mla_phone"),
          mla_email: get(row, "mla_email"),
        },
        {
          mla_name: get(row, "mla_name"),
          mla_phone: get(row, "mla_phone"),
          mla_email: get(row, "mla_email"),
        }
      );
      if (mla.created) summary.mlaCreated++;

      // --- Municipal body (optional — only for URBAN areas with a Mayor structure) ---
      let municipalBodyId = null;
      const municipalBodyName = get(row, "municipal_body_name");
      if (municipalBodyName) {
        const hasMayorRaw = (get(row, "has_mayor") || "N").toUpperCase();
        const hasMayor = hasMayorRaw === "Y" || hasMayorRaw === "YES" || hasMayorRaw === "1" ? 1 : 0;
        const mb = await findOrCreateByName(
          env,
          "municipal_bodies",
          municipalBodyName,
          {
            mla_constituency_id: mla.id,
            has_mayor: hasMayor,
            mayor_name: get(row, "mayor_name"),
            mayor_phone: get(row, "mayor_phone"),
            mayor_email: get(row, "mayor_email"),
          },
          {
            has_mayor: hasMayor,
            mayor_name: get(row, "mayor_name"),
            mayor_phone: get(row, "mayor_phone"),
            mayor_email: get(row, "mayor_email"),
          }
        );
        municipalBodyId = mb.id;
        if (mb.created) summary.municipalBodyCreated++;
      }

      // --- Local unit (ward/village) ---
      // Matched by name + MLA constituency, since ward names/numbers can
      // repeat across different cities/constituencies.
      const existingUnit = await env.DB.prepare(
        `SELECT id FROM local_units WHERE LOWER(name) = LOWER(?) AND mla_constituency_id = ?`
      )
        .bind(localUnitName, mla.id)
        .first();

      const repName = get(row, "rep_name");
      const repPhone = get(row, "rep_phone");
      const repEmail = get(row, "rep_email");
      const localities = get(row, "localities");

      if (existingUnit) {
        await env.DB.prepare(
          `UPDATE local_units
             SET unit_type = ?, municipal_body_id = ?, rep_name = COALESCE(?, rep_name),
                 rep_phone = COALESCE(?, rep_phone), rep_email = COALESCE(?, rep_email),
                 localities = COALESCE(?, localities)
           WHERE id = ?`
        )
          .bind(unitType, municipalBodyId, repName, repPhone, repEmail, localities, existingUnit.id)
          .run();
        summary.localUnitsUpdated++;
      } else {
        const id = `lu-${slugify(localUnitName)}-${slugify(mlaName)}`;
        await env.DB.prepare(
          `INSERT INTO local_units
             (id, name, unit_type, mla_constituency_id, municipal_body_id, rep_name, rep_phone, rep_email, localities)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(id, localUnitName, unitType, mla.id, municipalBodyId, repName, repPhone, repEmail, localities)
          .run();
        summary.localUnitsCreated++;
      }

      summary.rowsProcessed++;
    } catch (rowErr) {
      summary.errors.push(`Row ${rowNum}: ${rowErr.message || "unknown error"} — skipped.`);
    }
  }

  return Response.json({ success: true, summary });
}
