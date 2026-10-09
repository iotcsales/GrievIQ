// GET /api/dept/case?id=<case id>   One case for a department officer.
// Every case opened is recorded (dept_access_log, action CASE_VIEWED).
import { getVerifiedOfficer, logDept } from "../../_shared/dept-auth.js";
import { officerMaySee, officeCaseDetail } from "../../_shared/dept-cases.js";

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedOfficer(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: { "Cache-Control": "no-store" } });
  const id = String(new URL(request.url).searchParams.get("id") || "");
  const g = id ? await officerMaySee(env, auth.officer, id) : null;
  if (!g) return Response.json({ error: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  await logDept(env, { officerId: auth.officer.id, email: auth.officer.email, officeId: auth.officer.office_id, action: "CASE_VIEWED", grievanceId: g.id, detail: { ref: g.tracking_ref } });
  return Response.json({ case: await officeCaseDetail(env, auth.officer, g) }, { headers: { "Cache-Control": "no-store" } });
}
