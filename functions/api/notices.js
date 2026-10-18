/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/notices?ward=<id>   (grieviq-55)
// Public, no sign-in: the paid public notices running today for a ward or
// village, in a different fair order each day. Each says who published
// and paid for it. No prices, no people's names or contacts.

import { liveForWard } from "../_shared/notices.js";

export async function onRequestGet({ request, env }) {
  const id = String(new URL(request.url).searchParams.get("ward") || "").trim();
  if (!id || id.length > 200) return Response.json({ error: "ward is required" }, { status: 400 });
  const r = await liveForWard(env, id);
  if (!r) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  return Response.json(r, { headers: { "Cache-Control": "public, max-age=300" } });
}
