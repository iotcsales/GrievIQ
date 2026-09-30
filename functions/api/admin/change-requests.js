// functions/api/admin/change-requests.js
//
// Maker-checker for jurisdiction data (NIST SP 800-53 AC-5 separation of
// duties / AC-3(2) dual authorization). Data entry operators never change
// live data: every entry or change they make is stored here as a REQUEST
// and applied only when a super_admin or operations_admin approves it.
//
// GET
//   approvers (approve_changes): ?view=pending (default) or ?view=decided
//   operators (request_changes): their own requests, newest first
//
// POST { action, ... }
//   submit   (request_changes)  kind "contact": { targetType, targetId, name?, phone?, email?, reason, source? }
//                               kind "add_unit": { mlaId, name, unitType, municipalBodyId?, repName?, repPhone?, repEmail?, localities?, reason, source? }
//   withdraw (request_changes)  { id } -- own PENDING request only
//   approve  (approve_changes)  { ids: [...] } -- each applied exactly as requested
//   reject   (approve_changes)  { ids: [...], note } -- note is shown to the operator
//
// Rules enforced here, on the server:
//   - no one approves or rejects their own request
//   - the same format checks as direct edits (_shared/jurisdiction-writes.js),
//     at request time AND again at approval
//   - a request stores the old values it was made against; approval applies
//     the change in one transaction only if the record still holds those
//     values (OWASP ASVS: no time-of-check/time-of-use gap). Otherwise the
//     request is marked OUT_OF_DATE and must be made again.
//   - every step is logged to admin_events.

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import { validateContact, emailDomainCanReceive } from "../../_shared/contact-validation.js";
import { CONTACT_TABLES, readContact, checkNewUnit, insertUnit } from "../../_shared/jurisdiction-writes.js";

const FIELDS = ["name", "phone", "email"];
const MAX_IDS = 50;

function can(role, permission) {
  return (PERMISSIONS[permission] || []).includes(role);
}

async function logEvent(env, actorEmail, action, target, detail) {
  await env.DB.prepare(
    `INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), actorEmail, action, target, detail == null ? null : JSON.stringify(detail)).run();
}

function parse(json) {
  try { return json ? JSON.parse(json) : null; } catch { return null; }
}

function clip(v, n) {
  const s = v == null ? "" : String(v).trim();
  return s.slice(0, n);
}

function shape(r, live) {
  return {
    id: r.id,
    kind: r.kind,
    targetType: r.target_type,
    targetId: r.target_id,
    targetLabel: r.target_label,
    oldValues: parse(r.old_values),
    newValues: parse(r.new_values),
    liveValues: live || null,
    reason: r.reason,
    source: r.source,
    status: r.status,
    requestedBy: r.requested_by,
    requestedAt: r.requested_at,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    reviewNote: r.review_note,
  };
}

// ---------------------------------------------------------------- GET
export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const canApprove = can(auth.role, "approve_changes");
  const canRequest = can(auth.role, "request_changes");
  // The auditor sees every request and decision, read-only.
  const canView = can(auth.role, "view_change_requests");
  if (!canApprove && !canRequest && !canView) return Response.json({ error: "INSUFFICIENT_ROLE" }, { status: 403 });

  const url = new URL(request.url);
  let rows;
  if (canApprove || canView) {
    const view = url.searchParams.get("view") === "decided" ? "decided" : "pending";
    const sql = view === "pending"
      ? "SELECT * FROM change_requests WHERE status = 'PENDING' ORDER BY requested_at ASC LIMIT 200"
      : "SELECT * FROM change_requests WHERE status <> 'PENDING' ORDER BY COALESCE(reviewed_at, requested_at) DESC LIMIT 100";
    ({ results: rows } = await env.DB.prepare(sql).all());
  } else {
    ({ results: rows } = await env.DB.prepare(
      "SELECT * FROM change_requests WHERE requested_by = ? ORDER BY requested_at DESC LIMIT 200"
    ).bind(auth.email).all());
  }

  // For waiting contact requests, show what the record holds right now.
  const out = [];
  for (const r of rows) {
    let live = null;
    if (r.status === "PENDING" && r.kind === "contact") {
      const cur = await readContact(env, r.target_type, r.target_id);
      live = cur ? cur.values : null;
    }
    out.push(shape(r, live));
  }

  const { results: countRows } = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM change_requests WHERE status = 'PENDING'"
  ).all();

  return Response.json({
    role: auth.role,
    email: auth.email,
    canApprove,
    canRequest,
    canView,
    pendingCount: countRows[0] ? countRows[0].n : 0,
    requests: out,
  });
}

// ---------------------------------------------------------------- POST
export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const action = String(body.action || "");

  if (action === "submit" || action === "withdraw") {
    if (!can(auth.role, "request_changes")) return Response.json({ error: "INSUFFICIENT_ROLE" }, { status: 403 });
    return action === "submit" ? submit(env, auth, body) : withdraw(env, auth, body);
  }
  if (action === "approve" || action === "reject") {
    if (!can(auth.role, "approve_changes")) return Response.json({ error: "INSUFFICIENT_ROLE" }, { status: 403 });
    return action === "approve" ? approve(env, auth, body) : reject(env, auth, body);
  }
  return Response.json({ error: "Unknown action." }, { status: 400 });
}

async function submit(env, auth, body) {
  const reason = clip(body.reason, 500);
  const source = clip(body.source, 300) || null;
  if (reason.length < 5) {
    return Response.json({ error: "Give the reason for this request (at least a few words).", field: "reason" }, { status: 400 });
  }
  const kind = String(body.kind || "");
  const id = crypto.randomUUID();

  if (kind === "contact") {
    const type = String(body.targetType || "");
    const targetId = String(body.targetId || "");
    if (!CONTACT_TABLES[type] || !targetId) return Response.json({ error: "Invalid record." }, { status: 400 });
    const cur = await readContact(env, type, targetId);
    if (!cur) return Response.json({ error: "Record not found." }, { status: 404 });

    const checked = validateContact({
      name: body.name != null ? body.name : undefined,
      phone: body.phone != null ? body.phone : undefined,
      email: body.email != null ? body.email : undefined,
    });
    if (!checked.ok) return Response.json({ error: checked.error, field: checked.field }, { status: 400 });

    // Only fields that actually change become part of the request.
    const oldValues = {}, newValues = {};
    for (const f of FIELDS) {
      if (f in checked.values && (checked.values[f] ?? null) !== (cur.values[f] ?? null)) {
        oldValues[f] = cur.values[f] ?? null;
        newValues[f] = checked.values[f] ?? null;
      }
    }
    if (!Object.keys(newValues).length) {
      return Response.json({ error: "Nothing has changed. Edit at least one detail before sending the request." }, { status: 400 });
    }
    if (newValues.email) {
      const d = await emailDomainCanReceive(newValues.email);
      if (!d.ok) return Response.json({ error: d.error, field: "email" }, { status: 400 });
    }
    const waiting = await env.DB.prepare(
      "SELECT id FROM change_requests WHERE status = 'PENDING' AND kind = 'contact' AND target_type = ? AND target_id = ?"
    ).bind(type, targetId).first();
    if (waiting) {
      return Response.json({ error: "A change to this record is already waiting for approval. Wait for that decision, or withdraw it from My requests." }, { status: 409 });
    }

    await env.DB.prepare(
      `INSERT INTO change_requests (id, kind, target_type, target_id, target_label, old_values, new_values, reason, source, requested_by, requested_at)
       VALUES (?, 'contact', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, type, targetId, cur.label, JSON.stringify(oldValues), JSON.stringify(newValues), reason, source, auth.email, new Date().toISOString()).run();
    await logEvent(env, auth.email, "change_request_submitted", targetId, { requestId: id, type, oldValues, newValues, reason, source });
    return Response.json({ ok: true, id });
  }

  if (kind === "add_unit") {
    const checked = await checkNewUnit(env, body);
    if (!checked.ok) return Response.json({ error: checked.error, field: checked.field }, { status: checked.status });
    const u = checked.unit;
    const waiting = await env.DB.prepare(
      "SELECT id, new_values FROM change_requests WHERE status = 'PENDING' AND kind = 'add_unit' AND target_id = ?"
    ).bind(u.mlaId).all();
    if ((waiting.results || []).some((w) => { const v = parse(w.new_values); return v && String(v.name).toLowerCase() === u.name.toLowerCase(); })) {
      return Response.json({ error: `A request to add "${u.name}" under this MLA is already waiting for approval.`, field: "name" }, { status: 409 });
    }
    const newValues = {
      name: u.name, unitType: u.unitType, mlaId: u.mlaId, municipalBodyId: u.municipalBodyId,
      repName: u.repName, repPhone: u.repPhone, repEmail: u.repEmail, localities: u.localities,
    };
    const label = "New " + (u.unitType === "RURAL" ? "village" : "ward") + " under " + u.mlaLabel;
    await env.DB.prepare(
      `INSERT INTO change_requests (id, kind, target_type, target_id, target_label, old_values, new_values, reason, source, requested_by, requested_at)
       VALUES (?, 'add_unit', NULL, ?, ?, NULL, ?, ?, ?, ?, ?)`
    ).bind(id, u.mlaId, label, JSON.stringify(newValues), reason, source, auth.email, new Date().toISOString()).run();
    await logEvent(env, auth.email, "change_request_submitted", u.mlaId, { requestId: id, kind: "add_unit", newValues, reason, source });
    return Response.json({ ok: true, id });
  }

  return Response.json({ error: "Unknown kind of request." }, { status: 400 });
}

async function withdraw(env, auth, body) {
  const id = String(body.id || "");
  const r = await env.DB.prepare("SELECT id, requested_by, status, target_id FROM change_requests WHERE id = ?").bind(id).first();
  if (!r || r.requested_by !== auth.email) return Response.json({ error: "Request not found." }, { status: 404 });
  if (r.status !== "PENDING") return Response.json({ error: "Only a request that is still waiting can be withdrawn." }, { status: 409 });
  const res = await env.DB.prepare(
    "UPDATE change_requests SET status = 'WITHDRAWN', reviewed_at = ? WHERE id = ? AND status = 'PENDING'"
  ).bind(new Date().toISOString(), id).run();
  if (!res.meta || !res.meta.changes) return Response.json({ error: "This request was decided a moment ago. Refresh the page." }, { status: 409 });
  await logEvent(env, auth.email, "change_request_withdrawn", r.target_id, { requestId: id });
  return Response.json({ ok: true });
}

function idList(body) {
  return Array.isArray(body.ids) ? [...new Set(body.ids.map(String))].slice(0, MAX_IDS) : [];
}

async function reject(env, auth, body) {
  const ids = idList(body);
  const note = clip(body.note, 500);
  if (!ids.length) return Response.json({ error: "No requests selected." }, { status: 400 });
  if (note.length < 3) return Response.json({ error: "Give the reason for rejecting. The operator will see it.", field: "note" }, { status: 400 });
  const results = [];
  for (const id of ids) {
    const r = await env.DB.prepare("SELECT id, status, requested_by, target_id FROM change_requests WHERE id = ?").bind(id).first();
    if (!r) { results.push({ id, result: "not_found" }); continue; }
    if (r.requested_by === auth.email) { results.push({ id, result: "own_request" }); continue; }
    const res = await env.DB.prepare(
      "UPDATE change_requests SET status = 'REJECTED', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND status = 'PENDING'"
    ).bind(auth.email, new Date().toISOString(), note, id).run();
    if (!res.meta || !res.meta.changes) { results.push({ id, result: "already_decided" }); continue; }
    await logEvent(env, auth.email, "change_request_rejected", r.target_id, { requestId: id, requestedBy: r.requested_by, note });
    results.push({ id, result: "rejected" });
  }
  return Response.json({ ok: true, results });
}

async function markOutOfDate(env, auth, r, why) {
  await env.DB.prepare(
    "UPDATE change_requests SET status = 'OUT_OF_DATE', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND status = 'PENDING'"
  ).bind(auth.email, new Date().toISOString(), why, r.id).run();
  await logEvent(env, auth.email, "change_request_out_of_date", r.target_id, { requestId: r.id, why });
}

async function approve(env, auth, body) {
  const ids = idList(body);
  if (!ids.length) return Response.json({ error: "No requests selected." }, { status: 400 });
  const results = [];
  for (const id of ids) {
    const r = await env.DB.prepare("SELECT * FROM change_requests WHERE id = ?").bind(id).first();
    if (!r) { results.push({ id, result: "not_found" }); continue; }
    if (r.status !== "PENDING") { results.push({ id, result: "already_decided" }); continue; }
    if (r.requested_by === auth.email) { results.push({ id, result: "own_request" }); continue; }
    const now = new Date().toISOString();

    if (r.kind === "contact") {
      const def = CONTACT_TABLES[r.target_type];
      const oldValues = parse(r.old_values) || {};
      const newValues = parse(r.new_values) || {};
      const fields = FIELDS.filter((f) => f in newValues);
      // Re-check with today's rules before applying.
      const recheck = validateContact(Object.fromEntries(fields.map((f) => [f, newValues[f] ?? ""])));
      if (!def || !fields.length || !recheck.ok) {
        await markOutOfDate(env, auth, r, recheck.ok ? "Request no longer valid." : recheck.error);
        results.push({ id, result: "invalid", error: recheck.ok ? null : recheck.error });
        continue;
      }
      if (newValues.email) {
        const d = await emailDomainCanReceive(newValues.email);
        if (!d.ok) { results.push({ id, result: "invalid", error: d.error }); continue; }
      }
      const col = { name: def.nameCol, phone: def.phoneCol, email: def.emailCol };
      // One transaction: change the record only if it still holds the old
      // values, and mark the request approved only if the record now holds
      // the requested values.
      const setSql = fields.map((f) => `${col[f]} = ?`).join(", ");
      const oldCond = fields.map((f) => `${col[f]} IS ?`).join(" AND ");
      const newCond = fields.map((f) => `${col[f]} IS ?`).join(" AND ");
      const batch = await env.DB.batch([
        env.DB.prepare(`UPDATE ${def.table} SET ${setSql} WHERE id = ? AND ${oldCond}`)
          .bind(...fields.map((f) => newValues[f] ?? null), r.target_id, ...fields.map((f) => oldValues[f] ?? null)),
        env.DB.prepare(
          `UPDATE change_requests SET status = 'APPROVED', reviewed_by = ?, reviewed_at = ?, applied_values = ?
           WHERE id = ? AND status = 'PENDING' AND EXISTS (SELECT 1 FROM ${def.table} WHERE id = ? AND ${newCond})`
        ).bind(auth.email, now, JSON.stringify(newValues), id, r.target_id, ...fields.map((f) => newValues[f] ?? null)),
      ]);
      const approved = batch[1] && batch[1].meta && batch[1].meta.changes;
      if (!approved) {
        await markOutOfDate(env, auth, r, "The record changed after this request was made.");
        results.push({ id, result: "out_of_date" });
        continue;
      }
      await logEvent(env, auth.email, "change_request_approved", r.target_id, {
        requestId: id, requestedBy: r.requested_by, type: r.target_type, before: oldValues, after: newValues,
      });
      results.push({ id, result: "approved" });
      continue;
    }

    if (r.kind === "add_unit") {
      const v = parse(r.new_values) || {};
      const checked = await checkNewUnit(env, v);
      if (!checked.ok) {
        await markOutOfDate(env, auth, r, checked.error);
        results.push({ id, result: checked.status === 409 ? "out_of_date" : "invalid", error: checked.error });
        continue;
      }
      // Claim the request first so two approvers can't both create the ward.
      const claim = await env.DB.prepare(
        "UPDATE change_requests SET status = 'APPROVED', reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'PENDING'"
      ).bind(auth.email, now, id).run();
      if (!claim.meta || !claim.meta.changes) { results.push({ id, result: "already_decided" }); continue; }
      const unitId = await insertUnit(env, checked.unit);
      await env.DB.prepare("UPDATE change_requests SET applied_values = ? WHERE id = ?")
        .bind(JSON.stringify({ ...v, id: unitId }), id).run();
      await logEvent(env, auth.email, "change_request_approved", unitId, {
        requestId: id, requestedBy: r.requested_by, kind: "add_unit", after: { ...v, id: unitId },
      });
      results.push({ id, result: "approved", unitId });
      continue;
    }
    results.push({ id, result: "invalid" });
  }
  return Response.json({ ok: true, results });
}
