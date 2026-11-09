/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/case-actions.js (grieviq-86)
// The office-side checks shared by the new case actions (ask the citizen,
// close for not enough information, interim reply, send to the right
// office, take priority off): signed in, the office's own case, the right
// role, and a plan that isn't paused. Returns { auth, g, access } or a Response.
import { getVerifiedRep } from "./get-verified-rep.js";
import { getLocalUnitIdsForMandate } from "./jurisdiction.js";
import { caseAccess, canManageCases, isViewOnly } from "./team.js";

export async function officeCase(request, env, id, opts) {
  opts = opts || {};
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const g = await env.DB.prepare("SELECT * FROM grievances WHERE id = ?").bind(id).first();
  if (!g) return Response.json({ error: "Grievance not found" }, { status: 404 });
  const access = await caseAccess(env, auth, g, getLocalUnitIdsForMandate, { pool: !!opts.pool });
  if (!access) return Response.json({ error: "You do not have jurisdiction over this case" }, { status: 403 });
  if (opts.manage && !canManageCases(access.role)) return Response.json({ error: "Only the representative or office manager can do this.", code: "ROLE" }, { status: 403 });
  if (isViewOnly(access.role)) return Response.json({ error: "Office assistants can only view cases.", code: "ROLE" }, { status: 403 });
  if (access.mandate.sub && access.mandate.sub.status === "PAUSED") return Response.json({ error: "Your office's plan is paused, so cases can only be viewed.", code: "PAUSED" }, { status: 403 });
  return { auth, g, access };
}

export async function readBody(request) {
  try { return await request.json(); } catch (e) { return null; }
}

// ---- Sending a case to the right ward or village (grieviq-86) ----
import { liveJoin } from "./areas.js";
import { isMulti, seatsOfUnit, seatsReady } from "./seats.js";
import { addUpdate, REASON_MIN, REASON_MAX, hasContact, cleanText } from "./case-tools.js";
import { notifyNewCase, emailCaseUpdate } from "./notify.js";
import { pushCitizen } from "./citizen-push.js";

// Wards and villages of the same area that can take complaints (for the list).
export async function transferOptions(env, g) {
  const lu = await env.DB.prepare("SELECT id, area_id FROM local_units WHERE id = ?").bind(g.local_unit_id).first();
  if (!lu) return [];
  let rows;
  try {
    rows = (await env.DB.prepare(
      `SELECT lu.id, lu.name, lu.unit_type, lu.ward_num, lu.rep_email, lu.seat_status, lu.seat_count FROM local_units lu ${await liveJoin(env)}
        WHERE lu.id <> ? AND (lu.area_id = ? OR (? IS NULL AND lu.area_id IS NULL)) ORDER BY LOWER(lu.name) LIMIT 800`
    ).bind(g.local_unit_id, lu.area_id || null, lu.area_id || null).all()).results || [];
  } catch (e) {
    rows = (await env.DB.prepare("SELECT id, name, unit_type, ward_num, rep_email FROM local_units WHERE id <> ? ORDER BY LOWER(name) LIMIT 800").bind(g.local_unit_id).all()).results || [];
  }
  return rows.filter((u) => isMulti(u) || u.rep_email || u.seat_status === "VACANT").map((u) => ({ id: u.id, name: u.name, num: u.ward_num != null ? u.ward_num : null, rural: u.unit_type === "RURAL" }));
}

// Checks and moves the case. who: { kind: "OFFICE" | "STAFF", email, tier }.
// Returns { ok, to } or { ok: false, status, error, code, fields }.
export async function transferCase(env, origin, g, toUnitId, reasonIn, who, waitUntil) {
  const reason = cleanText(reasonIn, REASON_MAX);
  const fields = {};
  if (reason.length < REASON_MIN) fields.reason = "LENGTH"; else if (hasContact(reason)) fields.reason = "CONTACT";
  const options = await transferOptions(env, g);
  const to = options.find((o) => String(o.id) === String(toUnitId || ""));
  if (!to) fields.to = "REQUIRED";
  if (Object.keys(fields).length) return { ok: false, status: 400, error: "Choose the right ward or village and say why (10 to 300 characters, no phone numbers or emails).", fields };
  if (isMulti(await env.DB.prepare("SELECT seat_count FROM local_units WHERE id = ?").bind(to.id).first()) && await seatsReady(env)) {
    const seats = await seatsOfUnit(env, to.id);
    if (!(seats.some((x) => x.email && x.status !== "VACANT") || seats.every((x) => x.status === "VACANT"))) return { ok: false, status: 409, error: "That ward can't take complaints yet.", code: "NOT_OPEN" };
  }
  const multiTo = isMulti(await env.DB.prepare("SELECT seat_count FROM local_units WHERE id = ?").bind(to.id).first());
  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    `UPDATE grievances SET local_unit_id = ?, transferred_at = ?, transfer_count = COALESCE(transfer_count, 0) + 1, acknowledged_at = NULL, interims = NULL,
       current_tier = 'LOCAL', seat_choice = ?, seat_owner = NULL, seat_owner_at = NULL, updated_at = ?
     WHERE id = ? AND local_unit_id = ? AND status IN ('OPEN', 'ACKNOWLEDGED')`
  ).bind(to.id, now, multiTo ? "ANY" : null, now, g.id, g.local_unit_id).run();
  if (!res.meta || !res.meta.changes) return { ok: false, status: 409, error: "This case has changed. Please refresh.", code: "CHANGED" };
  try { await env.DB.prepare("UPDATE case_assignments SET ended_at = ? WHERE grievance_id = ? AND ended_at IS NULL").bind(now, g.id).run(); } catch (e) { /* ignore */ }
  // The old office's alerts about it are marked read.
  try { await env.DB.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?), seen_at = COALESCE(seen_at, ?) WHERE grievance_id = ? AND read_at IS NULL").bind(now, now, g.id).run(); } catch (e) { /* ignore */ }
  await addUpdate(env, { grievanceId: g.id, kind: "TRANSFER", tier: who.tier || null, byKind: who.kind, byEmail: who.email, text: reason, fromUnit: g.local_unit_id, toUnit: to.id, at: now });
  const moved = await env.DB.prepare("SELECT * FROM grievances WHERE id = ?").bind(g.id).first();
  const cat = await env.DB.prepare("SELECT * FROM grievance_categories WHERE id = ?").bind(g.category_id).first();
  const told = Promise.all([
    notifyNewCase(env, origin, moved),
    emailCaseUpdate(env, origin, moved, "TRANSFER", { category: cat, toName: to.name, text: reason, stamp: now }),
    pushCitizen(env, moved, "TRANSFER", { to: to.name }, "TR:" + g.id + ":" + now),
  ]);
  if (typeof waitUntil === "function") waitUntil(told); else await told;
  return { ok: true, to, at: now };
}
