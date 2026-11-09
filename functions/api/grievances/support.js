/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/grievances/support   { email, unit, category, k, lang }   (grieviq-86, citizen)
// "This is my problem too": instead of filing the same problem again, a
// citizen follows an open complaint from the "already reported nearby" list
// (k = the short code from /api/similar). Their email must have been proved
// with a code in the last 15 minutes. They get updates by email and see the
// complaint on their Track page (never what the other person wrote); the
// office sees only how many people follow it. Only the person who filed it
// confirms the fix, reopens or rates it.
import { supportKey } from "../../_shared/case-tools.js";
import { activeRestriction } from "../../_shared/misuse.js";

const json = (b, s) => new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } });
const ID = /^[A-Za-z0-9_\-]{1,64}$/;
const FOLLOW_MAX_PER_DAY = 10;

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const email = String(b.email || "").trim().toLowerCase();
  const unit = String(b.unit || ""), category = String(b.category || ""), k = String(b.k || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !ID.test(unit) || !ID.test(category) || !/^[0-9a-f]{16}$/.test(k)) return json({ error: "Bad request." }, 400);
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  const ok = await env.DB.prepare("SELECT id FROM grievance_otp WHERE LOWER(email) = ? AND purpose = 'STATUS_CHECK' AND verified = 1 AND verified_at >= ? LIMIT 1").bind(email, since).first();
  if (!ok) return json({ error: "Please confirm your email with the code first.", code: "VERIFY_AGAIN" }, 401);
  if (await activeRestriction(env, "", email)) return json({ error: "This email can't be used on GrievIQ for now.", code: "RESTRICTED" }, 403);
  const { results } = await env.DB.prepare(
    "SELECT id, tracking_ref, citizen_email FROM grievances WHERE local_unit_id = ? AND category_id = ? AND status IN ('OPEN', 'ACKNOWLEDGED') ORDER BY created_at DESC LIMIT 50"
  ).bind(unit, category).all();
  let g = null;
  for (const r of results || []) { if (await supportKey(r.id) === k) { g = r; break; } }
  if (!g) return json({ error: "That complaint is no longer open. You can file yours.", code: "GONE" }, 404);
  if (g.citizen_email && g.citizen_email.toLowerCase() === email) return json({ error: "You filed this complaint yourself.", code: "OWN" }, 409);
  const day = new Date(Date.now() - 86400000).toISOString();
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM case_supporters WHERE email = ? AND created_at >= ?").bind(email, day).first();
  if (n && Number(n.n) >= FOLLOW_MAX_PER_DAY) return json({ error: "You have followed many complaints today. Please try again tomorrow.", code: "LIMIT" }, 429);
  const now = new Date().toISOString();
  const res = await env.DB.prepare("INSERT OR IGNORE INTO case_supporters (id, grievance_id, email, lang, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), g.id, email, b.lang === "hi" ? "hi" : "en", now).run();
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM case_supporters WHERE grievance_id = ?").bind(g.id).first();
  return json({ following: true, already: !(res.meta && res.meta.changes), trackingRef: g.tracking_ref, followers: Number(count && count.n) || 1 });
}
