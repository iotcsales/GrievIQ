/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/gov/stats?month=YYYY-MM&district=<id>&dept=<key>   (grieviq-49)
// The government dashboard's figures for the official's state or district
// (_shared/gov-stats.js). A district official sees only their district; a
// state official any district of their state. Every view is logged
// (gov_view_log, can't be changed or deleted).
// ?demo=1 -> the demo state: invented figures, no sign-in, never logged.
import { getVerifiedGovUser, logGov } from "../../_shared/gov-auth.js";
import { govStats, demoStats, isMonth, istMonth, lastMonths } from "../../_shared/gov-stats.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url), q = url.searchParams;
  const now = Date.now();
  const month = q.get("month") || istMonth(now);
  if (!isMonth(month) || !lastMonths(istMonth(now), 12).includes(month)) return json({ error: "MONTH" }, 400);
  const district = q.get("district") || null, deptKey = q.get("dept") || null;
  if (q.get("demo") === "1") {
    const d = demoStats(district, deptKey, month, now);
    return d ? json(d) : json({ error: "NOT_FOUND" }, 404);
  }
  const auth = await getVerifiedGovUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const u = auth.user;
  const state = await env.DB.prepare("SELECT * FROM states WHERE id = ?").bind(u.state_id).first();
  if (!state) return json({ error: "NOT_FOUND" }, 404);
  let dist = null;
  const wanted = u.level === "DISTRICT" ? (district || u.district_id) : district;
  if (u.level === "DISTRICT" && wanted !== u.district_id) {
    await logGov(env, { userId: u.id, email: u.email, action: "REFUSED", scope: "district:" + wanted });
    return json({ error: "NOT_YOURS" }, 403);
  }
  if (wanted) {
    dist = await env.DB.prepare("SELECT * FROM districts WHERE id = ? AND state_id = ?").bind(wanted, state.id).first();
    if (!dist) return json({ error: "NOT_FOUND" }, 404);
  }
  const data = await govStats(env, { state, district: dist, deptKey }, month, now);
  if (deptKey && !data.dept) return json({ error: "NOT_FOUND" }, 404);
  await logGov(env, { userId: u.id, email: u.email, action: "VIEWED", scope: (dist ? "district:" + dist.id : "state:" + state.id) + (deptKey ? " · dept" : ""), detail: { month, dept: deptKey } });
  return json(data);
}
