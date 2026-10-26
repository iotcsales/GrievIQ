/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/review-office.js (grieviq-68)
//
// The review office: a demo representative's office that a payment
// provider's reviewers (Razorpay) can sign in to, to see where offices pay.
// A super admin switches it on for one Google account and off again.
//   - It lives in its own demo area (areas.review = 1, part43) that can never
//     be switched live, so citizens never see it, and it is left out of
//     every government dashboard and report.
//   - It holds no complaints and no citizen details. The reviewer sees an
//     empty console, Billing with one sample bill, and Help.
//   - The Google account must not be anyone's real office, team or staff
//     account, so nothing real can be reached with it.
//   - Switching off removes the account (sign-in stops at once) and cancels
//     the sample bill.

import { liveVersion, istToday } from "./site-settings.js";
import { quote, nextRef, periodEnd, addDays, logBill } from "./billing.js";
import { validateContact } from "./contact-validation.js";

export const REVIEW = {
  areaId: "grieviq-review", areaName: "GrievIQ Review (demo, not a real place)", state: "Uttar Pradesh",
  mpId: "mp_constituencie-grieviq-review", mpName: "GrievIQ Review MP area (demo)",
  mlaId: "mla_constituencie-grieviq-review", mlaName: "GrievIQ Review MLA area (demo)",
  unitId: "grieviq-review-office", unitName: "GrievIQ Review Office (demo, not a real ward)",
};
const NOTE = "Sample bill for the payment provider's review (GrievIQ review office; not a real office).";

let ready = null;
export async function reviewReady(env) {
  if (ready === true) return true;
  try { await env.DB.prepare("SELECT review FROM areas LIMIT 1").all(); ready = true; return true; } catch (e) { return false; }
}
// SQL fragment leaving review areas out (alias a), or "" before part43.
export async function notReview(env, alias) {
  return (await reviewReady(env)) ? ` AND COALESCE(${alias || "a"}.review, 0) = 0` : "";
}

async function adminLog(env, actor, action, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, REVIEW.unitId, detail == null ? null : JSON.stringify(detail)).run();
}

export async function reviewStatus(env) {
  if (!(await reviewReady(env))) return { ready: false };
  const u = await env.DB.prepare("SELECT rep_email FROM local_units WHERE id = ?").bind(REVIEW.unitId).first();
  const email = u && u.rep_email ? String(u.rep_email) : null;
  let bills = [];
  try {
    const { results } = await env.DB.prepare("SELECT id, ref, status, total, issued_at FROM bills WHERE office_type = 'REP' AND office_tier = 'LOCAL' AND office_id = ? ORDER BY issued_at DESC LIMIT 5").bind(REVIEW.unitId).all();
    bills = (results || []).map((b) => ({ id: b.id, ref: b.ref, status: b.status, total: b.total, issuedAt: b.issued_at }));
  } catch (e) { bills = []; }
  return { ready: true, on: !!email, email, officeName: REVIEW.unitName, bills };
}

// Is this email already someone real in GrievIQ? Then it can't be the reviewer's.
async function usedElsewhere(env, email) {
  const checks = [
    ["SELECT id FROM local_units WHERE LOWER(rep_email) = ? AND id <> ? LIMIT 1", [email, REVIEW.unitId]],
    ["SELECT id FROM municipal_bodies WHERE LOWER(mayor_email) = ? LIMIT 1", [email]],
    ["SELECT id FROM mla_constituencies WHERE LOWER(mla_email) = ? LIMIT 1", [email]],
    ["SELECT id FROM mp_constituencies WHERE LOWER(mp_email) = ? LIMIT 1", [email]],
    ["SELECT 1 AS id FROM office_team WHERE LOWER(member_email) = ? AND status = 'ACTIVE' LIMIT 1", [email]],
    ["SELECT id FROM dept_officers WHERE LOWER(email) = ? AND status = 'ACTIVE' LIMIT 1", [email]],
    ["SELECT id FROM admin_users WHERE LOWER(email) = ? LIMIT 1", [email]],
    ["SELECT id FROM gov_users WHERE LOWER(email) = ? AND status = 'ACTIVE' LIMIT 1", [email]],
    ["SELECT id FROM ward_seats WHERE LOWER(rep_email) = ? LIMIT 1", [email]],
  ];
  for (const [sql, b] of checks) {
    try { if (await env.DB.prepare(sql).bind(...b).first()) return true; } catch (e) { /* table not there yet */ }
  }
  return false;
}

// Switch on (or change the account). Returns { status, body }.
export async function reviewOn(env, actor, input) {
  if (!(await reviewReady(env))) return { status: 409, body: { error: "NOT_READY" } };
  const v = validateContact({ email: input && input.email });
  const email = v.ok && v.values.email ? String(v.values.email).toLowerCase() : "";
  if (!email) return { status: 400, body: { error: "CHECK_FIELDS", fields: { email: input && input.email ? "FORMAT" : "REQUIRED" } } };
  if (await usedElsewhere(env, email)) return { status: 400, body: { error: "CHECK_FIELDS", fields: { email: "IN_USE" } } };
  const st = [
    env.DB.prepare("INSERT OR IGNORE INTO areas (id, name, state, kind, slug, live, created_by, review) VALUES (?, ?, ?, 'CITY', ?, 0, ?, 1)").bind(REVIEW.areaId, REVIEW.areaName, REVIEW.state, REVIEW.areaId, actor),
    env.DB.prepare("UPDATE areas SET live = 0, review = 1 WHERE id = ?").bind(REVIEW.areaId),
    env.DB.prepare("INSERT OR IGNORE INTO mp_constituencies (id, name) VALUES (?, ?)").bind(REVIEW.mpId, REVIEW.mpName),
    env.DB.prepare("INSERT OR IGNORE INTO mla_constituencies (id, name, mp_constituency_id) VALUES (?, ?, ?)").bind(REVIEW.mlaId, REVIEW.mlaName, REVIEW.mpId),
    env.DB.prepare("INSERT OR IGNORE INTO local_units (id, name, unit_type, mla_constituency_id, area_id, rep_name) VALUES (?, ?, 'URBAN', ?, ?, ?)").bind(REVIEW.unitId, REVIEW.unitName, REVIEW.mlaId, REVIEW.areaId, "Payment review (demo)"),
    env.DB.prepare("UPDATE local_units SET rep_email = ?, area_id = ? WHERE id = ?").bind(email, REVIEW.areaId, REVIEW.unitId),
  ];
  await env.DB.batch(st);
  // One sample bill to pay, at the published price, if none is open.
  let bill = null;
  try {
    const open = await env.DB.prepare("SELECT ref FROM bills WHERE office_type = 'REP' AND office_id = ? AND status IN ('DUE','REPORTED') LIMIT 1").bind(REVIEW.unitId).first();
    if (open) bill = { ref: open.ref, existing: true };
    else bill = await sampleBill(env, actor);
  } catch (e) { bill = null; }
  await adminLog(env, actor, "review_office_on", { email, bill: bill && bill.ref });
  return { status: 200, body: { ok: true, email, bill } };
}

async function sampleBill(env, actor) {
  const live = await liveVersion(env);
  const plans = live.data.plans.filter((p) => !p.retired && p.billing !== "QUOTE");
  const plan = plans.find((p) => p.id === "councillor") || plans[0];
  if (!plan) return null;
  const today = istToday();
  const period = plan.billing === "YEARLY" ? "YEAR" : "MONTH";
  const q = quote(live.data, plan, period, today);
  if (!q) return null;
  const id = crypto.randomUUID(), now = new Date().toISOString();
  for (let i = 0; i < 3; i++) {
    const ref = await nextRef(env);
    try {
      await env.DB.prepare(
        `INSERT INTO bills (id, ref, office_type, office_tier, office_id, office_name, plan_id, plan_name, period, period_from, period_to, amount, gst_rate, gst, total, offer_id, settings_version, due_on, status, issued_by, issued_at, note)
         VALUES (?, ?, 'REP', 'LOCAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DUE', ?, ?, ?)`
      ).bind(id, ref, REVIEW.unitId, REVIEW.unitName, plan.id, plan.nameEn, period, today, periodEnd(today, period), q.amount, q.gstRate, q.gst, q.total, q.offerId, live.version, addDays(today, 60), actor, now, NOTE).run();
      await logBill(env, id, actor, "ISSUED", { ref, review: true, total: q.total });
      return { id, ref, total: q.total };
    } catch (e) { if (!/UNIQUE/i.test(String(e && e.message))) throw e; }
  }
  return null;
}

// Switch off: the account can't sign in any more; open sample bills are cancelled.
export async function reviewOff(env, actor) {
  if (!(await reviewReady(env))) return { status: 409, body: { error: "NOT_READY" } };
  const u = await env.DB.prepare("SELECT rep_email FROM local_units WHERE id = ?").bind(REVIEW.unitId).first();
  if (!u || !u.rep_email) return { status: 409, body: { error: "ALREADY_OFF" } };
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare("SELECT id FROM bills WHERE office_type = 'REP' AND office_id = ? AND status IN ('DUE','REPORTED')").bind(REVIEW.unitId).all();
  await env.DB.batch([
    env.DB.prepare("UPDATE local_units SET rep_email = NULL WHERE id = ?").bind(REVIEW.unitId),
    env.DB.prepare("UPDATE bills SET status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE office_type = 'REP' AND office_id = ? AND status IN ('DUE','REPORTED')").bind(now, actor, "Review access switched off", REVIEW.unitId),
  ]);
  for (const b of results || []) await logBill(env, b.id, actor, "CANCELLED", { reason: "Review access switched off" });
  await adminLog(env, actor, "review_office_off", { was: u.rep_email, billsCancelled: (results || []).length });
  return { status: 200, body: { ok: true, cancelled: (results || []).length } };
}
