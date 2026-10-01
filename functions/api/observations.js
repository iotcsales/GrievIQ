// /api/observations   (rep console, item 9c: the office's audit observations)
//
// Observations the auditor has addressed to a representative's office. In
// that office the representative and the office managers see and answer
// them; field workers and office assistants don't (least privilege). The
// finding itself can never be changed here: only the auditor closes it, and
// only the super admin accepts a risk (IIA Standard 7: independence).
//
// GET              the observations of the caller's offices (issued ones)
// GET ?id=<id>     one observation, its history, and what the caller may do
// POST { action, id, ... }
//   respond        { agree, text, actionPlan?, targetDate? }
//   report_done    { evidence }
//   comment        { text }
// Every action goes into observation_events (which can't be changed) with
// the person, their role and the office, and into the office's team
// activity.

import { getVerifiedRep } from "../_shared/get-verified-rep.js";
import { shapeObservation, todayIst, logObservation } from "../_shared/audit.js";
import { answerableOffices, addOwnerLabels, ownerAction, officeText, officeByKey } from "../_shared/audit-office.js";
import { logTeam, onBehalfOf, ROLE } from "../_shared/team.js";

const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const ROLE_WORDS = { REPRESENTATIVE: "Representative", OFFICE_MANAGER: "Office manager" };

function permissionsFor(o) {
  return {
    respond: o.status === "ISSUED" || o.status === "RESPONDED",
    reportDone: o.status === "RESPONDED" && o.response_agree === 1,
    comment: o.status !== "DRAFT" && o.status !== "WITHDRAWN",
  };
}
// What the office should do next (for the list and the tab's count): reply,
// or report the agreed action done. After disagreeing, the auditor or the
// super admin decides the next step.
function needsAction(o) { return o.status === "ISSUED" || (o.status === "RESPONDED" && o.response_agree === 1); }
// Whether the auditor's latest step was to send it back (for the status words).
async function sentBackSet(env, ids) {
  const out = new Set();
  if (!ids.length) return out;
  const { results } = await env.DB.prepare(
    "SELECT observation_id, kind FROM observation_events WHERE observation_id IN (SELECT value FROM json_each(?)) AND kind IN ('SENT_BACK', 'DONE_REPORTED', 'RESPONDED') ORDER BY created_at ASC, rowid ASC"
  ).bind(JSON.stringify(ids)).all();
  const last = new Map();
  for (const r of results || []) last.set(r.observation_id, r.kind);
  for (const [id, kind] of last) if (kind === "SENT_BACK") out.add(id);
  return out;
}

async function amendmentsFor(env, ids) {
  const by = new Map();
  if (!ids.length) return by;
  const { results } = await env.DB.prepare("SELECT * FROM observation_amendments WHERE observation_id IN (SELECT value FROM json_each(?)) ORDER BY amended_at ASC").bind(JSON.stringify(ids)).all();
  for (const a of results || []) { if (!by.has(a.observation_id)) by.set(a.observation_id, []); by.get(a.observation_id).push(a); }
  return by;
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const offices = answerableOffices(auth);
  const keys = offices.map((x) => x.key);
  const today = todayIst();
  const id = new URL(request.url).searchParams.get("id");

  if (id) {
    const o = await env.DB.prepare("SELECT * FROM observations WHERE id = ?").bind(id).first();
    if (!o || o.owner_type !== "OFFICE" || !keys.includes(o.owner_office) || o.status === "DRAFT" || o.status === "WITHDRAWN") {
      return json({ error: "Observation not found.", code: "NOT_FOUND" }, 404);
    }
    const am = await amendmentsFor(env, [o.id]);
    const shaped = (await addOwnerLabels(env, [shapeObservation(o, am.get(o.id) || [], today)]))[0];
    const { results: events } = await env.DB.prepare("SELECT * FROM observation_events WHERE observation_id = ? AND kind NOT IN ('CREATED', 'EDITED', 'ENGAGEMENT_LINKED', 'ENGAGEMENT_UNLINKED') ORDER BY created_at ASC, rowid ASC").bind(o.id).all();
    const mine = offices.find((x) => x.key === o.owner_office);
    const sb = await sentBackSet(env, [o.id]);
    return json({
      today, me: auth.email, myRole: mine ? (mine.mandate.role || ROLE.REP) : null,
      observation: Object.assign(shaped, { needsAction: needsAction(o), sentBack: sb.has(o.id) }),
      events: (events || []).map((e) => ({ kind: e.kind, by: e.actor_email, role: e.actor_role, text: e.text, detail: e.detail ? JSON.parse(e.detail) : null, at: e.created_at })),
      can: permissionsFor(o),
    });
  }

  if (!keys.length) return json({ offices: [], observations: [], counts: { needAction: 0, overdue: 0 } });
  const { results } = await env.DB.prepare(
    "SELECT * FROM observations WHERE owner_type = 'OFFICE' AND owner_office IN (SELECT value FROM json_each(?)) AND status NOT IN ('DRAFT', 'WITHDRAWN') ORDER BY issued_at DESC"
  ).bind(JSON.stringify(keys)).all();
  const rows = results || [];
  const am = await amendmentsFor(env, rows.map((r) => r.id));
  const sb = await sentBackSet(env, rows.filter((r) => r.status === "RESPONDED").map((r) => r.id));
  const list = await addOwnerLabels(env, rows.map((r) => Object.assign(shapeObservation(r, am.get(r.id) || [], today), { needsAction: needsAction(r), sentBack: r.status === "RESPONDED" && sb.has(r.id) })));
  return json({
    today,
    offices: offices.map((x) => ({ key: x.key, tier: x.mandate.tier, id: x.mandate.id, name: x.mandate.name, role: x.mandate.role || ROLE.REP })),
    observations: list,
    counts: { needAction: list.filter((o) => o.needsAction).length, overdue: list.filter((o) => o.overdue).length },
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const action = String(body.action || "");
  if (!["respond", "report_done", "comment"].includes(action)) return json({ error: "Unknown action." }, 400);

  const o = await env.DB.prepare("SELECT * FROM observations WHERE id = ?").bind(String(body.id || "")).first();
  const mine = o && o.owner_type === "OFFICE" ? answerableOffices(auth).find((x) => x.key === o.owner_office) : null;
  if (!o || !mine || o.status === "DRAFT" || o.status === "WITHDRAWN") return json({ error: "Observation not found.", code: "NOT_FOUND" }, 404);

  const p = permissionsFor(o);
  const allowed = action === "respond" ? p.respond : action === "report_done" ? p.reportDone : p.comment;
  if (!allowed) return json({ error: "This can't be done at this stage. Refresh the page.", code: "STAGE" }, 409);

  const m = mine.mandate;
  const role = m.role || ROLE.REP;
  const office = await officeByKey(env, o.owner_office);
  const officeName = office ? officeText(office) : o.owner_office;
  const onBehalf = onBehalfOf(m, auth);
  const res = await ownerAction(action, {
    env, request, o, body, json,
    who: `${auth.email} (${ROLE_WORDS[role] || role}, ${officeName})`,
    log: async (kind, text, detail) => {
      await logObservation(env, o.id, kind, auth.email, role, text, Object.assign({}, detail || {}, { office: o.owner_office, officeName, onBehalfOf: onBehalf }));
      await logTeam(env, { officeTier: m.tier, officeId: m.id, actor: auth.email, actorRole: role, onBehalf,
        action: kind === "RESPONDED" ? "OBSERVATION_REPLIED" : kind === "DONE_REPORTED" ? "OBSERVATION_DONE" : "OBSERVATION_COMMENTED",
        detail: { ref: o.ref, title: o.title } });
    },
  });
  return res || json({ error: "Unknown action." }, 400);
}
