// POST /api/grievances/rate   (citizen ratings, grieviq-30)
//
// The citizen says how satisfied they are, from the Track page.
// Body: { email, trackingRef, office, dept?, comment? }
//   office / dept: VERY_SATISFIED | SATISFIED | NEITHER | DISSATISFIED | VERY_DISSATISFIED
//   dept is asked (and accepted) only when a department worked on the case.
//   comment: optional, up to 500 characters.
// Identity: the email code the citizen entered on the Track page in the last
// 15 minutes (the same proof the confirm, dispute and reopen buttons use).
// When: a closed case, within 30 days of closing; the rating can be changed
// for 7 days after it is first sent (ratings.js ratingStatus).

import { settleOverdueConfirmations } from "../../_shared/confirmation.js";
import { resolveChain } from "../../_shared/jurisdiction.js";
import {
  ratingsReady, loadRatings, ratingStatus, departmentFor, resolvingOffice, scoreOf, shapeForCitizen,
  COMMENT_MAX, LOW_MAX,
} from "../../_shared/ratings.js";
import { closedAtMs } from "../../_shared/reopen.js";

const json = (body, status) => Response.json(body, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request." }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  const trackingRef = String(body.trackingRef || "").trim().toUpperCase();
  if (!email || !trackingRef) return json({ error: "email and trackingRef are required" }, 400);
  if (!(await ratingsReady(env))) return json({ error: "Ratings aren't switched on yet.", code: "NOT_SET_UP" }, 503);

  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const recent = await env.DB.prepare(
    `SELECT id FROM grievance_otp WHERE LOWER(email) = ? AND purpose = 'STATUS_CHECK' AND verified = 1 AND verified_at >= ? LIMIT 1`
  ).bind(email, windowStart).first();
  if (!recent) return json({ error: "VERIFY_AGAIN", message: "For your security, please verify your email again." }, 401);

  await settleOverdueConfirmations(env);
  const g = await env.DB.prepare(
    "SELECT id, status, citizen_email, current_tier, local_unit_id, closed_at, citizen_confirmed_at, resolved_at, updated_at, created_at FROM grievances WHERE tracking_ref = ?"
  ).bind(trackingRef).first();
  if (!g || !g.citizen_email || g.citizen_email.toLowerCase() !== email) return json({ error: "Case not found for this email" }, 404);

  const existing = (await loadRatings(env, [g.id])).get(g.id) || null;
  const st = ratingStatus(g, existing);
  if (!st.can) return json({ error: "This case can't be rated now.", code: st.code }, 409);

  const fields = {};
  const office = scoreOf(body.office);
  if (!office) fields.office = "REQUIRED";
  const dept = await departmentFor(env, g.id);
  let deptScore = null;
  if (dept && body.dept != null && body.dept !== "") {
    deptScore = scoreOf(body.dept);
    if (!deptScore) fields.dept = "FORMAT";
  }
  const comment = body.comment == null ? "" : String(body.comment).replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (comment.length > COMMENT_MAX) fields.comment = "LENGTH";
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted answers.", fields }, 400);

  const now = new Date().toISOString();
  const low = office <= LOW_MAX || (deptScore != null && deptScore <= LOW_MAX) ? 1 : 0;
  const roundClosed = new Date(closedAtMs(g)).toISOString();
  const chain = await resolveChain(env, g.local_unit_id);
  const off = resolvingOffice(g, chain);

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO case_ratings (id, grievance_id, office_score, dept_score, department, office_tier, office_id, comment, low, submitted_at, updated_at, round_closed_at, edit_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).bind(crypto.randomUUID(), g.id, office, deptScore, dept ? dept.key : null, off.tier, off.id, comment || null, low, now, now, roundClosed).run();
  } else if (st.mode === "NEW") {
    // Reopened and closed again: a new rating replaces the old one.
    await env.DB.prepare(
      `UPDATE case_ratings SET office_score = ?, dept_score = ?, department = ?, office_tier = ?, office_id = ?, comment = ?, low = ?,
         submitted_at = ?, updated_at = ?, round_closed_at = ?, edit_count = 0, followed_up_at = NULL, followed_up_by = NULL, follow_up_note = NULL
       WHERE id = ?`
    ).bind(office, deptScore, dept ? dept.key : null, off.tier, off.id, comment || null, low, now, now, roundClosed, existing.id).run();
  } else {
    // A change within 7 days. A low rating that changed goes back on the
    // follow-up list.
    const changed = office !== Number(existing.office_score) || (deptScore || null) !== (existing.dept_score == null ? null : Number(existing.dept_score));
    const resetFollow = low && changed;
    await env.DB.prepare(
      `UPDATE case_ratings SET office_score = ?, dept_score = ?, department = ?, comment = ?, low = ?, updated_at = ?, edit_count = edit_count + 1
         ${resetFollow ? ", followed_up_at = NULL, followed_up_by = NULL, follow_up_note = NULL" : ""}
       WHERE id = ?`
    ).bind(office, deptScore, dept ? dept.key : null, comment || null, low, now, existing.id).run();
  }
  const saved = (await loadRatings(env, [g.id])).get(g.id);
  return json({ ok: true, rating: shapeForCitizen(saved), ratingStatus: ratingStatus(g, saved) });
}
