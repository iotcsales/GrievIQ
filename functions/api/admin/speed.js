/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/admin/speed.js   (grieviq-47)
//
// GET (view_speed: super admin, operations admin)
//   -> { ready, status, areas: { CITIZEN|REP|DEPT|ADMIN: { lastHour, days } },
//        db: { size, limit, warn }, lastAlert, slowMs, sampleEvery }
//   ?summary=1 -> { ready, status } only (dashboard tile)
// "days" = the last 7 India days, each with its slowest hour's p95 (the time
// within which 95 of every 100 requests finished) and how many requests were
// measured. Figures come from speed_hourly (part31; _shared/speed.js).

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
import { speedReady, speedStatus, dbSize, AREAS, SLOW_MS, SAMPLE_EVERY, DB_LIMIT_BYTES, DB_WARN_BYTES } from "../../_shared/speed.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const istDay = (ms) => new Date(ms + 5.5 * 3600000).toISOString().slice(0, 10);

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_speed");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await speedReady(env))) return json({ ready: false });
  const now = Date.now();
  const status = await speedStatus(env, now);
  if (new URL(request.url).searchParams.get("summary")) return json({ ready: true, status: status.status });
  const since = new Date(now - 8 * 86400000).toISOString().slice(0, 13) + ":00";
  const { results } = await env.DB.prepare("SELECT hour, area, n, p50, p95, max_ms, failed FROM speed_hourly WHERE hour >= ? ORDER BY hour").bind(since).all();
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(istDay(now - i * 86400000));
  const areas = {};
  for (const a of AREAS) {
    const rows = (results || []).filter((r) => r.area === a);
    const last = rows.filter((r) => r.hour === status.hour)[0] || null;
    areas[a] = {
      lastHour: last ? { p95: last.p95, p50: last.p50, n: last.n, failed: last.failed } : null,
      days: days.map((d) => {
        const inDay = rows.filter((r) => istDay(Date.parse(r.hour + ":00Z")) === d);
        return { day: d, p95: inDay.length ? Math.max(...inDay.map((r) => r.p95)) : null, n: inDay.reduce((s, r) => s + r.n, 0), failed: inDay.reduce((s, r) => s + r.failed, 0) };
      }),
    };
  }
  let lastAlert = null;
  try { lastAlert = await env.DB.prepare("SELECT day, at FROM speed_alerts ORDER BY day DESC LIMIT 1").first(); } catch (e) { lastAlert = null; }
  return json({
    ready: true, status: status.status, slowAreas: status.slow.concat(status.slower).map((x) => x.area),
    areas, days, db: { size: await dbSize(env), limit: DB_LIMIT_BYTES, warn: DB_WARN_BYTES },
    lastAlert: lastAlert ? lastAlert.at : null, slowMs: SLOW_MS, sampleEvery: SAMPLE_EVERY,
  });
}
