/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/gov/me -> the signed-in official and where they start. grieviq-49, grieviq-51.
// ?demo=1 -> the demo country (no sign-in; invented figures, labelled so).
import { getVerifiedGovUser } from "../../_shared/gov-auth.js";
import { DEMO_COUNTRY, demoStates } from "../../_shared/gov-stats.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get("demo") === "1") {
    const country = { nameEn: DEMO_COUNTRY.name_en, nameHi: DEMO_COUNTRY.name_hi };
    // grieviq-52: the State Dashboard's demo starts at one demo state, with no country above it.
    if (q.get("mode") === "state") {
      const a = demoStates()[0], st = { id: a.id, nameEn: a.name_en, nameHi: a.name_hi, lgd: null };
      return json({ demo: true, user: { name: null, level: "STATE" }, country, state: st, district: null, home: { state: st, district: null } });
    }
    return json({ demo: true, user: { name: null, level: "NATIONAL" }, country, home: { state: null, district: null } });
  }
  const auth = await getVerifiedGovUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const u = auth.user;
  let state = null, district = null;
  if (u.state_id) { const s = await env.DB.prepare("SELECT id, name_en, name_hi, lgd_code FROM states WHERE id = ?").bind(u.state_id).first(); if (s) state = { id: s.id, nameEn: s.name_en, nameHi: s.name_hi, lgd: s.lgd_code }; }
  if (u.district_id) { const d = await env.DB.prepare("SELECT id, name_en, name_hi, lgd_code FROM districts WHERE id = ?").bind(u.district_id).first(); if (d) district = { id: d.id, nameEn: d.name_en, nameHi: d.name_hi, lgd: d.lgd_code }; }
  return json({
    demo: false,
    user: { name: u.name, designation: u.designation, email: u.email, level: u.level, emailKind: u.email_kind },
    country: { nameEn: "India", nameHi: "भारत" },
    // Where they start: a national official at the country, others at their own place.
    home: { state: u.level === "NATIONAL" ? null : state, district: u.level === "DISTRICT" ? district : null },
    state, district,
  });
}
