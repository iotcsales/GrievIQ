// functions/_shared/jurisdiction-writes.js
//
// The rules for writing jurisdiction data, in ONE place, used by:
//   - functions/api/admin/jurisdiction.js      (admins editing directly)
//   - functions/api/admin/change-requests.js   (operators' requests, checked
//     when the request is made and again when it is approved)
// so a change made directly and a change made through approval can never
// follow different rules.

import { validateContact, emailDomainCanReceive, EMAIL_RE } from "./contact-validation.js";
import { areasReady } from "./areas.js";

// Which area (city or district) a new ward or village goes in: the one
// given, else the area most of its MLA constituency's wards are in, else
// null (the caller asks the person to choose). Always null before the
// areas update (there are no areas then).
export async function areaForNewUnit(env, areaId, mlaId) {
  if (!(await areasReady(env))) return { ok: true, areaId: null };
  if (areaId) {
    const a = await env.DB.prepare("SELECT id FROM areas WHERE id = ?").bind(String(areaId)).first();
    return a ? { ok: true, areaId: a.id } : { ok: false, status: 400, error: "That area (city or district) was not found." };
  }
  const r = await env.DB.prepare(
    "SELECT area_id, COUNT(*) AS n FROM local_units WHERE mla_constituency_id = ? AND area_id IS NOT NULL GROUP BY area_id ORDER BY n DESC LIMIT 1"
  ).bind(String(mlaId || "")).first();
  if (r && r.area_id) return { ok: true, areaId: r.area_id };
  return { ok: false, status: 400, error: "Choose the area (city or district) this ward or village is in." };
}

// Which table and columns hold each kind of contact.
export const CONTACT_TABLES = {
  mp: { table: "mp_constituencies", nameCol: "mp_name", phoneCol: "mp_phone", emailCol: "mp_email", label: "MP" },
  mla: { table: "mla_constituencies", nameCol: "mla_name", phoneCol: "mla_phone", emailCol: "mla_email", label: "MLA" },
  ward: { table: "local_units", nameCol: "rep_name", phoneCol: "rep_phone", emailCol: "rep_email", label: "Ward representative" },
  mayor: { table: "municipal_bodies", nameCol: "mayor_name", phoneCol: "mayor_phone", emailCol: "mayor_email", label: "Mayor" },
};

// Current contact values of one record, plus a readable label, or null.
export async function readContact(env, type, id) {
  const def = CONTACT_TABLES[type];
  if (!def || !id) return null;
  const labelCol = type === "mp" ? "name" : type === "mla" ? "name" : type === "ward" ? "name" : "name";
  const row = await env.DB.prepare(
    `SELECT ${def.nameCol} AS name, ${def.phoneCol} AS phone, ${def.emailCol} AS email, ${labelCol} AS place
     FROM ${def.table} WHERE id = ?`
  ).bind(id).first();
  if (!row) return null;
  return {
    values: { name: row.name ?? null, phone: row.phone ?? null, email: row.email ?? null },
    label: def.label + " — " + (row.place || id),
  };
}

// Same slug rule as functions/api/admin/import-jurisdiction.js.
function slugify(text) {
  return String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function cleanField(value, maxLen) {
  if (value == null) return null;
  const v = String(value).trim().slice(0, maxLen);
  return v === "" ? null : v;
}

// Checks a new ward/village. Returns
//   { ok: true, unit: { name, unitType, mlaId, mlaName, mlaLabel, municipalBodyId, repName, repPhone, repEmail, localities } }
//   or { ok: false, status, error, field? }
export async function checkNewUnit(env, input) {
  const mlaId = String(input.mlaId || "");
  const name = cleanField(input.name, 120);
  const unitType = String(input.unitType || "").toUpperCase();
  let municipalBodyId = cleanField(input.municipalBodyId, 200);
  const repName = cleanField(input.repName, 120);
  const repPhone = cleanField(input.repPhone, 40);
  const repEmail = cleanField(input.repEmail, 200);
  const localities = cleanField(input.localities, 1000);
  const block = cleanField(input.block, 80);

  if (!mlaId) return { ok: false, status: 400, error: "Choose an MLA constituency." };
  if (!name) return { ok: false, status: 400, error: "Enter a name for the ward or village.", field: "name" };
  if (unitType !== "URBAN" && unitType !== "RURAL") {
    return { ok: false, status: 400, error: "Choose Urban ward or Rural village." };
  }
  if (repEmail && !EMAIL_RE.test(repEmail)) {
    return { ok: false, status: 400, error: "Enter the representative's email in the format name@example.com.", field: "email" };
  }
  const phoneCheck = validateContact({ phone: repPhone });
  if (!phoneCheck.ok) return { ok: false, status: 400, error: phoneCheck.error, field: "phone" };
  if (repEmail) {
    const domainCheck = await emailDomainCanReceive(repEmail);
    if (!domainCheck.ok) return { ok: false, status: 400, error: domainCheck.error, field: "email" };
  }

  const mla = await env.DB.prepare(
    "SELECT id, name, mla_name FROM mla_constituencies WHERE id = ?"
  ).bind(mlaId).first();
  if (!mla) return { ok: false, status: 404, error: "MLA constituency not found." };

  // Villages never sit under a municipal body; wards only if one is chosen.
  if (unitType === "RURAL") municipalBodyId = null;
  if (municipalBodyId) {
    const mb = await env.DB.prepare("SELECT id FROM municipal_bodies WHERE id = ?").bind(municipalBodyId).first();
    if (!mb) return { ok: false, status: 400, error: "Municipal body not found." };
  }

  const where = await areaForNewUnit(env, input.areaId, mla.id);
  if (!where.ok) return { ok: false, status: where.status, error: where.error, field: "areaId" };

  // Same duplicate rule as the CSV importer: name + MLA constituency.
  const duplicate = await env.DB.prepare(
    "SELECT id FROM local_units WHERE LOWER(name) = LOWER(?) AND mla_constituency_id = ?"
  ).bind(name, mla.id).first();
  if (duplicate) {
    return {
      ok: false, status: 409, field: "name",
      error: `A ward or village named "${name}" already exists under this MLA. Use Edit on that row instead.`,
    };
  }

  return {
    ok: true,
    unit: {
      name, unitType, mlaId: mla.id, mlaName: mla.name || mla.id,
      mlaLabel: (mla.mla_name || "unnamed MLA") + (mla.name ? " (" + mla.name + ")" : ""),
      municipalBodyId, repName, repPhone, repEmail, localities,
      areaId: where.areaId, block: unitType === "RURAL" ? block : null,
    },
  };
}

// Inserts a ward/village already checked by checkNewUnit(). Same id format
// as the CSV importer; never overwrites an existing id.
export async function insertUnit(env, unit) {
  const namePart = slugify(unit.name) || crypto.randomUUID().slice(0, 8);
  const mlaPart = slugify(unit.mlaName || unit.mlaId) || "mla";
  const baseId = `lu-${namePart}-${mlaPart}`;
  let id = baseId;
  for (let n = 2; ; n++) {
    const taken = await env.DB.prepare("SELECT id FROM local_units WHERE id = ?").bind(id).first();
    if (!taken) break;
    id = `${baseId}-${n}`;
  }
  await env.DB.prepare(insertUnitSql(unit)).bind(...insertUnitBinds(id, unit)).run();
  return id;
}

// The INSERT for a new ward/village (with its area and block once the
// areas update has run; areaId is null before it).
export function insertUnitSql(unit) {
  return unit.areaId
    ? `INSERT INTO local_units
         (id, name, unit_type, mla_constituency_id, municipal_body_id, rep_name, rep_phone, rep_email, localities, area_id, block)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    : `INSERT INTO local_units
         (id, name, unit_type, mla_constituency_id, municipal_body_id, rep_name, rep_phone, rep_email, localities)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
}
export function insertUnitBinds(id, unit) {
  const b = [id, unit.name, unit.unitType, unit.mlaId, unit.municipalBodyId, unit.repName, unit.repPhone, unit.repEmail, unit.localities];
  return unit.areaId ? b.concat([unit.areaId, unit.block || null]) : b;
}
