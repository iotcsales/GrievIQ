/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/grievances/[id]/ask   { question }   (grieviq-86)
// The office asks the citizen a question. The citizen is told by email (and
// phone alert if on) and answers on their Track page; the office never sees
// the citizen's phone or email. One open question at a time, at most 3 per
// case, 20 to 500 characters, no phone numbers or emails in it. The time
// limits keep running. Anyone in the office who works on cases may ask.
import { officeCase, readBody } from "../../../_shared/case-actions.js";
import { loadUpdates, questionStatus, hasContact, cleanText, addUpdate, TEXT_MIN, TEXT_MAX } from "../../../_shared/case-tools.js";
import { logTeam, onBehalfOf } from "../../../_shared/team.js";
import { emailCaseUpdate } from "../../../_shared/notify.js";
import { pushCitizen } from "../../../_shared/citizen-push.js";

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const c = await officeCase(request, env, params.id);
  if (c instanceof Response) return c;
  const { auth, g, access } = c;
  const b = await readBody(request);
  if (!b) return Response.json({ error: "Invalid request body." }, { status: 400 });
  const q = cleanText(b.question, TEXT_MAX);
  if (q.length < TEXT_MIN || q.length > TEXT_MAX) return Response.json({ error: "Write the question in 20 to 500 characters.", code: "LENGTH", fields: { question: "LENGTH" } }, { status: 400 });
  if (hasContact(q)) return Response.json({ error: "Please take out phone numbers and email addresses. The citizen answers on GrievIQ.", code: "CONTACT", fields: { question: "CONTACT" } }, { status: 400 });
  const rows = (await loadUpdates(env, [g.id])).get(g.id) || [];
  const st = questionStatus(g, rows);
  if (!st.canAsk) return Response.json({ error: { CLOSED: "This case is closed.", NO_EMAIL: "The citizen gave no email, so they can't be asked here.", WAITING: "Your last question hasn't been answered yet.", LIMIT: "This case already has 3 questions." }[st.why] || "Can't ask now.", code: st.why }, { status: 409 });
  const now = new Date().toISOString();
  await addUpdate(env, { grievanceId: g.id, kind: "QUESTION", tier: access.mandate.tier, byKind: "OFFICE", byEmail: auth.email, text: q, at: now });
  await logTeam(env, { officeTier: access.mandate.tier, officeId: access.mandate.id, actor: auth.email, actorRole: access.role, onBehalf: onBehalfOf(access.mandate, auth), action: "ASKED_CITIZEN", grievanceId: g.id });
  const origin = new URL(request.url).origin;
  const chainCat = await env.DB.prepare("SELECT g.tracking_ref, lu.name AS ward, c.id AS cid, c.name AS cname FROM grievances g JOIN local_units lu ON lu.id = g.local_unit_id JOIN grievance_categories c ON c.id = g.category_id WHERE g.id = ?").bind(g.id).first();
  const told = Promise.all([
    emailCaseUpdate(env, origin, g, "QUESTION", { wardName: chainCat && chainCat.ward, category: chainCat && { id: chainCat.cid, name: chainCat.cname }, stamp: now }),
    pushCitizen(env, g, "QUESTION", {}, "Q:" + g.id + ":" + now),
  ]);
  if (typeof context.waitUntil === "function") context.waitUntil(told); else await told;
  return Response.json({ asked: true, at: now });
}
