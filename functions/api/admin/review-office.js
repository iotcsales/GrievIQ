/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/admin/review-office.js (grieviq-68)
// GET  (view_bills: super, operations, auditor) -> review office status
// POST (super admin only) { action: "on", email } | { action: "off" }
// See _shared/review-office.js.

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
import { reviewStatus, reviewOn, reviewOff } from "../../_shared/review-office.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_bills");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  return json(Object.assign(await reviewStatus(env), { canManage: auth.role === "super_admin" }));
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_bills");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (auth.role !== "super_admin") return json({ error: "INSUFFICIENT_ROLE" }, 403);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const r = b.action === "on" ? await reviewOn(env, auth.email, b) : b.action === "off" ? await reviewOff(env, auth.email) : { status: 400, body: { error: "Unknown action." } };
  return json(r.body, r.status);
}
