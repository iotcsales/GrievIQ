/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/admin/handovers.js   (grieviq-53)
//
// Change of representative (see _shared/handover.js for what a change does).
//
// GET  -> { ready, canRequest, canApply, today, seats: { ward, mayor, mla, mp }, pending, recent }
// POST { action, ... }
//   propose  { seatType, seatId, kind, newName?, newPhone?, newEmail?, reason, reasonNote?, evidence, effectiveDate, applyNow? }
//            data entry operator: stored for approval. Super or operations
//            admin: applied at once when applyNow is true, else stored.
//   approve  { id }        super or operations admin, never their own request
//   reject   { id, note }  the same; the note is shown to the person who asked
//   withdraw { id }        the person who asked, while it waits

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import { handoverReady, listSeats, checkProposal, storeProposal, applyHandover, shapeRow, logEvent } from "../../_shared/handover.js";

function can(auth, permission) {
  return [].concat(auth.roles || auth.role).some((r) => (PERMISSIONS[permission] || []).includes(r));
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!can(auth, "view_handovers")) return Response.json({ error: "INSUFFICIENT_ROLE" }, { status: 403 });
  const canRequest = can(auth, "request_handover"), canApply = can(auth, "apply_handover");
  const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  if (!(await handoverReady(env))) return Response.json({ ready: false, canRequest, canApply, today });
  const [pend, recent] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM seat_handovers WHERE status = 'PENDING' ORDER BY requested_at ASC LIMIT 200"),
    env.DB.prepare("SELECT * FROM seat_handovers WHERE status <> 'PENDING' ORDER BY COALESCE(decided_at, requested_at) DESC LIMIT 100"),
  ]);
  return Response.json({
    ready: true, canRequest, canApply, today, me: auth.email,
    seats: await listSeats(env),
    pending: (pend.results || []).map(shapeRow),
    recent: (recent.results || []).map(shapeRow),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const canRequest = can(auth, "request_handover"), canApply = can(auth, "apply_handover");
  if (!canRequest && !canApply) return Response.json({ error: "INSUFFICIENT_ROLE" }, { status: 403 });
  if (!(await handoverReady(env))) return Response.json({ error: "NOT_READY" }, { status: 409 });
  let b = {};
  try { b = await request.json(); } catch (e) { return Response.json({ error: "BAD_JSON" }, { status: 400 }); }
  const origin = new URL(request.url).origin;
  const action = String(b.action || "");

  if (action === "propose") {
    const p = await checkProposal(env, b);
    if (!p.ok) return Response.json({ error: "INVALID", fields: p.fields }, { status: p.status });
    const id = await storeProposal(env, p, auth.email);
    if (b.applyNow && canApply) {
      const h = await env.DB.prepare("SELECT * FROM seat_handovers WHERE id = ?").bind(id).first();
      const r = await applyHandover(env, h, auth.email, origin);
      if (!r.ok) return Response.json({ error: r.error }, { status: 409 });
      return Response.json({ ok: true, id, status: "APPLIED", summary: r.summary });
    }
    return Response.json({ ok: true, id, status: "PENDING" });
  }

  const id = String(b.id || "");
  const h = id ? await env.DB.prepare("SELECT * FROM seat_handovers WHERE id = ?").bind(id).first() : null;
  if (!h) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (h.status !== "PENDING") return Response.json({ error: "ALREADY_DECIDED", status: h.status }, { status: 409 });
  const now = new Date().toISOString();
  const target = h.seat_type + ":" + h.seat_id;

  if (action === "withdraw") {
    if (h.requested_by !== auth.email) return Response.json({ error: "NOT_YOURS" }, { status: 403 });
    await env.DB.prepare("UPDATE seat_handovers SET status = 'WITHDRAWN', decided_by = ?, decided_at = ? WHERE id = ? AND status = 'PENDING'").bind(auth.email, now, id).run();
    await logEvent(env, auth.email, "seat_handover_withdrawn", target, { id });
    return Response.json({ ok: true, status: "WITHDRAWN" });
  }
  if (!canApply) return Response.json({ error: "INSUFFICIENT_ROLE" }, { status: 403 });
  if (h.requested_by === auth.email) return Response.json({ error: "OWN_REQUEST" }, { status: 403 });
  if (action === "approve") {
    const r = await applyHandover(env, h, auth.email, origin);
    if (!r.ok) return Response.json({ error: r.error }, { status: 409 });
    return Response.json({ ok: true, status: "APPLIED", summary: r.summary });
  }
  if (action === "reject") {
    const note = String(b.note || "").trim().slice(0, 300);
    if (note.length < 3) return Response.json({ error: "INVALID", fields: { note: "REQUIRED" } }, { status: 400 });
    await env.DB.prepare("UPDATE seat_handovers SET status = 'REJECTED', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ? AND status = 'PENDING'").bind(auth.email, now, note, id).run();
    await logEvent(env, auth.email, "seat_handover_rejected", target, { id, note });
    return Response.json({ ok: true, status: "REJECTED" });
  }
  return Response.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
}
