/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/handover.js   (grieviq-53)
//
// The person who has taken over an office answers its handover summary.
// POST { id, action: "accept_plan" | "seen" }
//   accept_plan  records that the new holder continues the office's plan
//   seen         the summary has been read; it is not shown again
// Only the person now holding that seat can do either. Logged.

import { getVerifiedRep } from "../_shared/get-verified-rep.js";
import { handoverReady, readSeat, logEvent } from "../_shared/handover.js";

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedRep(request, env, { allowPaused: true });
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!(await handoverReady(env))) return Response.json({ error: "NOT_READY" }, { status: 409 });
  let b = {};
  try { b = await request.json(); } catch (e) { return Response.json({ error: "BAD_JSON" }, { status: 400 }); }
  const h = await env.DB.prepare("SELECT * FROM seat_handovers WHERE id = ? AND status = 'APPLIED'").bind(String(b.id || "")).first();
  const me = String(auth.email || "").toLowerCase();
  if (!h || String(h.new_email || "").toLowerCase() !== me) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const seat = await readSeat(env, h.seat_type, h.seat_id);
  if (!seat || seat.email !== me) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const now = new Date().toISOString();
  if (b.action === "accept_plan") {
    await env.DB.prepare("UPDATE seat_handovers SET plan_accepted_at = COALESCE(plan_accepted_at, ?) WHERE id = ?").bind(now, h.id).run();
    await logEvent(env, me, "seat_handover_plan_accepted", h.seat_type + ":" + h.seat_id, { id: h.id });
    return Response.json({ ok: true, planAccepted: true });
  }
  if (b.action === "seen") {
    await env.DB.prepare("UPDATE seat_handovers SET welcome_seen_at = COALESCE(welcome_seen_at, ?) WHERE id = ?").bind(now, h.id).run();
    await logEvent(env, me, "seat_handover_summary_read", h.seat_type + ":" + h.seat_id, { id: h.id });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
}
