// GET /api/admin/dept-performance   Department performance (grieviq-33).
//
//   ?area=<id>                 which area (default: the first area)
//   &from=YYYY-MM-DD&to=...    the period, India dates (default: last 90 days)
//   &by=office|type            one row per department office (default) or per type
//   &detail=<row key>          also: that row's 12 months and its overdue cases now
//   &format=csv                the table as a CSV file (logged)
// Counts and timings only (_shared/dept-performance.js); no citizen data.
// Super admin, operations admin and the auditor.

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
import { listAreas } from "../../_shared/areas.js";
import { deptTypes, namesOf } from "../../_shared/departments.js";
import { isDay, dayStartMs, dayEndMs, todayIst } from "../../_shared/overview.js";
import { loadAssignments, measures, officeKey, monthlyDept, MIN_CASES } from "../../_shared/dept-performance.js";

const json = (b, s) => Response.json(b, { status: s || 200, headers: { "Cache-Control": "no-store" } });
const DAY = 86400000;

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_dept_performance");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const url = new URL(request.url), q = (k) => url.searchParams.get(k) || "";
  const areas = (await listAreas(env)).map((a) => ({ id: a.id, name: a.name }));
  const area = q("area") || (areas[0] && areas[0].id) || "";
  if (area && areas.length && !areas.some((a) => a.id === area)) return json({ error: "Unknown area.", code: "AREA" }, 404);
  const today = todayIst();
  const from = q("from") || new Date(dayStartMs(today) - 89 * DAY + 6 * 3600000).toISOString().slice(0, 10);
  const to = q("to") || today;
  const fields = {};
  if (!isDay(from)) fields.from = "DATE";
  if (!isDay(to)) fields.to = "DATE";
  if (!fields.from && !fields.to) { if (from > to) fields.to = "BEFORE_FROM"; else if (from > today) fields.from = "FUTURE"; }
  if (Object.keys(fields).length) return json({ error: "Please check the dates.", fields }, 400);
  const by = q("by") === "type" ? "type" : "office";
  const fromMs = dayStartMs(from), toMs = dayEndMs(to);

  const all = await loadAssignments(env, area ? { areaId: area } : {});
  const types = await deptTypes(env);
  const groups = new Map();
  for (const a of all) {
    const key = by === "type" ? "type:" + a.department : officeKey(a);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  // Names and the directory's facts for offices.
  const officeIds = Array.from(new Set(all.map((a) => a.officeId).filter(Boolean)));
  const offices = new Map(), active = new Map();
  if (officeIds.length) {
    const { results } = await env.DB.prepare("SELECT id, name_en, name_hi, departments FROM dept_offices WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(officeIds)).all();
    for (const o of results || []) offices.set(o.id, o);
    try {
      const { results: ac } = await env.DB.prepare(
        "SELECT office_id, COUNT(*) AS n FROM dept_officers WHERE status = 'ACTIVE' AND last_signed_in >= ? AND office_id IN (SELECT value FROM json_each(?)) GROUP BY office_id"
      ).bind(new Date(Date.now() - 30 * DAY).toISOString(), JSON.stringify(officeIds)).all();
      for (const r of ac || []) active.set(r.office_id, Number(r.n));
    } catch (e) { /* before part25 */ }
  }
  const rows = [];
  for (const [key, list] of groups) {
    const a0 = list[0];
    let row;
    if (by === "type") row = { key, department: a0.department, name: a0.department };
    else {
      const o = a0.officeId ? offices.get(a0.officeId) : null;
      row = { key, officeId: a0.officeId, inDirectory: !!o, name: o ? o.name_en : (a0.officeName || ""), nameHi: o ? o.name_hi || null : null,
        departments: Array.from(new Set(list.map((x) => x.department))), activeOfficers: a0.officeId ? (active.get(a0.officeId) || 0) : null };
    }
    row.m = measures(list, fromMs, toMs);
    if (row.m.forwarded || row.m.withNow) rows.push(row);
  }
  rows.sort((x, y) => (y.m.overdueNow - x.m.overdueNow) || (y.m.forwarded - x.m.forwarded) || String(x.name).localeCompare(String(y.name)));
  const total = measures(all, fromMs, toMs);

  if (q("format") === "csv") {
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), auth.email, "dept_performance_exported", area || null, JSON.stringify({ from, to, by })).run();
    return csv(rows, total, by, from, to, area);
  }
  let detail = null;
  const dk = q("detail");
  if (dk && groups.has(dk)) {
    const list = groups.get(dk);
    detail = {
      key: dk, trend: monthlyDept(list, today),
      overdue: list.filter((a) => a.overdueNow).sort((x, y) => y.overdueDays - x.overdueDays).slice(0, 50)
        .map((a) => ({ id: a.grievanceId, ref: a.trackingRef, days: a.overdueDays })),
    };
  }
  return json({ areas, area, from, to, today, by, min: MIN_CASES, deptNames: namesOf(types), rows, total, detail });
}

function cell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csv(rows, total, by, from, to, area) {
  const head = [by === "type" ? "Department type" : "Department office", "Forwarded", "With the office now", "Overdue now",
    "First reply: median days", "Work done on time %", "On time: cases decided", "Time to fixed: median days", "Fixed first time %", "Field checks",
    "Reopened %", "Citizen rating (average of 5)", "Ratings", "Replies made by the department %", "Not ours", "Can't do"];
  const line = (name, m) => [name, m.forwarded, m.withNow, m.overdueNow, m.firstReply.median, m.onTime.pct, m.onTime.d, m.toFixed.median,
    m.fixedFirst.pct, m.fixedFirst.d, m.reopened.pct, m.rating.average, m.rating.count, m.ownReplies.pct, m.notOurs, m.cantDo];
  const out = [["GrievIQ department performance", "Area: " + (area || "all"), "Period: " + from + " to " + to, "Shares and medians only from 5 cases"], head]
    .concat(rows.map((r) => line(r.name, r.m))).concat([line("Total", total)]);
  const body = "﻿" + out.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="grieviq-department-performance-${by}-${from}-to-${to}.csv"` } });
}
