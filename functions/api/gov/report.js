/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/gov/report?r=<summary|districts|departments|pending30|themes|reps>&month=YYYY-MM&state=<id>&district=<id>
//   -> one MIS report as tables (grieviq-50; _shared/gov-reports.js). The
//   page prints it to PDF and builds the Excel file from it. Same access
//   rules as /api/gov/stats; every report opened is logged (REPORT).
// ?demo=1 -> the demo state's report (invented figures, labelled).
import { getVerifiedGovUser, logGov } from "../../_shared/gov-auth.js";
import { isMonth, istMonth, lastMonths } from "../../_shared/gov-stats.js";
import { REPORTS, buildReport, buildDemoReport } from "../../_shared/gov-reports.js";
import { resolveScope, placeOut, demoPlace } from "../../_shared/gov-scope.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams, now = Date.now();
  const kind = q.get("r");
  if (!REPORTS.includes(kind)) return json({ error: "REPORT" }, 400);
  const month = q.get("month") || istMonth(now);
  if (!isMonth(month) || !lastMonths(istMonth(now), 12).includes(month)) return json({ error: "MONTH" }, 400);
  const stateId = q.get("state") || null, district = q.get("district") || null;
  const generatedAt = new Date(now).toISOString();
  if (q.get("demo") === "1") {
    const r = buildDemoReport(kind, { state: stateId, district }, month, now);
    return r ? json(Object.assign(r, { generatedAt, place: demoPlace(stateId, district) })) : json({ error: "NOT_FOUND" }, 404);
  }
  const auth = await getVerifiedGovUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const u = auth.user;
  const sc = await resolveScope(env, u, stateId, district);
  if (!sc.ok) {
    if (sc.status === 403) await logGov(env, { userId: u.id, email: u.email, action: "REFUSED", scope: sc.label, detail: { report: kind } });
    return json({ error: sc.error }, sc.status);
  }
  const r = await buildReport(env, kind, { state: sc.state, district: sc.district }, month, now);
  await logGov(env, { userId: u.id, email: u.email, action: "REPORT", scope: sc.label, detail: { report: kind, month } });
  return json(Object.assign(r, { generatedAt, by: u.name, place: placeOut(sc.state, sc.district) }));
}
