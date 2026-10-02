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

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import { validateContact, emailDomainCanReceive } from "../../_shared/contact-validation.js";
import { checkNewUnit, insertUnit, CONTACT_TABLES } from "../../_shared/jurisdiction-writes.js";

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
  // Operators may view (to request changes); only run_import may edit.
  const auth = await getVerifiedAdmin(request, env, "view_jurisdiction");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const [mps, mlas, municipalBodies, localUnits] = await Promise.all([
    env.DB.prepare("SELECT id, mp_name, mp_phone, mp_email FROM mp_constituencies ORDER BY mp_name").all(),
    env.DB.prepare("SELECT id, name, mla_name, mla_phone, mla_email, mp_constituency_id FROM mla_constituencies ORDER BY mla_name").all(),
    env.DB.prepare("SELECT id, name, has_mayor, mayor_name, mayor_phone, mayor_email FROM municipal_bodies ORDER BY name").all(),
    env.DB.prepare("SELECT id, name, unit_type, mla_constituency_id, municipal_body_id, rep_name, rep_phone, rep_email FROM local_units ORDER BY name").all(),
  ]);

  // Records with a change request still waiting for approval.
  const { results: waiting } = await env.DB.prepare(
    "SELECT DISTINCT target_type, target_id FROM change_requests WHERE status = 'PENDING' AND kind = 'contact'"
  ).all();

  return Response.json({
    role: auth.role,
    canEdit: (auth.roles || [auth.role]).some((r) => (PERMISSIONS.run_import || []).includes(r)),
    canRequest: (auth.roles || [auth.role]).some((r) => (PERMISSIONS.request_changes || []).includes(r)),
    pendingRequests: waiting.map((w) => w.target_type + ":" + w.target_id),
    mps: mps.results,
    mlas: mlas.results,
    municipalBodies: municipalBodies.results,
    localUnits: localUnits.results,
  });
}

const TABLES = CONTACT_TABLES;   // shared with change-requests.js

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

    // Same format rules as operators' change requests (see
    // _shared/contact-validation.js). A field not sent keeps its value.
    const checked = validateContact({
      name: body.name != null ? body.name : undefined,
      phone: body.phone != null ? body.phone : undefined,
      email: body.email != null ? body.email : undefined,
    });
    if (!checked.ok) {
      return Response.json({ error: checked.error, field: checked.field }, { status: 400 });
    }
    const name = "name" in checked.values ? checked.values.name : before.name;
    const phone = "phone" in checked.values ? checked.values.phone : before.phone;
    const email = "email" in checked.values ? checked.values.email : before.email;

    // A new or changed email must be at a domain that can receive email.
    if (email && email !== before.email) {
      const domainCheck = await emailDomainCanReceive(email);
      if (!domainCheck.ok) {
        return Response.json({ error: domainCheck.error, field: "email" }, { status: 400 });
      }
    }

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

      // Never point at an MP constituency that doesn't exist -- it would
      // break the escalation chain for every ward under this MLA.
      const parent = await env.DB.prepare(
        "SELECT id FROM mp_constituencies WHERE id = ?"
      ).bind(newParentId).first();
      if (!parent) return Response.json({ error: "That MP constituency does not exist." }, { status: 400 });

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

      // Never point at an MLA constituency that doesn't exist -- the ward's
      // escalation chain would break and its cases would vanish from the
      // rep console.
      const parent = await env.DB.prepare(
        "SELECT id FROM mla_constituencies WHERE id = ?"
      ).bind(newParentId).first();
      if (!parent) return Response.json({ error: "That MLA constituency does not exist." }, { status: 400 });

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

  // Rules shared with operators' change requests (_shared/jurisdiction-writes.js).
  const checked = await checkNewUnit(env, body);
  if (!checked.ok) {
    return Response.json({ error: checked.error, field: checked.field }, { status: checked.status });
  }
  const u = checked.unit;
  const id = await insertUnit(env, u);
  const name = u.name, unitType = u.unitType, municipalBodyId = u.municipalBodyId;
  const repName = u.repName, repPhone = u.repPhone, repEmail = u.repEmail, localities = u.localities;
  const mla = { id: u.mlaId };

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
