/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/razorpay.js
//
// "Pay online" for bills (grieviq-67), through Razorpay. Storage: part42.
//
//   1. The office taps "Pay online" on a bill that is still to pay, and ticks
//      that the payment is from the office's or officeholder's own funds,
//      not a political party's or a campaign's.
//   2. GrievIQ asks Razorpay for an order of exactly the bill total (in
//      paise), with the bill reference as the receipt. The amount always
//      comes from the bill, never from the browser.
//   3. Razorpay's own payment window takes the payment. Card numbers, UPI
//      PINs and bank passwords go to Razorpay only, never to GrievIQ.
//   4. The bill is marked paid only after GrievIQ has checked the payment
//      with Razorpay itself: right after paying (the signature from the
//      payment window, then Razorpay's record of the payment), when Razorpay
//      sends its message (webhook, signed with the webhook secret), and every
//      hour for any order still waiting. The amount and currency must match.
//      Whichever comes first marks the bill paid; the others find it done.
//   5. Then exactly what happens when staff confirm a UPI or bank payment:
//      bill_events, the office's paid-up date, a paid notice starts, and the
//      "payment received" email.
// Keys are Cloudflare secrets, never in code or files:
//   RZP_KEY_ID, RZP_KEY_SECRET            from Razorpay → Account & Settings → API keys
//   RZP_WEBHOOK_SECRET (+ _PREV while changing it)   chosen when adding the webhook
// Keys starting rzp_test_ are TEST keys: the whole flow works, no money
// moves, and a bill is never marked paid by a test payment.

import { logBill, emailOffice } from "./billing.js";
import { sendEmailNow } from "./dept-auth.js";
import { liveVersion } from "./site-settings.js";
import { applyPayment } from "./subscriptions.js";
import { noticePaid } from "./notices.js";

const API = "https://api.razorpay.com/v1";
export const KEEP_TRYING_MS = 3 * 86400000;     // an order unpaid after 3 days is left
const REUSE_MS = 6 * 3600000;                    // the same order is offered again for 6 hours
export const MAX_ORDERS_PER_DAY = 10;            // per bill

// ---- configuration ----
export function rzpConfig(env) {
  const id = String((env && env.RZP_KEY_ID) || "").trim();
  const secret = String((env && env.RZP_KEY_SECRET) || "").trim();
  const ok = /^rzp_(test|live)_[A-Za-z0-9]{6,40}$/.test(id) && secret.length >= 8;
  return { on: ok, mode: ok ? (id.startsWith("rzp_live_") ? "LIVE" : "TEST") : null, keyId: ok ? id : null, webhook: !!(env && env.RZP_WEBHOOK_SECRET) };
}
let tablesReady = null;
export async function onlineReady(env) {
  if (tablesReady === true) return true;
  try { await env.DB.prepare("SELECT 1 FROM bill_online_payments LIMIT 1").all(); tablesReady = true; } catch (e) { return false; }
  return true;
}
// What offices are told: is "Pay online" offered, and is it test mode.
export async function onlineInfo(env) {
  const c = rzpConfig(env);
  if (!c.on || !(await onlineReady(env))) return { on: false };
  return { on: true, test: c.mode === "TEST" };
}

// ---- Razorpay API (plain fetch with Basic auth; no SDK) ----
function b64(s) { return btoa(unescape(encodeURIComponent(s))); }
export async function rzp(env, method, path, body) {
  const c = rzpConfig(env);
  if (!c.on) throw new Error("RZP_OFF");
  const opts = { method, headers: { Authorization: "Basic " + b64(c.keyId + ":" + String(env.RZP_KEY_SECRET).trim()) } };
  if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  try { opts.signal = AbortSignal.timeout(8000); } catch (e) { /* older runtimes */ }
  const res = await fetch(API + path, opts);
  let d = null; try { d = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok) { const err = new Error("RZP_" + res.status); err.status = res.status; err.body = d; throw err; }
  return d;
}

// ---- signatures (HMAC-SHA256, hex; compared in constant time) ----
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
function sameText(a, b) {
  a = String(a || ""); b = String(b || "");
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0 && a.length > 0;
}
export { hmacHex };
// From the payment window: hmac(order_id + "|" + payment_id, key secret).
export async function checkoutSigOk(env, orderId, paymentId, sig) {
  if (!rzpConfig(env).on || !/^[0-9a-f]{64}$/i.test(String(sig || ""))) return false;
  return sameText(await hmacHex(String(env.RZP_KEY_SECRET).trim(), orderId + "|" + paymentId), String(sig).toLowerCase());
}
// From the webhook: hmac(raw body, webhook secret). The previous secret is
// accepted too while it is being changed.
export async function webhookSigOk(env, raw, sig) {
  if (!/^[0-9a-f]{64}$/i.test(String(sig || ""))) return false;
  for (const s of [env.RZP_WEBHOOK_SECRET, env.RZP_WEBHOOK_SECRET_PREV]) {
    if (s && sameText(await hmacHex(String(s), raw), String(sig).toLowerCase())) return true;
  }
  return false;
}

const ORDER_RE = /^order_[A-Za-z0-9]{6,40}$/;
const PAY_RE = /^pay_[A-Za-z0-9]{6,40}$/;
export function goodIds(orderId, paymentId) { return ORDER_RE.test(String(orderId || "")) && PAY_RE.test(String(paymentId || "")); }

// ---- 1-2: start a payment ----
// Returns { status, body }. body has what the payment window needs; the key
// id is public by design (Razorpay's checkout needs it), the secret never
// leaves the server.
export async function startOnline(env, bill, actor, input) {
  const c = rzpConfig(env);
  if (!c.on || !(await onlineReady(env))) return { status: 409, body: { error: "ONLINE_OFF" } };
  if (!bill) return { status: 404, body: { error: "NOT_FOUND" } };
  if (bill.status === "PAID") return { status: 409, body: { error: "ALREADY_PAID" } };
  if (bill.status === "CANCELLED") return { status: 409, body: { error: "CANCELLED" } };
  if (bill.status === "REPORTED") return { status: 409, body: { error: "ALREADY_REPORTED" } };
  if (!input || input.ownFunds !== true) return { status: 400, body: { error: "CHECK_FIELDS", fields: { ownFunds: "REQUIRED" } } };
  const paise = Math.round(Number(bill.total) * 100);
  if (!Number.isInteger(paise) || paise < 100) return { status: 409, body: { error: "AMOUNT" } };
  const nowMs = Date.now(), now = new Date(nowMs).toISOString();
  const company = (await liveVersion(env)).data.company || {};
  const out = (row) => ({ status: 200, body: { ok: true, keyId: c.keyId, test: c.mode === "TEST", orderId: row.order_id, amount: row.amount_paise, currency: "INR",
    name: company.legalName || "GrievIQ", description: bill.ref + " · " + bill.plan_name, ref: bill.ref, email: String(actor || "").includes("@") ? actor : "" } });
  // The same order again if one was made for this amount in the last 6 hours.
  const prev = await env.DB.prepare("SELECT * FROM bill_online_payments WHERE bill_id = ? AND status = 'CREATED' AND mode = ? AND amount_paise = ? AND started_at > ? ORDER BY started_at DESC LIMIT 1")
    .bind(bill.id, c.mode, paise, new Date(nowMs - REUSE_MS).toISOString()).first();
  if (prev) {
    await env.DB.prepare("UPDATE bill_online_payments SET last_try_at = ? WHERE id = ?").bind(now, prev.id).run();
    return out(prev);
  }
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM bill_online_payments WHERE bill_id = ? AND started_at > ?").bind(bill.id, new Date(nowMs - 86400000).toISOString()).first();
  if (n && n.n >= MAX_ORDERS_PER_DAY) return { status: 429, body: { error: "TOO_MANY" } };
  let order;
  try {
    order = await rzp(env, "POST", "/orders", { amount: paise, currency: "INR", receipt: bill.ref, notes: { bill_ref: bill.ref, office: String(bill.office_name || "").slice(0, 200) } });
  } catch (e) { return { status: 502, body: { error: "GATEWAY" } }; }
  if (!order || !ORDER_RE.test(String(order.id || "")) || Number(order.amount) !== paise) return { status: 502, body: { error: "GATEWAY" } };
  const row = { id: crypto.randomUUID(), order_id: order.id, amount_paise: paise };
  await env.DB.prepare("INSERT INTO bill_online_payments (id, bill_id, mode, order_id, amount_paise, currency, status, own_funds, started_by, started_at, last_try_at) VALUES (?, ?, ?, ?, ?, 'INR', 'CREATED', 1, ?, ?, ?)")
    .bind(row.id, bill.id, c.mode, order.id, paise, actor, now, now).run();
  await logBill(env, bill.id, actor, "ONLINE_STARTED", { order: order.id, amount: bill.total, mode: c.mode, ownFunds: true });
  return out(row);
}

// Razorpay's own record of the payments for an order (row: order_id,
// amount_paise). An authorised payment of the right amount is captured now
// (the account may not capture by itself). Returns one of
//   { paid }                    a captured payment (any amount: the caller checks it)
//   { failed: text }            only failed tries so far
//   { waiting: true, tryExpire } nothing yet (tryExpire: Razorpay answered)
// Used for bills (below) and Community helpers' fees (helpers.js).
export async function lookupOrder(env, row, hintPaymentId) {
  let pays = [];
  try {
    const d = await rzp(env, "GET", "/orders/" + encodeURIComponent(row.order_id) + "/payments");
    pays = (d && d.items) || [];
  } catch (e) {
    // Couldn't reach Razorpay: try just the one payment we were told about.
    if (hintPaymentId && PAY_RE.test(hintPaymentId)) {
      try { pays = [await rzp(env, "GET", "/payments/" + encodeURIComponent(hintPaymentId))]; } catch (e2) { return { waiting: true }; }
    } else return { waiting: true };
  }
  pays = pays.filter((p) => p && p.order_id === row.order_id);
  let paid = pays.find((p) => p.status === "captured");
  if (!paid) {
    const auth = pays.find((p) => p.status === "authorized");
    if (auth && Number(auth.amount) === row.amount_paise && auth.currency === "INR") {
      try { paid = await rzp(env, "POST", "/payments/" + encodeURIComponent(auth.id) + "/capture", { amount: row.amount_paise, currency: "INR" }); }
      catch (e) { try { paid = await rzp(env, "GET", "/payments/" + encodeURIComponent(auth.id)); } catch (e2) { paid = null; } }
      if (paid && paid.status !== "captured") paid = null;
    }
  }
  if (paid) return { paid };
  const failed = pays.filter((p) => p.status === "failed");
  if (failed.length) return { failed: String(failed[0].error_description || failed[0].error_reason || "failed").slice(0, 200), tryExpire: true };
  return { waiting: true, tryExpire: true };
}
export { PAY_RE, ORDER_RE, sameText };

// ---- 4-5: settle ----
// Looks at Razorpay's own record of the payments for an order and, if one is
// paid for the right amount, finishes the bill. Safe to call any number of
// times, from anywhere. Returns { state } where state is one of:
// PAID, TEST_PAID, EXTRA, WAITING, FAILED, EXPIRED, DONE (already settled), UNKNOWN.
export async function syncOrder(env, origin, row, via, hintPaymentId) {
  if (!row) return { state: "UNKNOWN" };
  if (row.status !== "CREATED") return { state: "DONE", status: row.status };
  const c = rzpConfig(env);
  if (!c.on) return { state: "WAITING" };
  // Keys changed between test and live: this order can't be looked up any more.
  if (c.mode !== row.mode) {
    await env.DB.prepare("UPDATE bill_online_payments SET status = 'EXPIRED', settled_at = ?, settled_via = ? WHERE id = ? AND status = 'CREATED'").bind(new Date().toISOString(), via, row.id).run();
    return { state: "EXPIRED" };
  }
  const look = await lookupOrder(env, row, hintPaymentId);
  if (look.waiting && !look.tryExpire) return { state: "WAITING" };
  const paid = look.paid || null;
  if (!paid) {
    const tooOld = Date.now() - Date.parse(row.started_at) > KEEP_TRYING_MS;
    if (tooOld) {
      await env.DB.prepare("UPDATE bill_online_payments SET status = 'EXPIRED', settled_at = ?, settled_via = ? WHERE id = ? AND status = 'CREATED'").bind(new Date().toISOString(), via, row.id).run();
      return { state: "EXPIRED" };
    }
    if (look.failed) {
      await env.DB.prepare("UPDATE bill_online_payments SET last_fail = ? WHERE id = ?").bind(look.failed, row.id).run();
      return { state: "FAILED" };
    }
    return { state: "WAITING" };
  }
  // The money must be exactly the bill total, in rupees.
  if (Number(paid.amount) !== row.amount_paise || paid.currency !== "INR" || !PAY_RE.test(String(paid.id || ""))) {
    await markExtra(env, origin, row, paid, via, "AMOUNT:" + Math.max(0, Math.round(Number(paid.amount) || 0)));
    return { state: "EXTRA" };
  }
  return finish(env, origin, row, paid, via);
}

async function adminLog(env, action, target, detail) {
  try {
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), "razorpay", action, target, detail == null ? null : JSON.stringify(detail)).run();
  } catch (e) { /* the payment is recorded either way */ }
}
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");
const escH = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
async function tellStaff(env, origin, subject, html) {
  try {
    const s = (await liveVersion(env)).data;
    await sendEmailNow(env, s.company.supportEmail, subject, html + `<p>See <a href="${escH(origin)}/admin-bills.html">Bills</a>.</p>`);
  } catch (e) { /* shown on the Bills page either way */ }
}

async function markExtra(env, origin, row, paid, via, why, from) {
  const now = new Date().toISOString();
  const r = await env.DB.prepare("UPDATE bill_online_payments SET status = 'EXTRA', payment_id = ?, method = ?, settled_at = ?, settled_via = ?, last_fail = ? WHERE id = ? AND status = ?")
    .bind(paid.id, String(paid.method || "").replace(/[^a-z_]/gi, "").slice(0, 20) || null, now, via, why, row.id, from || "CREATED").run();
  if (!r.meta || r.meta.changes !== 1) return;
  const bill = await env.DB.prepare("SELECT * FROM bills WHERE id = ?").bind(row.bill_id).first();
  await logBill(env, row.bill_id, "razorpay", "ONLINE_EXTRA", { order: row.order_id, payment: paid.id, amount: Number(paid.amount) / 100, why });
  await adminLog(env, "bill_online_extra", bill ? bill.ref : row.bill_id, { payment: paid.id, why });
  await tellStaff(env, origin, `GrievIQ: online payment to refund — ${bill ? bill.ref : ""}`,
    `<p>Razorpay payment <b>${escH(paid.id)}</b> of ${inr(Number(paid.amount) / 100)} was taken for bill <b>${escH(bill ? bill.ref : "")}</b>${bill ? " (" + escH(bill.office_name) + ")" : ""}, but the bill ${String(why).startsWith("AMOUNT") ? "total is different" : "was already paid or cancelled"}. Please refund it from the Razorpay dashboard, then mark it refunded in GrievIQ.</p>`);
}

async function finish(env, origin, row, paid, via) {
  const now = new Date().toISOString();
  const method = String(paid.method || "").replace(/[^a-z_]/gi, "").slice(0, 20) || null;
  if (row.mode === "TEST") {
    const r = await env.DB.prepare("UPDATE bill_online_payments SET status = 'TEST_PAID', payment_id = ?, method = ?, settled_at = ?, settled_via = ? WHERE id = ? AND status = 'CREATED'")
      .bind(paid.id, method, now, via, row.id).run();
    if (r.meta && r.meta.changes === 1) await logBill(env, row.bill_id, "razorpay", "ONLINE_TEST_PAID", { order: row.order_id, payment: paid.id, method });
    return { state: "TEST_PAID" };
  }
  // Claim the payment first, so only one of checkout / webhook / hourly finishes it.
  const claim = await env.DB.prepare("UPDATE bill_online_payments SET status = 'PAID', payment_id = ?, method = ?, settled_at = ?, settled_via = ? WHERE id = ? AND status = 'CREATED'")
    .bind(paid.id, method, now, via, row.id).run();
  if (!claim.meta || claim.meta.changes !== 1) return { state: "DONE" };
  const bill = await env.DB.prepare("SELECT * FROM bills WHERE id = ?").bind(row.bill_id).first();
  const up = await env.DB.prepare("UPDATE bills SET status = 'PAID', paid_at = ?, paid_checked_by = 'razorpay' WHERE id = ? AND status IN ('DUE','REPORTED')").bind(now, row.bill_id).run();
  if (!up.meta || up.meta.changes !== 1) {
    // The bill was paid another way or cancelled meanwhile: this money goes back.
    await markExtra(env, origin, row, paid, via, "CLOSED", "PAID");
    return { state: "EXTRA" };
  }
  await logBill(env, bill.id, "razorpay", "PAID_ONLINE", { order: row.order_id, payment: paid.id, method, amount: bill.total, via });
  // A UPI or bank payment the office had also recorded is closed with a note;
  // staff are told to look for a second payment to refund.
  if (bill.status === "REPORTED") {
    await env.DB.prepare("UPDATE bill_payments SET status = 'RETURNED', checked_by = 'razorpay', checked_at = ?, reason = ? WHERE bill_id = ? AND status = 'REPORTED'")
      .bind(now, "Paid online instead (Razorpay " + paid.id + "). If you also paid by UPI or bank, GrievIQ will refund that payment.", bill.id).run();
    await tellStaff(env, origin, `GrievIQ: ${bill.ref} paid online after a UPI/bank payment was recorded`,
      `<p>Bill <b>${escH(bill.ref)}</b> (${escH(bill.office_name)}) was paid online (Razorpay ${escH(paid.id)}) while a UPI or bank payment was also recorded. Check the bank statement: if that money arrived too, refund it.</p>`);
  }
  try { await applyPayment(env, bill, "razorpay"); } catch (e) { /* bill is paid either way */ }
  try { await noticePaid(env, bill, "razorpay"); } catch (e) { /* the notice can be started by hand */ }
  await adminLog(env, "bill_paid_online", bill.ref, { amount: bill.total, payment: paid.id, method, via });
  try { await emailOffice(env, origin, bill, "CONFIRMED"); } catch (e) { /* paid either way */ }
  return { state: "PAID" };
}

// After the payment window says "paid": check the signature, then Razorpay's
// own record. Returns { status, body }.
export async function checkoutDone(env, origin, bill, input) {
  if (!(await onlineReady(env))) return { status: 409, body: { error: "ONLINE_OFF" } };
  const orderId = String(input.orderId || ""), paymentId = String(input.paymentId || "");
  if (!goodIds(orderId, paymentId)) return { status: 400, body: { error: "BAD_PAYMENT" } };
  const row = await env.DB.prepare("SELECT * FROM bill_online_payments WHERE order_id = ? AND bill_id = ?").bind(orderId, bill.id).first();
  if (!row) return { status: 404, body: { error: "NOT_FOUND" } };
  if (!(await checkoutSigOk(env, orderId, paymentId, input.signature))) {
    await logBill(env, bill.id, "razorpay", "ONLINE_BAD_SIGNATURE", { order: orderId });
    return { status: 400, body: { error: "BAD_PAYMENT" } };
  }
  const r = await syncOrder(env, origin, row, "CHECKOUT", paymentId);
  const now = await env.DB.prepare("SELECT status FROM bill_online_payments WHERE id = ?").bind(row.id).first();
  const st = now ? now.status : row.status;
  return { status: 200, body: { ok: true, result: st === "PAID" ? "PAID" : st === "TEST_PAID" ? "TEST_PAID" : st === "EXTRA" ? "EXTRA" : "WAITING", state: r.state } };
}

// Hourly: orders still waiting (from 10 minutes to 3 days old) are checked
// with Razorpay, in case the webhook didn't arrive; older ones are closed.
export async function runOnlinePayments(env, origin, nowMs) {
  const out = { checked: 0, paid: 0, expired: 0 };
  if (!rzpConfig(env).on || !(await onlineReady(env))) return out;
  const { results } = await env.DB.prepare("SELECT * FROM bill_online_payments WHERE status = 'CREATED' AND started_at < ? ORDER BY started_at LIMIT 30")
    .bind(new Date(nowMs - 600000).toISOString()).all();
  for (const row of results || []) {
    out.checked++;
    try {
      const r = await syncOrder(env, origin, row, "HOURLY");
      if (r.state === "PAID") out.paid++;
      if (r.state === "EXPIRED") out.expired++;
    } catch (e) { /* next hour */ }
  }
  // Webhook messages are kept 90 days (only ids and event names).
  try { await env.DB.prepare("DELETE FROM payment_webhook_events WHERE received_at < ?").bind(new Date(nowMs - 90 * 86400000).toISOString()).run(); } catch (e) { /* next hour */ }
  return out;
}

// What staff and offices see of the online payments of some bills.
export async function onlineFor(env, billIds) {
  if (!billIds.length || !(await onlineReady(env))) return [];
  const { results } = await env.DB.prepare("SELECT * FROM bill_online_payments WHERE bill_id IN (SELECT value FROM json_each(?)) AND status != 'CREATED' AND status != 'EXPIRED' ORDER BY started_at DESC").bind(JSON.stringify(billIds)).all();
  return results || [];
}
export function onlineOut(o, staff) {
  // A payment of a different amount keeps what was really taken (last_fail "AMOUNT:<paise>").
  const m = /^AMOUNT:(\d+)$/.exec(String(o.last_fail || ""));
  const x = { id: o.id, status: o.status, mode: o.mode, paymentId: o.payment_id, amount: (m ? Number(m[1]) : o.amount_paise) / 100, method: o.method, settledAt: o.settled_at };
  if (staff) Object.assign(x, { orderId: o.order_id, startedBy: o.started_by, startedAt: o.started_at, via: o.settled_via, why: m ? "AMOUNT" : o.status === "EXTRA" || o.status === "REFUNDED" ? "CLOSED" : null, staffBy: o.staff_by, staffAt: o.staff_at, staffNote: o.staff_note });
  return x;
}
