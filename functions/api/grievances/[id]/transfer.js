/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/grievances/[id]/transfer   (grieviq-86)
//   GET               the wards and villages of the same area it can go to
//   POST { to, reason }   send the case to the right ward or village
// For the representative or office manager of an office that sees the case
// (in a ward with several members, also a case still open to every member),
// within 48 hours of filing and once per case. The new office's time limits
// start again; the citizen and anyone following it are told. After that,
// GrievIQ staff can move it (admin Cases page).
import { officeCase, readBody, transferOptions, transferCase } from "../../../_shared/case-actions.js";
import { transferStatus } from "../../../_shared/case-tools.js";
import { logTeam, onBehalfOf } from "../../../_shared/team.js";

export async function onRequestGet({ request, env, params }) {
  const c = await officeCase(request, env, params.id, { manage: true, pool: true });
  if (c instanceof Response) return c;
  const st = transferStatus(c.g);
  return Response.json({ status: st, options: st.can ? await transferOptions(env, c.g) : [] });
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const c = await officeCase(request, env, params.id, { manage: true, pool: true });
  if (c instanceof Response) return c;
  const { auth, g, access } = c;
  const st = transferStatus(g);
  if (!st.can) return Response.json({ error: st.code === "TOO_LATE" ? "More than 48 hours have passed since filing. Ask GrievIQ staff to move it." : st.code === "ALREADY_MOVED" ? "This case has already been moved once. Ask GrievIQ staff to move it again." : "This case can't be moved now.", code: st.code }, { status: 409 });
  const b = await readBody(request);
  if (!b) return Response.json({ error: "Invalid request body." }, { status: 400 });
  const r = await transferCase(env, new URL(request.url).origin, g, b.to, b.reason, { kind: "OFFICE", email: auth.email, tier: access.mandate.tier }, context.waitUntil && context.waitUntil.bind(context));
  if (!r.ok) return Response.json({ error: r.error, code: r.code, fields: r.fields }, { status: r.status });
  await logTeam(env, { officeTier: access.mandate.tier, officeId: access.mandate.id, actor: auth.email, actorRole: access.role, onBehalf: onBehalfOf(access.mandate, auth), action: "SENT_TO_OTHER_WARD", grievanceId: g.id, detail: { to: r.to.id } });
  return Response.json({ moved: true, to: r.to.name });
}
