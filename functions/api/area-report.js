/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/area-report?t=<token>   (grieviq-88)
//
// The free report on one ward's complaints during a GrievIQ-assisted pilot,
// for that ward's councillor's office only (a private 30-day link made by
// GrievIQ staff). Counts by type only: no citizen names, phone numbers,
// emails, addresses or complaint text; counts 1-9 are shown as "<10" and a
// median needs 10 or more cases (functions/_shared/assisted.js). The same
// report for every office, whatever its party.

import { validToken, tokenHash, toMs, areaReport, istDay } from "../_shared/assisted.js";

const HEAD = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" };

export async function onRequestGet({ request, env }) {
  const t = new URL(request.url).searchParams.get("t") || "";
  const bad = (code, status) => Response.json({ error: code === "EXPIRED" ? "This report link has expired. Ask GrievIQ for a new one." : "This report link isn't valid.", code }, { status, headers: HEAD });
  if (!validToken(t)) return bad("NOT_FOUND", 404);
  let r;
  try { r = await env.DB.prepare("SELECT * FROM assisted_reports WHERE token_hash = ?").bind(await tokenHash(t)).first(); }
  catch (e) { return bad("NOT_FOUND", 404); }
  if (!r) return bad("NOT_FOUND", 404);
  if (r.revoked_at || Date.now() > toMs(r.expires_at)) return bad("EXPIRED", 410);
  const p = await env.DB.prepare("SELECT starts_on, ends_on FROM assisted_pilots WHERE id = ?").bind(r.pilot_id).first();
  if (!p) return bad("NOT_FOUND", 404);
  const today = istDay();
  const to = today < p.ends_on ? today : p.ends_on;
  const report = await areaReport(env, r.unit_id, p.starts_on, to < p.starts_on ? p.starts_on : to);
  if (!report) return bad("NOT_FOUND", 404);
  await env.DB.prepare("UPDATE assisted_reports SET opened_count = opened_count + 1 WHERE id = ?").bind(r.id).run();
  return Response.json({ report, expiresAt: r.expires_at }, { headers: HEAD });
}
