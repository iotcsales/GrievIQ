/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/grievances/[id]/close-no-info   (grieviq-86)
// "Closed: not enough information". Only when the office's last question
// has had no answer for 7 days, by the representative or office manager.
// The citizen (and anyone following it) is told; the citizen can reopen it
// within 30 days by answering the question on the Track page.
import { officeCase } from "../../../_shared/case-actions.js";
import { loadUpdates, questionStatus, addUpdate } from "../../../_shared/case-tools.js";
import { resolveChain } from "../../../_shared/jurisdiction.js";
import { computeEscalation } from "../../../_shared/escalation.js";
import { logTeam, onBehalfOf } from "../../../_shared/team.js";
import { emailCaseUpdate } from "../../../_shared/notify.js";
import { pushCitizen } from "../../../_shared/citizen-push.js";

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const c = await officeCase(request, env, params.id, { manage: true });
  if (c instanceof Response) return c;
  const { auth, g, access } = c;
  const rows = (await loadUpdates(env, [g.id])).get(g.id) || [];
  const st = questionStatus(g, rows);
  if (!st.canCloseNoInfo) return Response.json({ error: "A case can be closed for not enough information only when your question has had no answer for 7 days.", code: "NOT_YET", from: st.closeFrom }, { status: 409 });
  const [chain, category] = await Promise.all([resolveChain(env, g.local_unit_id), env.DB.prepare("SELECT * FROM grievance_categories WHERE id = ?").bind(g.category_id).first()]);
  const tier = chain && category ? computeEscalation(g, category, chain.tiers).currentTier.tier : g.current_tier;
  const now = new Date().toISOString();
  const res = await env.DB.prepare("UPDATE grievances SET status = 'CLOSED', closure_kind = 'NO_INFO', closed_at = ?, current_tier = ?, updated_at = ? WHERE id = ? AND status IN ('OPEN', 'ACKNOWLEDGED')")
    .bind(now, tier, now, g.id).run();
  if (!res.meta || !res.meta.changes) return Response.json({ error: "This case is closed.", code: "CLOSED" }, { status: 409 });
  await addUpdate(env, { grievanceId: g.id, kind: "NO_INFO", tier: access.mandate.tier, byKind: "OFFICE", byEmail: auth.email, at: now });
  await env.DB.prepare("UPDATE case_assignments SET ended_at = ? WHERE grievance_id = ? AND ended_at IS NULL").bind(now, g.id).run().catch(() => {});
  await logTeam(env, { officeTier: access.mandate.tier, officeId: access.mandate.id, actor: auth.email, actorRole: access.role, onBehalf: onBehalfOf(access.mandate, auth), action: "CLOSED_NO_INFO", grievanceId: g.id });
  const origin = new URL(request.url).origin;
  const told = Promise.all([
    emailCaseUpdate(env, origin, g, "NO_INFO", { wardName: chain && chain.localUnit.name, category, stamp: now }),
    pushCitizen(env, g, "NO_INFO", {}, "NOINFO:" + g.id + ":" + now),
  ]);
  if (typeof context.waitUntil === "function") context.waitUntil(told); else await told;
  return Response.json({ closed: true, at: now });
}
