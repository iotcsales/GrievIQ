/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/admin/whoami   (every staff member)
//
// Who is signed in to the admin panel, their role, and which admin pages
// that role may open. The menu on every admin page uses this to show only
// the pages the person can use (least privilege, and no dead ends); the
// server still checks every action itself.

// grieviq-75: also the person's named duties, and whether a sales staff
// member still has to accept the sales code of conduct.
// POST { action: "accept_sales_code" }   (sales staff) accept it.
// grieviq-78: also the staff policies still to accept (policies.need);
// POST { action: "accept_policies", policies: [...] } accepts them.

import { getVerifiedAdmin, pagesFor } from "../../_shared/get-verified-admin.js";
import { needsSalesCode, acceptSalesCode, SALES_CODE_VERSION } from "../../_shared/sales-code.js";
import { policiesNeeded, acceptPolicies, POLICY_VERSIONS } from "../../_shared/staff-policies.js";

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error, leaveUntil: auth.leaveUntil || null, why: auth.why || null }, { status: auth.status });
  const need = await policiesNeeded(env, auth.adminId);
  return new Response(JSON.stringify({ email: auth.email, role: auth.role, roles: auth.roles || [auth.role], name: auth.name || null, employeeId: auth.employeeId || null,
    covering: auth.covering || [], duties: auth.duties || [], pages: pagesFor(auth.roles || auth.role),
    salesCode: (await needsSalesCode(env, auth)) ? { needed: true, version: SALES_CODE_VERSION } : null,
    policies: need.length ? { need, versions: POLICY_VERSIONS } : null }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  let b;
  try { b = await request.json(); } catch (e) { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  if (b && b.action === "accept_policies") {
    const r = await acceptPolicies(env, auth, b.policies);
    return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
  }
  if (!b || b.action !== "accept_sales_code") return Response.json({ error: "Unknown action." }, { status: 400 });
  if (b.accept !== true) return Response.json({ error: "CHECK_FIELDS", fields: { accept: "REQUIRED" } }, { status: 400 });
  const r = await acceptSalesCode(env, auth);
  return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
