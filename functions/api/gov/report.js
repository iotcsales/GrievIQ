/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/gov/report?r=<summary|districts|departments|pending30|themes|reps>&month=YYYY-MM&district=<id>
//   -> one MIS report as tables (grieviq-50; _shared/gov-reports.js). The
//   page prints it to PDF and builds the Excel file from it. Same access
//   rules as /api/gov/stats; every report opened is logged (REPORT).
// ?demo=1 -> the demo state's report (invented figures, labelled).
import { getVerifiedGovUser, logGov } from "../../_shared/gov-auth.js";
import { isMonth, istMonth, lastMonths } from "../../_shared/gov-stats.js";
import { REPORTS, buildReport, buildDemoReport } from "../../_shared/gov-reports.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams, now = Date.now();
  const kind = q.get("r");
  if (!REPORTS.includes(kind)) return json({ error: "REPORT" }, 400);
  const month = q.get("month") || istMonth(now);
  if (!isMonth(month) || !lastMonths(istMonth(now), 12).includes(month)) return json({ error: "MONTH" }, 400);
  const district = q.get("district") || null;
  const generatedAt = new Date(now).toISOString();
  if (q.get("demo") === "1") {
    const r = buildDemoReport(kind, district, month, now);
    return r ? json(Object.assign(r, { generatedAt, scope: { demo: true, district } })) : json({ error: "NOT_FOUND" }, 404);
  }
  const auth = await getVerifiedGovUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const u = auth.user;
  const state = await env.DB.prepare("SELECT * FROM states WHERE id = ?").bind(u.state_id).first();
  if (!state) return json({ error: "NOT_FOUND" }, 404);
  const wanted = u.level === "DISTRICT" ? (district || u.district_id) : district;
  if (u.level === "DISTRICT" && wanted !== u.district_id) {
    await logGov(env, { userId: u.id, email: u.email, action: "REFUSED", scope: "district:" + wanted, detail: { report: kind } });
    return json({ error: "NOT_YOURS" }, 403);
  }
  let dist = null;
  if (wanted) {
    dist = await env.DB.prepare("SELECT * FROM districts WHERE id = ? AND state_id = ?").bind(wanted, state.id).first();
    if (!dist) return json({ error: "NOT_FOUND" }, 404);
  }
  const r = await buildReport(env, kind, { state, district: dist }, month, now);
  await logGov(env, { userId: u.id, email: u.email, action: "REPORT", scope: dist ? "district:" + dist.id : "state:" + state.id, detail: { report: kind, month } });
  return json(Object.assign(r, { generatedAt, by: u.name, scope: { state: { id: state.id, nameEn: state.name_en, nameHi: state.name_hi, lgd: state.lgd_code },
    district: dist ? { id: dist.id, nameEn: dist.name_en, nameHi: dist.name_hi, lgd: dist.lgd_code } : null } }));
}
