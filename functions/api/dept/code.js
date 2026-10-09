// POST /api/dept/code { email }   Department dashboard sign-in, step 1.
// Always the same reply whether or not the email belongs to an officer
// (_shared/dept-auth.js); the code is emailed in the background.
import { requestCode, codeEmail, sendEmailNow, officersReady } from "../../_shared/dept-auth.js";

export async function onRequestPost({ request, env, waitUntil }) {
  let b; try { b = await request.json(); } catch (e) { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (!(await officersReady(env))) return Response.json({ error: "NOT_SET_UP" }, { status: 503 });
  const r = await requestCode(env, b.email);
  if (r.send) {
    const m = codeEmail(r.send.code, new URL(request.url).origin);
    const p = sendEmailNow(env, r.send.to, m.subject, m.html);
    if (typeof waitUntil === "function") waitUntil(p); else await p;
  }
  return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
