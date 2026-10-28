/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/helper-check?ref=GIQ-H-0123   (public; grieviq-72)
//
// The public record of a Community helper: anyone can check that a helper
// number is real and active. Only the number, whether it is active, the
// ward or village and since when. Never a name, party, photo or symbol.
// At most 60 checks a day from one device (counted with the day's secret,
// as for complaints).

import { helpersReady, helperRefOk, stateOf, electionPause } from "../_shared/helpers.js";
import { istToday } from "../_shared/site-settings.js";
import { checkDailyLimits, deviceParts } from "../_shared/daily-limit.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const ref = String(new URL(request.url).searchParams.get("ref") || "").toUpperCase().replace(/\s+/g, "").slice(0, 20);
  if (!helperRefOk(ref)) return json({ error: "FORMAT" }, 400);
  if (!(await helpersReady(env))) return json({ ref, found: false });
  const lim = await checkDailyLimits(env, [{ name: "helper-check", parts: deviceParts(request), max: 60 }]);
  if (!lim.ok) return json({ error: "TOO_MANY" }, 429);
  const h = await env.DB.prepare("SELECT h.*, lu.name AS unit_name, ar.name AS area_name FROM helpers h LEFT JOIN local_units lu ON lu.id = h.unit_id LEFT JOIN areas ar ON ar.id = h.area_id WHERE h.ref = ?").bind(ref).first();
  if (!h) return json({ ref, found: false });
  const today = istToday();
  const st = stateOf(h, today, await electionPause(env, h, today));
  // ACTIVE | PAUSED (unpaid, yearly ID check or election code) | NOT_ACTIVE (stopped, suspended or removed)
  const status = h.status === "ACTIVE" && st.canHelp ? "ACTIVE" : ["ACTIVE", "LAPSED"].includes(h.status) ? "PAUSED" : "NOT_ACTIVE";
  return json({ ref, found: true, status, since: status === "NOT_ACTIVE" ? null : String(h.approved_at || "").slice(0, 7),
    place: status === "NOT_ACTIVE" ? null : { unit: h.unit_name || "", area: h.area_name || "" } });
}
