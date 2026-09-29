// POST /api/auth/signout   (rep console)
//
// Item 8a: ends this browser's sign-in session on the server and clears the
// cookie. Only accepted from our own pages (Origin check, plus the cookie
// is SameSite=Lax so other sites can't send it on a form post).

import { endSession, clearCookieHeader, logAuthEvent, COOKIE } from "../../_shared/rep-session.js";

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Not allowed." }, { status: 403 });
  }
  const email = await endSession(request, env, "SIGNED_OUT");
  if (email) await logAuthEvent(env, request, email, "SIGNED_OUT", null);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Set-Cookie": clearCookieHeader(COOKIE) },
  });
}
