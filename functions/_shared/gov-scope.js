/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/gov-scope.js   (grieviq-51)
//
// Which part of the country an official may open:
//   NATIONAL  (a Union ministry)  the whole country, any state, any district
//   STATE     their state and any district in it
//   DISTRICT  their district only
// A request outside that is refused (403) and logged by the caller.
import { demoStates, demoDistrictsOf, DEMO_COUNTRY } from "./gov-stats.js";
// Returns { ok, state: row | null (= the whole country), district: row | null, label }
//      or { ok: false, status, error }.
export async function resolveScope(env, user, stateParam, districtParam) {
  const want = (v) => (v ? String(v) : null);
  let stateId = want(stateParam), districtId = want(districtParam);
  if (user.level !== "NATIONAL") {
    if (stateId && stateId !== user.state_id) return { ok: false, status: 403, error: "NOT_YOURS", label: "state:" + stateId };
    stateId = user.state_id;
  }
  if (user.level === "DISTRICT") {
    if (districtId && districtId !== user.district_id) return { ok: false, status: 403, error: "NOT_YOURS", label: "district:" + districtId };
    districtId = user.district_id;
  }
  if (districtId && !stateId) return { ok: false, status: 404, error: "NOT_FOUND" };
  let state = null, district = null;
  if (stateId) {
    state = await env.DB.prepare("SELECT * FROM states WHERE id = ? AND demo = 0").bind(stateId).first();
    if (!state) return { ok: false, status: 404, error: "NOT_FOUND" };
  }
  if (districtId) {
    district = await env.DB.prepare("SELECT * FROM districts WHERE id = ? AND state_id = ?").bind(districtId, stateId).first();
    if (!district) return { ok: false, status: 404, error: "NOT_FOUND" };
  }
  return { ok: true, state, district, label: district ? "district:" + district.id : state ? "state:" + state.id : "country" };
}
export function placeOut(state, district) {
  return {
    national: !state, country: { nameEn: "India", nameHi: "भारत" },
    state: state ? { id: state.id, nameEn: state.name_en, nameHi: state.name_hi, lgd: state.lgd_code } : null,
    district: district ? { id: district.id, nameEn: district.name_en, nameHi: district.name_hi, lgd: district.lgd_code } : null,
  };
}

export function demoPlace(stateId, districtId) {
  const st = stateId ? demoStates().find((x) => x.id === stateId) : null;
  const d = st && districtId ? demoDistrictsOf(st.id).find((x) => x.id === districtId) : null;
  return { national: !st, country: { nameEn: DEMO_COUNTRY.name_en, nameHi: DEMO_COUNTRY.name_hi },
    state: st ? { id: st.id, nameEn: st.name_en, nameHi: st.name_hi, lgd: st.lgd_code } : null,
    district: d ? { id: d.id, nameEn: d.name_en, nameHi: d.name_hi, lgd: d.lgd_code } : null };
}

