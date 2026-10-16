/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/gov/me -> the signed-in official and what they may see. grieviq-49.
// ?demo=1 -> the demo state (no sign-in; invented figures, labelled so).
import { getVerifiedGovUser } from "../../_shared/gov-auth.js";
import { DEMO_STATE, demoDistricts } from "../../_shared/gov-stats.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  if (new URL(request.url).searchParams.get("demo") === "1") {
    return json({ demo: true, user: { name: null, level: "STATE" }, state: { id: DEMO_STATE.id, nameEn: DEMO_STATE.name_en, nameHi: DEMO_STATE.name_hi, lgd: null },
      district: null, districts: demoDistricts().map((d) => ({ id: d.id, nameEn: d.name_en, nameHi: d.name_hi, lgd: d.lgd_code })) });
  }
  const auth = await getVerifiedGovUser(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const u = auth.user;
  const st = await env.DB.prepare("SELECT id, name_en, name_hi, lgd_code FROM states WHERE id = ?").bind(u.state_id).first();
  const { results } = await env.DB.prepare("SELECT id, name_en, name_hi, lgd_code FROM districts WHERE state_id = ? ORDER BY name_en").bind(u.state_id).all();
  const dists = (results || []).map((d) => ({ id: d.id, nameEn: d.name_en, nameHi: d.name_hi, lgd: d.lgd_code }));
  return json({
    demo: false,
    user: { name: u.name, designation: u.designation, email: u.email, level: u.level, emailKind: u.email_kind },
    state: st ? { id: st.id, nameEn: st.name_en, nameHi: st.name_hi, lgd: st.lgd_code } : null,
    district: u.level === "DISTRICT" ? dists.find((d) => d.id === u.district_id) || null : null,
    districts: u.level === "DISTRICT" ? dists.filter((d) => d.id === u.district_id) : dists,
  });
}
