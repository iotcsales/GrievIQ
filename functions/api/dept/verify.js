// POST /api/dept/verify { email, code }   Department dashboard sign-in, step 2.
import { verifyCode, officersReady } from "../../_shared/dept-auth.js";

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch (e) { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (!(await officersReady(env))) return Response.json({ error: "NOT_SET_UP" }, { status: 503 });
  const r = await verifyCode(env, b.email, b.code);
  const headers = { "Cache-Control": "no-store" };
  if (r.cookie) headers["Set-Cookie"] = r.cookie;
  return Response.json(r.body, { status: r.status, headers });
}
