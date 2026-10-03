// GET /api/admin/visitors   (super admin, operations admin; auditor reads)
//
// The live visitor map and daily visitor figures. Everything here is
// anonymous: city-level places and counts only (see functions/api/visit.js
// for how visits are counted without cookies or network addresses).

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
import { istDay } from "../../_shared/daily-salt.js";

const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const DAY = 86400000;

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_visitors");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const DB = env.DB;
  const today = istDay(), yesterday = istDay(Date.now() - DAY), from = istDay(Date.now() - 29 * DAY);
  try {
    const live = await DB.prepare("SELECT COUNT(DISTINCT vid) AS n FROM visit_events WHERE at >= datetime('now', '-5 minutes')").first();
    const recent = (await DB.prepare(
      `SELECT country, region, city, AVG(lat) AS lat, AVG(lng) AS lng, COUNT(DISTINCT vid) AS visitors, COUNT(*) AS views, MAX(at) AS lastAt
         FROM visit_events WHERE at >= datetime('now', '-30 minutes')
        GROUP BY country, region, city ORDER BY lastAt DESC LIMIT 200`
    ).all()).results || [];
    const days = (await DB.prepare("SELECT day, visitors, pageviews FROM visit_daily WHERE day >= ? ORDER BY day").bind(from).all()).results || [];
    const byDay = Object.fromEntries(days.map((d) => [d.day, d]));
    const series = [];
    for (let i = 29; i >= 0; i--) {
      const d = istDay(Date.now() - i * DAY);
      series.push({ day: d, visitors: byDay[d] ? Number(byDay[d].visitors) : 0, pageviews: byDay[d] ? Number(byDay[d].pageviews) : 0 });
    }
    const topCities = (await DB.prepare(
      `SELECT country, region, city, AVG(lat) AS lat, AVG(lng) AS lng, SUM(visitors) AS visitors
         FROM visit_city_daily WHERE day >= ? GROUP BY country, region, city ORDER BY visitors DESC, city ASC LIMIT 100`
    ).bind(from).all()).results || [];
    const countries = await DB.prepare("SELECT COUNT(DISTINCT country) AS n FROM visit_city_daily WHERE day >= ? AND country <> ''").bind(from).first();
    const pick = (d) => ({ visitors: byDay[d] ? Number(byDay[d].visitors) : 0, pageviews: byDay[d] ? Number(byDay[d].pageviews) : 0 });
    return json({
      ready: true,
      liveNow: Number(live && live.n) || 0,
      recent: recent.map((r) => ({ country: r.country, region: r.region, city: r.city, lat: r.lat, lng: r.lng, visitors: Number(r.visitors), views: Number(r.views), lastAt: r.lastAt })),
      today: pick(today), yesterday: pick(yesterday),
      last30: { visitors: series.reduce((n, d) => n + d.visitors, 0), pageviews: series.reduce((n, d) => n + d.pageviews, 0) },
      series,
      topCities: topCities.map((r) => ({ country: r.country, region: r.region, city: r.city, lat: r.lat, lng: r.lng, visitors: Number(r.visitors) })),
      countries: Number(countries && countries.n) || 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    if (/no such table/i.test(String(e && e.message))) return json({ ready: false });
    throw e;
  }
}
