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

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
import { validateContact } from "../../_shared/contact-validation.js";
import { areasReady, getArea } from "../../_shared/areas.js";

// Areas (cities and districts): every file is imported INTO one area,
// chosen on the page (areaId), so its wards and villages are matched and
// created there. dryRun: true only checks the file and says what would
// happen -- nothing is saved -- so the page can show a preview first.

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

// Problems with one row that mean it is skipped (null = fine).
function rowProblem(get, row) {
  const mpName = get(row, "mp_constituency_name");
  const mlaName = get(row, "mla_constituency_name");
  const unitName = get(row, "local_unit_name");
  const unitType = (get(row, "unit_type") || "").toUpperCase();
  if (!mpName || !mlaName || !unitName) return "missing MP constituency, MLA constituency, or ward/village name";
  if (unitType !== "RURAL" && unitType !== "URBAN") return `unit_type must be RURAL or URBAN, got "${unitType}"`;
  for (const [who, n, ph, em] of [["MP", "mp_name", "mp_phone", "mp_email"], ["MLA", "mla_name", "mla_phone", "mla_email"],
    ["Mayor", "mayor_name", "mayor_phone", "mayor_email"], ["Representative", "rep_name", "rep_phone", "rep_email"]]) {
    const v = validateContact({ name: get(row, n) || undefined, phone: get(row, ph) || undefined, email: get(row, em) || undefined });
    if (!v.ok) return `${who} ${v.field}: ${v.error}`;
  }
  return null;
}

// What an import would do, without saving anything.
async function preview(env, rows, get, area) {
  const out = { rowsOk: 0, mpCreated: 0, mlaCreated: 0, municipalBodyCreated: 0, localUnitsCreated: 0, localUnitsUpdated: 0, withoutEmail: 0, errors: [] };
  const seen = { mp: new Map(), mla: new Map(), mb: new Set(), unit: new Set() };
  const byName = async (table, name) => env.DB.prepare(`SELECT id FROM ${table} WHERE LOWER(name) = LOWER(?)`).bind(name).first();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r], rowNum = r + 1;
    const problem = rowProblem(get, row);
    if (problem) { out.errors.push(`Row ${rowNum}: ${problem} — would be skipped.`); continue; }
    const mpName = get(row, "mp_constituency_name").toLowerCase();
    const mlaName = get(row, "mla_constituency_name").toLowerCase();
    const unitName = get(row, "local_unit_name").toLowerCase();
    if (!seen.mp.has(mpName)) { const e = await byName("mp_constituencies", mpName); seen.mp.set(mpName, e ? e.id : null); if (!e) out.mpCreated++; }
    let mlaId = seen.mla.get(mlaName);
    if (mlaId === undefined) { const e = await byName("mla_constituencies", mlaName); mlaId = e ? e.id : null; seen.mla.set(mlaName, mlaId); if (!e) out.mlaCreated++; }
    const mbName = (get(row, "municipal_body_name") || "").toLowerCase();
    if (mbName && !seen.mb.has(mbName)) { seen.mb.add(mbName); if (!(await byName("municipal_bodies", mbName))) out.municipalBodyCreated++; }
    const key = unitName + "|" + mlaName;
    if (seen.unit.has(key)) { out.errors.push(`Row ${rowNum}: "${get(row, "local_unit_name")}" appears twice in this file under the same MLA constituency — the later row would update the earlier one.`); }
    seen.unit.add(key);
    const existing = mlaId ? await env.DB.prepare(`SELECT id${area ? ", area_id" : ""} FROM local_units WHERE LOWER(name) = LOWER(?) AND mla_constituency_id = ?`).bind(unitName, mlaId).first() : null;
    if (existing && area && existing.area_id && existing.area_id !== area.id) {
      out.errors.push(`Row ${rowNum}: "${get(row, "local_unit_name")}" already exists in another area (${existing.area_id}) — would be skipped.`);
      continue;
    }
    if (existing) out.localUnitsUpdated++; else if (!seen.unit.has(key + "#counted")) { out.localUnitsCreated++; seen.unit.add(key + "#counted"); }
    if (!get(row, "rep_email")) out.withoutEmail++;
    out.rowsOk++;
  }
  return out;
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

  // Which area the file is for (required once areas are set up).
  const ready = await areasReady(env);
  let area = null;
  if (ready) {
    area = body.areaId ? await getArea(env, body.areaId) : null;
    if (!area) return Response.json({ error: "Choose the area (city or district) this file is for.", fields: { areaId: "REQUIRED" } }, { status: 400 });
  }
  if (rows.length > 5001) {
    return Response.json({ error: "This file has more than 5,000 rows. Please split it into smaller files." }, { status: 400 });
  }
  if (body.dryRun === true) {
    return Response.json({ preview: true, area: area ? { id: area.id, name: area.name } : null, summary: await preview(env, rows, get, area) });
  }

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

      const problem = rowProblem(get, row);
      if (problem) {
        summary.errors.push(`Row ${rowNum}: ${problem} — skipped.`);
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
          Object.assign(area ? { area_id: area.id } : {}, {
            mla_constituency_id: mla.id,
            has_mayor: hasMayor,
            mayor_name: get(row, "mayor_name"),
            mayor_phone: get(row, "mayor_phone"),
            mayor_email: get(row, "mayor_email"),
          }),
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
        `SELECT id${area ? ", area_id" : ""} FROM local_units WHERE LOWER(name) = LOWER(?) AND mla_constituency_id = ?`
      )
        .bind(localUnitName, mla.id)
        .first();
      // Never move a ward or village between areas by accident.
      if (existingUnit && area && existingUnit.area_id && existingUnit.area_id !== area.id) {
        summary.errors.push(`Row ${rowNum}: "${localUnitName}" already exists in another area (${existingUnit.area_id}) — skipped.`);
        continue;
      }
      const block = unitType === "RURAL" ? get(row, "block") : null;

      const repName = get(row, "rep_name");
      const repPhone = get(row, "rep_phone");
      const repEmail = get(row, "rep_email");
      const localities = get(row, "localities");

      if (existingUnit) {
        await env.DB.prepare(
          `UPDATE local_units
             SET unit_type = ?, municipal_body_id = ?, rep_name = COALESCE(?, rep_name),
                 rep_phone = COALESCE(?, rep_phone), rep_email = COALESCE(?, rep_email),
                 localities = COALESCE(?, localities)${area ? ", area_id = ?, block = COALESCE(?, block)" : ""}
           WHERE id = ?`
        )
          .bind(...[unitType, municipalBodyId, repName, repPhone, repEmail, localities].concat(area ? [area.id, block] : []), existingUnit.id)
          .run();
        summary.localUnitsUpdated++;
      } else {
        const id = `lu-${slugify(localUnitName)}-${slugify(mlaName)}`;
        await env.DB.prepare(
          `INSERT INTO local_units
             (id, name, unit_type, mla_constituency_id, municipal_body_id, rep_name, rep_phone, rep_email, localities${area ? ", area_id, block" : ""})
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${area ? ", ?, ?" : ""})`
        )
          .bind(...[id, localUnitName, unitType, mla.id, municipalBodyId, repName, repPhone, repEmail, localities].concat(area ? [area.id, block] : []))
          .run();
        summary.localUnitsCreated++;
      }

      summary.rowsProcessed++;
    } catch (rowErr) {
      summary.errors.push(`Row ${rowNum}: ${rowErr.message || "unknown error"} — skipped.`);
    }
  }

      await env.DB.prepare(
      `INSERT INTO admin_events (id, actor_email, action, target, detail)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      auth.email,
      "import_jurisdiction",
      area ? area.id : "local_units",
      JSON.stringify(Object.assign({ area: area ? area.id : null }, summary))
    ).run();

    return Response.json({ success: true, summary });
}
