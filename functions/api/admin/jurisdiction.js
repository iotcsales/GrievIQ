/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
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
import { checkNewUnit, insertUnit, CONTACT_TABLES, contactDef } from "../../_shared/jurisdiction-writes.js";
import { seatsReady, LETTERS, MAX_SEATS, seatId } from "../../_shared/seats.js";

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

  const seats = await seatsReady(env);
  const [mps, mlas, municipalBodies, localUnits] = await Promise.all([
    env.DB.prepare("SELECT id, mp_name, mp_phone, mp_email FROM mp_constituencies ORDER BY mp_name").all(),
    env.DB.prepare("SELECT id, name, mla_name, mla_phone, mla_email, mp_constituency_id FROM mla_constituencies ORDER BY mla_name").all(),
    env.DB.prepare("SELECT id, name, has_mayor, mayor_name, mayor_phone, mayor_email FROM municipal_bodies ORDER BY name").all(),
    env.DB.prepare(`SELECT id, name, unit_type, mla_constituency_id, municipal_body_id, rep_name, rep_phone, rep_email${seats ? ", seat_count, seat_status" : ""} FROM local_units ORDER BY name`).all(),
  ]);
  // grieviq-57: seats B-F of wards with several members.
  let wardSeats = [];
  if (seats) wardSeats = ((await env.DB.prepare("SELECT s.id, s.local_unit_id, s.seat_label, s.rep_name, s.rep_phone, s.rep_email, s.seat_status FROM ward_seats s JOIN local_units lu ON lu.id = s.local_unit_id ORDER BY s.local_unit_id, s.seat_label").all()).results || []);

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
    seatsReady: seats, maxSeats: MAX_SEATS, wardSeats,
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
    const def = contactDef(type, id);   // grieviq-57: a seat of a ward with several members
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

  // grieviq-57: how many elected members a ward has (1-6). Raising it adds
  // empty seats; lowering it removes the last seats, only when nothing uses
  // them yet (no member, team, plan, bill, notice, handover or case). A seat
  // in use is made vacant through "Change of representative" instead.
  if (action === "set_seats") {
    if (!(await seatsReady(env))) return Response.json({ error: "Run the part40 database step first.", code: "NOT_READY" }, { status: 409 });
    const id = String(body.id || "");
    const count = Number(body.count);
    const unit = await env.DB.prepare("SELECT id, name, unit_type, seat_count FROM local_units WHERE id = ?").bind(id).first();
    if (!unit) return Response.json({ error: "Ward not found." }, { status: 404 });
    if (!Number.isInteger(count) || count < 1 || count > MAX_SEATS) return Response.json({ error: "Choose from 1 to " + MAX_SEATS + " members.", fields: { count: "RANGE" } }, { status: 400 });
    if (count > 1 && unit.unit_type !== "URBAN") return Response.json({ error: "Only urban wards can have more than one member.", fields: { count: "RURAL" } }, { status: 400 });
    const before = Number(unit.seat_count) > 1 ? Number(unit.seat_count) : 1;
    if (count === before) return Response.json({ ok: true, count, unchanged: true });
    const now = new Date().toISOString();
    if (count < before) {
      for (let i = count; i < before; i++) {
        const sid = seatId(unit.id, LETTERS[i]);
        const inUse = await seatInUse(env, sid);
        if (inUse) return Response.json({ error: "Seat " + LETTERS[i] + " is in use (" + inUse + "). Make it vacant through Change of representative instead.", code: "SEAT_IN_USE", seat: LETTERS[i], why: inUse }, { status: 409 });
      }
      // Going back to one member: no case may still be waiting for a member to take it.
      if (count === 1) {
        const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM grievances WHERE local_unit_id = ? AND seat_choice IS NOT NULL AND seat_owner IS NULL AND status NOT IN ('RESOLVED', 'CLOSED')").bind(unit.id).first();
        if (open && open.n) return Response.json({ error: "This ward still has " + open.n + " open complaint(s) waiting for a member to take them. Wait until they are taken or closed.", code: "OPEN_CASES", n: open.n }, { status: 409 });
      }
      await env.DB.prepare("DELETE FROM ward_seats WHERE local_unit_id = ? AND seat_label IN (SELECT value FROM json_each(?))").bind(unit.id, JSON.stringify(LETTERS.slice(count, before))).run();
    } else {
      // Complaints filed while the ward had one member were sent to that
      // member: they stay with seat A, and the new members don't see them.
      if (before === 1) {
        await env.DB.prepare("UPDATE grievances SET seat_choice = ?, seat_owner = ?, seat_owner_at = COALESCE(acknowledged_at, created_at) WHERE local_unit_id = ? AND seat_choice IS NULL AND seat_owner IS NULL")
          .bind(unit.id, unit.id, unit.id).run();
      }
      for (let i = 1; i < count; i++) {
        await env.DB.prepare("INSERT OR IGNORE INTO ward_seats (id, local_unit_id, seat_label, created_at, created_by) VALUES (?, ?, ?, ?, ?)")
          .bind(seatId(unit.id, LETTERS[i]), unit.id, LETTERS[i], now, auth.email).run();
      }
    }
    await env.DB.prepare("UPDATE local_units SET seat_count = ? WHERE id = ?").bind(count > 1 ? count : null, unit.id).run();
    await logEvent(env, auth.email, "ward_seats_changed", unit.id, { ward: unit.name, from: before, to: count });
    return Response.json({ ok: true, count });
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

// grieviq-57: why a seat can't be removed (or null when nothing uses it).
async function seatInUse(env, sid) {
  const checks = [
    ["a member", "SELECT 1 FROM ward_seats WHERE id = ? AND (COALESCE(rep_email, '') <> '' OR COALESCE(rep_name, '') <> '')"],
    ["a team", "SELECT 1 FROM office_team WHERE office_tier = 'LOCAL' AND office_id = ? LIMIT 1"],
    ["a plan", "SELECT 1 FROM office_subscriptions WHERE office_type = 'REP' AND office_tier = 'LOCAL' AND office_id = ? LIMIT 1"],
    ["bills", "SELECT 1 FROM bills WHERE office_type = 'REP' AND office_id = ? LIMIT 1"],
    ["notices", "SELECT 1 FROM notices WHERE office_type = 'REP' AND office_id = ? LIMIT 1"],
    ["a change of representative", "SELECT 1 FROM seat_handovers WHERE seat_type = 'ward' AND seat_id = ? LIMIT 1"],
    ["complaints", "SELECT 1 FROM grievances WHERE seat_owner = ? OR seat_choice = ? LIMIT 1"],
  ];
  for (const [what, sql] of checks) {
    try {
      const st = env.DB.prepare(sql);
      const r = await (sql.split("?").length - 1 === 2 ? st.bind(sid, sid) : st.bind(sid)).first();
      if (r) return what;
    } catch (e) { /* that table isn't there yet */ }
  }
  return null;
}
