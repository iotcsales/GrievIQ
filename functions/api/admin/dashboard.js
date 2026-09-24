// functions/api/admin/dashboard.js
//
// Admin dashboard: citywide ward coverage and headline counts.
//
// GET (view_dashboard -- all four admin roles) returns, computed live:
//   - one row per ward/village with which contact details are on file at
//     every level of its escalation chain, whether it has a boundary
//     shape, its open cases and its cases needing attention
//   - pending citizen suggestions awaiting review
//   - the data-collection note
//   - which admin pages the caller's role can open, so the page only
//     links to pages that will actually work for them
// Read-only: GET changes nothing, so nothing is logged.
//
// POST (run_import -- super_admin, operations_admin) updates the
// data-collection note. Logged to admin_events with before/after.
//
// Chain rules match _shared/jurisdiction.js resolveChain: ward rep ->
// Mayor (only when the ward's municipal body has_mayor) -> MLA -> MP.
// "Needs attention" uses the same shared logic as the Exceptions page.
// All queries are aggregate JOINs -- no long IN (?,?,...) lists.

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import { findExceptionCases } from "../../_shared/exception-cases.js";

const NOTE_KEY = "data_collection_note";

function has(v) {
  return v != null && String(v).trim() !== "";
}

function can(role, permission) {
  return (PERMISSIONS[permission] || []).includes(role);
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
  const auth = await getVerifiedAdmin(request, env, "view_dashboard");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Boundary GeoJSON can be large, so only its presence is selected.
  const [unitsRes, openRes, reviewsRes, noteRow, exceptionCases] = await Promise.all([
    env.DB.prepare(
      `SELECT lu.id, lu.name, lu.unit_type,
              lu.rep_name, lu.rep_phone, lu.rep_email,
              CASE WHEN COALESCE(TRIM(lu.ward_boundary_geojson), '') = '' THEN 0 ELSE 1 END AS has_boundary,
              mla.id AS mla_id, mla.name AS mla_constituency,
              mla.mla_name, mla.mla_phone, mla.mla_email,
              mp.id AS mp_id, mp.mp_name, mp.mp_phone, mp.mp_email,
              mb.id AS mb_id, mb.name AS mb_name, mb.has_mayor,
              mb.mayor_name, mb.mayor_phone, mb.mayor_email
       FROM local_units lu
       LEFT JOIN mla_constituencies mla ON mla.id = lu.mla_constituency_id
       LEFT JOIN mp_constituencies mp ON mp.id = mla.mp_constituency_id
       LEFT JOIN municipal_bodies mb ON mb.id = lu.municipal_body_id
       ORDER BY lu.name ASC`
    ).all(),
    env.DB.prepare(
      `SELECT local_unit_id, COUNT(*) AS n
       FROM grievances
       WHERE status NOT IN ('RESOLVED', 'CLOSED')
       GROUP BY local_unit_id`
    ).all(),
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM rep_suggestions WHERE status = 'PENDING'"
    ).first(),
    env.DB.prepare(
      "SELECT value, updated_by, updated_at FROM admin_settings WHERE key = ?"
    ).bind(NOTE_KEY).first(),
    findExceptionCases(env),
  ]);

  const openByUnit = new Map();
  for (const r of openRes.results) openByUnit.set(r.local_unit_id, r.n);

  const attentionByUnit = new Map();
  for (const c of exceptionCases) {
    const id = c.localUnit.id;
    attentionByUnit.set(id, (attentionByUnit.get(id) || 0) + 1);
  }

  const wards = unitsRes.results.map((u) => {
    const hasMayor = !!(u.mb_id && u.has_mayor);
    const rep = { name: has(u.rep_name), phone: has(u.rep_phone), email: has(u.rep_email) };
    const mayor = hasMayor
      ? { name: has(u.mayor_name), phone: has(u.mayor_phone), email: has(u.mayor_email) }
      : null;
    const mla = u.mla_id
      ? { name: has(u.mla_name), phone: has(u.mla_phone), email: has(u.mla_email) }
      : { name: false, phone: false, email: false };
    const mp = u.mp_id
      ? { name: has(u.mp_name), phone: has(u.mp_phone), email: has(u.mp_email) }
      : { name: false, phone: false, email: false };

    // Every level in this ward's own chain has an email -- what
    // escalation needs to reach each tier.
    const fullyReachable = rep.email && (!mayor || mayor.email) && mla.email && mp.email;

    return {
      id: u.id,
      name: u.name,
      unitType: u.unit_type,
      mlaConstituency: u.mla_constituency || null,
      mlaName: u.mla_name || null,
      mpName: u.mp_name || null,
      municipalBody: u.mb_name || null,
      repName: u.rep_name || null,
      rep,
      mayor,
      mla,
      mp,
      hasBoundary: u.has_boundary === 1,
      fullyReachable,
      openCases: openByUnit.get(u.id) || 0,
      needsAttention: attentionByUnit.get(u.id) || 0,
    };
  });

  const role = auth.role;

  return Response.json({
    role,
    wards,
    needsAttentionTotal: exceptionCases.length,
    pendingReviews: reviewsRes ? reviewsRes.n : 0,
    note: noteRow
      ? { value: noteRow.value || "", updatedBy: noteRow.updated_by, updatedAt: noteRow.updated_at }
      : { value: "", updatedBy: null, updatedAt: null },
    canEditNote: can(role, "run_import"),
    links: {
      jurisdiction: can(role, "run_import"),
      wardBoundaries: can(role, "run_import"),
      exceptions: can(role, "exceptions_queue"),
      reviews: can(role, "review_queue"),
      cases: can(role, "view_cases"),
    },
    generatedAt: new Date().toISOString(),
  });
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

  if (String(body.action || "") !== "update_note") {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }

  const value = String(body.note == null ? "" : body.note).trim().slice(0, 1000);
  const now = new Date().toISOString();

  const before = await env.DB.prepare(
    "SELECT value FROM admin_settings WHERE key = ?"
  ).bind(NOTE_KEY).first();

  await env.DB.prepare(
    `INSERT INTO admin_settings (key, value, updated_by, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`
  ).bind(NOTE_KEY, value, auth.email, now).run();

  await logEvent(env, auth.email, "data_collection_note_updated", NOTE_KEY, {
    before: before ? before.value : null,
    after: value,
  });

  return Response.json({ ok: true, note: { value, updatedBy: auth.email, updatedAt: now } });
}
