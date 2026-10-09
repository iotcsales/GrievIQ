// POST /api/dept/photo?id=<case id>   multipart: photo (+ optional thumb, dhash)
// A "work done" photo from a department officer, stored privately with the
// same checks as the representative's photos (_shared/resolution-upload.js).
// Joined to the officer's "Work done" reply (api/dept/reply.js).
import { getVerifiedOfficer } from "../../_shared/dept-auth.js";
import { officerMaySee } from "../../_shared/dept-cases.js";
import { storeResolutionPhoto } from "../../_shared/resolution-upload.js";

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedOfficer(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const id = String(new URL(request.url).searchParams.get("id") || "");
  const g = id ? await officerMaySee(env, auth.officer, id) : null;
  if (!g) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (g.status !== "OPEN" && g.status !== "ACKNOWLEDGED") return Response.json({ error: "This case is already resolved.", code: "CLOSED" }, { status: 409 });
  return storeResolutionPhoto(env, g, request, String(auth.officer.email).toLowerCase());
}
