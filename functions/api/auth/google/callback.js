/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/auth/google/callback   (public; Google sends the browser here)
//
// Item 8a: finishes "Sign in with Google". Checks the one-time state
// against this browser's cookie and uses it up, swaps the code for Google's
// ID token (with the PKCE verifier), checks the token
// (_shared/google-oidc.js), and signs the person in only if their email
// belongs to a representative in our ward data. Everything else is refused
// and recorded. Always ends by sending the browser back to /rep.

import { exchangeCode, verifyIdToken, configured, STATE_COOKIE, STATE_MINUTES } from "../../../_shared/google-oidc.js";
import { readCookie, createSession, clearCookieHeader, logAuthEvent } from "../../../_shared/rep-session.js";
import { lookupMandates } from "../../../_shared/get-verified-rep.js";

function back(request, outcome, cookies, page) {
  const headers = new Headers({
    Location: new URL((page || "/rep") + (outcome ? "?signin=" + outcome : ""), request.url).toString(),
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  headers.append("Set-Cookie", clearCookieHeader(STATE_COOKIE));
  for (const c of cookies || []) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet({ request, env }) {
  if (!configured(env)) return back(request, "not_set_up");
  const url = new URL(request.url);
  if (url.searchParams.get("error")) {
    // The person pressed Cancel on Google's screen, or Google refused.
    // (Back to the page they started from: the helper page or the console.)
    let page = "/rep";
    const st = url.searchParams.get("state") || "";
    if (st && st === readCookie(request, STATE_COOKIE)) {
      try {
        const r = await env.DB.prepare("SELECT * FROM oauth_states WHERE state = ?").bind(st).first();
        await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(st).run();
        if (r && r.purpose === "HELPER") page = "/helper";
      } catch (e) { /* the console */ }
    }
    return back(request, "cancelled", null, page);
  }
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const cookieState = readCookie(request, STATE_COOKIE);
  if (!state || !code || !cookieState || cookieState !== state) {
    await logAuthEvent(env, request, null, "SIGN_IN_REFUSED", { reason: "STATE_MISMATCH" });
    return back(request, "failed");
  }

  // One use only: taken out of the table as it is read.
  const row = await env.DB.prepare("SELECT * FROM oauth_states WHERE state = ?").bind(state).first();
  await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  // grieviq-72: a Community helper signing in goes back to /helper.
  const helper = !!(row && row.purpose === "HELPER");
  const page = helper ? "/helper" : "/rep";
  if (!row || Date.now() - new Date(row.created_at).getTime() > STATE_MINUTES * 60000) {
    await logAuthEvent(env, request, null, "SIGN_IN_REFUSED", { reason: "STATE_EXPIRED" });
    return back(request, "expired", null, page);
  }

  let who;
  try {
    const idToken = await exchangeCode(env, request, code, row.code_verifier);
    who = await verifyIdToken(env, idToken, row.nonce);
  } catch (e) {
    await logAuthEvent(env, request, null, "SIGN_IN_REFUSED", { reason: String((e && e.message) || "FAILED").slice(0, 40) });
    return back(request, "failed", null, page);
  }

  // A Community helper (or someone applying to be one) needs no office.
  // What they may do is decided by /api/helper.
  if (helper) {
    const cookie = await createSession(env, request, who.email);
    await logAuthEvent(env, request, who.email, "SIGNED_IN", { method: "google", for: "helper" });
    return back(request, "", [cookie], "/helper");
  }

  const mandates = await lookupMandates(env, who.email);
  if (!mandates.length) {
    await logAuthEvent(env, request, who.email, "SIGN_IN_REFUSED", { reason: "NOT_REGISTERED" });
    return back(request, "not_registered");
  }

  const cookie = await createSession(env, request, who.email);
  await logAuthEvent(env, request, who.email, "SIGNED_IN", { method: "google", offices: mandates.length });
  return back(request, "", [cookie]);
}
