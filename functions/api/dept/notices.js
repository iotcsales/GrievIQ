/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/dept/notices   (grieviq-55): paid public notices on the department
// dashboard, for the signed-in officer's own office. Same rules as the
// representative console (see /api/notices/office).

import { getVerifiedOfficer } from "../../_shared/dept-auth.js";
import { noticesReady, officeView, requestNotice, withdrawNotice, deptOfficeInfo, readBody, replaceLetter } from "../../_shared/notices.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedOfficer(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const o = await deptOfficeInfo(env, auth.officer.office_id);
  if (!o) return json({ error: "NOT_FOUND" }, 404);
  return json(await officeView(env, [o]));
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedOfficer(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await noticesReady(env))) return json({ error: "NOT_READY" }, 409);
  let b, file;
  try { ({ b, file } = await readBody(request)); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const o = await deptOfficeInfo(env, auth.officer.office_id);
  if (!o) return json({ error: "NOT_FOUND" }, 404);
  if (b.action === "request") {
    const r = await requestNotice(env, o, b, auth.officer.email, new URL(request.url).origin, file);
    return json(r.body, r.status);
  }
  if (b.action === "withdraw" || b.action === "letter") {
    const n = await env.DB.prepare("SELECT * FROM notices WHERE id = ? AND office_type = 'DEPT' AND office_id = ?").bind(String(b.id || ""), o.id).first();
    const r = b.action === "letter" ? await replaceLetter(env, n, b, file, auth.officer.email) : await withdrawNotice(env, n, auth.officer.email);
    return json(r.body, r.status);
  }
  return json({ error: "Unknown action." }, 400);
}
