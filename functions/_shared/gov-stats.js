/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/gov-stats.js   (grieviq-49)
//
// The figures on the government dashboard, for a state or one district,
// for one month, with the month before beside them. Approved design
// (16 Oct 2026), aligned with the Government of India's CPGRAMS monthly
// reports and its Grievance Redressal Assessment and Index (GRAI), and with
// ISO 10002 (monitoring complaint handling):
//   received / resolved     filed / marked fixed in the month
//   pending                 not yet marked fixed, today (compared with the
//                           number pending at the end of last month)
//   pending by age          0-7, 8-21, 22-30, over 30 days since filing
//                           (CPGRAMS works to a 21-day closing standard)
//   within target           of cases resolved in the month, the share fixed
//                           within their issue type's time limit (21 days
//                           when the type has none)
//   average days            filing to fixed, cases resolved in the month
//   reopened                of cases resolved in the month, the share the
//                           citizen reopened
//   satisfied               of citizens' ratings given in the month, the
//                           share "satisfied" or "very satisfied"
//   moved up                of cases received in the month, the share that
//                           moved above the ward office because it was late
//   department on time      of cases forwarded to departments in the month,
//                           the share marked done by the department's target
//   with location and photo of cases received in the month, the share with a
//                           map pin and a photo (how reliable the data is)
//
// Neutrality rule (approved): government departments are shown office by
// office; representatives' offices are never named or ranked, only counted
// inside area totals, unless an office itself chose to share
// (office_gov_share).
// Privacy (DPDP Act 2023; statistical disclosure control): no names, phone
// numbers, emails or complaint text; any count from 1 to 9 is sent as "<10"
// and a share or average resting on fewer than 10 cases is not shown. The
// rule is applied here, on the server, so small numbers never reach a
// browser.

import { loadAssignments, measures as deptMeasures, officeKey as deptOfficeKey, monthlyDept } from "./dept-performance.js";
import { THEMES } from "./gov.js";

const DAY = 86400000;
export const MIN_N = 10;
export const AGE_BANDS = [[0, 7], [8, 21], [22, 30], [31, Infinity]];
const FIXED = ["RESOLVED", "CLOSED", "PENDING_CONFIRMATION"];

// ---- small-number rule ----
export function sn(n) { n = Number(n) || 0; return n > 0 && n < MIN_N ? "<10" : n; }
function share(n, d) { return d >= MIN_N ? Math.round((n / d) * 1000) / 10 : null; }
function avg(list) { return list.length >= MIN_N ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null; }

// ---- months (India time) ----
export function istMonth(ms) { return new Date((ms || Date.now()) + 5.5 * 3600000).toISOString().slice(0, 7); }
export function monthBounds(mo) {
  const [y, m] = mo.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  return { from: Date.parse(mo + "-01T00:00:00+05:30"), to: Date.parse(next + "-01T00:00:00+05:30") - 1 };
}
export function prevMonth(mo) { const [y, m] = mo.split("-").map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); }
export function lastMonths(mo, n) { const out = [mo]; while (out.length < n) out.unshift(prevMonth(out[0])); return out; }
export function isMonth(v) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || "")); }

function ms(t) { if (!t) return NaN; const s = String(t); return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z"); }

// One case's facts for the dashboard.
export function facts(g, cat, nowMs) {
  const created = ms(g.created_at);
  const resolvedMs = FIXED.includes(g.status) && g.resolved_at ? ms(g.resolved_at) : NaN;
  const slaH = cat && cat.resolution_sla_hours ? Number(cat.resolution_sla_hours) : 21 * 24;
  return {
    id: g.id, created, resolvedMs, pending: !FIXED.includes(g.status),
    ageDays: Math.floor((nowMs - created) / DAY),
    within: !isNaN(resolvedMs) && resolvedMs - created <= slaH * 3600000,
    days: !isNaN(resolvedMs) ? (resolvedMs - created) / DAY : null,
    reopened: Number(g.reopen_count || 0) > 0,
    movedUp: String(g.current_tier || "LOCAL") !== "LOCAL",
    located: g.pin_lat != null && !!g.has_photo,
    theme: (cat && cat.theme) || null, categoryId: g.category_id,
    unitId: g.local_unit_id, unitName: g.unit_name, areaId: g.area_id, districtId: g.district_id || null,
    mlaId: g.mla_id, mbId: g.mb_id, mpId: g.mp_id,
  };
}

// The measures for a list of cases in [from, to]; ratings: [{ at, score }].
export function measure(list, b, ratings) {
  const rec = list.filter((f) => f.created >= b.from && f.created <= b.to);
  const res = list.filter((f) => !isNaN(f.resolvedMs) && f.resolvedMs >= b.from && f.resolvedMs <= b.to);
  const pend = list.filter((f) => f.pending);
  const ages = AGE_BANDS.map(([lo, hi]) => pend.filter((f) => f.ageDays >= lo && f.ageDays <= hi).length);
  const rt = (ratings || []).filter((r) => r.at >= b.from && r.at <= b.to);
  return {
    received: rec.length, resolved: res.length, pending: pend.length, ages, over30: ages[3],
    within: { n: res.filter((f) => f.within).length, d: res.length },
    days: res.map((f) => f.days),
    reopened: { n: res.filter((f) => f.reopened).length, d: res.length },
    satisfied: { n: rt.filter((r) => r.score >= 4).length, d: rt.length },
    movedUp: { n: rec.filter((f) => f.movedUp).length, d: rec.length },
    located: { n: rec.filter((f) => f.located).length, d: rec.length },
  };
}
// Applies the small-number rule to measure() output.
export function shown(m) {
  return {
    received: sn(m.received), resolved: sn(m.resolved), pending: sn(m.pending), ages: m.ages.map(sn), over30: sn(m.over30),
    within: share(m.within.n, m.within.d), avgDays: avg(m.days), reopened: share(m.reopened.n, m.reopened.d),
    satisfied: share(m.satisfied.n, m.satisfied.d), movedUp: share(m.movedUp.n, m.movedUp.d), located: share(m.located.n, m.located.d),
  };
}

// Everything the dashboard needs for one scope and month.
// scope: { state: { id, name_en, ... }, district: row | null, deptKey?: string }
export async function govStats(env, scope, month, nowMs) {
  const now = nowMs || Date.now();
  const st = scope.state, dist = scope.district;
  const where = ["a.state = ?"], binds = [st.name_en];
  if (dist) { where.push("a.district_id = ?"); binds.push(dist.id); }
  const [casesRes, catRes, areaRes, distRes] = await env.DB.batch([
    env.DB.prepare(
      `SELECT g.id, g.status, g.created_at, g.resolved_at, g.current_tier, g.reopen_count, g.pin_lat, g.category_id, g.local_unit_id,
              lu.name AS unit_name, lu.mla_constituency_id AS mla_id, lu.municipal_body_id AS mb_id, mla.mp_constituency_id AS mp_id,
              a.id AS area_id, a.district_id,
              EXISTS (SELECT 1 FROM complaint_photos p WHERE p.grievance_id = g.id) AS has_photo
         FROM grievances g JOIN local_units lu ON lu.id = g.local_unit_id JOIN areas a ON a.id = lu.area_id
         LEFT JOIN mla_constituencies mla ON mla.id = lu.mla_constituency_id
        WHERE ${where.join(" AND ")}`
    ).bind(...binds),
    env.DB.prepare("SELECT id, name, resolution_sla_hours, theme FROM grievance_categories"),
    env.DB.prepare(`SELECT a.id, a.name, a.kind, a.district_id, a.lgd_code FROM areas a WHERE ${where.join(" AND ")} ORDER BY a.name`).bind(...binds),
    env.DB.prepare("SELECT id, name_en, name_hi, lgd_code FROM districts WHERE state_id = ? ORDER BY name_en").bind(st.id),
  ]);
  const cats = new Map((catRes.results || []).map((c) => [c.id, c]));
  const all = (casesRes.results || []).map((g) => facts(g, cats.get(g.category_id), now));
  const areas = areaRes.results || [];
  const districts = distRes.results || [];

  // Citizens' ratings of the cases in scope.
  let ratings = [];
  if (all.length) {
    try {
      const { results } = await env.DB.prepare("SELECT grievance_id, office_score, submitted_at FROM case_ratings WHERE grievance_id IN (SELECT value FROM json_each(?))")
        .bind(JSON.stringify(all.map((f) => f.id))).all();
      const areaOf = new Map(all.map((f) => [f.id, f]));
      ratings = (results || []).map((r) => ({ at: ms(r.submitted_at), score: Number(r.office_score), f: areaOf.get(r.grievance_id) }));
    } catch (e) { ratings = []; }
  }
  // Department work on these cases.
  let asg = [];
  if (areas.length) {
    const ids = new Set(all.map((f) => f.id));
    asg = (await loadAssignments(env, { areaIds: areas.map((a) => a.id) }, now)).filter((a) => ids.has(a.grievanceId));
  }
  const officeNames = new Map();
  try {
    const offIds = Array.from(new Set(asg.map((a) => a.officeId).filter(Boolean)));
    if (offIds.length) {
      const { results } = await env.DB.prepare("SELECT id, name_en, name_hi FROM dept_offices WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(offIds)).all();
      for (const r of results || []) officeNames.set(String(r.id), r);
    }
  } catch (e) { /* departments not set up */ }

  const b = monthBounds(month), pb = monthBounds(prevMonth(month));
  const ratingsOf = (list) => { const ids = new Set(list.map((f) => f.id)); return ratings.filter((r) => r.f && ids.has(r.f.id)); };
  const deptOnTime = (list, bb) => { const m = deptMeasures(list, bb.from, bb.to); return share(m.onTime.n, m.onTime.d); };

  const cur = measure(all, b, ratings), prev = measure(all, pb, ratings);
  const tiles = Object.assign(shown(cur), { deptOnTime: deptOnTime(asg, b) });
  const before = Object.assign(shown(prev), { deptOnTime: deptOnTime(asg, pb) });
  // Change from last month, only where both months clear the rule.
  // Pending at the end of last month: filed by then and not yet fixed then.
  prev.pending = all.filter((f) => f.created <= pb.to && (isNaN(f.resolvedMs) || f.resolvedMs > pb.to)).length;
  before.pending = sn(prev.pending);
  const change = {};
  for (const k of ["received", "resolved", "pending"]) {
    const a = cur[k], p = prev[k];
    change[k] = a >= MIN_N && p >= MIN_N ? Math.round(((a - p) / p) * 1000) / 10 : null;
  }

  // Rows: districts (state view) or cities and blocks (district view).
  const rowOf = (list) => {
    const m = measure(list, b, ratingsOf(list));
    const s = shown(m);
    return { received: s.received, resolved: s.resolved, pending: s.pending, over30: s.over30, within: s.within, satisfied: s.satisfied };
  };
  let rows;
  if (!dist) {
    rows = districts.map((d) => {
      const list = all.filter((f) => f.districtId === d.id);
      return Object.assign({ id: d.id, nameEn: d.name_en, nameHi: d.name_hi, lgd: d.lgd_code, areas: areas.filter((a) => a.district_id === d.id).length }, rowOf(list), { raw: list.length });
    }).filter((r) => r.areas > 0 || r.raw > 0);
    const loose = all.filter((f) => !f.districtId);
    if (loose.length || areas.some((a) => !a.district_id)) rows.push(Object.assign({ id: null, unplaced: true, areas: areas.filter((a) => !a.district_id).length }, rowOf(loose), { raw: loose.length }));
  } else {
    rows = areas.map((a) => Object.assign({ id: a.id, nameEn: a.name, kind: a.kind, lgd: a.lgd_code }, rowOf(all.filter((f) => f.areaId === a.id)), { raw: 1 }));
  }
  rows.forEach((r) => delete r.raw);

  // Government department offices, ranked by "done on time".
  const byOffice = new Map();
  for (const a of asg) { const k = deptOfficeKey(a); if (!byOffice.has(k)) byOffice.set(k, []); byOffice.get(k).push(a); }
  const depts = Array.from(byOffice.entries()).map(([k, list]) => {
    const a0 = list[0], off = a0.officeId ? officeNames.get(String(a0.officeId)) : null;
    const m = deptMeasures(list, b.from, b.to);
    return {
      key: k, nameEn: off ? off.name_en : a0.officeName || a0.department, nameHi: off ? off.name_hi : null, department: a0.department,
      forwarded: sn(m.forwarded), withNow: sn(m.withNow), overdueNow: sn(m.overdueNow),
      onTime: share(m.onTime.n, m.onTime.d), firstReplyDays: m.firstReply.n >= MIN_N ? m.firstReply.median : null,
      rating: m.rating.count >= MIN_N ? Math.round((list.filter((x) => x.ratingScore >= 4 && x.forwardedMs >= b.from && x.forwardedMs <= b.to).length / m.rating.count) * 1000) / 10 : null,
      _sort: m.onTime.d >= MIN_N ? m.onTime.n / m.onTime.d : -1, _n: m.forwarded,
    };
  }).sort((x, y) => y._sort - x._sort || y._n - x._n || String(x.nameEn).localeCompare(String(y.nameEn)));
  depts.forEach((d) => { delete d._sort; delete d._n; });

  // One department office in detail (State › District › Department).
  let dept = null;
  if (scope.deptKey) {
    const list = byOffice.get(scope.deptKey);
    if (list) {
      const m = deptMeasures(list, b.from, b.to), mp = deptMeasures(list, pb.from, pb.to);
      const d0 = depts.find((d) => d.key === scope.deptKey);
      const tr = monthlyDept(list, month + "-15");
      dept = Object.assign({}, d0, {
        prevOnTime: share(mp.onTime.n, mp.onTime.d), fixedFirst: share(m.fixedFirst.n, m.fixedFirst.d),
        reopened: share(m.reopened.n, m.reopened.d), notOurs: sn(m.notOurs),
        trend: tr.map((t) => ({ month: t.month, received: sn(t.received), resolved: sn(t.resolved) })),
      });
    }
  }

  // Issue themes (ISO 37120) and types, received in the month.
  const recM = all.filter((f) => f.created >= b.from && f.created <= b.to);
  const themeCount = new Map();
  for (const f of recM) themeCount.set(f.theme || "OTHER", (themeCount.get(f.theme || "OTHER") || 0) + 1);
  const themes = Array.from(themeCount.entries()).map(([theme, n]) => ({ theme, received: sn(n), _n: n })).sort((x, y) => y._n - x._n);
  themes.forEach((t) => delete t._n);

  // Hotspots: wards and villages with the most pending cases (places, not offices).
  const pendBy = new Map();
  for (const f of all) if (f.pending) { const e = pendBy.get(f.unitId) || { name: f.unitName, areaId: f.areaId, n: 0 }; e.n++; pendBy.set(f.unitId, e); }
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const hotspots = Array.from(pendBy.values()).filter((h) => h.n >= MIN_N).sort((x, y) => y.n - x.n).slice(0, 5)
    .map((h) => ({ name: h.name, area: areaName.get(h.areaId) || "", pending: h.n }));

  // 12 months.
  const trend = lastMonths(month, 12).map((mo) => {
    const bb = monthBounds(mo);
    return { month: mo, received: sn(all.filter((f) => f.created >= bb.from && f.created <= bb.to).length), resolved: sn(all.filter((f) => !isNaN(f.resolvedMs) && f.resolvedMs >= bb.from && f.resolvedMs <= bb.to).length) };
  });

  // Representatives' offices that chose to share their own figures.
  let shared = [];
  try {
    const { results } = await env.DB.prepare("SELECT office_tier, office_id, office_name FROM office_gov_share WHERE share = 1").all();
    const field = { LOCAL: "unitId", MAYOR: "mbId", MLA: "mlaId", MP: "mpId" };
    shared = (results || []).map((o) => {
      const list = all.filter((f) => String(f[field[o.office_tier]] || "") === String(o.office_id));
      return list.length ? Object.assign({ name: o.office_name || o.office_id, tier: o.office_tier }, rowOf(list)) : null;
    }).filter(Boolean);
  } catch (e) { shared = []; }

  return {
    month, months: lastMonths(istMonth(now), 12).reverse(), tiles, before, change, rows, depts, dept, themes, hotspots, trend, shared,
    totalRaw: null,
  };
}

// ---------------- the demo state (sample figures for presentations) ----------------
// Everything here is invented and every screen and report says so.
function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}
export const DEMO_STATE = { id: "demo", name_en: "Demo State", name_hi: "डेमो राज्य", lgd_code: null, demo: 1 };
const DEMO_D = "ABCDEFGH".split("");
const DEMO_DEPTS = [["Water Supply Department", "जलापूर्ति विभाग", "Water Supply"], ["Electricity Distribution Company", "विद्युत वितरण कंपनी", "Electricity"],
  ["Municipal Sanitation", "नगर स्वच्छता", "Sanitation / Garbage"], ["Public Works (Roads)", "लोक निर्माण (सड़कें)", "Roads & Public Works"],
  ["Police", "पुलिस", "Police"], ["Revenue Department", "राजस्व विभाग", "Revenue"]];
const DEMO_THEMES = [["WATER", 26], ["SOLID_WASTE", 19], ["TRANSPORT", 17], ["ENERGY", 15], ["SAFETY", 9], ["WASTEWATER", 6], ["GOVERNANCE", 5], ["HEALTH", 3]];

function demoDistrict(letter, month) {
  const r = rng("d" + letter + month), base = 120 + Math.floor(rng("b" + letter)() * 260);
  const season = 1 + 0.18 * Math.sin((Number(month.slice(5)) / 12) * 2 * Math.PI);
  const received = Math.round(base * season * (0.9 + r() * 0.2));
  const resolved = Math.round(received * (0.82 + r() * 0.2));
  const pending = Math.round(base * (0.45 + r() * 0.3));
  const a1 = Math.round(pending * 0.42), a2 = Math.round(pending * 0.3), a3 = Math.round(pending * 0.12);
  return {
    received, resolved, pending, ages: [a1, a2, a3, Math.max(0, pending - a1 - a2 - a3)],
    within: 58 + r() * 32, avgDays: 6 + r() * 12, reopened: 2 + r() * 6, satisfied: 55 + r() * 33, movedUp: 8 + r() * 16, deptOnTime: 50 + r() * 38, located: 62 + r() * 30,
  };
}
function sumDemo(list) {
  const tot = list.reduce((s, d) => s + d.received, 0) || 1, res = list.reduce((s, d) => s + d.resolved, 0) || 1;
  const w = (k, by) => Math.round(list.reduce((s, d) => s + d[k] * d[by], 0) / (by === "resolved" ? res : tot) * 10) / 10;
  return {
    received: list.reduce((s, d) => s + d.received, 0), resolved: list.reduce((s, d) => s + d.resolved, 0), pending: list.reduce((s, d) => s + d.pending, 0),
    ages: [0, 1, 2, 3].map((i) => list.reduce((s, d) => s + d.ages[i], 0)), within: w("within", "resolved"), avgDays: w("avgDays", "resolved"),
    reopened: w("reopened", "resolved"), satisfied: w("satisfied", "received"), movedUp: w("movedUp", "received"), deptOnTime: w("deptOnTime", "received"), located: w("located", "received"),
  };
}
function demoTiles(t) {
  return { received: t.received, resolved: t.resolved, pending: t.pending, ages: t.ages, over30: t.ages[3], within: t.within, avgDays: t.avgDays,
    reopened: t.reopened, satisfied: t.satisfied, movedUp: t.movedUp, located: t.located, deptOnTime: t.deptOnTime };
}
export function demoDistricts() {
  return DEMO_D.map((L, i) => ({ id: "demo-" + L.toLowerCase(), name_en: "Demo District " + L, name_hi: "डेमो ज़िला " + L, lgd_code: String(9001 + i) }));
}
export function demoStats(districtId, deptKey, month, nowMs) {
  const letters = districtId ? DEMO_D.filter((L) => "demo-" + L.toLowerCase() === districtId) : DEMO_D;
  if (!letters.length) return null;
  const cur = (mo) => letters.map((L) => demoDistrict(L, mo));
  const t = sumDemo(cur(month)), p = sumDemo(cur(prevMonth(month)));
  const change = {};
  for (const k of ["received", "resolved", "pending"]) change[k] = Math.round(((t[k] - p[k]) / p[k]) * 1000) / 10;
  const row = (x) => ({ received: x.received, resolved: x.resolved, pending: x.pending, over30: x.ages[3], within: Math.round(x.within * 10) / 10, satisfied: Math.round(x.satisfied * 10) / 10 });
  let rows;
  if (!districtId) rows = demoDistricts().map((d, i) => Object.assign({ id: d.id, nameEn: d.name_en, nameHi: d.name_hi, lgd: d.lgd_code, areas: 3 }, row(demoDistrict(DEMO_D[i], month))));
  else {
    const d = demoDistrict(letters[0], month);
    rows = [0.5, 0.3, 0.2].map((f, i) => {
      const sc = (n) => Math.round(n * f);
      return { id: districtId + "-" + (i + 1), nameEn: (i === 2 ? "Demo Block " : "Demo City ") + letters[0] + "-" + (i + 1), kind: i === 2 ? "DISTRICT" : "CITY",
        received: sc(d.received), resolved: sc(d.resolved), pending: sc(d.pending), over30: sc(d.ages[3]), within: Math.round((d.within + (i - 1) * 4) * 10) / 10, satisfied: Math.round((d.satisfied + (1 - i) * 3) * 10) / 10 };
    });
  }
  const scale = t.received / 1600;
  const depts = DEMO_DEPTS.map((dd, i) => {
    const r = rng("dept" + i + month + (districtId || ""));
    return { key: "demo-dept-" + i, nameEn: dd[0], nameHi: dd[1], department: dd[2], forwarded: Math.max(12, Math.round((60 + r() * 140) * scale)),
      withNow: Math.max(10, Math.round((15 + r() * 40) * scale)), overdueNow: Math.round((r() * 18) * scale), onTime: Math.round((48 + r() * 42) * 10) / 10,
      firstReplyDays: Math.round((1 + r() * 4) * 10) / 10, rating: Math.round((50 + r() * 38) * 10) / 10 };
  }).map((d) => Object.assign(d, { overdueNow: d.overdueNow < 10 ? (d.overdueNow ? "<10" : 0) : d.overdueNow }))
    .sort((x, y) => y.onTime - x.onTime);
  let dept = null;
  if (deptKey) {
    const d0 = depts.find((d) => d.key === deptKey);
    if (d0) {
      dept = Object.assign({}, d0, { prevOnTime: Math.round((d0.onTime - 4 + rng(deptKey)() * 8) * 10) / 10, fixedFirst: Math.round((70 + rng("ff" + deptKey)() * 22) * 10) / 10,
        reopened: Math.round((2 + rng("ro" + deptKey)() * 6) * 10) / 10, notOurs: "<10",
        trend: lastMonths(month, 12).map((mo) => { const r = rng(deptKey + mo); const n = mo === month ? d0.forwarded : Math.round(d0.forwarded * (0.8 + r() * 0.4)); return { month: mo, received: n, resolved: Math.round(n * (0.8 + r() * 0.2)) }; }) });
    }
  }
  const themes = DEMO_THEMES.map(([theme, pc]) => ({ theme, received: Math.round(t.received * pc / 100) }));
  const hotspots = [["Demo Ward 12", "A"], ["Demo Ward 4", "C"], ["Demo Ward 27", "B"], ["Demo Village 3", "F"], ["Demo Ward 9", "A"]]
    .filter((h) => !districtId || letters.includes(h[1])).map((h, i) => ({ name: h[0], area: "Demo City " + h[1] + "-1", pending: Math.round(t.pending * (0.06 - i * 0.008)) }));
  const trend = lastMonths(month, 12).map((mo) => { const x = sumDemo(cur(mo)); return { month: mo, received: x.received, resolved: x.resolved }; });
  const shared = districtId && letters[0] !== "A" ? [] : [{ name: "Demo Ward 12 (Corporator)", tier: "LOCAL", received: 64, resolved: 58, pending: 21, over30: "<10", within: 81.2, satisfied: 77.5 }];
  return { month, months: lastMonths(istMonth(nowMs), 12).reverse(), tiles: demoTiles(t), before: demoTiles(p), change, rows, depts, dept, themes, hotspots, trend, shared, demo: true };
}
export { THEMES };
