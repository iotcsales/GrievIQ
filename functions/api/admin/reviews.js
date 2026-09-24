// functions/api/admin/reviews.js
//
// Review queue for citizen-reported representative details. When a
// citizen files a complaint in a ward whose Corporator / Gram Pradhan,
// MLA or MP is missing a name or phone, they may suggest one
// (functions/api/grievances/submit.js stores it as a PENDING row in
// rep_suggestions). Nothing a citizen types is ever applied directly:
// an admin approves (optionally correcting it first) or rejects it here.
//
// GET groups pending suggestions the way OpenStreetMap-style moderation
// does: the same name suggested for the same representative by several
// citizens is shown once, with a count, since independent agreement is a
// much stronger signal than a single report.
//
// POST { action: "approve" | "reject", ids: [...], name?, phone? }
// Approve writes the name (and phone, if given) to the right table --
// local_units for LOCAL, mla_constituencies for MLA, mp_constituencies
// for MP -- and marks the suggestions APPROVED. Every decision is logged
// to admin_events with before/after.
//
// Gated behind review_queue (super_admin, operations_admin, data_moderator).

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";

const TARGETS = {
  LOCAL: { table: "local_units", nameCol: "rep_name", phoneCol: "rep_phone" },
  MLA: { table: "mla_constituencies", nameCol: "mla_name", phoneCol: "mla_phone" },
  MP: { table: "mp_constituencies", nameCol: "mp_name", phoneCol: "mp_phone" },
};

function normalizeName(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, " ").trim();
}

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
  const auth = await getVerifiedAdmin(request, env, "review_queue");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { results: rows } = await env.DB.prepare(
    `SELECT s.id, s.tier, s.suggested_name, s.suggested_phone, s.created_at, s.local_unit_id,
            g.tracking_ref,
            lu.name AS ward_name, lu.unit_type, lu.rep_name, lu.rep_phone,
            mla.id AS mla_id, mla.name AS mla_constituency, mla.mla_name, mla.mla_phone,
            mp.id AS mp_id, mp.name AS mp_constituency, mp.mp_name, mp.mp_phone
     FROM rep_suggestions s
     LEFT JOIN grievances g ON g.id = s.grievance_id
     LEFT JOIN local_units lu ON lu.id = s.local_unit_id
     LEFT JOIN mla_constituencies mla ON mla.id = lu.mla_constituency_id
     LEFT JOIN mp_constituencies mp ON mp.id = mla.mp_constituency_id
     WHERE s.status = 'PENDING'
     ORDER BY s.created_at ASC`
  ).all();

  // How many wards an MLA / MP approval would affect.
  const { results: mlaCounts } = await env.DB.prepare(
    "SELECT mla_constituency_id AS id, COUNT(*) AS n FROM local_units GROUP BY mla_constituency_id"
  ).all();
  const { results: mpCounts } = await env.DB.prepare(
    `SELECT mla.mp_constituency_id AS id, COUNT(*) AS n
     FROM local_units lu JOIN mla_constituencies mla ON mla.id = lu.mla_constituency_id
     GROUP BY mla.mp_constituency_id`
  ).all();
  const wardsUnderMla = new Map(mlaCounts.map((r) => [r.id, r.n]));
  const wardsUnderMp = new Map(mpCounts.map((r) => [r.id, r.n]));

  const groups = new Map();
  for (const r of rows) {
    let targetId, targetLabel, currentName, currentPhone, roleLabel, wardsAffected;
    if (r.tier === "LOCAL") {
      targetId = r.local_unit_id;
      roleLabel = r.unit_type === "RURAL" ? "Gram Pradhan" : "Corporator";
      targetLabel = r.ward_name || r.local_unit_id;
      currentName = r.rep_name;
      currentPhone = r.rep_phone;
      wardsAffected = 1;
    } else if (r.tier === "MLA") {
      targetId = r.mla_id;
      roleLabel = "MLA";
      targetLabel = r.mla_constituency || r.mla_id;
      currentName = r.mla_name;
      currentPhone = r.mla_phone;
      wardsAffected = wardsUnderMla.get(r.mla_id) || 0;
    } else {
      targetId = r.mp_id;
      roleLabel = "MP";
      targetLabel = r.mp_constituency || r.mp_id;
      currentName = r.mp_name;
      currentPhone = r.mp_phone;
      wardsAffected = wardsUnderMp.get(r.mp_id) || 0;
    }
    if (!targetId) continue; // ward or constituency since deleted

    const key = r.tier + "|" + targetId + "|" + normalizeName(r.suggested_name);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        tier: r.tier,
        roleLabel,
        targetId,
        targetLabel,
        wardName: r.ward_name,
        currentName: currentName || null,
        currentPhone: currentPhone || null,
        wardsAffected,
        suggestedName: r.suggested_name,
        phones: [],
        ids: [],
        trackingRefs: [],
        firstAt: r.created_at,
        lastAt: r.created_at,
      });
    }
    const grp = groups.get(key);
    grp.ids.push(r.id);
    if (r.suggested_phone && !grp.phones.includes(r.suggested_phone)) grp.phones.push(r.suggested_phone);
    if (r.tracking_ref) grp.trackingRefs.push(r.tracking_ref);
    grp.lastAt = r.created_at;
  }

  const list = Array.from(groups.values()).map((g) => ({ ...g, count: g.ids.length }));
  // Most-corroborated first, then oldest.
  list.sort((a, b) => b.count - a.count || String(a.firstAt).localeCompare(String(b.firstAt)));

  return Response.json({ groups: list, generatedAt: new Date().toISOString() });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "review_queue");
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
  const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 90) : [];
  if (!["approve", "reject"].includes(action) || ids.length === 0) {
    return Response.json({ error: "Invalid action or no suggestions selected." }, { status: 400 });
  }

  const placeholders = ids.map(() => "?").join(",");
  const { results: rows } = await env.DB.prepare(
    `SELECT s.id, s.tier, s.status, s.local_unit_id, s.suggested_name, s.suggested_phone,
            lu.mla_constituency_id AS mla_id, mla.mp_constituency_id AS mp_id
     FROM rep_suggestions s
     LEFT JOIN local_units lu ON lu.id = s.local_unit_id
     LEFT JOIN mla_constituencies mla ON mla.id = lu.mla_constituency_id
     WHERE s.id IN (${placeholders})`
  ).bind(...ids).all();

  if (rows.length !== ids.length) {
    return Response.json({ error: "Some suggestions were not found. Refresh and try again." }, { status: 404 });
  }
  if (rows.some((r) => r.status !== "PENDING")) {
    return Response.json({ error: "Some of these were already reviewed. Refresh and try again." }, { status: 409 });
  }

  const tier = rows[0].tier;
  const targetOf = (r) => (r.tier === "LOCAL" ? r.local_unit_id : r.tier === "MLA" ? r.mla_id : r.mp_id);
  const targetId = targetOf(rows[0]);
  if (!targetId || rows.some((r) => r.tier !== tier || targetOf(r) !== targetId)) {
    return Response.json({ error: "These suggestions are not for the same representative." }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (action === "reject") {
    await env.DB.prepare(
      `UPDATE rep_suggestions SET status = 'REJECTED', reviewed_by = ?, reviewed_at = ? WHERE id IN (${placeholders})`
    ).bind(auth.email, now, ...ids).run();
    await logEvent(env, auth.email, "rep_suggestion_rejected", targetId, {
      tier, suggestionIds: ids, suggestedName: rows[0].suggested_name,
    });
    return Response.json({ ok: true, status: "REJECTED" });
  }

  // Approve: the reviewer may correct the name/phone before it is applied.
  const name = String(body.name || "").trim().slice(0, 120);
  const phone = String(body.phone || "").trim().slice(0, 40);
  if (name.length < 2) {
    return Response.json({ error: "Enter the representative's name before approving." }, { status: 400 });
  }
  const digits = phone.replace(/\D/g, "");
  if (phone && (digits.length < 10 || digits.length > 13)) {
    return Response.json({ error: "Enter a valid phone number, or leave it blank." }, { status: 400 });
  }

  const def = TARGETS[tier];
  const before = await env.DB.prepare(
    `SELECT ${def.nameCol} AS name, ${def.phoneCol} AS phone FROM ${def.table} WHERE id = ?`
  ).bind(targetId).first();
  if (!before) {
    return Response.json({ error: "That ward or constituency no longer exists." }, { status: 404 });
  }

  // A blank phone keeps whatever phone is already on file.
  const newPhone = phone || before.phone || null;
  await env.DB.prepare(
    `UPDATE ${def.table} SET ${def.nameCol} = ?, ${def.phoneCol} = ? WHERE id = ?`
  ).bind(name, newPhone, targetId).run();

  await env.DB.prepare(
    `UPDATE rep_suggestions SET status = 'APPROVED', reviewed_by = ?, reviewed_at = ? WHERE id IN (${placeholders})`
  ).bind(auth.email, now, ...ids).run();

  await logEvent(env, auth.email, "rep_suggestion_approved", targetId, {
    tier,
    suggestionIds: ids,
    before: { name: before.name, phone: before.phone },
    after: { name, phone: newPhone },
  });

  return Response.json({ ok: true, status: "APPROVED" });
}
