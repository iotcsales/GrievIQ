/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/dept/report   { id, reason, note }   (grieviq-82)
// A department officer tells GrievIQ a forwarded complaint looks false, abusive or a duplicate
// (OUTSIDE is for representatives' offices; a department says "This isn't our office's work"
// instead). It goes to GrievIQ staff and never closes the case by itself. One open report per
// office per case.
import { getVerifiedOfficer, logDept } from "../../_shared/dept-auth.js";
import { officerMaySee } from "../../_shared/dept-cases.js";
import { NOTE_MAX } from "../../_shared/misuse.js";

const REASONS = ["FALSE", "ABUSIVE", "DUPLICATE", "OTHER"];
const json = (b, s) => Response.json(b, { status: s || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedOfficer(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Invalid request." }, 400); }
  const o = auth.officer;
  const g = await officerMaySee(env, o, String(b.id || ""));
  if (!g) return json({ error: "NOT_FOUND" }, 404);
  const reason = String(b.reason || "").toUpperCase(), note = String(b.note || "").replace(/\s+/g, " ").trim();
  const fields = {};
  if (!REASONS.includes(reason)) fields.reason = "REQUIRED";
  if (note.length < 10) fields.note = "SHORT"; else if (note.length > NOTE_MAX) fields.note = "LONG";
  if (Object.keys(fields).length) return json({ error: "Please choose a reason and say what is wrong (10 to 500 characters).", fields }, 400);
  if (g.status !== "OPEN" && g.status !== "ACKNOWLEDGED") return json({ error: "This case is already resolved.", code: "CLOSED" }, 409);
  const officeKey = "DEPT:" + o.office_id;
  const open = await env.DB.prepare("SELECT id FROM complaint_reports WHERE grievance_id = ? AND office_key = ? AND status = 'OPEN'").bind(g.id, officeKey).first();
  if (open) return json({ error: "Your office has already reported this complaint. GrievIQ staff will look at it.", code: "ALREADY" }, 409);
  await env.DB.prepare("INSERT INTO complaint_reports (id, grievance_id, by_kind, by_email, office_key, reason, note, created_at) VALUES (?, ?, 'DEPT', ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), g.id, o.email, officeKey, reason, note, new Date().toISOString()).run();
  await logDept(env, { officerId: o.id, email: o.email, officeId: o.office_id, action: "REPORTED", grievanceId: g.id, detail: { reason } });
  return json({ reported: true });
}
