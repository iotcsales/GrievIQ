/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/gov/stats?month=YYYY-MM&state=<id>&district=<id>&dept=<key>   (grieviq-49, grieviq-51)
// The government dashboard's figures (_shared/gov-stats.js) for the part of
// the country the official may open (_shared/gov-scope.js): a national
// official the whole country or any state or district; a state official
// their state or a district in it; a district official their district.
// Every view is logged (gov_view_log, can't be changed or deleted).
// ?demo=1 -> the demo country: invented figures, no sign-in, never logged.
import { getVerifiedGovUser, logGov } from "../../_shared/gov-auth.js";
import { govStats, demoStats, isMonth, istMonth, lastMonths } from "../../_shared/gov-stats.js";
import { resolveScope, placeOut, demoPlace } from "../../_shared/gov-scope.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const now = Date.now();
  const month = q.get("month") || istMonth(now);
  if (!isMonth(month) || !lastMonths(istMonth(now), 12).includes(month)) return json({ error: "MONTH" }, 400);
  const stateId = q.get("state") || null, district = q.get("district") || null, deptKey = q.get("dept") || null;
  if (q.get("demo") === "1") {
    const d = demoStats({ state: stateId, district }, deptKey, month, now);
    if (!d || (deptKey && !d.dept)) return json({ error: "NOT_FOUND" }, 404);
    return json(Object.assign(d, { place: demoPlace(stateId, district) }));
  }
  const auth = await getVerifiedGovUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const u = auth.user;
  const sc = await resolveScope(env, u, stateId, district);
  if (!sc.ok) {
    if (sc.status === 403) await logGov(env, { userId: u.id, email: u.email, action: "REFUSED", scope: sc.label });
    return json({ error: sc.error }, sc.status);
  }
  const data = await govStats(env, { state: sc.state, district: sc.district, deptKey }, month, now);
  if (deptKey && !data.dept) return json({ error: "NOT_FOUND" }, 404);
  await logGov(env, { userId: u.id, email: u.email, action: "VIEWED", scope: sc.label + (deptKey ? " · dept" : ""), detail: { month, dept: deptKey } });
  return json(Object.assign(data, { place: placeOut(sc.state, sc.district) }));
}
