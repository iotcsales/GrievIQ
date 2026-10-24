/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/gov/signout. grieviq-49.
import { endSession, clearCookie, logGov } from "../../_shared/gov-auth.js";

export async function onRequestPost({ request, env }) {
  let id = null;
  try { id = await endSession(request, env); } catch (e) { id = null; }
  if (id) await logGov(env, { userId: id, action: "SIGNED_OUT" });
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookie(), "Cache-Control": "no-store" } });
}
