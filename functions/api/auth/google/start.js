// GET /api/auth/google/start   (public)
//
// Item 8a: begins "Sign in with Google" for the rep console. Makes a
// one-time state, nonce and PKCE verifier (_shared/google-oidc.js), keeps
// them for 10 minutes (oauth_states), ties the state to this browser with a
// short-lived cookie, and sends the browser to Google.

import { configured, randomString, pkceChallenge, authorizeUrl, STATE_COOKIE, STATE_MINUTES } from "../../../_shared/google-oidc.js";
import { cookieHeader, tidySessions } from "../../../_shared/rep-session.js";

export async function onRequestGet({ request, env }) {
  if (!configured(env)) {
    return Response.redirect(new URL("/rep?signin=not_set_up", request.url).toString(), 302);
  }
  const state = randomString(32), nonce = randomString(32), verifier = randomString(48);
  await env.DB.prepare(
    "INSERT INTO oauth_states (state, nonce, code_verifier, created_at) VALUES (?, ?, ?, ?)"
  ).bind(state, nonce, verifier, new Date().toISOString()).run();
  await tidySessions(env);
  const url = authorizeUrl(env, request, { state, nonce, challenge: await pkceChallenge(verifier) });
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Set-Cookie": cookieHeader(STATE_COOKIE, state, STATE_MINUTES * 60),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
