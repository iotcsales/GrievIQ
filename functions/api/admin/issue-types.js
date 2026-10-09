// functions/api/admin/issue-types.js
//
// Admin "Issue types" page.
//
// GET (view_issue_types -- every role except data entry operator): each issue type with its
// time limits (read-only here) and its suggested follow-up department,
// plus the department list and whether the caller may edit.
//
// PATCH (manage_issue_types -- super_admin, operations_admin): change one
// issue type's suggested department. Body: { id, suggestedDepartment }
// where suggestedDepartment is one of the shared DEPARTMENTS or null
// ("No suggestion"). Logged to admin_events with before/after.
//
// The suggestion only decides which department the rep console lists
// first, marked "(suggested)"; nothing is ever pre-selected for the rep.

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import { deptTypes, namesOf } from "../../_shared/departments.js";

function can(role, permission) {
  return [].concat(role).some((r) => (PERMISSIONS[permission] || []).includes(r));
}

async function logEvent(env, actorEmail, action, target, detail) {
  await env.DB.prepare(
    `INSERT INTO admin_events (id, actor_email, action, target, detail)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    actorEmail,
    action,
    target,
    detail == null ? null : JSON.stringify(detail)
  ).run();
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_issue_types");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { results } = await env.DB.prepare(
    `SELECT id, name, ack_sla_hours, resolution_sla_hours, suggested_department
     FROM grievance_categories ORDER BY name ASC`
  ).all();

  // grieviq-25: the department types are managed on the Departments page.
  const types = await deptTypes(env);
  return Response.json({
    role: auth.role,
    canEdit: can(auth.roles || auth.role, "manage_issue_types"),
    departments: types.filter((t) => !t.retired).map((t) => t.key),
    deptNames: namesOf(types),
    issueTypes: results.map((r) => ({
      id: r.id,
      name: r.name,
      ackHours: r.ack_sla_hours,
      resolutionHours: r.resolution_sla_hours,
      suggestedDepartment: r.suggested_department || null,
    })),
  });
}

export async function onRequestPatch({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_issue_types");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const id = String(body.id || "").trim();
  const raw = body.suggestedDepartment;
  const next = raw === null || raw === undefined || String(raw).trim() === "" ? null : String(raw).trim();

  if (!id) {
    return Response.json({ error: "Issue type id is required." }, { status: 400 });
  }
  const active = (await deptTypes(env)).filter((t) => !t.retired).map((t) => t.key);
  if (next !== null && !active.includes(next)) {
    return Response.json({ error: "Department must be one of: " + active.join(", ") }, { status: 400 });
  }

  const row = await env.DB.prepare(
    "SELECT id, name, suggested_department FROM grievance_categories WHERE id = ?"
  ).bind(id).first();
  if (!row) {
    return Response.json({ error: "No issue type with that id." }, { status: 404 });
  }

  const before = row.suggested_department || null;
  if (before === next) {
    return Response.json({ ok: true, unchanged: true, id, name: row.name, suggestedDepartment: next });
  }

  await env.DB.prepare(
    "UPDATE grievance_categories SET suggested_department = ? WHERE id = ?"
  ).bind(next, id).run();

  await logEvent(env, auth.email, "issue_type_suggestion_changed", id, {
    name: row.name,
    before,
    after: next,
  });

  return Response.json({ ok: true, id, name: row.name, before, suggestedDepartment: next });
}
