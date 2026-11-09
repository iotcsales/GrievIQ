/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/grievances/[id]/priority   { reason }   (grieviq-86)
// Takes priority off a complaint the citizen marked as a danger to life or
// health, when the office finds it isn't one. The representative or office
// manager says why (10 to 300 characters); the citizen sees the reason on
// their Track page. The normal time limits for the type of problem apply
// from then on (counted from filing, as for any case).
import { officeCase, readBody } from "../../../_shared/case-actions.js";
import { isPriority, addUpdate, cleanText, hasContact, REASON_MIN, REASON_MAX } from "../../../_shared/case-tools.js";
import { logTeam, onBehalfOf } from "../../../_shared/team.js";

export async function onRequestPost({ request, env, params }) {
  const c = await officeCase(request, env, params.id, { manage: true });
  if (c instanceof Response) return c;
  const { auth, g, access } = c;
  const b = await readBody(request);
  if (!b) return Response.json({ error: "Invalid request body." }, { status: 400 });
  const reason = cleanText(b.reason, REASON_MAX);
  if (reason.length < REASON_MIN || reason.length > REASON_MAX || hasContact(reason)) return Response.json({ error: "Say why it is not a danger to life or health (10 to 300 characters, no phone numbers or emails).", fields: { reason: hasContact(reason) ? "CONTACT" : "LENGTH" } }, { status: 400 });
  if (!isPriority(g)) return Response.json({ error: "This complaint is not marked priority.", code: "NOT_PRIORITY" }, { status: 409 });
  if (g.status !== "OPEN" && g.status !== "ACKNOWLEDGED") return Response.json({ error: "This case is closed.", code: "CLOSED" }, { status: 409 });
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE grievances SET priority_off_at = ?, updated_at = ? WHERE id = ? AND priority_off_at IS NULL").bind(now, now, g.id).run();
  await addUpdate(env, { grievanceId: g.id, kind: "PRIORITY_OFF", tier: access.mandate.tier, byKind: "OFFICE", byEmail: auth.email, text: reason, at: now });
  await logTeam(env, { officeTier: access.mandate.tier, officeId: access.mandate.id, actor: auth.email, actorRole: access.role, onBehalf: onBehalfOf(access.mandate, auth), action: "PRIORITY_OFF", grievanceId: g.id });
  return Response.json({ removed: true });
}
