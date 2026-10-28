/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
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
    const to = new URL(request.url).searchParams.get("for") === "helper" ? "/helper" : "/rep";
    return Response.redirect(new URL(to + "?signin=not_set_up", request.url).toString(), 302);
  }
  const state = randomString(32), nonce = randomString(32), verifier = randomString(48);
  // grieviq-72: "?for=helper" is a Community helper signing in (sent back to /helper).
  const helper = new URL(request.url).searchParams.get("for") === "helper";
  if (helper) {
    await env.DB.prepare(
      "INSERT INTO oauth_states (state, nonce, code_verifier, created_at, purpose) VALUES (?, ?, ?, ?, 'HELPER')"
    ).bind(state, nonce, verifier, new Date().toISOString()).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO oauth_states (state, nonce, code_verifier, created_at) VALUES (?, ?, ?, ?)"
    ).bind(state, nonce, verifier, new Date().toISOString()).run();
  }
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
