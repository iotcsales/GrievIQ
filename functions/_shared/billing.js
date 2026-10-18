/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/billing.js
//
// Bills for offices, paid by UPI or bank transfer (grieviq-41, approved
// 11 Oct 2026). Storage: part28 (bills, bill_payments, bill_events).
//
//   1. GrievIQ staff (super or operations admin) make a bill for an office:
//      plan + month or year. The amount, GST and total come from the
//      published prices that day (planPrices), never typed in, so every
//      party pays the same.
//   2. The office (representative and office manager; for a department
//      office, its officers) sees the bill with GrievIQ's payment details:
//      a UPI QR code for that amount and reference, and the bank account.
//   3. After paying, the office records the transaction reference (UTR),
//      amount and date: "I have paid".
//   4. Staff check it against the bank statement and confirm it (the bill is
//      paid) or turn it back with a reason (the bill is due again).
// Every step is written to bill_events, which cannot be changed or deleted.
// Emails about bills carry the reference, amount and dates only, and always
// say to pay only to the details shown inside GrievIQ.

import { liveVersion, planPrices, withGst, istToday, paymentState, LIMITS } from "./site-settings.js";
import { sendEmailNow } from "./dept-auth.js";

export const MAX_REPORTS = 5;
export const LEDGER_TAG = "13F1965C40903C1E";
export const UTR_RE = /^[A-Z0-9]{10,22}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIER_TABLE = {
  LOCAL: { table: "local_units", email: "rep_email" },
  MAYOR: { table: "municipal_bodies", email: "mayor_email" },
  MLA: { table: "mla_constituencies", email: "mla_email" },
  MP: { table: "mp_constituencies", email: "mp_email" },
};

export function isMissingBillTables(e) { return /no such table: bill/i.test(String(e && e.message || e)); }
// grieviq-46: bills the hourly job makes wait for staff to send them; offices
// never see a bill that hasn't been sent. Before part30 there are no such bills.
let draftCols = null;
export async function hasDraftColumns(env) {
  if (draftCols !== null) return draftCols;
  try { await env.DB.prepare("SELECT auto, sent_at FROM bills LIMIT 1").all(); draftCols = true; } catch (e) { draftCols = false; }
  return draftCols;
}
// grieviq-55: bills for paid public notices (kind NOTICE) are kept apart
// from plan bills in everything about subscriptions.
let kindCol = null;
export async function hasKindColumn(env) {
  if (kindCol !== null) return kindCol;
  try { await env.DB.prepare("SELECT kind, notice_id FROM bills LIMIT 1").all(); kindCol = true; } catch (e) { kindCol = false; }
  return kindCol;
}
export async function planBillFilter(env) { return (await hasKindColumn(env)) ? " AND (kind IS NULL OR kind <> 'NOTICE')" : ""; }
export async function officeBillFilter(env) { return (await hasDraftColumns(env)) ? " AND (auto = 0 OR sent_at IS NOT NULL)" : ""; }
export async function billingReady(env) {
  try { await env.DB.prepare("SELECT 1 FROM bills LIMIT 1").all(); return true; } catch (e) { return false; }
}
export function realDate(s) { if (!DATE_RE.test(s || "")) return false; const d = new Date(s + "T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }
function addDays(s, n) { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// The last day of a month or year starting on `from` (1 Oct → 31 Oct; 15 Oct → 14 Nov).
export function periodEnd(from, period) {
  const d = new Date(from + "T00:00:00Z");
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  // The day after the period: same date next month/year, or the 1st of the
  // month after when that date doesn't exist (31 Jan → ends 28/29 Feb).
  let after = period === "YEAR" ? Date.UTC(y + 1, m, day) : Date.UTC(y, m + 1, day);
  if (period !== "YEAR") after = Math.min(after, Date.UTC(y, m + 2, 1));
  return new Date(after - 86400000).toISOString().slice(0, 10);
}
export { addDays };

// What a plan costs for one month or one year, today.
export function quote(settings, plan, period, today) {
  if (!plan || plan.billing === "QUOTE" || plan.retired) return null;
  if (plan.billing === "YEARLY" && period !== "YEAR") return null;
  const pr = planPrices(settings, plan, today);
  let amount, offer;
  if (period === "MONTH") { amount = pr.monthlyOffer ? pr.monthlyOffer.price : pr.monthly; offer = pr.monthlyOffer; }
  else { amount = pr.yearlyOffer ? pr.yearlyOffer.price : pr.yearly; offer = pr.yearlyOffer; }
  if (amount == null) return null;
  const total = withGst(amount, settings.gst.rate);
  return { amount, gstRate: Number(settings.gst.rate), gst: total - amount, total, offerId: offer ? offer.id : null };
}

export async function nextRef(env) {
  const r = await env.DB.prepare("SELECT ref FROM bills ORDER BY ref DESC LIMIT 1").first();
  const n = r ? Number(String(r.ref).replace(/\D/g, "")) + 1 : 1;
  return "GIQ-PAY-" + String(n).padStart(6, "0");
}

export async function logBill(env, billId, actor, action, detail) {
  await env.DB.prepare("INSERT INTO bill_events (id, bill_id, at, actor, action, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), billId, new Date().toISOString(), actor, action, detail == null ? null : JSON.stringify(detail)).run();
}

// A representative office: its name and the people who see its bills
// (the representative and active office managers).
export async function repOffice(env, tier, id) {
  const t = TIER_TABLE[tier];
  if (!t) return null;
  const extra = tier === "LOCAL" ? ", unit_type" : "";
  const row = await env.DB.prepare(`SELECT id, name, ${t.email} AS email${extra} FROM ${t.table} WHERE id = ?`).bind(String(id || "")).first();
  if (!row) return null;
  const label = tier === "LOCAL" ? (row.unit_type === "URBAN" ? "Corporator" : "Gram Pradhan") : tier === "MAYOR" ? "Mayor" : tier;
  return { tier, id: row.id, name: row.name, label, email: row.email ? String(row.email).toLowerCase() : null };
}
export async function billPeople(env, bill) {
  try {
    if (bill.office_type === "DEPT") {
      const { results } = await env.DB.prepare("SELECT email FROM dept_officers WHERE office_id = ? AND status = 'ACTIVE'").bind(bill.office_id).all();
      return (results || []).map((r) => String(r.email).toLowerCase());
    }
    const o = await repOffice(env, bill.office_tier, bill.office_id);
    const out = o && o.email ? [o.email] : [];
    const { results } = await env.DB.prepare("SELECT member_email FROM office_team WHERE office_tier = ? AND office_id = ? AND role = 'OFFICE_MANAGER' AND status = 'ACTIVE'").bind(bill.office_tier, bill.office_id).all();
    for (const r of results || []) { const e = String(r.member_email).toLowerCase(); if (!out.includes(e)) out.push(e); }
    return out;
  } catch (e) { return []; }
}

const escH = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");
function dmy(s) { try { return new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); } catch (e) { return s; } }

// Emails to the office about its bill. kind: ISSUED | CONFIRMED | RETURNED.
export async function emailOffice(env, origin, bill, kind, reason) {
  const to = await billPeople(env, bill);
  if (!to.length) return 0;
  const where = bill.office_type === "DEPT" ? origin + "/dept" : origin + "/rep";
  const safety = "<p><b>Pay only to the GrievIQ payment details shown when you sign in.</b> GrievIQ never asks you to pay to another account by phone, WhatsApp or email.</p>";
  const safetyHi = "<p><b>भुगतान केवल साइन इन करने पर दिखने वाले GrievIQ भुगतान विवरण पर करें।</b> GrievIQ कभी फ़ोन, व्हाट्सऐप या ईमेल से किसी अन्य खाते में भुगतान करने को नहीं कहता।</p>";
  let subject, en, hi;
  if (kind === "ISSUED") {
    subject = `GrievIQ bill ${bill.ref}: ${inr(bill.total)} due by ${dmy(bill.due_on)} · बिल`;
    en = `<p>A GrievIQ bill for <b>${escH(bill.office_name)}</b> is ready: <b>${escH(bill.ref)}</b>, ${escH(bill.plan_name)}, ${dmy(bill.period_from)} to ${dmy(bill.period_to)}.</p><p>Amount ${inr(bill.amount)} + GST ${inr(bill.gst)} = <b>${inr(bill.total)}</b>, due by ${dmy(bill.due_on)}.</p><p>See it and pay at <a href="${escH(where)}">${escH(where)}</a> → Billing.</p>` + safety;
    hi = `<p><b>${escH(bill.office_name)}</b> का GrievIQ बिल तैयार है: <b>${escH(bill.ref)}</b>, कुल <b>${inr(bill.total)}</b> (GST सहित), ${dmy(bill.due_on)} तक देय। <a href="${escH(where)}">${escH(where)}</a> पर बिलिंग में देखें और भुगतान करें।</p>` + safetyHi;
  } else if (kind === "CONFIRMED") {
    subject = `GrievIQ: payment received for ${bill.ref} · भुगतान प्राप्त`;
    en = `<p>Thank you. Your payment of <b>${inr(bill.total)}</b> for bill <b>${escH(bill.ref)}</b> (${escH(bill.office_name)}) has been received and checked.</p>`;
    hi = `<p>धन्यवाद। बिल <b>${escH(bill.ref)}</b> का <b>${inr(bill.total)}</b> का भुगतान प्राप्त हो गया है और जाँच लिया गया है।</p>`;
  } else {
    subject = `GrievIQ: please check your payment for ${bill.ref} · भुगतान जाँचें`;
    en = `<p>We could not match the payment you recorded for bill <b>${escH(bill.ref)}</b> (${escH(bill.office_name)}).</p><p>Reason: ${escH(reason)}</p><p>Please check it and record it again at <a href="${escH(where)}">${escH(where)}</a> → Billing.</p>` + safety;
    hi = `<p>बिल <b>${escH(bill.ref)}</b> के लिए दर्ज भुगतान का मिलान नहीं हो सका। कारण: ${escH(reason)}</p><p>कृपया जाँचें और <a href="${escH(where)}">${escH(where)}</a> पर बिलिंग में फिर दर्ज करें।</p>` + safetyHi;
  }
  let n = 0;
  for (const e of to) if (await sendEmailNow(env, e, subject, en + "<hr>" + hi)) n++;
  return n;
}

// The bill as offices and staff see it.
export function billOut(b, payments) {
  return {
    id: b.id, ref: b.ref, officeType: b.office_type, officeTier: b.office_tier, officeId: b.office_id, officeName: b.office_name,
    planId: b.plan_id, planName: b.plan_name, period: b.period, from: b.period_from, to: b.period_to,
    amount: b.amount, gstRate: b.gst_rate, gst: b.gst, total: b.total, offerId: b.offer_id, dueOn: b.due_on, status: b.status,
    kind: b.kind || "PLAN", noticeId: b.notice_id || null,
    issuedAt: b.issued_at, issuedBy: b.issued_by, paidAt: b.paid_at, auto: !!b.auto, sentAt: b.sent_at || null, waiting: !!b.auto && !b.sent_at, cancelledAt: b.cancelled_at, cancelReason: b.cancel_reason, note: b.note,
    payments: (payments || []).filter((p) => p.bill_id === b.id).map((p) => ({ id: p.id, method: p.method, utr: p.utr, amount: p.amount, paidOn: p.paid_on,
      reportedBy: p.reported_by, reportedAt: p.reported_at, status: p.status, checkedAt: p.checked_at, reason: p.reason })),
  };
}
export async function paymentsFor(env, billIds) {
  if (!billIds.length) return [];
  const { results } = await env.DB.prepare("SELECT * FROM bill_payments WHERE bill_id IN (SELECT value FROM json_each(?)) ORDER BY reported_at DESC").bind(JSON.stringify(billIds)).all();
  return results || [];
}

// What offices are shown with their bills: the payment details live now
// (only those switched on), and who they are paying.
export async function payInfo(env) {
  const live = await liveVersion(env);
  const s = live.data;
  const methods = paymentState(s).current.filter((m) => m.shown).map((m) => m.kind === "UPI"
    ? { kind: "UPI", upiId: m.upiId, payeeName: m.payeeName }
    : { kind: "BANK", accountName: m.accountName, bankName: m.bankName, branch: m.branch, accountNumber: m.accountNumber, ifsc: m.ifsc, accountType: m.accountType });
  return { methods, company: { legalName: s.company.legalName, supportEmail: s.company.supportEmail, callbackEn: s.company.callbackEn, callbackHi: s.company.callbackHi }, gstin: s.gst.gstin || "" };
}

// "I have paid": checks and records the office's payment. Returns { status, body }.
export async function reportPayment(env, origin, bill, input, actor) {
  if (!bill) return { status: 404, body: { error: "NOT_FOUND" } };
  if (bill.status === "PAID") return { status: 409, body: { error: "ALREADY_PAID" } };
  if (bill.status === "CANCELLED") return { status: 409, body: { error: "CANCELLED" } };
  if (bill.status === "REPORTED") return { status: 409, body: { error: "ALREADY_REPORTED" } };
  const f = {};
  const method = input.method === "BANK" ? "BANK" : input.method === "UPI" ? "UPI" : null;
  if (!method) f.method = "REQUIRED";
  const utr = String(input.utr || "").toUpperCase().replace(/[\s-]/g, "");
  if (!utr) f.utr = "REQUIRED"; else if (!UTR_RE.test(utr)) f.utr = "FORMAT";
  const amount = Number(String(input.amount == null ? "" : input.amount).replace(/[,₹\s]/g, ""));
  if (input.amount === "" || input.amount == null) f.amount = "REQUIRED";
  else if (!Number.isInteger(amount) || amount < 1 || amount > LIMITS.price) f.amount = "RANGE";
  const paidOn = String(input.paidOn || "");
  const today = istToday();
  if (!paidOn) f.paidOn = "REQUIRED";
  else if (!realDate(paidOn)) f.paidOn = "DATE";
  else if (paidOn > today) f.paidOn = "FUTURE";
  else if (paidOn < addDays(bill.issued_at.slice(0, 10), -30)) f.paidOn = "TOO_OLD";
  if (Object.keys(f).length) return { status: 400, body: { error: "CHECK_FIELDS", fields: f } };
  const dup = await env.DB.prepare("SELECT id FROM bill_payments WHERE utr = ? AND status != 'RETURNED' LIMIT 1").bind(utr).first();
  if (dup) return { status: 400, body: { error: "CHECK_FIELDS", fields: { utr: "DUPLICATE" } } };
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM bill_payments WHERE bill_id = ?").bind(bill.id).first();
  if (n && n.n >= MAX_REPORTS) return { status: 429, body: { error: "TOO_MANY" } };
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const res = await env.DB.batch([
    env.DB.prepare("INSERT INTO bill_payments (id, bill_id, method, utr, amount, paid_on, reported_by, reported_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REPORTED')")
      .bind(id, bill.id, method, utr, amount, paidOn, actor, now),
    env.DB.prepare("UPDATE bills SET status = 'REPORTED' WHERE id = ? AND status = 'DUE'").bind(bill.id),
  ]);
  if (!res[1].meta || res[1].meta.changes !== 1) return { status: 409, body: { error: "ALREADY_REPORTED" } };
  await logBill(env, bill.id, actor, "PAYMENT_REPORTED", { payment: id, method, utr, amount, paidOn });
  // Staff are told a payment is waiting to be checked (no personal details).
  try {
    const s = (await liveVersion(env)).data;
    await sendEmailNow(env, s.company.supportEmail, `GrievIQ: payment recorded for ${bill.ref} — please check`,
      `<p>${escH(bill.office_name)} recorded a payment for bill <b>${escH(bill.ref)}</b>: ${inr(amount)} by ${method === "UPI" ? "UPI" : "bank transfer"} on ${dmy(paidOn)}, reference ending ${escH(utr.slice(-4))}${amount !== bill.total ? ` (bill total ${inr(bill.total)})` : ""}.</p><p>Check it against the bank statement in <a href="${escH(origin)}/admin-bills.html">Bills</a>.</p>`);
  } catch (e) { /* the bill is recorded either way */ }
  return { status: 200, body: { ok: true, payment: id, mismatch: amount !== bill.total } };
}
