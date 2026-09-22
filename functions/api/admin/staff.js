// functions/api/admin/staff.js
//
// Manage admin_users: list, add, change role, remove. Gated behind the
// manage_admins permission (super_admin only) since this controls who
// else can act as an admin. Every change is logged to admin_events.

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";

const VALID_ROLES = ["super_admin", "operations_admin", "data_moderator", "auditor"];

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
  const auth = await getVerifiedAdmin(request, env, "manage_admins");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { results } = await env.DB.prepare(
    "SELECT id, email, role, created_at FROM admin_users ORDER BY created_at ASC"
  ).all();

  return Response.json({ staff: results });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_admins");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const role = String(body.role || "").trim();

  if (!email || !email.includes("@")) {
    return Response.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return Response.json({ error: "Invalid role." }, { status: 400 });
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM admin_users WHERE LOWER(email) = ?"
  ).bind(email).first();
  if (existing) {
    return Response.json({ error: "That email is already a staff member." }, { status: 409 });
  }

  const id = `admin-${crypto.randomUUID().slice(0, 8)}`;
  await env.DB.prepare(
    "INSERT INTO admin_users (id, email, role) VALUES (?, ?, ?)"
  ).bind(id, email, role).run();

  await logEvent(env, auth.email, "staff_added", email, { role });

  return Response.json({ ok: true, id, email, role });
}

export async function onRequestPatch({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_admins");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const role = String(body.role || "").trim();

  if (!email) {
    return Response.json({ error: "Email is required." }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return Response.json({ error: "Invalid role." }, { status: 400 });
  }

  const existing = await env.DB.prepare(
    "SELECT id, role FROM admin_users WHERE LOWER(email) = ?"
  ).bind(email).first();
  if (!existing) {
    return Response.json({ error: "No staff member with that email." }, { status: 404 });
  }

  if (email === auth.email && role !== "super_admin") {
    return Response.json({ error: "You cannot remove your own super_admin role." }, { status: 400 });
  }

  await env.DB.prepare(
    "UPDATE admin_users SET role = ? WHERE LOWER(email) = ?"
  ).bind(role, email).run();

  await logEvent(env, auth.email, "staff_role_changed", email, {
    fromRole: existing.role,
    toRole: role,
  });

  return Response.json({ ok: true, email, role });
}

export async function onRequestDelete({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_admins");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  if (!email) {
    return Response.json({ error: "Email is required." }, { status: 400 });
  }

  if (email === auth.email) {
    return Response.json({ error: "You cannot remove yourself." }, { status: 400 });
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM admin_users WHERE LOWER(email) = ?"
  ).bind(email).first();
  if (!existing) {
    return Response.json({ error: "No staff member with that email." }, { status: 404 });
  }

  await env.DB.prepare("DELETE FROM admin_users WHERE LOWER(email) = ?").bind(email).run();

  await logEvent(env, auth.email, "staff_removed", email, null);

  return Response.json({ ok: true, email });
}