// POST /api/grievances/[id]/assign   (representative or office manager, item 8b)
//
// Assigns an open case to one field worker of the office (or clears the
// assignment with { email: null }). Only one field worker at a time; every
// change is kept (case_assignments rows are ended, not deleted) and logged
// in the team activity log. Item 8c-1: the field worker must cover the
// case's ward and not be on leave.

import { getVerifiedRep } from "../../../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate } from "../../../_shared/jurisdiction.js";
import { caseAccess, canManageCases, activeAssignment, logTeam, onBehalfOf, officeInfo, coversWard, ROLE } from "../../../_shared/team.js";

export async function onRequestPost({ request, env, params }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch (e) { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const g = await env.DB.prepare("SELECT * FROM grievances WHERE id = ?").bind(params.id).first();
  if (!g) return Response.json({ error: "Grievance not found" }, { status: 404 });
  const access = await caseAccess(env, auth, g, getLocalUnitIdsForMandate);
  if (!access) return Response.json({ error: "You do not have jurisdiction over this case" }, { status: 403 });
  if (!canManageCases(access.role)) return Response.json({ error: "Only the representative or office manager can assign cases.", code: "ROLE" }, { status: 403 });
  if (g.status === "RESOLVED" || g.status === "CLOSED" || g.status === "PENDING_CONFIRMATION") {
    return Response.json({ error: "Only open cases can be assigned.", code: "NOT_OPEN" }, { status: 409 });
  }

  const m = access.mandate;
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  let member = null;
  if (email) {
    const office = await officeInfo(env, m.tier, m.id);
    member = await env.DB.prepare(
      "SELECT * FROM office_team WHERE office_tier = ? AND office_id = ? AND LOWER(member_email) = ? AND status = 'ACTIVE' AND role = ?"
    ).bind(m.tier, m.id, email, ROLE.FW).first();
    if (!member || !office || String(member.confirmed_by_rep_email || "").toLowerCase() !== office.repEmail) {
      return Response.json({ error: "Choose a field worker from this office's team.", fields: { email: "NOT_MEMBER" } }, { status: 400 });
    }
    // Item 8c-1: only within the member's wards, and not while on leave
    // (unless they already hold this case).
    if (!coversWard(member, g.local_unit_id)) {
      return Response.json({ error: "This field worker doesn't cover this case's ward. Change their wards in the Team tab first.", fields: { email: "OUT_OF_AREA" } }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const current = await activeAssignment(env, g.id);
  if (current && email && current.assignee_email === email) return Response.json({ ok: true, unchanged: true });
  if (member && member.available != null && Number(member.available) === 0) {
    return Response.json({ error: "This field worker is marked on leave. Choose someone else, or mark them available in the Team tab.", fields: { email: "ON_LEAVE" } }, { status: 400 });
  }
  const stmts = [];
  if (current) {
    stmts.push(env.DB.prepare("UPDATE case_assignments SET ended_at = ?, ended_by = ?, end_reason = ? WHERE id = ? AND ended_at IS NULL")
      .bind(now, auth.email, email ? "REASSIGNED" : "UNASSIGNED", current.id));
  }
  if (email) {
    stmts.push(env.DB.prepare(
      `INSERT INTO case_assignments (id, grievance_id, office_tier, office_id, assignee_email, assigned_by, assigned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), g.id, m.tier, m.id, email, auth.email, now));
  }
  if (stmts.length) await env.DB.batch(stmts);
  await logTeam(env, { officeTier: m.tier, officeId: m.id, actor: auth.email, actorRole: access.role, onBehalf: onBehalfOf(m, auth),
    action: email ? "ASSIGNED" : "UNASSIGNED", grievanceId: g.id, detail: email ? { to: email, name: member.member_name, from: current ? current.assignee_email : null } : { from: current ? current.assignee_email : null } });
  return Response.json({ ok: true });
}
