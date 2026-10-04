// /api/admin/feedback   -- citizen feedback about the app
//
// GET  ?status=NEW|IN_PROGRESS|DONE|ALL   the list, newest first, and counts
//      (super admin, operations admin; the auditor reads). The citizen's
//      email is shown in full only to those who can reply (super admin and
//      operations admin); the auditor sees it partly hidden.
// POST { id, status, note }   update the status and the internal note
//      (super admin, operations admin). Logged.

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";

const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const STATUSES = ["NEW", "IN_PROGRESS", "DONE"];
function canManage(auth) { return (auth.roles || [auth.role]).some((r) => (PERMISSIONS.manage_feedback || []).includes(r)); }
function maskEmail(e) {
  if (!e) return null;
  const [u, d] = String(e).split("@");
  return (u.length <= 2 ? u[0] + "•" : u.slice(0, 2) + "•".repeat(Math.min(6, u.length - 2))) + "@" + (d || "");
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_feedback");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const st = (new URL(request.url).searchParams.get("status") || "NEW").toUpperCase();
  const manage = canManage(auth);
  try {
    await env.DB.prepare("DELETE FROM feedback WHERE created_at < datetime('now', '-365 days')").run();
    const counts = { NEW: 0, IN_PROGRESS: 0, DONE: 0 };
    for (const r of (await env.DB.prepare("SELECT status, COUNT(*) AS n FROM feedback GROUP BY status").all()).results || []) counts[r.status] = Number(r.n) || 0;
    const where = STATUSES.includes(st) ? "WHERE status = ?" : "";
    const stmt = env.DB.prepare(`SELECT * FROM feedback ${where} ORDER BY created_at DESC LIMIT 500`);
    const rows = ((where ? await stmt.bind(st).all() : await stmt.all()).results) || [];
    return json({
      ready: true, canManage: manage, counts,
      items: rows.map((r) => ({
        id: r.id, createdAt: r.created_at, category: r.category, message: r.message, trackingRef: r.tracking_ref, lang: r.lang,
        email: manage ? r.email : maskEmail(r.email), emailMasked: !manage && !!r.email,
        status: r.status, note: r.note, updatedAt: r.updated_at, updatedBy: r.updated_by,
      })),
    });
  } catch (e) {
    if (/no such table/i.test(String(e && e.message))) return json({ ready: false, error: "Feedback isn't set up yet. Run the database update part15-feedback.sql.", code: "NOT_SET_UP" }, 503);
    throw e;
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_feedback");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const id = String(b.id || "");
  const status = String(b.status || "").toUpperCase();
  const note = b.note == null ? null : String(b.note).trim().slice(0, 1000) || null;
  if (!STATUSES.includes(status)) return json({ error: "Choose a status.", fields: { status: "REQUIRED" } }, 400);
  const row = await env.DB.prepare("SELECT id, status, note FROM feedback WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "Not found." }, 404);
  await env.DB.prepare("UPDATE feedback SET status = ?, note = ?, updated_at = datetime('now'), updated_by = ? WHERE id = ?").bind(status, note, auth.email, id).run();
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), auth.email, "feedback_updated", id, JSON.stringify({ from: row.status, to: status, noteChanged: (row.note || null) !== note })).run();
  return json({ ok: true });
}
