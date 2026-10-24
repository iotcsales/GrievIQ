/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/grievances/[id]/seat.js   (grieviq-57)
//
// POST { action: "take" }                  a member's office takes a case that
//                                          is open to every member of the ward
// POST { action: "return", reason }        the office that took an "any member"
//                                          case gives it back to the ward
// Only in wards with several members (see _shared/seats.js), only the
// representative or office manager, never while the office is paused.
//   - Taking is first come, first served: the update only succeeds while
//     nobody else has the case. Taking a case still at the ward level that
//     nobody has acknowledged also acknowledges it.
//   - A case the citizen sent to one member can't be given back: the citizen
//     chose that member (it goes back to the ward only if that member's
//     office can't act).
// Every take and return is written to team_activity (tamper-proof); the
// citizen and the other members are told.

import { getVerifiedRep } from "../../../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate, resolveChain } from "../../../_shared/jurisdiction.js";
import { computeEscalation } from "../../../_shared/escalation.js";
import { caseAccess, canManageCases } from "../../../_shared/team.js";
import { seatsReady, logSeat, RETURN_REASON_MIN, RETURN_REASON_MAX, letterOf } from "../../../_shared/seats.js";
import { notifyTaken, notifyReturned } from "../../../_shared/notify.js";

const json = (b, s) => Response.json(b, { status: s || 200 });
const OPEN = ["OPEN", "ACKNOWLEDGED"];

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await seatsReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const action = String(b.action || "");
  if (action !== "take" && action !== "return") return json({ error: "Unknown action." }, 400);

  const g = await env.DB.prepare("SELECT * FROM grievances WHERE id = ?").bind(String(params.id || "")).first();
  if (!g) return json({ error: "Grievance not found" }, 404);
  if (!OPEN.includes(g.status)) return json({ error: "This case is not open.", code: "NOT_OPEN" }, 409);

  const access = await caseAccess(env, auth, g, getLocalUnitIdsForMandate, { pool: action === "take" });
  const m = access && access.mandate;
  if (!access || m.tier !== "LOCAL" || !m.multi) {
    const sameWard = auth.mandates.some((x) => x.tier === "LOCAL" && x.multi && String(x.unit) === String(g.local_unit_id));
    if (action === "take" && g.seat_owner && sameWard && g.seat_choice === "ANY") return json({ error: "Another member's office has taken this case.", code: "TAKEN" }, 409);
    return json({ error: "You do not have jurisdiction over this case" }, 403);
  }
  if (!canManageCases(access.role)) return json({ error: "Only the representative or office manager can do this.", code: "ROLE" }, 403);
  const now = new Date().toISOString();
  const origin = env.SITE_ORIGIN || new URL(request.url).origin;

  if (action === "take") {
    if (g.seat_owner) return json({ error: g.seat_owner === m.id ? "Your office already has this case." : "Another member's office has taken this case.", code: g.seat_owner === m.id ? "ALREADY_YOURS" : "TAKEN" }, 409);
    // Taking a case still at the ward level that nobody acknowledged also acknowledges it.
    let ack = false;
    if (!g.acknowledged_at) {
      const [chain, category] = await Promise.all([
        resolveChain(env, g.local_unit_id),
        env.DB.prepare("SELECT * FROM grievance_categories WHERE id = ?").bind(g.category_id).first(),
      ]);
      ack = !!(chain && category && computeEscalation(g, category, chain.tiers).currentTierIndex === 0);
    }
    const r = await env.DB.prepare(
      `UPDATE grievances SET seat_owner = ?, seat_owner_at = ?, seat_choice = COALESCE(seat_choice, 'ANY'), updated_at = ?${ack ? ", acknowledged_at = ?" : ""}
        WHERE id = ? AND seat_owner IS NULL AND status IN ('OPEN', 'ACKNOWLEDGED')`
    ).bind(...[m.id, now, now].concat(ack ? [now] : []), g.id).run();
    if (!r.meta || !r.meta.changes) return json({ error: "Another member's office has just taken this case.", code: "TAKEN" }, 409);
    if (ack) {
      await env.DB.prepare("INSERT INTO grievance_events (id, grievance_id, event_type, actor, created_at) VALUES (?, ?, 'ACKNOWLEDGED', ?, ?)")
        .bind(crypto.randomUUID(), g.id, auth.email, now).run();
    }
    await logSeat(env, m.id, auth.email, access.role, "CASE_TAKEN", g.id, { acknowledged: ack });
    const seat = { id: m.id, letter: m.seatLabel || letterOf(m.id), name: null };
    try { const o = await env.DB.prepare("SELECT rep_name FROM local_offices WHERE id = ?").bind(m.id).first(); seat.name = o && o.rep_name ? o.rep_name : null; } catch (e) { /* ignore */ }
    const told = notifyTaken(env, origin, Object.assign({}, g, { seat_owner: m.id, seat_owner_at: now }), seat);
    if (typeof context.waitUntil === "function") context.waitUntil(told); else await told;
    return json({ ok: true, owner: m.id, acknowledgedAt: ack ? now : g.acknowledged_at || null });
  }

  // return
  if (g.seat_owner !== m.id) return json({ error: "Your office doesn't have this case.", code: "NOT_YOURS" }, 409);
  if (g.seat_choice && g.seat_choice !== "ANY") return json({ error: "The citizen sent this complaint to your office, so it can't be given to another member.", code: "CHOSEN" }, 409);
  const reason = String(b.reason == null ? "" : b.reason).trim();
  if (reason.length < RETURN_REASON_MIN) return json({ error: "Say why, in at least " + RETURN_REASON_MIN + " letters.", fields: { reason: "REQUIRED" } }, 400);
  if (reason.length > RETURN_REASON_MAX) return json({ error: "Keep the reason under " + RETURN_REASON_MAX + " letters.", fields: { reason: "LENGTH" } }, 400);
  const r = await env.DB.prepare("UPDATE grievances SET seat_owner = NULL, seat_owner_at = NULL, updated_at = ? WHERE id = ? AND seat_owner = ?").bind(now, g.id, m.id).run();
  if (!r.meta || !r.meta.changes) return json({ error: "Your office doesn't have this case.", code: "NOT_YOURS" }, 409);
  try { await env.DB.prepare("UPDATE case_assignments SET ended_at = ?, ended_by = ?, end_reason = 'RETURNED_TO_WARD' WHERE grievance_id = ? AND office_tier = 'LOCAL' AND office_id = ? AND ended_at IS NULL").bind(now, auth.email, g.id, m.id).run(); } catch (e) { /* no assignments table */ }
  await logSeat(env, m.id, auth.email, access.role, "CASE_RETURNED", g.id, { reason });
  const told = notifyReturned(env, origin, [{ g: Object.assign({}, g, { seat_owner: null }), from: m.id, why: "RETURNED" }]);
  if (typeof context.waitUntil === "function") context.waitUntil(told); else await told;
  return json({ ok: true });
}
