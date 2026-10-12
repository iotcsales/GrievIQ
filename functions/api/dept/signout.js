/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/dept/signout   Ends this browser's department session.
import { endSession, clearCookie, logDept } from "../../_shared/dept-auth.js";

export async function onRequestPost({ request, env }) {
  let id = null;
  try { id = await endSession(request, env); } catch (e) { id = null; }
  if (id) await logDept(env, { officerId: id, action: "SIGNED_OUT" });
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookie(), "Cache-Control": "no-store" } });
}
