/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/notices/office   (grieviq-55): paid public notices in the
// representative console. The representative and the office manager (the
// people who see the office's bills) can ask for a notice, see its state
// and its bill, and take back a request before it is paid.
// GET  -> { ready, enabled, offices: [{ tier, id, name, label, reach, plans, pausedNow, pauses }], notices, ... }
// POST { action: "request", officeTier, officeId, category, titleEn, bodyEn, titleHi, bodyHi, eventDate, eventTime, place, planId, startOn }
//      { action: "withdraw", id }
//      grieviq-56: sent as multipart with the authority letter in "letter"
//      and letterNo, letterDate, letterBy; { action: "letter", id } sends a
//      new letter while the request waits.

import { getVerifiedRep } from "../../_shared/get-verified-rep.js";
import { ROLE } from "../../_shared/team.js";
import { noticesReady, officeView, requestNotice, withdrawNotice, repOfficeInfo, readBody, replaceLetter } from "../../_shared/notices.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
function mine(auth) { return auth.mandates.filter((m) => (m.role || ROLE.REP) === ROLE.REP || m.role === ROLE.OM); }
async function infos(env, auth) { const out = []; for (const m of mine(auth)) { const o = await repOfficeInfo(env, m.tier, m.id); if (o) out.push(o); } return out; }

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const offices = await infos(env, auth);
  if (!offices.length) return json({ error: "NOT_ALLOWED" }, 403);
  return json(await officeView(env, offices));
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await noticesReady(env))) return json({ error: "NOT_READY" }, 409);
  let b, file;
  try { ({ b, file } = await readBody(request)); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const offices = await infos(env, auth);
  if (!offices.length) return json({ error: "NOT_ALLOWED" }, 403);
  if (b.action === "request") {
    const office = offices.find((o) => o.tier === b.officeTier && o.id === b.officeId) || (offices.length === 1 && !b.officeId ? offices[0] : null);
    if (!office) return json({ error: "CHECK_FIELDS", fields: { office: "REQUIRED" } }, 400);
    const r = await requestNotice(env, office, b, auth.email, new URL(request.url).origin, file);
    return json(r.body, r.status);
  }
  if (b.action === "withdraw" || b.action === "letter") {
    const n = await env.DB.prepare("SELECT * FROM notices WHERE id = ? AND office_type = 'REP'").bind(String(b.id || "")).first();
    if (!n || !offices.some((o) => o.tier === n.office_tier && o.id === n.office_id)) return json({ error: "NOT_FOUND" }, 404);
    const r = b.action === "letter" ? await replaceLetter(env, n, b, file, auth.email) : await withdrawNotice(env, n, auth.email);
    return json(r.body, r.status);
  }
  return json({ error: "Unknown action." }, 400);
}
