/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/gov-reports.js   (grieviq-50)
//
// The six MIS reports of the government dashboard (approved design, 16 Oct
// 2026), each for the official's state or district and one month:
//   summary      the key figures, with last month and the same month last
//                year beside them (CPGRAMS monthly report style)
//   districts    district by district (in a district: city and block)
//   departments  government department office by office
//   pending30    cases pending over 30 days, by department office and by age
//                (31-60, 61-90, over 90 days): counts only, no case details
//   themes       issue types (ISO 37120 themes) received, month by month,
//                for 12 months
//   reps         representatives' offices: totals by district, no office
//                names (neutrality rule)
// A report is a list of tables; the page shows it for printing to PDF and
// builds the Excel file from the same data, in the reader's language
// (column labels are text keys the page translates). The small-number rule
// (counts 1-9 as "<10"; shares and averages need 10 cases) applies as on
// the dashboard.

import { govStats, demoStats, sn, MIN_N, monthBounds, lastMonths, prevMonth, DEMO_STATE, demoDistricts } from "./gov-stats.js";
import { THEMES } from "./gov.js";

export const REPORTS = ["summary", "districts", "departments", "pending30", "themes", "reps"];
const DAY = 86400000;
const C = (key, label, type) => ({ key, label, type: type || "num" });
function yearAgo(mo) { let m = mo; for (let i = 0; i < 12; i++) m = prevMonth(m); return m; }
function share(n, d) { return d >= MIN_N ? Math.round((n / d) * 1000) / 10 : null; }

function summaryTable(t, b, y) {
  const row = (k, key, type) => ({ name: { k }, now: t[key], last: b ? b[key] : null, year: y ? y[key] : null, _t: type });
  const rows = [
    row("gv.t_received", "received"), row("gv.t_resolved", "resolved"), row("gv.t_pending", "pending"),
    { name: { k: "gv.age_1" }, now: t.ages[0], last: b ? b.ages[0] : null, year: y ? y.ages[0] : null },
    { name: { k: "gv.age_2" }, now: t.ages[1], last: b ? b.ages[1] : null, year: y ? y.ages[1] : null },
    { name: { k: "gv.age_3" }, now: t.ages[2], last: b ? b.ages[2] : null, year: y ? y.ages[2] : null },
    { name: { k: "gv.age_4" }, now: t.ages[3], last: b ? b.ages[3] : null, year: y ? y.ages[3] : null },
    row("gv.t_within", "within", "pct"), row("gv.t_avg_days", "avgDays", "days"), row("gv.t_reopened", "reopened", "pct"),
    row("gv.t_satisfied", "satisfied", "pct"), row("gv.t_moved_up", "movedUp", "pct"), row("gv.t_dept_on_time", "deptOnTime", "pct"),
    row("gv.t_located", "located", "pct"),
  ];
  return { id: "summary", title: "gv.rp_summary", columns: [C("name", "gv.rp_col_figure", "text"), C("now", "gv.rp_col_this", "mixed"), C("last", "gv.rp_col_last", "mixed"), C("year", "gv.rp_col_year", "mixed")], rows, note: "gv.rp_summary_note" };
}
function districtsTable(rows, inDistrict) {
  return {
    id: "districts", title: inDistrict ? "gv.rp_areas" : "gv.rp_districts",
    columns: [C("name", inDistrict ? "gv.col_area" : "gv.col_district", "text"), C("lgd", "gv.rp_col_lgd", "text"), C("received", "gv.t_received"), C("resolved", "gv.t_resolved"),
      C("pending", "gv.t_pending"), C("over30", "gv.col_over30"), C("within", "gv.col_within", "pct"), C("satisfied", "gv.col_satisfied", "pct")],
    rows: rows.map((r) => ({ name: r.unplaced ? { k: "gv.unplaced" } : { en: r.nameEn, hi: r.nameHi || r.nameEn }, lgd: r.lgd || "", received: r.received, resolved: r.resolved, pending: r.pending, over30: r.over30, within: r.within, satisfied: r.satisfied })),
  };
}
function deptsTable(depts) {
  return {
    id: "departments", title: "gv.rp_departments",
    columns: [C("rank", "gv.rp_col_rank", "int"), C("name", "gv.col_office", "text"), C("department", "gv.rp_col_dept", "dept"), C("forwarded", "gv.col_forwarded"), C("withNow", "gv.col_with_now"),
      C("overdueNow", "gv.col_late_now"), C("onTime", "gv.col_on_time", "pct"), C("firstReplyDays", "gv.col_first_reply", "days"), C("rating", "gv.col_satisfied", "pct")],
    rows: depts.map((d, i) => ({ rank: i + 1, name: { en: d.nameEn, hi: d.nameHi || d.nameEn }, department: d.department, forwarded: d.forwarded, withNow: d.withNow, overdueNow: d.overdueNow, onTime: d.onTime, firstReplyDays: d.firstReplyDays, rating: d.rating })),
  };
}
function pendingTable(rows) {
  return {
    id: "pending30", title: "gv.rp_pending30",
    columns: [C("name", "gv.col_office", "text"), C("department", "gv.rp_col_dept", "dept"), C("total", "gv.rp_col_over30_total"), C("b1", "gv.rp_col_31_60"), C("b2", "gv.rp_col_61_90"), C("b3", "gv.rp_col_90"), C("oldest", "gv.rp_col_oldest", "days")],
    rows, note: "gv.rp_pending30_note",
  };
}
function themesTable(months, matrix) {
  return {
    id: "themes", title: "gv.rp_themes",
    columns: [C("name", "gv.theme_col", "text")].concat(months.map((m) => ({ key: m, label: m, type: "num", month: true }))).concat([C("total", "gv.rp_col_total")]),
    rows: matrix, note: "gv.rp_themes_note",
  };
}
function repsTable(rows, inDistrict) {
  return {
    id: "reps", title: "gv.rp_reps",
    columns: [C("name", inDistrict ? "gv.col_area" : "gv.col_district", "text"), C("offices", "gv.rp_col_offices"), C("received", "gv.t_received"), C("resolved", "gv.t_resolved"),
      C("pending", "gv.t_pending"), C("over30", "gv.col_over30"), C("movedUp", "gv.t_moved_up", "pct")],
    rows, note: "gv.rp_reps_note",
  };
}

// A real report. scope: { state, district } rows from the database.
export async function buildReport(env, kind, scope, month, nowMs) {
  const now = nowMs || Date.now();
  const s = await govStats(env, scope, month, now, { raw: true });
  const raw = s.raw, inDistrict = !!scope.district;
  let table;
  if (kind === "summary") {
    const y = await govStats(env, scope, yearAgo(month), now);
    table = summaryTable(s.tiles, s.before, y.tiles);
  } else if (kind === "districts") table = districtsTable(s.rows, inDistrict);
  else if (kind === "departments") table = deptsTable(s.depts);
  else if (kind === "pending30") {
    // Cases with a department now, more than 30 days after filing.
    const facts = new Map(raw.all.map((f) => [f.id, f]));
    const rows = [];
    for (const [k, list] of raw.byOffice) {
      const ages = list.filter((a) => a.current && a.withNow).map((a) => facts.get(a.grievanceId)).filter((f) => f && f.pending && f.ageDays > 30).map((f) => f.ageDays);
      if (!ages.length) continue;
      const a0 = list[0], off = a0.officeId ? raw.officeNames.get(String(a0.officeId)) : null;
      rows.push({ name: { en: off ? off.name_en : a0.officeName || a0.department, hi: off ? off.name_hi || off.name_en : a0.officeName || a0.department }, department: a0.department,
        total: sn(ages.length), b1: sn(ages.filter((d) => d <= 60).length), b2: sn(ages.filter((d) => d > 60 && d <= 90).length), b3: sn(ages.filter((d) => d > 90).length),
        oldest: ages.length >= MIN_N ? Math.max(...ages) : null, _n: ages.length });
    }
    rows.sort((x, y) => y._n - x._n); rows.forEach((r) => delete r._n);
    // Still with representatives' offices (never forwarded): one total, no office named.
    const withDept = new Set(raw.asg.filter((a) => a.current && a.withNow).map((a) => a.grievanceId));
    const rest = raw.all.filter((f) => f.pending && f.ageDays > 30 && !withDept.has(f.id)).map((f) => f.ageDays);
    rows.push({ name: { k: "gv.rp_not_forwarded" }, department: "", total: sn(rest.length), b1: sn(rest.filter((d) => d <= 60).length), b2: sn(rest.filter((d) => d > 60 && d <= 90).length), b3: sn(rest.filter((d) => d > 90).length), oldest: rest.length >= MIN_N ? Math.max(...rest) : null });
    table = pendingTable(rows);
  } else if (kind === "themes") {
    const months = lastMonths(month, 12);
    const keys = THEMES.concat(["OTHER"]);
    const matrix = keys.map((t) => {
      const r = { name: { k: t === "OTHER" ? "gv.theme_other" : "theme." + t } };
      let tot = 0;
      for (const m of months) { const b = monthBounds(m); const n = raw.all.filter((f) => (f.theme || "OTHER") === t && f.created >= b.from && f.created <= b.to).length; r[m] = sn(n); tot += n; }
      r.total = sn(tot); r._n = tot; return r;
    }).filter((r) => r._n > 0).sort((x, y) => y._n - x._n);
    matrix.forEach((r) => delete r._n);
    table = themesTable(months, matrix);
  } else if (kind === "reps") {
    const b = monthBounds(month);
    const groups = inDistrict ? raw.areas.map((a) => ({ name: { en: a.name, hi: a.name }, test: (f) => f.areaId === a.id, areaIds: [a.id] }))
      : raw.districts.filter((d) => raw.areas.some((a) => a.district_id === d.id)).map((d) => ({ name: { en: d.name_en, hi: d.name_hi || d.name_en }, test: (f) => f.districtId === d.id, areaIds: raw.areas.filter((a) => a.district_id === d.id).map((a) => a.id) }));
    if (!inDistrict && raw.areas.some((a) => !a.district_id)) groups.push({ name: { k: "gv.unplaced" }, test: (f) => !f.districtId, areaIds: raw.areas.filter((a) => !a.district_id).map((a) => a.id) });
    // Offices using GrievIQ: wards and villages with a representative's email.
    let units = [];
    try {
      const ids = raw.areas.map((a) => a.id);
      if (ids.length) units = (await env.DB.prepare("SELECT area_id FROM local_units WHERE COALESCE(TRIM(rep_email), '') <> '' AND area_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).all()).results || [];
    } catch (e) { units = []; }
    const rows = groups.map((g) => {
      const list = raw.all.filter(g.test);
      const rec = list.filter((f) => f.created >= b.from && f.created <= b.to);
      return { name: g.name, offices: units.filter((u) => g.areaIds.includes(u.area_id)).length,
        received: sn(rec.length), resolved: sn(list.filter((f) => !isNaN(f.resolvedMs) && f.resolvedMs >= b.from && f.resolvedMs <= b.to).length),
        pending: sn(list.filter((f) => f.pending).length), over30: sn(list.filter((f) => f.pending && f.ageDays > 30).length), movedUp: share(rec.filter((f) => f.movedUp).length, rec.length) };
    });
    table = repsTable(rows, inDistrict);
  } else return null;
  return { report: kind, month, tables: [table] };
}

// The demo state's reports: invented figures, labelled "Demo data".
export function buildDemoReport(kind, districtId, month, nowMs) {
  const s = demoStats(districtId, null, month, nowMs);
  if (!s) return null;
  const inDistrict = !!districtId;
  let table;
  if (kind === "summary") table = summaryTable(s.tiles, s.before, demoStats(districtId, null, yearAgo(month), nowMs).tiles);
  else if (kind === "districts") table = districtsTable(s.rows, inDistrict);
  else if (kind === "departments") table = deptsTable(s.depts);
  else if (kind === "pending30") {
    const rows = s.depts.map((d, i) => { const t = Math.max(10, Math.round((typeof d.withNow === "number" ? d.withNow : 10) * 0.4)); const b1 = Math.round(t * 0.55), b2 = Math.round(t * 0.3);
      return { name: { en: d.nameEn, hi: d.nameHi }, department: d.department, total: t, b1: sn(b1), b2: sn(b2), b3: sn(t - b1 - b2), oldest: 45 + i * 17 }; }).sort((x, y) => y.total - x.total);
    rows.push({ name: { k: "gv.rp_not_forwarded" }, department: "", total: Math.round(s.tiles.over30 * 0.35), b1: Math.round(s.tiles.over30 * 0.2), b2: Math.round(s.tiles.over30 * 0.1), b3: sn(Math.round(s.tiles.over30 * 0.05)), oldest: 118 });
    table = pendingTable(rows);
  } else if (kind === "themes") {
    const months = lastMonths(month, 12);
    const tot = Object.fromEntries(s.trend.map((m) => [m.month, m.received]));
    const share = Object.fromEntries(s.themes.map((t) => [t.theme, t.received / (s.tiles.received || 1)]));
    const matrix = s.themes.map((t) => { const r = { name: { k: "theme." + t.theme } }; let sum = 0; for (const m of months) { r[m] = Math.round((tot[m] || 0) * share[t.theme]); sum += r[m]; } r.total = sum; return r; });
    table = themesTable(months, matrix);
  } else if (kind === "reps") {
    table = repsTable(s.rows.map((r, i) => ({ name: { en: r.nameEn, hi: r.nameHi || r.nameEn }, offices: inDistrict ? 12 + i * 5 : 38 + ((i * 7) % 21), received: r.received, resolved: r.resolved, pending: r.pending, over30: r.over30, movedUp: Math.round((9 + (i * 3) % 11) * 10) / 10 })), inDistrict);
  } else return null;
  return { report: kind, month, tables: [table], demo: true };
}
export { DEMO_STATE, demoDistricts, DAY };
