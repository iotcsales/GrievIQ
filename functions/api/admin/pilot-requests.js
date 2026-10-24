/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/admin/pilot-requests.js
//
// Admin "Pilot requests" (grieviq-39): requests sent from /for-offices.
// GET  (view_pilot_requests): newest first. The auditor sees mobile numbers
//      and emails partly hidden; the two senior roles see them in full to
//      call back.
// POST (manage_pilot_requests) { id, status: NEW|CONTACTED|CLOSED, note? }
//      Logged. Requests are deleted one year after they were sent.

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const maskMobile = (m) => m ? m.slice(0, 2) + "XXXXXX" + m.slice(-2) : "";
const maskEmail = (e) => { if (!e) return ""; const [u, d] = e.split("@"); return (u || "").slice(0, 1) + "***@" + (d || ""); };

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_pilot_requests");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const full = allows(auth, "manage_pilot_requests");
  try {
    await env.DB.prepare("DELETE FROM pilot_requests WHERE created_at < ?").bind(new Date(Date.now() - 365 * 86400000).toISOString()).run();
    const { results } = await env.DB.prepare("SELECT * FROM pilot_requests ORDER BY created_at DESC LIMIT 500").all();
    return json({
      canManage: full, ready: true,
      requests: (results || []).map((r) => ({
        id: r.id, createdAt: r.created_at, name: r.name, office: r.office_kind, place: r.place,
        mobile: full ? r.mobile : maskMobile(r.mobile), email: full ? (r.email || "") : maskEmail(r.email),
        lang: r.lang, consentAt: r.consent_at, status: r.status, statusAt: r.status_at, statusBy: r.status_by, note: r.note || "",
      })),
    });
  } catch (e) {
    if (/no such table/i.test(String(e && e.message))) return json({ canManage: full, ready: false, requests: [] });
    throw e;
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_pilot_requests");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const status = String(b.status || "").toUpperCase();
  if (!["NEW", "CONTACTED", "CLOSED"].includes(status)) return json({ error: "CHECK_FIELDS", fields: { status: "REQUIRED" } }, 400);
  const note = String(b.note || "").replace(/\s+/g, " ").trim();
  if (note.length > 500) return json({ error: "CHECK_FIELDS", fields: { note: "LENGTH" } }, 400);
  const r = await env.DB.prepare("SELECT id, status, note FROM pilot_requests WHERE id = ?").bind(String(b.id || "")).first();
  if (!r) return json({ error: "NOT_FOUND" }, 404);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE pilot_requests SET status = ?, note = ?, status_at = ?, status_by = ? WHERE id = ?").bind(status, note || null, now, auth.email, r.id).run();
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), auth.email, "pilot_request_updated", r.id, JSON.stringify({ before: r.status, after: status, noteChanged: (r.note || "") !== note })).run();
  return json({ ok: true, status, statusAt: now, statusBy: auth.email });
}
