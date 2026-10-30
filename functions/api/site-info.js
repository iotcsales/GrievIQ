/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/site-info.js
//
// GET /api/site-info (public, grieviq-39): the published prices, offers
// running today, GST, the company's details and contacts, payment policy
// text and the claims that are switched on. Used by /for-offices, the
// Privacy and Help pages and the department agreement. Only published,
// public fields; never the draft.

import { liveVersion, publicView } from "../_shared/site-settings.js";

export async function onRequestGet({ env }) {
  const live = await liveVersion(env);
  const out = publicView(live.data, live);
  // Where GrievIQ is open for citizens now (for "Which areas are covered?").
  try {
    const { results } = await env.DB.prepare("SELECT name, state FROM areas WHERE live = 1 ORDER BY name").all();
    out.areas = (results || []).map((r) => ({ name: r.name, state: r.state }));
  } catch (e) { out.areas = []; }
  // grieviq-75: the Grievance Officer is the staff member who holds that duty
  // (Staff page), so the published name can't go out of date. Their sign-in
  // address is never published: the contact email stays the published one.
  try {
    const go = await env.DB.prepare(
      "SELECT a.name FROM staff_duties d JOIN admin_users a ON a.id = d.admin_id WHERE d.duty = 'GRIEVANCE_OFFICER' AND d.ended_at IS NULL AND COALESCE(a.status, 'PRESENT') <> 'LEFT' LIMIT 1"
    ).first();
    if (go && go.name) out.company.goName = go.name;
  } catch (e) { /* part49 not run yet: the published name stays */ }
  return Response.json(out, { headers: { "Cache-Control": "public, max-age=300" } });
}
