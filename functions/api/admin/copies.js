/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/admin/copies   (grieviq-45, view_copies: super admin and auditor)
// Web addresses where a copy of GrievIQ has been seen running, newest first.
import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_copies");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  try {
    const { results } = await env.DB.prepare("SELECT * FROM copy_sightings ORDER BY last_seen DESC LIMIT 500").all();
    return json({ ready: true, copies: (results || []).map((r) => ({ host: r.host, firstSeen: r.first_seen, lastSeen: r.last_seen, hits: r.hits, lastPath: r.last_path || "", country: r.country || "", seenBy: (r.seen_by || "").split(",").filter(Boolean) })) });
  } catch (e) {
    if (/no such table/i.test(String(e && e.message))) return json({ ready: false, copies: [] });
    throw e;
  }
}
