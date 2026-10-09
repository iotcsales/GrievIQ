// /api/admin/ratings   (citizen ratings, grieviq-30)
//
// GET  ?show=OPEN|DONE|ALL   low ratings (Dissatisfied or Very dissatisfied on
//      either question): OPEN = not yet followed up (default), DONE =
//      followed up, ALL = both. Also counts and the overall picture (all
//      ratings, average only from 5). Super admin, operations admin; the
//      auditor reads.
// POST { id, note }   mark a low rating followed up, with what was done
//      (10-500 characters). Super admin, operations admin. Logged.
//
// No citizen contact details are returned: staff follow up through the case
// (admin Cases page) and the representative's office.

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import { ratingsReady, shapeForAdmin, summarise, FOLLOW_NOTE_MIN, FOLLOW_NOTE_MAX } from "../../_shared/ratings.js";
import { deptTypes, namesOf } from "../../_shared/departments.js";

const json = (body, status) => Response.json(body, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const SHOW = ["OPEN", "DONE", "ALL"];
function canFollow(auth) { return (auth.roles || [auth.role]).some((r) => (PERMISSIONS.follow_up_ratings || []).includes(r)); }
const NOT_SET_UP = { error: "Ratings aren't set up yet. Run the database update part24-citizen-ratings.sql.", code: "NOT_SET_UP" };

// Office names by level and id, for the list.
async function officeNames(env, rows) {
  const want = { LOCAL: new Set(), MAYOR: new Set(), MLA: new Set(), MP: new Set() };
  for (const r of rows) if (r.office_tier && r.office_id && want[r.office_tier]) want[r.office_tier].add(String(r.office_id));
  const table = { LOCAL: "local_units", MAYOR: "municipal_bodies", MLA: "mla_constituencies", MP: "mp_constituencies" };
  const out = {};
  for (const [tier, ids] of Object.entries(want)) {
    if (!ids.size) continue;
    const { results } = await env.DB.prepare(`SELECT id, name FROM ${table[tier]} WHERE id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(Array.from(ids))).all();
    for (const x of results || []) out[tier + ":" + x.id] = x.name;
  }
  return out;
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_ratings");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await ratingsReady(env))) return json(Object.assign({ ready: false }, NOT_SET_UP), 503);
  const show = (new URL(request.url).searchParams.get("show") || "OPEN").toUpperCase();
  const which = SHOW.includes(show) ? show : "OPEN";

  const all = (await env.DB.prepare("SELECT office_score, dept_score, low, followed_up_at FROM case_ratings").all()).results || [];
  const counts = { OPEN: 0, DONE: 0, ALL: 0 };
  for (const r of all) if (Number(r.low) === 1) { counts.ALL++; if (r.followed_up_at) counts.DONE++; else counts.OPEN++; }

  const where = which === "OPEN" ? "AND r.followed_up_at IS NULL" : which === "DONE" ? "AND r.followed_up_at IS NOT NULL" : "";
  const { results } = await env.DB.prepare(
    `SELECT r.*, g.tracking_ref, g.status, lu.name AS ward_name, c.name AS category_name, g.category_id
     FROM case_ratings r JOIN grievances g ON g.id = r.grievance_id
     LEFT JOIN local_units lu ON lu.id = g.local_unit_id
     LEFT JOIN grievance_categories c ON c.id = g.category_id
     WHERE r.low = 1 ${where}
     ORDER BY CASE WHEN r.followed_up_at IS NULL THEN 0 ELSE 1 END, r.updated_at DESC LIMIT 500`
  ).all();
  const rows = results || [];
  const names = await officeNames(env, rows);
  return json({
    ready: true, canFollowUp: canFollow(auth), show: which, counts,
    overall: { office: summarise(all.map((r) => r.office_score)), dept: summarise(all.map((r) => r.dept_score).filter((n) => n != null)) },
    deptNames: namesOf(await deptTypes(env)),
    noteMin: FOLLOW_NOTE_MIN, noteMax: FOLLOW_NOTE_MAX,
    items: rows.map((r) => Object.assign(shapeForAdmin(r), {
      id: r.id, caseId: r.grievance_id, trackingRef: r.tracking_ref, caseStatus: r.status,
      ward: r.ward_name || "", category: r.category_name || "", categoryId: r.category_id || "",
      officeName: names[r.office_tier + ":" + r.office_id] || null,
    })),
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "follow_up_ratings");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await ratingsReady(env))) return json(NOT_SET_UP, 503);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const id = String(b.id || "");
  const note = String(b.note == null ? "" : b.note).replace(/\s+/g, " ").trim();
  if (note.length < FOLLOW_NOTE_MIN) return json({ error: "Please say what was done.", fields: { note: "SHORT" } }, 400);
  if (note.length > FOLLOW_NOTE_MAX) return json({ error: "Please shorten the note.", fields: { note: "LENGTH" } }, 400);
  const row = await env.DB.prepare("SELECT id, grievance_id, low, followed_up_at, updated_at FROM case_ratings WHERE id = ?").bind(id).first();
  if (!row || Number(row.low) !== 1) return json({ error: "Not found." }, 404);
  if (row.followed_up_at) return json({ error: "Someone has already marked this followed up.", code: "ALREADY" }, 409);
  // Only if the citizen hasn't changed it meanwhile (the page shows what was read).
  if (b.updatedAt && String(b.updatedAt) !== String(row.updated_at)) return json({ error: "The citizen changed this rating. Please look again.", code: "CHANGED" }, 409);
  const now = new Date().toISOString();
  const res = await env.DB.prepare("UPDATE case_ratings SET followed_up_at = ?, followed_up_by = ?, follow_up_note = ? WHERE id = ? AND followed_up_at IS NULL")
    .bind(now, auth.email, note, id).run();
  if (!res.meta || res.meta.changes !== 1) return json({ error: "Someone has already marked this followed up.", code: "ALREADY" }, 409);
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), auth.email, "rating_followed_up", row.grievance_id, JSON.stringify({ ratingId: id, note })).run();
  return json({ ok: true });
}
