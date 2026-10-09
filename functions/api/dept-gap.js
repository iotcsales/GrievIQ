// POST /api/dept-gap   { grievanceId, department }
//
// Departments stage 2: on a case whose ward has no office on file for a
// department, anyone in the representative's office who can see the case can
// press "Tell GrievIQ". It is recorded (once per ward and department per 7
// days) and shown to admins on the Departments page, next to the Coverage
// table, so the missing contact gets found. Nothing is sent to anyone else.

import { getVerifiedRep } from "../_shared/get-verified-rep.js";
import { getLocalUnitIdsForMandate } from "../_shared/jurisdiction.js";
import { caseAccess } from "../_shared/team.js";
import { activeDeptKeys } from "../_shared/departments.js";

const json = (body, status) => Response.json(body, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const department = String(body.department || "").trim();
  if (!(await activeDeptKeys(env)).includes(department)) return json({ error: "Unknown department.", code: "DEPT" }, 400);
  const g = await env.DB.prepare("SELECT * FROM grievances WHERE id = ?").bind(String(body.grievanceId || "")).first();
  if (!g) return json({ error: "Case not found." }, 404);
  const access = await caseAccess(env, auth, g, getLocalUnitIdsForMandate);
  if (!access) return json({ error: "You do not have access to this case." }, 403);
  const unit = await env.DB.prepare("SELECT id, name, area_id FROM local_units WHERE id = ?").bind(g.local_unit_id).first();
  if (!unit) return json({ error: "Ward not found." }, 404);
  const since = new Date(Date.now() - 7 * 86400000).toISOString().replace("T", " ").slice(0, 19);
  const { results } = await env.DB.prepare(
    "SELECT detail FROM admin_events WHERE action = 'dept_gap_reported' AND target = ? AND created_at >= ?"
  ).bind(unit.id, since).all();
  const already = (results || []).some((r) => { try { return JSON.parse(r.detail).department === department; } catch (e) { return false; } });
  if (!already) {
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, 'dept_gap_reported', ?, ?)")
      .bind(crypto.randomUUID(), auth.email, unit.id, JSON.stringify({ department, unitName: unit.name, areaId: unit.area_id || "lucknow",
        grievanceId: g.id, trackingRef: g.tracking_ref, office: access.mandate.tier + ":" + access.mandate.id })).run();
  }
  return json({ ok: true, already });
}
