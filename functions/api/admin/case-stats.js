// GET /api/admin/case-stats?area=<id|ALL>   (charts, grieviq-31)
//
// "How complaints are moving" on the admin dashboard: counts only, for the
// whole platform or one area (city / district). Same definitions as the
// representative's Overview tab (_shared/overview.js): received and
// resolved this month, pending and overdue now, median days to resolve,
// pending by age, overdue by ward, received by issue type (last 12 months),
// and 12 months of received vs resolved.
//
// No case details and no citizen data leave this file. Everyone who can
// open the dashboard can read it (the auditor too).

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
import { resolveChain } from "../../_shared/jurisdiction.js";
import { settleOverdueConfirmations } from "../../_shared/confirmation.js";
import { listAreas } from "../../_shared/areas.js";
import { caseFacts, summarise, monthlyTrend, todayIst, dayStartMs, dayEndMs } from "../../_shared/overview.js";

const json = (body, status) => Response.json(body, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_dashboard");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  const areas = (await listAreas(env)).map((a) => ({ id: a.id, name: a.name, live: !!a.live }));
  let area = String(url.searchParams.get("area") || "ALL");
  if (area !== "ALL" && !areas.some((a) => a.id === area)) return json({ error: "Unknown area.", code: "AREA" }, 404);

  await settleOverdueConfirmations(env);
  const where = area === "ALL" ? "" : "WHERE lu.area_id = ?";
  const stmt = env.DB.prepare(`SELECT g.* FROM grievances g JOIN local_units lu ON lu.id = g.local_unit_id ${where}`);
  const [casesRes, catRes] = await env.DB.batch([
    area === "ALL" ? stmt : stmt.bind(area),
    env.DB.prepare("SELECT * FROM grievance_categories"),
  ]);
  const cases = casesRes.results || [];
  const categories = new Map((catRes.results || []).map((c) => [c.id, c]));
  const units = Array.from(new Set(cases.map((g) => g.local_unit_id)));
  const chains = new Map();
  (await Promise.all(units.map((u) => resolveChain(env, u)))).forEach((c, i) => chains.set(units[i], c));

  const now = Date.now();
  const today = todayIst(now);
  const monthFrom = dayStartMs(today.slice(0, 8) + "01"), monthTo = dayEndMs(today);
  const [y, m] = today.split("-").map(Number);
  const yearFrom = dayStartMs(new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10));

  const byWard = [], byType = [], facts = [];
  for (const g of cases) {
    const category = categories.get(g.category_id);
    const chain = chains.get(g.local_unit_id);
    if (!category || !chain) continue;
    const f = caseFacts(g, category, chain, now);
    facts.push(f);
    byWard.push({ key: String(g.local_unit_id), facts: f });
    byType.push({ key: String(g.category_id), facts: f });
  }
  const wardGroups = units.filter((u) => chains.get(u)).map((u) => ({ key: String(u), id: String(u), name: chains.get(u).localUnit.name }));
  const typeGroups = Array.from(new Set(cases.map((g) => g.category_id))).filter((id) => categories.has(id))
    .map((id) => ({ key: String(id), id: String(id), name: categories.get(id).name }));

  const month = summarise(byWard, [], monthFrom, monthTo).total;
  const wards = summarise(byWard, wardGroups, monthFrom, monthTo).rows;
  const types = summarise(byType, typeGroups, yearFrom, monthTo).rows;

  // Low ratings waiting for a follow-up, in this area (null before part24).
  let lowRatings = null;
  try {
    const r = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM case_ratings r JOIN grievances g ON g.id = r.grievance_id JOIN local_units lu ON lu.id = g.local_unit_id
       WHERE r.low = 1 AND r.followed_up_at IS NULL ${area === "ALL" ? "" : "AND lu.area_id = ?"}`
    ).bind(...(area === "ALL" ? [] : [area])).first();
    lowRatings = r ? Number(r.n) || 0 : 0;
  } catch (e) { lowRatings = null; }

  return json({
    areas, area, today,
    tiles: { received: month.received, resolved: month.resolved, pending: month.pending, overdue: month.overdue, medianDays: month.medianDays, lowRatings },
    ages: month.ages,
    trend: monthlyTrend(facts, today),
    overdueByWard: wards.filter((w) => w.overdue > 0).map((w) => ({ id: w.id, name: w.name, value: w.overdue })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)),
    receivedByType: types.filter((t) => t.received > 0).map((t) => ({ id: t.id, name: t.name, value: t.received })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)),
  });
}
