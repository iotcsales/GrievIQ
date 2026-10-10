// functions/api/citizen-updates.js
//
// "Get updates on this phone" for citizens (approved Oct 2026).
//
// GET                         -> { configured, key }  (GrievIQ's public push key)
// POST { action: "subscribe", ref, pass | email, subscription, lang }
//        pass  = the one-time pass returned when the complaint was filed (24 hours)
//        email = the citizen's email, verified with a code on Track in the last 15 minutes
// POST { action: "status", ref, endpoint }       -> { on }
// POST { action: "unsubscribe", ref, endpoint }
//
// Only for open complaints; at most 3 devices each; device addresses must
// belong to a known browser push service. See _shared/citizen-push.js.

import { pushConfigured } from "../_shared/webpush.js";
import { allowedEndpoint } from "../_shared/notice-box.js";
import { checkFilingPass, pushWelcome, MAX_DEVICES_PER_CASE } from "../_shared/citizen-push.js";

const b64u = /^[A-Za-z0-9_-]+$/;
const VERIFIED_WINDOW_MINUTES = 15;
function json(body, status) { return Response.json(body, { status: status || 200, headers: { "Cache-Control": "no-store" } }); }

export async function onRequestGet({ env }) {
  return json({ configured: pushConfigured(env), key: pushConfigured(env) ? env.VAPID_PUBLIC_KEY : null });
}

async function findCase(env, ref) {
  const r = String(ref || "").trim().toUpperCase();
  if (!r || r.length > 40) return null;
  return env.DB.prepare("SELECT id, tracking_ref, status, citizen_email, retention_removed_at FROM grievances WHERE tracking_ref = ?").bind(r).first();
}
const isOpen = (g) => g && !g.retention_removed_at && !["RESOLVED", "CLOSED"].includes(g.status);

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const g = await findCase(env, body.ref);
  const notFound = () => json({ error: "We couldn't find this complaint.", code: "NOT_FOUND" }, 404);

  if (body.action === "status" || body.action === "unsubscribe") {
    if (!g) return notFound();
    const endpoint = String(body.endpoint || "").slice(0, 1000);
    try {
      if (body.action === "unsubscribe") {
        await env.DB.prepare("DELETE FROM citizen_push WHERE grievance_id = ? AND endpoint = ?").bind(g.id, endpoint).run();
        return json({ ok: true });
      }
      const row = await env.DB.prepare("SELECT 1 AS x FROM citizen_push WHERE grievance_id = ? AND endpoint = ?").bind(g.id, endpoint).first();
      return json({ on: !!row, open: isOpen(g) });
    } catch (e) { return json({ on: false, open: isOpen(g) }); }
  }

  if (body.action !== "subscribe") return json({ error: "Unknown action." }, 400);
  if (!pushConfigured(env)) return json({ error: "Phone updates aren't available yet.", code: "NOT_CONFIGURED" }, 503);
  if (!g) return notFound();
  if (!isOpen(g)) return json({ error: "This complaint is closed, so there are no more updates.", code: "CLOSED" }, 409);

  // Who may turn it on: the person who just filed (pass), or the citizen
  // signed in on Track with their email code (last 15 minutes).
  let allowed = false;
  if (body.pass) allowed = await checkFilingPass(env, g.id, body.pass);
  if (!allowed && body.email) {
    const email = String(body.email).trim().toLowerCase();
    if (email && g.citizen_email && email === String(g.citizen_email).toLowerCase()) {
      const recent = await env.DB.prepare(
        "SELECT id FROM grievance_otp WHERE LOWER(email) = ? AND purpose = 'STATUS_CHECK' AND verified = 1 AND verified_at >= ? LIMIT 1"
      ).bind(email, new Date(Date.now() - VERIFIED_WINDOW_MINUTES * 60000).toISOString()).first();
      allowed = !!recent;
    }
  }
  if (!allowed) return json({ error: "For your security, please open this complaint on the Track page with your email code first.", code: "VERIFY" }, 401);

  const s = body.subscription || {};
  const keys = s.keys || {};
  if (!allowedEndpoint(s.endpoint)) return json({ error: "This browser's notification service isn't supported.", code: "BAD_ENDPOINT" }, 400);
  if (!b64u.test(String(keys.p256dh || "")) || !b64u.test(String(keys.auth || "")) || String(keys.p256dh).length > 100 || String(keys.auth).length > 50) {
    return json({ error: "The browser sent incomplete notification keys.", code: "BAD_KEYS" }, 400);
  }
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM citizen_push WHERE grievance_id = ? AND endpoint <> ?").bind(g.id, s.endpoint).first();
  if (n && n.n >= MAX_DEVICES_PER_CASE) return json({ error: "Updates are already on for " + MAX_DEVICES_PER_CASE + " devices for this complaint.", code: "TOO_MANY" }, 409);
  const now = new Date().toISOString();
  const sub = { id: crypto.randomUUID(), endpoint: s.endpoint, p256dh: keys.p256dh, auth: keys.auth, lang: body.lang === "hi" ? "hi" : "en" };
  await env.DB.prepare(
    `INSERT INTO citizen_push (id, grievance_id, endpoint, p256dh, auth, lang, consent_at, fail_count) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(grievance_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang, consent_at = excluded.consent_at, fail_count = 0`
  ).bind(sub.id, g.id, sub.endpoint, sub.p256dh, sub.auth, sub.lang, now).run();
  await pushWelcome(env, sub, g);
  return json({ ok: true });
}
