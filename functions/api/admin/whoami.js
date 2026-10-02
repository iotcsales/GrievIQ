// GET /api/admin/whoami   (every staff member)
//
// Who is signed in to the admin panel, their role, and which admin pages
// that role may open. The menu on every admin page uses this to show only
// the pages the person can use (least privilege, and no dead ends); the
// server still checks every action itself.

import { getVerifiedAdmin, pagesFor } from "../../_shared/get-verified-admin.js";

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error, leaveUntil: auth.leaveUntil || null }, { status: auth.status });
  return new Response(JSON.stringify({ email: auth.email, role: auth.role, roles: auth.roles || [auth.role], name: auth.name || null, employeeId: auth.employeeId || null,
    covering: auth.covering || [], pages: pagesFor(auth.roles || auth.role) }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
