// POST /api/grievances/[id]/review-report   (representative or office manager, item 8b)
//
// Decides a field worker's fix report: { reportId, decision, note }.
//   approve    -> marks the case resolved with that report, exactly as the
//                 representative's own "Mark resolved" does
//                 (_shared/resolve-case.js): the citizen confirms, or GrievIQ
//                 staff check when there is no email
//   send_back  -> note required (10-500 characters); the field worker sees
//                 it and can submit a new report
// Separation of duties (NIST AC-5): nobody decides their own report.

import { getVerifiedRep } from "../../../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate, resolveChain } from "../../../_shared/jurisdiction.js";
import { computeEscalation } from "../../../_shared/escalation.js";
import { finalizeResolution } from "../../../_shared/resolve-case.js";
import { caseAccess, canManageCases, logTeam, onBehalfOf } from "../../../_shared/team.js";

export async function onRequestPost({ request, env, params }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch (e) { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const g = await env.DB.prepare("SELECT * FROM grievances WHERE id = ?").bind(params.id).first();
  if (!g) return Response.json({ error: "Grievance not found" }, { status: 404 });
  const access = await caseAccess(env, auth, g, getLocalUnitIdsForMandate);
  if (!access) return Response.json({ error: "You do not have jurisdiction over this case" }, { status: 403 });
  if (!canManageCases(access.role)) return Response.json({ error: "Only the representative or office manager can decide fix reports.", code: "ROLE" }, { status: 403 });

  const report = await env.DB.prepare(
    "SELECT * FROM resolution_reports WHERE id = ? AND grievance_id = ? AND review_status = 'PENDING'"
  ).bind(String(body.reportId || ""), g.id).first();
  if (!report) return Response.json({ error: "This fix report has already been decided. Refresh the page.", code: "NOT_PENDING" }, { status: 409 });
  if (String(report.created_by).toLowerCase() === auth.email) {
    return Response.json({ error: "You can't approve or send back your own fix report.", code: "OWN_REPORT" }, { status: 403 });
  }

  const decision = String(body.decision || "");
  const note = String(body.note || "").trim();
  const now = new Date().toISOString();
  const teamBase = { officeTier: access.mandate.tier, officeId: access.mandate.id, actor: auth.email, actorRole: access.role,
    onBehalf: onBehalfOf(access.mandate, auth), grievanceId: g.id };

  if (decision === "send_back") {
    if (note.length < 10 || note.length > 500) {
      return Response.json({ error: "Say what needs to be done, in 10 to 500 characters.", fields: { note: "NOTE_LENGTH" } }, { status: 400 });
    }
    await env.DB.prepare(
      "UPDATE resolution_reports SET review_status = 'SENT_BACK', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND review_status = 'PENDING'"
    ).bind(auth.email, now, note, report.id).run();
    await logTeam(env, { ...teamBase, action: "FIX_REPORT_SENT_BACK", detail: { reportId: report.id, submittedBy: report.created_by, note } });
    return Response.json({ ok: true, decision });
  }

  if (decision !== "approve") return Response.json({ error: "Unknown decision." }, { status: 400 });
  if (g.status === "RESOLVED" || g.status === "CLOSED" || g.status === "PENDING_CONFIRMATION") {
    return Response.json({ error: "This case is already resolved or awaiting confirmation.", code: "NOT_OPEN" }, { status: 409 });
  }
  const chain = await resolveChain(env, g.local_unit_id);
  const category = await env.DB.prepare("SELECT * FROM grievance_categories WHERE id = ?").bind(g.category_id).first();
  if (!chain || !category) return Response.json({ error: "Could not resolve jurisdiction or category for this case" }, { status: 500 });
  const result = computeEscalation(g, category, chain.tiers);

  await env.DB.prepare(
    "UPDATE resolution_reports SET review_status = 'APPROVED', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ? AND review_status = 'PENDING'"
  ).bind(auth.email, now, note ? note.slice(0, 500) : null, report.id).run();
  const out = await finalizeResolution(env, request, g, result.currentTier.tier, report.note, auth.email);
  await logTeam(env, { ...teamBase, action: "FIX_REPORT_APPROVED", detail: { reportId: report.id, submittedBy: report.created_by } });
  return Response.json({ ...out, decision });
}
