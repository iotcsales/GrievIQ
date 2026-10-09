// GET /api/overview   (rep console, item 8c-2)
//
// How an office's whole area is doing: counts only (_shared/overview.js).
// For the representative, office managers and office assistants of the
// office; not field workers.
//
//   ?office=<TIER:ID>        which office (required)
//   &from=YYYY-MM-DD&to=...  the period, India dates (default: this month)
//   &mla=<id>                MP offices: the wards of one MLA constituency
//   &format=csv              the same table as a CSV file (logged)
//
// Rows: a ward office by issue type; Mayor and MLA offices by ward; MP
// offices by MLA constituency (and, with &mla, by ward). Cases still at a
// lower level are included as numbers only -- no case details are returned.
// Team workload (representative and office manager only): per field worker,
// open and overdue cases now, and median days from assignment to fix.

import { getVerifiedRep } from "../_shared/get-verified-rep.js";
import { resolveChain, mandateScope, officeUnitIds } from "../_shared/jurisdiction.js";
import { settleOverdueConfirmations } from "../_shared/confirmation.js";
import { ROLE, parseOfficeKey, logTeam } from "../_shared/team.js";
import { caseFacts, summarise, monthlyTrend, isDay, dayStartMs, dayEndMs, todayIst, pct, AGE_BUCKETS } from "../_shared/overview.js";
import { toUtcMs } from "../_shared/time-limits.js";
import { loadRatings, summarise as summariseRatings } from "../_shared/ratings.js";

const MAX_DAYS = 3 * 366;
const DAY = 86400000;

function bad(error, fields) { return Response.json({ error, fields }, { status: 400 }); }

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const url = new URL(request.url);
  const o = parseOfficeKey(url.searchParams.get("office"));
  const m = o && auth.mandates.find((x) => x.tier === o.tier && x.id === o.id);
  if (!m || m.role === ROLE.FW) return Response.json({ error: "You can't see this office's overview.", code: "ROLE" }, { status: 403 });

  // The period (India dates). Default: this month so far.
  const today = todayIst();
  let from = url.searchParams.get("from") || today.slice(0, 8) + "01";
  let to = url.searchParams.get("to") || today;
  const fields = {};
  if (!isDay(from)) fields.from = "DATE";
  if (!isDay(to)) fields.to = "DATE";
  if (!fields.from && !fields.to) {
    if (from > to) fields.to = "BEFORE_FROM";
    else if (from > today) fields.from = "FUTURE";
    else if ((dayStartMs(to) - dayStartMs(from)) / DAY > MAX_DAYS) fields.to = "TOO_LONG";
  }
  if (Object.keys(fields).length) return bad("Please check the dates.", fields);
  const fromMs = dayStartMs(from), toMs = dayEndMs(to);

  const mlaId = m.tier === "MP" ? (url.searchParams.get("mla") || null) : null;

  await settleOverdueConfirmations(env);

  // Every case in the office's area (a team member's own wards only).
  const s = mandateScope(m);
  let where = s.where;
  const binds = s.binds.slice();
  if (mlaId) { where = "(" + where + ") AND lu_scope.mla_constituency_id = ?"; binds.push(mlaId); }
  const [casesRes, catRes] = await env.DB.batch([
    env.DB.prepare(`SELECT g.* FROM grievances g ${s.join} WHERE ${where}`).bind(...binds),
    env.DB.prepare("SELECT * FROM grievance_categories"),
  ]);
  const cases = casesRes.results || [];
  const categories = new Map((catRes.results || []).map((c) => [c.id, c]));

  // Ward chains, side by side (same as the case list).
  const units = Array.from(new Set(cases.map((g) => g.local_unit_id)));
  const chains = new Map();
  (await Promise.all(units.map((u) => resolveChain(env, u)))).forEach((c, i) => chains.set(units[i], c));

  // The groups, in display order, including those with no cases.
  const unitIds = (await officeUnitIds(env, m)).map(String).filter((id) => !Array.isArray(m.wards) || m.wards.includes(id));
  let groupBy, groups;
  if (m.tier === "LOCAL") {
    groupBy = "category";
    const used = new Set(cases.map((g) => g.category_id));
    groups = Array.from(categories.values()).filter((c) => used.has(c.id))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map((c) => ({ key: String(c.id), id: String(c.id), name: c.name }));
  } else {
    const { results: wards } = await env.DB.prepare(
      `SELECT lu.id, lu.name, lu.mla_constituency_id AS mla_id, mla.name AS mla_name FROM local_units lu
       LEFT JOIN mla_constituencies mla ON mla.id = lu.mla_constituency_id
       WHERE lu.id IN (SELECT value FROM json_each(?)) ORDER BY lu.name`
    ).bind(JSON.stringify(unitIds)).all();
    if (m.tier === "MP" && !mlaId) {
      groupBy = "mla";
      const seen = new Map();
      for (const w of wards || []) {
        if (!w.mla_id || seen.has(String(w.mla_id))) continue;
        seen.set(String(w.mla_id), { key: String(w.mla_id), id: String(w.mla_id), name: w.mla_name || String(w.mla_id), wards: 0 });
      }
      for (const w of wards || []) { const g = seen.get(String(w.mla_id)); if (g) g.wards++; }
      groups = Array.from(seen.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    } else {
      groupBy = "ward";
      groups = (wards || []).filter((w) => !mlaId || String(w.mla_id) === String(mlaId))
        .map((w) => ({ key: String(w.id), id: String(w.id), name: w.name }));
      if (mlaId && !groups.length) return bad("That constituency isn't in this office's area.", { mla: "NOT_IN_AREA" });
    }
  }
  const unitToMla = new Map();
  if (groupBy === "mla") {
    for (const u of units) { const c = chains.get(u); if (c && c.localUnit) unitToMla.set(u, String(c.localUnit.mla_constituency_id)); }
  }

  const now = Date.now();
  const items = [];
  const factsById = new Map();
  for (const g of cases) {
    const category = categories.get(g.category_id);
    const chain = chains.get(g.local_unit_id);
    if (!category || !chain) continue;
    const facts = caseFacts(g, category, chain, now);
    factsById.set(g.id, facts);
    const key = groupBy === "category" ? String(g.category_id) : groupBy === "mla" ? unitToMla.get(g.local_unit_id) : String(g.local_unit_id);
    items.push({ key, facts });
  }
  const { rows, total } = summarise(items, groups, fromMs, toMs);
  const trend = monthlyTrend(items.map((i) => i.facts), today);

  // Team workload: representative and office manager only.
  let workload = null;
  if (m.role === ROLE.REP || m.role === ROLE.OM) {
    workload = [];
    try {
      const [teamRes, asgRes] = await env.DB.batch([
        env.DB.prepare("SELECT member_email, member_name, available FROM office_team WHERE office_tier = ? AND office_id = ? AND status = 'ACTIVE' AND role = 'FIELD_WORKER' ORDER BY member_name").bind(m.tier, m.id),
        env.DB.prepare("SELECT grievance_id, assignee_email, assigned_at, ended_at FROM case_assignments WHERE office_tier = ? AND office_id = ? ORDER BY assigned_at ASC").bind(m.tier, m.id),
      ]);
      // Each case's latest assignment, if it still stands.
      const latest = new Map();
      for (const a of asgRes.results || []) latest.set(a.grievance_id, a);
      const per = new Map((teamRes.results || []).map((r) => [String(r.member_email).toLowerCase(), { name: r.member_name, email: r.member_email, available: Number(r.available) !== 0, open: 0, overdue: 0, days: [] }]));
      for (const [gid, a] of latest) {
        if (a.ended_at) continue;
        const w = per.get(String(a.assignee_email).toLowerCase());
        const f = factsById.get(gid);
        if (!w || !f) continue;
        if (f.pending) { w.open++; if (f.overdue) w.overdue++; }
        if (!isNaN(f.resolvedMs) && f.resolvedMs >= fromMs && f.resolvedMs <= toMs) {
          const at = toUtcMs(a.assigned_at);
          if (!isNaN(at) && f.resolvedMs >= at) w.days.push((f.resolvedMs - at) / DAY);
        }
      }
      workload = Array.from(per.values()).map((w) => {
        const s2 = w.days.slice().sort((x, y) => x - y);
        const mid = Math.floor(s2.length / 2);
        const med = s2.length ? Math.round((s2.length % 2 ? s2[mid] : (s2[mid - 1] + s2[mid]) / 2) * 10) / 10 : null;
        return { name: w.name, available: w.available, open: w.open, overdue: w.overdue, fixed: w.days.length, medianDays: med };
      });
    } catch (e) { workload = []; }
  }

  // Citizen ratings (grieviq-30): representative and office managers only.
  // Cases this office resolved, rated in the period; an average only from 5.
  let ratings = null;
  if (m.role === ROLE.REP || m.role === ROLE.OM) {
    const byCase = await loadRatings(env, cases.map((g) => g.id));
    const scores = [];
    for (const r of byCase.values()) {
      if (r.office_tier !== m.tier || String(r.office_id) !== String(m.id)) continue;
      const at = toUtcMs(r.submitted_at);
      if (!isNaN(at) && at >= fromMs && at <= toMs) scores.push(r.office_score);
    }
    ratings = summariseRatings(scores);
  }

  const officeOut = { key: m.tier + ":" + m.id, tier: m.tier, name: m.name, label: m.label };
  if (url.searchParams.get("format") === "csv") {
    await logTeam(env, { officeTier: m.tier, officeId: m.id, actor: auth.email, actorRole: m.role || ROLE.REP,
      onBehalf: m.officeRepEmail || auth.email, action: "OVERVIEW_EXPORTED", detail: { from, to, mla: mlaId } });
    return csvResponse(officeOut, from, to, groupBy, rows, total, mlaId);
  }
  return new Response(JSON.stringify({
    office: officeOut, myRole: m.role || ROLE.REP, from, to, today, groupBy, mla: mlaId,
    mlaName: mlaId && rows.length ? await mlaNameOf(env, mlaId) : null,
    ages: AGE_BUCKETS.map(([lo, hi]) => ({ from: lo, to: hi === Infinity ? null : hi })),
    rows, total, trend, workload, ratings,
  }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function mlaNameOf(env, id) {
  const r = await env.DB.prepare("SELECT name FROM mla_constituencies WHERE id = ?").bind(id).first();
  return r ? r.name : null;
}

// CSV: opens in Excel with Hindi intact (UTF-8 with a byte-order mark);
// cells starting with = + - @ are prefixed so a spreadsheet never runs them
// as formulas (OWASP CSV injection).
function cell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvResponse(office, from, to, groupBy, rows, total, mlaId) {
  const first = groupBy === "category" ? "Issue type / समस्या" : groupBy === "mla" ? "MLA constituency / विधानसभा क्षेत्र" : "Ward / वार्ड";
  const head = [first, "Received / प्राप्त", "Resolved / निस्तारित", "Pending now / अभी लंबित",
    "Pending 0-7 days", "Pending 8-30 days", "Pending 31-90 days", "Pending over 90 days",
    "Overdue now / समय से पीछे", "Median days to resolve", "Acknowledged on time %", "Escalated beyond ward %",
    "Confirmed fixed by citizen %", "Reopened %"];
  const line = (name, r) => [name, r.received, r.resolved, r.pending, r.ages[0], r.ages[1], r.ages[2], r.ages[3], r.overdue,
    r.medianDays, pct(r.ackOnTime), pct(r.escalated), pct(r.confirmed), pct(r.reopened)];
  const out = [
    ["GrievIQ overview", office.name + " (" + office.label + ")", "Period: " + from + " to " + to, "Pending and overdue: as of the time of download"],
    head,
    ...rows.map((r) => line(r.name, r)),
    line("Total / कुल", total),
  ];
  const body = "﻿" + out.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  const safe = String(office.name).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "office";
  return new Response(body, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="grieviq-overview-${safe}${mlaId ? "-" + String(mlaId).replace(/[^A-Za-z0-9]+/g, "") : ""}-${from}-to-${to}.csv"`,
    "Cache-Control": "no-store",
  } });
}
