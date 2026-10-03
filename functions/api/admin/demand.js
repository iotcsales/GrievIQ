// GET /api/admin/demand   (super admin, operations admin; auditor reads)
//
// "Where people want GrievIQ next": the anonymous totals from the home
// page's "I want GrievIQ in my city" button, most-requested first. Only city,
// state, count and first/last dates exist -- there is nothing personal here.

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";

const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_demand");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let rows;
  try {
    rows = (await env.DB.prepare(
      `SELECT city, state, count, first_at, last_at FROM demand_signals
        WHERE count > 0 ORDER BY count DESC, last_at DESC, city ASC LIMIT 500`
    ).all()).results || [];
  } catch (e) {
    if (/no such table/i.test(String(e && e.message))) rows = [];
    else throw e;
  }
  const total = rows.reduce((n, r) => n + (Number(r.count) || 0), 0);
  return json({ rows, total, cities: rows.length, generatedAt: new Date().toISOString() });
}
