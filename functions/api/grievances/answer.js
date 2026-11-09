/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// POST /api/grievances/answer   { email, trackingRef, questionId, answer }   (grieviq-86, citizen)
// The citizen answers the office's question on the Track page (the email
// proved with a code in the last 15 minutes, as for reopening). 2 to 1000
// characters. The office that asked is told. If the case was closed for
// "not enough information", answering within 30 days opens it again at the
// same level, with a fresh time limit there (not counted as a reopening).
import { openQuestion, loadUpdates, cleanText, ANSWER_MIN, ANSWER_REOPEN_DAYS } from "../../_shared/case-tools.js";
import { resolveChain } from "../../_shared/jurisdiction.js";
import { chainOffices, officeRecipients, createNotices, KIND } from "../../_shared/notify.js";
import { toUtcMs } from "../../_shared/time-limits.js";

const json = (b, s) => new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } });
const ANSWER_MAX = 1000;

export async function onRequestPost(context) {
  const { request, env } = context;
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const email = String(b.email || "").trim().toLowerCase(), ref = String(b.trackingRef || "").trim().toUpperCase();
  const answer = cleanText(b.answer, ANSWER_MAX);
  if (!email || !ref) return json({ error: "email and trackingRef are required" }, 400);
  if (answer.length < ANSWER_MIN || answer.length > ANSWER_MAX) return json({ error: "Please write your answer (up to 1000 characters).", code: "INVALID", fields: { answer: "LENGTH" } }, 400);
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  const ok = await env.DB.prepare("SELECT id FROM grievance_otp WHERE LOWER(email) = ? AND purpose = 'STATUS_CHECK' AND verified = 1 AND verified_at >= ? LIMIT 1").bind(email, since).first();
  if (!ok) return json({ error: "Please verify your email again before responding", code: "VERIFY_AGAIN" }, 401);
  const g = await env.DB.prepare("SELECT * FROM grievances WHERE tracking_ref = ?").bind(ref).first();
  if (!g || !g.citizen_email || g.citizen_email.toLowerCase() !== email) return json({ error: "Case not found for this email" }, 404);
  const rows = (await loadUpdates(env, [g.id])).get(g.id) || [];
  const q = openQuestion(rows);
  if (!q || (b.questionId && b.questionId !== q.id)) return json({ error: "There is no question waiting for an answer.", code: "NO_QUESTION" }, 409);
  const live = g.status === "OPEN" || g.status === "ACKNOWLEDGED";
  const noInfo = g.status === "CLOSED" && g.closure_kind === "NO_INFO";
  if (!live && !noInfo) return json({ error: "This case is closed.", code: "CLOSED" }, 409);
  if (noInfo && Date.now() > toUtcMs(g.closed_at) + ANSWER_REOPEN_DAYS * 86400000) return json({ error: "The 30 days to answer have passed. Please file it again if the problem is still there.", code: "TOO_LATE" }, 409);
  const now = new Date().toISOString();
  const res = await env.DB.prepare("UPDATE case_updates SET answer = ?, answered_at = ? WHERE id = ? AND answered_at IS NULL").bind(answer, now, q.id).run();
  if (!res.meta || !res.meta.changes) return json({ error: "This question has already been answered.", code: "ANSWERED" }, 409);
  if (noInfo) {
    await env.DB.prepare(
      `UPDATE grievances SET status = 'OPEN', closure_kind = NULL, closed_at = NULL, reopened_at = ?, reopen_start_tier = current_tier, interims = NULL, updated_at = ?
       WHERE id = ? AND status = 'CLOSED' AND closure_kind = 'NO_INFO'`
    ).bind(now, now, g.id).run();
    // The hourly job would otherwise also send "the citizen reopened it".
    try {
      await env.DB.prepare(`INSERT INTO notify_state (grievance_id, notified_index, reopen_marker, updated_at) VALUES (?, 0, ?, ?)
        ON CONFLICT(grievance_id) DO UPDATE SET reopen_marker = excluded.reopen_marker, updated_at = excluded.updated_at`).bind(g.id, now, now).run();
    } catch (e) { /* ignore */ }
  }
  // Tell the office that asked (or, after reopening, the level it is with).
  const told = (async () => {
    try {
      const chain = await resolveChain(env, g.local_unit_id);
      if (!chain) return;
      const tier = noInfo ? g.current_tier : (q.tier || g.current_tier);
      const o = chainOffices(chain).find((x) => x.tier === tier) || chainOffices(chain)[0];
      const category = await env.DB.prepare("SELECT * FROM grievance_categories WHERE id = ?").bind(g.category_id).first();
      const ids = o.tier === "LOCAL" && chain.tiers[0].multi ? (g.seat_owner ? [g.seat_owner] : []) : [o.id];
      for (const id of ids) {
        const seat = o.tier === "LOCAL" && chain.tiers[0].multi ? (chain.tiers[0].seats || []).find((x) => x.id === id) : null;
        const people = await officeRecipients(env, o.tier, id, chain.localUnit.id, seat ? seat.email : o.email);
        await createNotices(env, new URL(request.url).origin, people, { kind: KIND.ANSWER, key: "ANS:" + q.id, officeTier: o.tier, officeId: id, g, category, wardName: chain.localUnit.name, data: noInfo ? { reopened: true } : {} });
      }
    } catch (e) { /* ignore */ }
  })();
  if (typeof context.waitUntil === "function") context.waitUntil(told); else await told;
  return json({ answered: true, reopened: noInfo });
}
