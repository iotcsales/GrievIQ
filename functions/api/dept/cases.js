// GET /api/dept/cases   Department dashboard: who is signed in, their
// office, the tiles and the case list (_shared/dept-cases.js).
import { getVerifiedOfficer } from "../../_shared/dept-auth.js";
import { officeCaseList } from "../../_shared/dept-cases.js";
import { deptTypes, namesOf } from "../../_shared/departments.js";

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedOfficer(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: { "Cache-Control": "no-store" } });
  const o = auth.officer;
  const list = await officeCaseList(env, o);
  let departments = [];
  try { departments = JSON.parse(o.office_departments || "[]"); } catch (e) { departments = []; }
  const types = await deptTypes(env);
  return Response.json({
    me: { name: o.name, designation: o.designation, email: o.email },
    office: { id: o.office_id, nameEn: o.office_name_en, nameHi: o.office_name_hi || null, departments },
    deptNames: namesOf(types), departments: types.filter((t) => !t.retired).map((t) => t.key),
    tiles: list.tiles, cases: list.cases,
  }, { headers: { "Cache-Control": "no-store" } });
}
