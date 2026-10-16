/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/dept/cases   Department dashboard: who is signed in, their
// office, the tiles and the case list (_shared/dept-cases.js).
import { getVerifiedOfficer } from "../../_shared/dept-auth.js";
import { officeCaseList } from "../../_shared/dept-cases.js";
import { deptTypes, namesOf } from "../../_shared/departments.js";

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedOfficer(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: { "Cache-Control": "no-store" } });
  const o = auth.officer;
  const list = await officeCaseList(env, o, Date.now(), new URL(request.url).searchParams.get("closed"));
  let departments = [];
  try { departments = JSON.parse(o.office_departments || "[]"); } catch (e) { departments = []; }
  const types = await deptTypes(env);
  // grieviq-38: the city, for the welcome line.
  let area = null;
  try { area = o.area_id ? await env.DB.prepare("SELECT name FROM areas WHERE id = ?").bind(o.area_id).first() : null; } catch (e) { area = null; }
  return Response.json({
    me: { name: o.name, designation: o.designation, email: o.email },
    office: { id: o.office_id, nameEn: o.office_name_en, nameHi: o.office_name_hi || null, departments, areaName: area ? area.name : null },
    // grieviq-46: the office's plan (dates shown to its officers).
    sub: o.sub ? { status: o.sub.status, until: o.sub.until || null, graceUntil: o.sub.graceUntil || null, byAdmin: !!o.sub.byAdmin } : null,
    deptNames: namesOf(types), departments: types.filter((t) => !t.retired).map((t) => t.key),
    tiles: list.tiles, cases: list.cases, closed: list.closed,
  }, { headers: { "Cache-Control": "no-store" } });
}
