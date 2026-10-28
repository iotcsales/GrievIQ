/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/helper-consent?k=<link>   (public; grieviq-73)
//
// The link in the email a citizen gets when a Community helper files a
// complaint for them. Only whoever has that email's link can use it (a long
// random value; only its SHA-256 is stored).
// GET           what was filed (type, ward, the description, the helper's number)
// POST {k, answer: "YES" | "NO"}
//   YES  the complaint is filed now, like any other
//   NO   "I didn't ask for this": nothing is filed, its details are
//        deleted, and the helper gets a strike

import { sha256Hex } from "../_shared/rep-session.js";
import { filingsReady, confirmFiling, closeFiling, addStrike } from "../_shared/helper-filing.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
const K_RE = /^[A-Za-z0-9_-]{20,60}$/;

async function find(env, k) {
  if (!K_RE.test(String(k || "")) || !(await filingsReady(env))) return null;
  return env.DB.prepare("SELECT f.*, h.ref AS helper_ref FROM helper_filings f JOIN helpers h ON h.id = f.helper_id WHERE f.link_hash = ?").bind(await sha256Hex(String(k))).first();
}

export async function onRequestGet({ request, env }) {
  const f = await find(env, new URL(request.url).searchParams.get("k"));
  if (!f || f.status !== "WAITING_CODE" || !f.payload) return json({ error: "NOT_FOUND" }, 404);
  const p = JSON.parse(f.payload);
  const cat = await env.DB.prepare("SELECT name FROM grievance_categories WHERE id = ?").bind(f.category_id).first();
  const unit = await env.DB.prepare("SELECT name FROM local_units WHERE id = ?").bind(f.unit_id).first();
  return json({ helperRef: f.helper_ref, filedAt: f.created_at, category: cat ? cat.name : "", categoryId: f.category_id, unit: unit ? unit.name : "", description: p.description, place: p.location_detail || "" });
}

export async function onRequestPost({ request, env, waitUntil }) {
  const o = request.headers.get("Origin");
  const origin = new URL(request.url).origin;
  if (o && o !== origin) return json({ error: "Not allowed." }, 403);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "BODY" }, 400); }
  const f = await find(env, b && b.k);
  if (!f || f.status !== "WAITING_CODE" || !f.payload) return json({ error: "NOT_FOUND" }, 404);
  if (b.answer === "YES") {
    const r = await confirmFiling(env, origin, f, "LINK", "citizen (link)", waitUntil);
    return r.error ? json({ error: r.error }, 409) : json({ ok: true, trackingRef: r.trackingRef });
  }
  if (b.answer === "NO") {
    if (!(await closeFiling(env, f, "NOT_ASKED", "citizen (link)", "The citizen said they didn't ask for it"))) return json({ error: "STATE" }, 409);
    await addStrike(env, origin, f.helper_id, "NOT_ASKED_LINK");
    return json({ ok: true, refused: true });
  }
  return json({ error: "CHECK_FIELDS", fields: { answer: "REQUIRED" } }, 400);
}
