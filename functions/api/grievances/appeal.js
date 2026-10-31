/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/grievances/appeal   { email, trackingRef, note }   (grieviq-82, citizen)
// A complaint GrievIQ closed as "not genuine" can be appealed once, within 30 days, by the citizen
// who filed it (the email proved with a code in the last 15 minutes, as for reopening). The appeal
// goes to GrievIQ staff; someone other than the person who closed it decides (admin Misuse page).
const json = (b, s) => new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } });
export const APPEAL_DAYS = 30;

export function appealStatus(g, nowMs) {
  if (!g || g.closure_kind !== "NOT_GENUINE") return { can: false, code: "NOT_CLOSED_NOT_GENUINE" };
  if (g.appeal_at) return { can: false, code: "ALREADY_APPEALED" };
  const at = Date.parse(g.not_genuine_at || "");
  const until = at + APPEAL_DAYS * 86400000;
  if (isNaN(at) || (nowMs || Date.now()) > until) return { can: false, code: "TOO_LATE" };
  return { can: true, code: "OK", until: new Date(until).toISOString() };
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const email = String(b.email || "").trim(), ref = String(b.trackingRef || "").trim();
  const note = String(b.note || "").replace(/\s+/g, " ").trim();
  if (!email || !ref) return json({ error: "email and trackingRef are required" }, 400);
  if (note.length < 10 || note.length > 500) return json({ error: "Please say why the complaint is genuine (10 to 500 characters).", code: "INVALID", fields: { note: note.length < 10 ? "SHORT" : "LONG" } }, 400);
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  const ok = await env.DB.prepare("SELECT id FROM grievance_otp WHERE LOWER(email) = LOWER(?) AND purpose = 'STATUS_CHECK' AND verified = 1 AND verified_at >= ? LIMIT 1").bind(email, since).first();
  if (!ok) return json({ error: "Please verify your email again before responding", code: "VERIFY_AGAIN" }, 401);
  const g = await env.DB.prepare("SELECT * FROM grievances WHERE tracking_ref = ?").bind(ref).first();
  if (!g || !g.citizen_email || g.citizen_email.toLowerCase() !== email.toLowerCase()) return json({ error: "Case not found for this email" }, 404);
  const st = appealStatus(g);
  if (!st.can) return json({ error: st.code === "ALREADY_APPEALED" ? "You have already appealed this decision." : st.code === "TOO_LATE" ? "The 30 days to appeal have passed." : "This case can't be appealed.", code: st.code }, 409);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE grievances SET appeal_note = ?, appeal_at = ?, updated_at = ? WHERE id = ? AND appeal_at IS NULL").bind(note, now, now, g.id).run();
  return json({ appealed: true });
}
