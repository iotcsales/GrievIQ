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
// Also the number of change requests waiting (all of them for approvers,
// the caller's own for a data entry operator).
//
// POST (run_import -- super_admin, operations_admin) updates the
// data-collection note. Logged to admin_events with before/after.
//
// Chain rules match _shared/jurisdiction.js resolveChain: ward rep ->
// Mayor (only when the ward's municipal body has_mayor) -> MLA -> MP.
// "Needs attention" uses the same shared logic as the Exceptions page.
// All queries are aggregate JOINs -- no long IN (?,?,...) lists.

import { getVerifiedAdmin, PERMISSIONS, pagesFor } from "../../_shared/get-verified-admin.js";
import { shapeObservation, todayIst } from "../../_shared/audit.js";
import { findExceptionCases } from "../../_shared/exception-cases.js";
import { settleOverdueConfirmations } from "../../_shared/confirmation.js";
import { purgeDuePhotos, PURGE_BATCH } from "../../_shared/photo-store.js";
import { runRetention, RUN_BATCH } from "../../_shared/retention.js";

const NOTE_KEY = "data_collection_note";

function has(v) {
  return v != null && String(v).trim() !== "";
}

function can(role, permission) {
  return [].concat(role).some((r) => (PERMISSIONS[permission] || []).includes(r));
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

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await getVerifiedAdmin(request, env, "view_dashboard");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Photo retention (item 7c): remove a small batch of photos that are due,
  // in the background so the page isn't slowed down.
  if (context.waitUntil) context.waitUntil(purgeDuePhotos(env, PURGE_BATCH));
  // Item 9d: data retention, in small batches the same way (notices,
  // anonymising cases whose time is up, old sign-in details and codes).
  if (context.waitUntil) context.waitUntil(runRetention(env, { limit: RUN_BATCH, actor: "system", kind: "AUTO", request: context.request }));

  // Close any case whose confirmation time has run out before counting
  // (item 7a), so "open cases" never includes one that has closed.
  await settleOverdueConfirmations(env);

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

  const role = auth.roles || auth.role;   // item 10: includes roles held while covering

  // Change requests waiting (maker-checker): approvers see all waiting
  // requests; a data entry operator sees how many of their own are waiting.
  const canApprove = can(role, "approve_changes");
  const canRequest = can(role, "request_changes");
  // Item 7b-2: fixes waiting for a GrievIQ staff check (citizen gave no
  // email), and how long the oldest has waited.
  const checksRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n, MIN(resolved_at) AS oldest FROM grievances
     WHERE status = 'PENDING_CONFIRMATION' AND COALESCE(TRIM(citizen_email), '') = ''`
  ).first();

  // Item 7c: photo storage, for the super admin only -- old public photos
  // still to move, and photos kept privately.
  let photoStorage = null;
  if (can(role, "manage_photos")) {
    try {
      const [legacyRow, keptRow] = await env.DB.batch([
        env.DB.prepare("SELECT COUNT(*) AS n FROM grievances WHERE photo_url LIKE '%grievance-photos/%'"),
        env.DB.prepare(
          `SELECT (SELECT COUNT(*) FROM complaint_photos WHERE grievance_id IS NOT NULL AND deleted_at IS NULL)
                + (SELECT COUNT(*) FROM resolution_photos WHERE report_id IS NOT NULL AND deleted_at IS NULL) AS n`
        ),
      ]);
      photoStorage = {
        legacyCases: legacyRow.results[0] ? legacyRow.results[0].n : 0,
        keptPhotos: keptRow.results[0] ? keptRow.results[0].n : 0,
      };
    } catch (e) {
      photoStorage = null; // tables not created yet
    }
  }

  let changeRequestsWaiting = null;
  if (canApprove || canRequest) {
    const row = canApprove
      ? await env.DB.prepare("SELECT COUNT(*) AS n FROM change_requests WHERE status = 'PENDING'").first()
      : await env.DB.prepare("SELECT COUNT(*) AS n FROM change_requests WHERE status = 'PENDING' AND requested_by = ?").bind(auth.email).first();
    changeRequestsWaiting = row ? row.n : 0;
  }

  // Item 9c: audit observations. The auditor and the super admin see the
  // whole picture; other staff see the observations they own (if any).
  let audit = null;
  try {
    const all = can(role, "view_all_observations");
    const { results: obs } = all
      ? await env.DB.prepare("SELECT * FROM observations WHERE status IN ('ISSUED', 'RESPONDED', 'DONE_REPORTED')").all()
      : await env.DB.prepare("SELECT * FROM observations WHERE owner_type = 'STAFF' AND LOWER(owner_email) IN (SELECT value FROM json_each(?)) AND status NOT IN ('DRAFT', 'WITHDRAWN')").bind(JSON.stringify(auth.myEmails || [auth.email])).all();
    const rows = obs || [];
    const ids = rows.map((r) => r.id);
    const amendBy = new Map();
    if (ids.length) {
      const { results: am } = await env.DB.prepare("SELECT * FROM observation_amendments WHERE observation_id IN (SELECT value FROM json_each(?)) ORDER BY amended_at ASC").bind(JSON.stringify(ids)).all();
      for (const a of am || []) { if (!amendBy.has(a.observation_id)) amendBy.set(a.observation_id, []); amendBy.get(a.observation_id).push(a); }
    }
    const today = todayIst();
    const shaped = rows.map((r) => shapeObservation(r, amendBy.get(r.id) || [], today));
    if (all) {
      audit = { scope: "all", overdue: shaped.filter((o) => o.overdue).length, waitingVerification: shaped.filter((o) => o.status === "DONE_REPORTED").length };
    } else if (shaped.length) {
      audit = { scope: "own", needReply: shaped.filter((o) => o.status === "ISSUED" || o.status === "RESPONDED").length, overdue: shaped.filter((o) => o.overdue).length };
    }
  } catch (e) {
    audit = null; // audit tables not created yet
  }

  return Response.json({
    role: auth.role,
    roles: auth.roles || [auth.role],
    me: { email: auth.email, name: auth.name || null, employeeId: auth.employeeId || null },
    covering: auth.covering || [],
    wards,
    audit,
    needsAttentionTotal: exceptionCases.length,
    pendingReviews: reviewsRes ? reviewsRes.n : 0,
    changeRequestsWaiting,
    changeRequestsScope: canApprove ? "all" : canRequest ? "own" : null,
    checksWaiting: can(role, "view_checks") ? (checksRow ? checksRow.n : 0) : null,
    checksOldestAt: can(role, "view_checks") && checksRow ? checksRow.oldest || null : null,
    photoStorage,
    note: noteRow
      ? { value: noteRow.value || "", updatedBy: noteRow.updated_by, updatedAt: noteRow.updated_at }
      : { value: "", updatedBy: null, updatedAt: null },
    canEditNote: can(role, "run_import"),
    // Card links follow the same page list as the menu (pagesFor), so a
    // card never leads to a page the role can't use.
    links: (() => {
      const pg = pagesFor(role);
      const ok = (k) => !!(pg[k] && pg[k].allowed);
      return {
        jurisdiction: ok("admin-jurisdiction"), wardBoundaries: ok("admin-import-wards"),
        exceptions: ok("admin-exceptions"), reviews: ok("admin-reviews"), cases: ok("admin-cases"),
        changeRequests: ok("admin-change-requests"), checks: ok("admin-checks"), photos: ok("admin-photos"),
      };
    })(),
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
