// GET /api/dept/performance?from=&to=   "Your office's performance" on the
// department dashboard (grieviq-33): the officer's own office only, never
// other offices (owner decision 9 Oct 2026). Same definitions as the admin page.
import { getVerifiedOfficer } from "../../_shared/dept-auth.js";
import { isDay, dayStartMs, dayEndMs, todayIst } from "../../_shared/overview.js";
import { loadAssignments, measures, monthlyDept, MIN_CASES } from "../../_shared/dept-performance.js";

const DAY = 86400000;
export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedOfficer(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: { "Cache-Control": "no-store" } });
  const url = new URL(request.url), today = todayIst();
  const from = url.searchParams.get("from") || new Date(dayStartMs(today) - 89 * DAY + 6 * 3600000).toISOString().slice(0, 10);
  const to = url.searchParams.get("to") || today;
  if (!isDay(from) || !isDay(to) || from > to) return Response.json({ error: "Please check the dates.", fields: { to: "DATE" } }, { status: 400 });
  const officeId = String(auth.officer.office_id);
  const list = (await loadAssignments(env, { officeId })).filter((a) => a.officeId === officeId);
  return Response.json({ from, to, today, min: MIN_CASES, m: measures(list, dayStartMs(from), dayEndMs(to)), trend: monthlyDept(list, today) },
    { headers: { "Cache-Control": "no-store" } });
}
