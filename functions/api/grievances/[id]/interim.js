/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/grievances/[id]/interim   { reason, note, expectedBy }   (grieviq-86)
// "This will take longer": an interim reply (DARPG's interim reply, given
// when a grievance can't be settled within the time limit). The level now
// responsible gives a reason, what it is doing and an expected date, from
// tomorrow to 60 days ahead. Once per level. Its time limit moves to that
// date and the higher levels move with it; if the work isn't done by then,
// the case moves up at once. The case must be acknowledged first. The
// citizen and anyone following it are told.
//   reason: TENDER | DEPARTMENT | MATERIAL | WEATHER | LEGAL | OTHER
//   expectedBy: YYYY-MM-DD (the end of that day, India time)
import { officeCase, readBody } from "../../../_shared/case-actions.js";
import { INTERIM_REASONS, INTERIM_MAX_DAYS, TEXT_MIN, TEXT_MAX, readInterims, hasContact, cleanText, addUpdate } from "../../../_shared/case-tools.js";
import { resolveChain } from "../../../_shared/jurisdiction.js";
import { computeEscalation, clockStart } from "../../../_shared/escalation.js";
import { logTeam, onBehalfOf } from "../../../_shared/team.js";
import { emailCaseUpdate } from "../../../_shared/notify.js";
import { pushCitizen } from "../../../_shared/citizen-push.js";

const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_HI = ["जन॰", "फ़र॰", "मार्च", "अप्रैल", "मई", "जून", "जुल॰", "अग॰", "सित॰", "अक्तू॰", "नव॰", "दिस॰"];

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const c = await officeCase(request, env, params.id, { manage: true });
  if (c instanceof Response) return c;
  const { auth, g, access } = c;
  const b = await readBody(request);
  if (!b) return Response.json({ error: "Invalid request body." }, { status: 400 });
  const reason = String(b.reason || "").toUpperCase();
  const note = cleanText(b.note, TEXT_MAX);
  const day = String(b.expectedBy || "");
  const fields = {};
  if (!INTERIM_REASONS.includes(reason)) fields.reason = "REQUIRED";
  if (note.length < TEXT_MIN || note.length > TEXT_MAX) fields.note = "LENGTH"; else if (hasContact(note)) fields.note = "CONTACT";
  // The end of the chosen day in India (23:59 IST = 18:29 UTC).
  const until = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(day + "T18:29:00Z") : NaN;
  const now = Date.now();
  if (isNaN(until) || until < now + 12 * 3600000 || until > now + INTERIM_MAX_DAYS * 86400000 + 86400000) fields.expectedBy = "RANGE";
  if (Object.keys(fields).length) return Response.json({ error: "Please choose a reason, say what you are doing (20 to 500 characters, no phone numbers or emails) and pick a date from tomorrow to 60 days ahead.", fields }, { status: 400 });
  if (g.status !== "OPEN" && g.status !== "ACKNOWLEDGED") return Response.json({ error: "This case is closed.", code: "CLOSED" }, { status: 409 });
  if (!g.acknowledged_at) return Response.json({ error: "Acknowledge the case first.", code: "NOT_ACK" }, { status: 409 });
  const [chain, category] = await Promise.all([resolveChain(env, g.local_unit_id), env.DB.prepare("SELECT * FROM grievance_categories WHERE id = ?").bind(g.category_id).first()]);
  if (!chain || !category) return Response.json({ error: "Could not read this case's levels." }, { status: 500 });
  const r = computeEscalation(g, category, chain.tiers);
  const tier = access.mandate.tier;
  if (r.currentTier.tier !== tier) return Response.json({ error: "Only the level the case is with now can give an interim reply.", code: "NOT_CURRENT" }, { status: 409 });
  if (r.needsLegalReview) return Response.json({ error: "This type of complaint has no time limit to move.", code: "NO_LIMIT" }, { status: 409 });
  const start = clockStart(g, chain.tiers);
  const iv = readInterims(g);
  if (iv[tier] && Number(iv[tier].clock) === start.ms) return Response.json({ error: "Your level has already given an interim reply on this case.", code: "ALREADY" }, { status: 409 });
  const iso = new Date(until).toISOString(), at = new Date(now).toISOString();
  iv[tier] = { until: iso, clock: start.ms };
  await env.DB.prepare("UPDATE grievances SET interims = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(iv), at, g.id).run();
  await addUpdate(env, { grievanceId: g.id, kind: "INTERIM", tier, byKind: "OFFICE", byEmail: auth.email, reason, text: note, expectedBy: iso, at });
  await logTeam(env, { officeTier: tier, officeId: access.mandate.id, actor: auth.email, actorRole: access.role, onBehalf: onBehalfOf(access.mandate, auth), action: "INTERIM_REPLY", grievanceId: g.id, detail: { reason, expectedBy: day } });
  const origin = new URL(request.url).origin;
  const d = new Date(until + 5.5 * 3600000);
  const told = Promise.all([
    emailCaseUpdate(env, origin, g, "INTERIM", { wardName: chain.localUnit.name, category, reason, text: note, expectedMs: until, label: r.currentTier.label, stamp: at }),
    pushCitizen(env, g, "INTERIM", { date: d.getUTCDate() + " " + MON_EN[d.getUTCMonth()], dateHi: d.getUTCDate() + " " + MON_HI[d.getUTCMonth()] }, "INT:" + g.id + ":" + at),
  ]);
  if (typeof context.waitUntil === "function") context.waitUntil(told); else await told;
  return Response.json({ saved: true, expectedBy: iso });
}
