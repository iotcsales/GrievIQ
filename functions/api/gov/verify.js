/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/gov/verify { email, code } -> sets the session cookie. grieviq-49.
import { verifyCode, govLoginReady } from "../../_shared/gov-auth.js";

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch (e) { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (!(await govLoginReady(env))) return Response.json({ error: "NOT_SET_UP" }, { status: 503 });
  const r = await verifyCode(env, b.email, b.code);
  const headers = { "Cache-Control": "no-store" };
  if (r.cookie) headers["Set-Cookie"] = r.cookie;
  return Response.json(r.body, { status: r.status, headers });
}
