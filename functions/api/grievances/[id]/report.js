/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/grievances/[id]/report   { reason, note }   (grieviq-82)
//
// A representative or office manager tells GrievIQ a complaint looks false, abusive, a duplicate
// or outside their area. It goes to GrievIQ staff (admin Misuse page) and never closes or hides the
// case by itself: the office keeps its time limits until staff decide. One open report per office
// per case. reason: FALSE | ABUSIVE | DUPLICATE | OUTSIDE | OTHER; note: 10-500 characters.
import { getVerifiedRep } from "../../../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate } from "../../../_shared/jurisdiction.js";
import { caseAccess, canManageCases, logTeam, onBehalfOf } from "../../../_shared/team.js";
import { REPORT_REASONS, NOTE_MAX } from "../../../_shared/misuse.js";

export async function onRequestPost({ request, env, params }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const g = await env.DB.prepare("SELECT * FROM grievances WHERE id = ?").bind(params.id).first();
  if (!g) return Response.json({ error: "Grievance not found" }, { status: 404 });
  const access = await caseAccess(env, auth, g, getLocalUnitIdsForMandate);
  if (!access) return Response.json({ error: "You do not have jurisdiction over this case" }, { status: 403 });
  if (!canManageCases(access.role)) return Response.json({ error: "Only the representative or office manager can report a complaint.", code: "ROLE" }, { status: 403 });
  let b; try { b = await request.json(); } catch (e) { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const reason = String(b.reason || "").toUpperCase(), note = String(b.note || "").trim();
  const fields = {};
  if (!REPORT_REASONS.includes(reason)) fields.reason = "REQUIRED";
  if (note.length < 10) fields.note = "SHORT"; else if (note.length > NOTE_MAX) fields.note = "LONG";
  if (Object.keys(fields).length) return Response.json({ error: "Please choose a reason and say what is wrong (10 to 500 characters).", fields }, { status: 400 });
  if (g.status === "CLOSED" || g.status === "RESOLVED") return Response.json({ error: "This case is already closed.", code: "CLOSED" }, { status: 409 });
  const officeKey = access.mandate.tier + ":" + access.mandate.id;
  const open = await env.DB.prepare("SELECT id FROM complaint_reports WHERE grievance_id = ? AND office_key = ? AND status = 'OPEN'").bind(g.id, officeKey).first();
  if (open) return Response.json({ error: "Your office has already reported this complaint. GrievIQ staff will look at it.", code: "ALREADY" }, { status: 409 });
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO complaint_reports (id, grievance_id, by_kind, by_email, office_key, reason, note, created_at) VALUES (?, ?, 'REP', ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), g.id, auth.email, officeKey, reason, note, now).run();
  await logTeam(env, { officeTier: access.mandate.tier, officeId: access.mandate.id, actor: auth.email, actorRole: access.role, onBehalf: onBehalfOf(access.mandate, auth), action: "REPORTED_COMPLAINT", grievanceId: g.id, detail: { reason } });
  return Response.json({ reported: true });
}
