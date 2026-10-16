/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/gov/code { email } -> { sent: true } whether or not the email has
// access (nothing to learn from the answer). grieviq-49.
import { requestCode, codeEmail, govLoginReady } from "../../_shared/gov-auth.js";
import { sendEmailNow } from "../../_shared/dept-auth.js";

export async function onRequestPost({ request, env, waitUntil }) {
  let b; try { b = await request.json(); } catch (e) { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (!(await govLoginReady(env))) return Response.json({ error: "NOT_SET_UP" }, { status: 503 });
  const r = await requestCode(env, b.email);
  if (r.send) {
    const m = codeEmail(r.send.code, new URL(request.url).origin);
    const p = sendEmailNow(env, r.send.to, m.subject, m.html);
    if (typeof waitUntil === "function") waitUntil(p); else await p;
  }
  return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
