// functions/api/admin/jurisdiction.js
//
// Read and edit the MP -> MLA -> ward jurisdiction hierarchy (plus the
// optional municipal body / mayor attached to some wards). GET returns
// the whole structure flat; the frontend assembles the tree, since the
// dataset is small. PATCH handles two distinct actions:
//   - update_contact: fix a name/phone/email on any node
//   - reassign: move an MLA to a different MP, or a ward to a different
//     MLA -- rarer and higher-impact than a contact fix, so it's a
//     separate action rather than folded into update_contact.
// POST handles one action:
//   - add_unit: create a single ward/village under a chosen MLA
//     constituency. Uses the same id format and the same duplicate rule
//     (name + MLA constituency, case-insensitive) as the CSV importer, so
//     the two routes can never produce inconsistent data.
// Gated behind run_import (same citywide-impact tier as the bulk
// importers). Every change is logged to admin_events with before/after.

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";

async function logEvent(env, actorEmail, action, target, detail) {
  await env.DB.prepare(
    `INSERT INTO admin_events (id, actor_email, action, target, detail)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    actorEmail,
    action,
    target,
    detail == null ? null : JSON.stringify(detail)
  ).run();
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "run_import");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const [mps, mlas, municipalBodies, localUnits] = await Promise.all([
    env.DB.prepare("SELECT id, mp_name, mp_phone, mp_email FROM mp_constituencies ORDER BY mp_name").all(),
    env.DB.prepare("SELECT id, name, mla_name, mla_phone, mla_email, mp_constituency_id FROM mla_constituencies ORDER BY mla_name").all(),
    env.DB.prepare("SELECT id, name, has_mayor, mayor_name, mayor_phone, mayor_email FROM municipal_bodies ORDER BY name").all(),
    env.DB.prepare("SELECT id, name, unit_type, mla_constituency_id, municipal_body_id, rep_name, rep_phone, rep_email FROM local_units ORDER BY name").all(),
  ]);

  return Response.json({
    mps: mps.results,
    mlas: mlas.results,
    municipalBodies: municipalBodies.results,
    localUnits: localUnits.results,
  });
}

const TABLES = {
  mp: { table: "mp_constituencies", nameCol: "mp_name", phoneCol: "mp_phone", emailCol: "mp_email" },
  mla: { table: "mla_constituencies", nameCol: "mla_name", phoneCol: "mla_phone", emailCol: "mla_email" },
  ward: { table: "local_units", nameCol: "rep_name", phoneCol: "rep_phone", emailCol: "rep_email" },
  mayor: { table: "municipal_bodies", nameCol: "mayor_name", phoneCol: "mayor_phone", emailCol: "mayor_email" },
};

export async function onRequestPatch({ request, env }) {
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

  const action = String(body.action || "");

  if (action === "update_contact") {
    const type = String(body.type || "");
    const id = String(body.id || "");
    const def = TABLES[type];
    if (!def || !id) {
      return Response.json({ error: "Invalid type or id." }, { status: 400 });
    }

    const before = await env.DB.prepare(
      `SELECT ${def.nameCol} as name, ${def.phoneCol} as phone, ${def.emailCol} as email FROM ${def.table} WHERE id = ?`
    ).bind(id).first();
    if (!before) {
      return Response.json({ error: "Record not found." }, { status: 404 });
    }

    const name = body.name != null ? String(body.name) : before.name;
    const phone = body.phone != null ? String(body.phone) : before.phone;
    const email = body.email != null ? String(body.email) : before.email;

    await env.DB.prepare(
      `UPDATE ${def.table} SET ${def.nameCol} = ?, ${def.phoneCol} = ?, ${def.emailCol} = ? WHERE id = ?`
    ).bind(name, phone, email, id).run();

    await logEvent(env, auth.email, "jurisdiction_contact_updated", id, {
      type, before, after: { name, phone, email },
    });

    return Response.json({ ok: true });
  }

  if (action === "reassign") {
    const type = String(body.type || "");
    const id = String(body.id || "");
    const newParentId = String(body.newParentId || "");
    if (!id || !newParentId) {
      return Response.json({ error: "id and newParentId are required." }, { status: 400 });
    }

    if (type === "mla") {
      const before = await env.DB.prepare(
        "SELECT mp_constituency_id FROM mla_constituencies WHERE id = ?"
      ).bind(id).first();
      if (!before) return Response.json({ error: "MLA constituency not found." }, { status: 404 });

      await env.DB.prepare(
        "UPDATE mla_constituencies SET mp_constituency_id = ? WHERE id = ?"
      ).bind(newParentId, id).run();

      await logEvent(env, auth.email, "jurisdiction_reassigned", id, {
        type, fromParent: before.mp_constituency_id, toParent: newParentId,
      });

      return Response.json({ ok: true });
    }

    if (type === "ward") {
      const before = await env.DB.prepare(
        "SELECT mla_constituency_id FROM local_units WHERE id = ?"
      ).bind(id).first();
      if (!before) return Response.json({ error: "Ward not found." }, { status: 404 });

      await env.DB.prepare(
        "UPDATE local_units SET mla_constituency_id = ? WHERE id = ?"
      ).bind(newParentId, id).run();

      await logEvent(env, auth.email, "jurisdiction_reassigned", id, {
        type, fromParent: before.mla_constituency_id, toParent: newParentId,
      });

      return Response.json({ ok: true });
    }

    return Response.json({ error: "Invalid type for reassignment." }, { status: 400 });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}


// Same slug rule as functions/api/admin/import-jurisdiction.js.
function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function cleanField(value, maxLen) {
  if (value == null) return null;
  const v = String(value).trim().slice(0, maxLen);
  return v === "" ? null : v;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  if (String(body.action || "") !== "add_unit") {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }

  const mlaId = String(body.mlaId || "");
  const name = cleanField(body.name, 120);
  const unitType = String(body.unitType || "").toUpperCase();
  let municipalBodyId = cleanField(body.municipalBodyId, 200);
  const repName = cleanField(body.repName, 120);
  const repPhone = cleanField(body.repPhone, 40);
  const repEmail = cleanField(body.repEmail, 200);
  const localities = cleanField(body.localities, 1000);

  if (!mlaId) return Response.json({ error: "Choose an MLA constituency." }, { status: 400 });
  if (!name) return Response.json({ error: "Enter a name for the ward or village." }, { status: 400 });
  if (unitType !== "URBAN" && unitType !== "RURAL") {
    return Response.json({ error: "Choose Urban ward or Rural village." }, { status: 400 });
  }
  if (repEmail && !EMAIL_RE.test(repEmail)) {
    return Response.json({ error: "Enter the representative's email in the format name@example.com." }, { status: 400 });
  }

  const mla = await env.DB.prepare(
    "SELECT id, name, mla_name FROM mla_constituencies WHERE id = ?"
  ).bind(mlaId).first();
  if (!mla) {
    return Response.json({ error: "MLA constituency not found." }, { status: 404 });
  }

  // Villages never sit under a municipal body; wards only if one is chosen.
  if (unitType === "RURAL") municipalBodyId = null;
  if (municipalBodyId) {
    const mb = await env.DB.prepare(
      "SELECT id FROM municipal_bodies WHERE id = ?"
    ).bind(municipalBodyId).first();
    if (!mb) {
      return Response.json({ error: "Municipal body not found." }, { status: 400 });
    }
  }

  // Same duplicate rule as the CSV importer: name + MLA constituency.
  const duplicate = await env.DB.prepare(
    "SELECT id FROM local_units WHERE LOWER(name) = LOWER(?) AND mla_constituency_id = ?"
  ).bind(name, mla.id).first();
  if (duplicate) {
    return Response.json({
      error: `A ward or village named "${name}" already exists under this MLA. Use Edit on that row instead.`,
    }, { status: 409 });
  }

  // Same id format as the CSV importer. Names in non-Latin script (e.g.
  // Devanagari) slugify to nothing, so fall back to a short random part;
  // and never overwrite an existing id -- add a numeric suffix instead.
  const namePart = slugify(name) || crypto.randomUUID().slice(0, 8);
  const mlaPart = slugify(mla.name || mla.id) || "mla";
  const baseId = `lu-${namePart}-${mlaPart}`;
  let id = baseId;
  for (let n = 2; ; n++) {
    const taken = await env.DB.prepare("SELECT id FROM local_units WHERE id = ?").bind(id).first();
    if (!taken) break;
    id = `${baseId}-${n}`;
  }

  await env.DB.prepare(
    `INSERT INTO local_units
       (id, name, unit_type, mla_constituency_id, municipal_body_id, rep_name, rep_phone, rep_email, localities)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, name, unitType, mla.id, municipalBodyId, repName, repPhone, repEmail, localities).run();

  await logEvent(env, auth.email, "jurisdiction_unit_added", id, {
    after: {
      name, unitType, mlaConstituencyId: mla.id, municipalBodyId,
      repName, repPhone, repEmail, localities,
    },
  });

  return Response.json({
    ok: true,
    unit: { id, name, unitType, mlaConstituencyId: mla.id },
  });
}
