/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/helpers.js
//
// Community helpers, part 1 (grieviq-72; approved 28 Oct 2026). Storage: part46.
//
// A Community helper is a local person who helps neighbours file and follow
// complaints. The rules (also in the Terms and on /helper):
//   - Only GrievIQ staff approve. A representative can't approve or block.
//   - Strict identity check (KYC): Google sign-in; name as on the ID;
//     mobile; ward or village; one photo ID (Voter ID preferred; PAN,
//     driving licence or passport; Aadhaar only masked, a full Aadhaar
//     number is refused); a selfie holding the ID; the code of conduct; a
//     video call with staff. Maker-checker: one staff member checks, a
//     different one approves (NIST AC-5 separation of duties).
//   - Kept about the ID: its type, the last 4 characters, and an HMAC of the
//     number (secret HELPER_ID_SECRET) that stops the same ID being used
//     twice. The ID photo and selfie are deleted 30 days after the decision;
//     every time staff open them is recorded (helper_events, unchangeable).
//   - The public record is the helper number only (GIQ-H-0123), with the
//     ward or village and whether it is active. No name, party, photo or
//     symbol, anywhere.
//   - The monthly fee (Prices & site details → Community helpers; GST
//     included) is the same for everyone, paid through Razorpay in the
//     helper's own name, from their own money (ticked). It buys the role
//     only: no ranking, featuring or protection from removal.
//   - Month: starts on approval. Reminder 5 days before it ends, 3 days'
//     grace, then the helper role pauses until paid. ID checked again every
//     12 months (opens 30 days before).
//   - Election code (the dates already set for paid notices): no new
//     applications or payments in that area, the helper role pauses, and
//     each paused day is added to the helper's month.
//   - Refunds: refused for a reason that isn't the applicant's fault, or
//     the applicant withdraws before the decision: the first month in full.
//     Refused for forged documents: none. Removed for misuse: none for the
//     current month. Stopping: no part-month refunds.
//   - Suspend or remove only with a reason. One appeal, decided by a
//     different staff member.

import { rzpConfig, rzp, onlineReady, lookupOrder, checkoutSigOk, goodIds, PAY_RE, ORDER_RE, hmacHex, KEEP_TRYING_MS } from "./razorpay.js";
import { liveVersion, istToday, gstIncluded } from "./site-settings.js";
import { activePauses, pausedOn } from "./notices.js";
import { sendEmailNow } from "./dept-auth.js";
import { sniffImage } from "./resolution-evidence.js";
import { stripJpegMetadata } from "./photo-store.js";

export const FILE_KEEP_DAYS = 30;
export const GRACE_DAYS = 3;
export const REMIND_DAYS = 5;
export const RENEW_EARLY_DAYS = 10;
export const KYC_MONTHS = 12;
export const RECHECK_OPEN_DAYS = 30;
export const APPEAL_DAYS = 30;
export const DRAFT_DAYS = 30;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ORDERS_PER_DAY = 10;
const REUSE_MS = 6 * 3600000;
export const LIMITS = { name: [2, 80], about: 200, reason: [10, 500], appeal: [20, 1000], note: 300 };
export const ID_TYPES = ["EPIC", "PAN", "DL", "PASSPORT", "AADHAAR"];
const ID_RE = {
  EPIC: /^[A-Z]{3}[0-9]{7}$/,                 // Voter ID (EPIC): 3 letters, 7 digits
  PAN: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  DL: /^[A-Z]{2}[0-9]{2}[0-9A-Z]{8,14}$/,     // state, RTO, then year and number
  PASSPORT: /^[A-Z][0-9]{7}$/,
  AADHAAR: /^[0-9]{4}$/,                      // the last 4 digits only (masked Aadhaar)
};
const NAME_RE = /^[\p{L}\p{M} .'-]+$/u;
const MOBILE_RE = /^[6-9][0-9]{9}$/;
export const OPEN = ["DRAFT", "WAITING", "CHECKED", "ACTIVE", "LAPSED", "SUSPENDED"];

// ---- small things ----
export function addDays(day, n) { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// One month of the role: to the day before the same date next month (28 Oct -> 27 Nov; 31 Jan -> 28 Feb).
export function monthEnd(from) {
  const d = new Date(from + "T00:00:00Z");
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  // No such date next month (31 Jan): to the last day of that month.
  if (day > last) return new Date(Date.UTC(y, m + 1, last)).toISOString().slice(0, 10);
  return addDays(new Date(Date.UTC(y, m + 1, day)).toISOString().slice(0, 10), -1);
}
export function addMonths(day, n) {
  let d = day;
  for (let i = 0; i < n; i++) d = addDays(monthEnd(d), 1);
  return d;
}
function clean(v, max) { return String(v == null ? "" : v).normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1); }
const escH = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function dmy(s) { try { return new Date(String(s).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); } catch (e) { return s; } }
export function maskMobile(m) { m = String(m || ""); return m.length > 4 ? "X".repeat(m.length - 4) + m.slice(-4) : m; }
export function helperRefOk(ref) { return /^GIQ-H-[0-9]{4,6}$/.test(String(ref || "")); }

let ready = null;
export async function helpersReady(env) {
  if (ready === true) return true;
  try { await env.DB.prepare("SELECT 1 FROM helpers LIMIT 1").all(); await env.DB.prepare("SELECT 1 FROM helper_payments LIMIT 1").all(); ready = true; return true; } catch (e) { return false; }
}
export function idSecretOk(env) { return !!(env && env.HELPER_ID_SECRET && String(env.HELPER_ID_SECRET).length >= 16); }

export async function logHelper(env, helperId, actor, action, detail) {
  await env.DB.prepare("INSERT INTO helper_events (id, helper_id, at, actor, action, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), helperId, new Date().toISOString(), actor || "system", action, detail == null ? null : JSON.stringify(detail)).run();
}
export async function adminLog(env, actor, action, target, detail) {
  try {
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actor, action, target, detail == null ? null : JSON.stringify(detail)).run();
  } catch (e) { /* the helper's own history has it either way */ }
}

// ---- the ID ----
// Returns { ok, number, last4 } or { ok: false, code }.
export function normaliseId(type, raw) {
  if (!ID_TYPES.includes(type)) return { ok: false, code: "TYPE" };
  let s = String(raw == null ? "" : raw).toUpperCase().replace(/[\s.\/-]/g, "");
  // Masked Aadhaar as printed ("XXXX XXXX 1234"): the 4 digits.
  if (type === "AADHAAR" && /^[X*]{8}[0-9]{4}$/.test(s)) s = s.slice(-4);
  if (!s) return { ok: false, code: "REQUIRED" };
  // A full Aadhaar number (12 digits, or a 16-digit Virtual ID) is never accepted.
  if (/^[0-9]{12}$/.test(s) || /^[0-9]{16}$/.test(s) || (type === "AADHAAR" && s.length > 4)) return { ok: false, code: "FULL_AADHAAR" };
  if (!ID_RE[type].test(s)) return { ok: false, code: "FORMAT" };
  return { ok: true, number: s, last4: s.slice(-4) };
}
export async function idHash(env, type, number) {
  if (type === "AADHAAR") return null;   // 4 digits can't identify anyone: staff compare the masked card instead
  return hmacHex(String(env.HELPER_ID_SECRET), "giq-helper-id|" + type + "|" + number);
}

// ---- the ward or village ----
export async function unitInfo(env, unitId) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(unitId || ""))) return null;
  const u = await env.DB.prepare(
    "SELECT lu.id, lu.name, lu.unit_type, ar.id AS area_id, ar.name AS area_name, ar.state FROM local_units lu JOIN areas ar ON ar.id = lu.area_id AND ar.live = 1 WHERE lu.id = ? AND COALESCE(ar.review, 0) = 0"
  ).bind(String(unitId)).first();
  return u || null;
}
export async function electionPause(env, h, today) {
  const p = pausedOn(await activePauses(env), h.area_id, h.state, today || istToday());
  return p ? { to: p.to_on } : null;
}

// ---- the application form ----
// b: { name, mobile, unitId, about, idType, idNumber, conduct }. Returns { fields, v }.
export function cleanApplication(b) {
  const f = {}, v = {};
  b = b || {};
  v.name = clean(b.name, LIMITS.name[1]);
  if (!v.name) f.name = "REQUIRED"; else if (v.name.length > LIMITS.name[1]) f.name = "LENGTH"; else if (v.name.length < LIMITS.name[0] || !NAME_RE.test(v.name)) f.name = "FORMAT";
  let m = String(b.mobile == null ? "" : b.mobile).replace(/[\s()-]/g, "");
  if (/^(\+?91)[6-9][0-9]{9}$/.test(m)) m = m.slice(-10);
  if (m.length === 11 && m[0] === "0") m = m.slice(1);
  v.mobile = m;
  if (!m) f.mobile = "REQUIRED"; else if (!MOBILE_RE.test(m)) f.mobile = "FORMAT";
  v.unitId = clean(b.unitId, 80);
  if (!v.unitId) f.unitId = "REQUIRED";
  v.about = clean(b.about, LIMITS.about);
  if (v.about.length > LIMITS.about) f.about = "LENGTH";
  v.idType = String(b.idType || "");
  if (!ID_TYPES.includes(v.idType)) f.idType = "REQUIRED";
  else {
    const id = normaliseId(v.idType, b.idNumber);
    if (!id.ok) f.idNumber = id.code; else { v.idNumber = id.number; v.idLast4 = id.last4; }
  }
  if (b.conduct !== true && b.conduct !== "1" && b.conduct !== "true" && b.conduct !== "on") f.conduct = "REQUIRED";
  return { fields: f, v };
}

// An uploaded image: JPG, PNG or WEBP up to 5 MB. JPEG details (date, GPS)
// are removed. Returns { buf, type, ext } or { code }.
export async function readImage(file) {
  if (!file || typeof file === "string" || !file.size) return { code: "REQUIRED" };
  if (file.size > MAX_FILE_BYTES) return { code: "TOO_BIG" };
  let buf = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(buf.subarray(0, Math.min(16, buf.byteLength)));
  if (!type) return { code: "BAD_TYPE" };
  if (type === "image/jpeg") buf = stripJpegMetadata(buf);
  return { buf, type, ext: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type] };
}
export async function deleteFiles(env, keys) {
  const list = keys.filter(Boolean);
  if (!list.length || !env.PRIVATE_PHOTOS) return;
  try { await env.PRIVATE_PHOTOS.delete(list); } catch (e) { for (const k of list) { try { await env.PRIVATE_PHOTOS.delete(k); } catch (e2) { /* next hour */ } } }
}

// ---- what the helper's situation is today ----
export function stateOf(h, today, pause) {
  const t = today || istToday();
  const graceTo = h.paid_until ? addDays(h.paid_until, GRACE_DAYS) : null;
  const active = h.status === "ACTIVE";
  const inGrace = active && h.paid_until && t > h.paid_until && t <= graceTo;
  const lapsed = h.status === "LAPSED" || (active && graceTo && t > graceTo);
  const kycOverdue = !!(active && h.kyc_due && t > h.kyc_due);
  const recheckOpen = !!((active || h.status === "LAPSED") && h.kyc_due && t >= addDays(h.kyc_due, -RECHECK_OPEN_DAYS) && !h.recheck);
  const canRenew = (active && h.paid_until && t >= addDays(h.paid_until, -RENEW_EARLY_DAYS)) || lapsed;
  return {
    status: lapsed && active ? "LAPSED" : h.status,
    inGrace: !!inGrace, graceTo, lapsed: !!lapsed, kycOverdue, recheckOpen,
    canRenew: !!canRenew && !pause && ["ACTIVE", "LAPSED"].includes(h.status),
    pause: pause || null,
    canHelp: active && !lapsed && !kycOverdue && !pause,
  };
}
export function paymentOut(p) {
  return { id: p.id, kind: p.kind, status: p.status, receiptNo: p.receipt_no, price: p.price, base: p.base, gst: p.gst, rate: p.gst_rate, method: p.method,
    paymentId: p.status === "CREATED" || p.status === "EXPIRED" ? null : p.payment_id, mode: p.mode, settledAt: p.settled_at, periodFrom: p.period_from, periodTo: p.period_to, refundWhy: p.refund_why,
    startedAt: p.started_at };
}
// The helper's own view.
export function helperOut(h, unit, payments, today, pause) {
  const st = stateOf(h, today, pause);
  const appealOpen = ["SUSPENDED", "REMOVED"].includes(h.status) && !h.appeal_at && h.action_at && Date.now() - Date.parse(h.action_at) <= APPEAL_DAYS * 86400000;
  return {
    id: h.id, ref: h.ref, status: st.status, state: st,
    name: h.name, mobile: h.mobile, email: h.email, about: h.about || "",
    unit: unit ? { id: unit.id, name: unit.name, area: unit.area_name, areaId: unit.area_id } : { id: h.unit_id },
    idType: h.id_type, idLast4: h.id_last4, filesIn: !!(h.id_key && h.selfie_key), filesDeleted: !!h.files_deleted_at,
    submittedAt: h.submitted_at, approvedAt: h.approved_at, paidUntil: h.paid_until, kycDue: h.kyc_due, recheck: h.recheck,
    decidedAt: h.decided_at, refuseKind: h.refuse_kind, reason: h.status === "REFUSED" ? (h.refuse_kind === "FORGED" ? null : h.decision_note) : ["SUSPENDED", "REMOVED"].includes(h.status) ? h.action_reason : null,
    actionAt: h.action_at,
    appeal: h.appeal_at ? { text: h.appeal_text, at: h.appeal_at, result: h.appeal_result, decidedAt: h.appeal_decided_at, note: h.appeal_note } : null,
    canAppeal: !!appealOpen,
    canApplyAgain: ["STOPPED", "WITHDRAWN"].includes(h.status) || (h.status === "REFUSED" && h.refuse_kind !== "FORGED"),
    payments: (payments || []).filter((p) => p.status !== "CREATED" && p.status !== "EXPIRED").map(paymentOut),
  };
}

// ---- emails (to the helper themselves; to staff, content-free) ----
async function companyOf(env) { try { return (await liveVersion(env)).data.company || {}; } catch (e) { return {}; } }
export async function emailHelper(env, origin, h, subject, lines) {
  try {
    const html = lines.map((l) => "<p>" + l + "</p>").join("") + `<p><a href="${escH(origin)}/helper">Open your Community helper page</a></p><p style="color:#666">GrievIQ · Community helpers</p>`;
    await sendEmailNow(env, h.email, subject, html);
  } catch (e) { /* the page shows it either way */ }
}
export async function tellStaff(env, origin, subject, line) {
  try {
    const c = await companyOf(env);
    if (c.supportEmail) await sendEmailNow(env, c.supportEmail, subject, `<p>${escH(line)}</p><p>Open <a href="${escH(origin)}/admin-helpers.html">Community helpers</a> to see it.</p>`);
  } catch (e) { /* the admin page lists it either way */ }
}

// ---- payments (Razorpay) ----
async function nextReceipt(env) {
  const r = await env.DB.prepare("SELECT receipt_no FROM helper_payments WHERE receipt_no IS NOT NULL ORDER BY receipt_no DESC LIMIT 1").first();
  const n = r ? Number(String(r.receipt_no).replace(/\D/g, "")) + 1 : 1;
  return "GIQ-HR-" + String(n).padStart(6, "0");
}
export async function nextHelperRef(env) {
  const r = await env.DB.prepare("SELECT ref FROM helpers WHERE ref IS NOT NULL ORDER BY LENGTH(ref) DESC, ref DESC LIMIT 1").first();
  const n = r ? Number(String(r.ref).replace(/\D/g, "")) + 1 : 1;
  return "GIQ-H-" + String(n).padStart(4, "0");
}
export async function feeNow(env) {
  const live = await liveVersion(env);
  const s = live.data;
  const fee = gstIncluded((s.helpers || {}).price || 499, s.gst.rate);
  return Object.assign({ open: !!(s.helpers && s.helpers.open), company: s.company || {} }, fee);
}

// Start a payment of the monthly fee. Returns { status, body }.
export async function startHelperPay(env, h, actor, input) {
  const c = rzpConfig(env);
  if (!c.on || !(await onlineReady(env))) return { status: 409, body: { error: "ONLINE_OFF" } };
  if (!input || input.ownFunds !== true) return { status: 400, body: { error: "CHECK_FIELDS", fields: { ownFunds: "REQUIRED" } } };
  const today = istToday();
  if (await electionPause(env, h, today)) return { status: 409, body: { error: "ELECTION_PAUSE" } };
  const fee = await feeNow(env);
  let kind;
  if (h.status === "DRAFT") {
    if (!fee.open) return { status: 409, body: { error: "CLOSED" } };
    if (!h.id_key || !h.selfie_key) return { status: 409, body: { error: "FILES" } };
    kind = "FIRST";
  } else if (["ACTIVE", "LAPSED"].includes(h.status)) {
    if (!stateOf(h, today, null).canRenew) return { status: 409, body: { error: "NOT_YET" } };
    kind = "RENEWAL";
  } else return { status: 409, body: { error: "NOT_NOW" } };
  const paise = Math.round(fee.price * 100);
  const nowMs = Date.now(), now = new Date(nowMs).toISOString();
  const out = (row) => ({ status: 200, body: { ok: true, keyId: c.keyId, test: c.mode === "TEST", orderId: row.order_id, amount: row.amount_paise, currency: "INR",
    name: fee.company.legalName || "GrievIQ", description: "Community helper · 1 month", email: h.email, kind } });
  const prev = await env.DB.prepare("SELECT * FROM helper_payments WHERE helper_id = ? AND kind = ? AND status = 'CREATED' AND mode = ? AND amount_paise = ? AND started_at > ? ORDER BY started_at DESC LIMIT 1")
    .bind(h.id, kind, c.mode, paise, new Date(nowMs - REUSE_MS).toISOString()).first();
  if (prev) {
    await env.DB.prepare("UPDATE helper_payments SET last_try_at = ? WHERE id = ?").bind(now, prev.id).run();
    return out(prev);
  }
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM helper_payments WHERE helper_id = ? AND started_at > ?").bind(h.id, new Date(nowMs - 86400000).toISOString()).first();
  if (n && n.n >= MAX_ORDERS_PER_DAY) return { status: 429, body: { error: "TOO_MANY" } };
  let order;
  try {
    order = await rzp(env, "POST", "/orders", { amount: paise, currency: "INR", receipt: "HLP-" + h.id.slice(0, 18), notes: { purpose: "Community helper fee, 1 month", helper: h.ref || "application" } });
  } catch (e) { return { status: 502, body: { error: "GATEWAY" } }; }
  if (!order || !ORDER_RE.test(String(order.id || "")) || Number(order.amount) !== paise) return { status: 502, body: { error: "GATEWAY" } };
  const row = { id: crypto.randomUUID(), order_id: order.id, amount_paise: paise };
  await env.DB.prepare("INSERT INTO helper_payments (id, helper_id, kind, mode, order_id, amount_paise, price, base, gst, gst_rate, status, own_funds, started_by, started_at, last_try_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREATED', 1, ?, ?, ?)")
    .bind(row.id, h.id, kind, c.mode, order.id, paise, fee.price, fee.base, fee.gst, fee.rate, actor, now, now).run();
  await logHelper(env, h.id, actor, "PAY_STARTED", { order: order.id, kind, amount: fee.price, mode: c.mode, ownFunds: true });
  return out(row);
}

// Razorpay's record of a helper order, settled. Returns { state }:
// PAID, TEST_PAID, EXTRA, WAITING, FAILED, EXPIRED, DONE, UNKNOWN.
export async function syncHelperOrder(env, origin, row, via, hint) {
  if (!row) return { state: "UNKNOWN" };
  if (row.status !== "CREATED") return { state: "DONE", status: row.status };
  const c = rzpConfig(env);
  if (!c.on) return { state: "WAITING" };
  const nowIso = () => new Date().toISOString();
  if (c.mode !== row.mode) {
    await env.DB.prepare("UPDATE helper_payments SET status = 'EXPIRED', settled_at = ?, settled_via = ? WHERE id = ? AND status = 'CREATED'").bind(nowIso(), via, row.id).run();
    return { state: "EXPIRED" };
  }
  const look = await lookupOrder(env, row, hint);
  if (look.waiting && !look.tryExpire) return { state: "WAITING" };
  const paid = look.paid || null;
  if (!paid) {
    if (Date.now() - Date.parse(row.started_at) > KEEP_TRYING_MS) {
      await env.DB.prepare("UPDATE helper_payments SET status = 'EXPIRED', settled_at = ?, settled_via = ? WHERE id = ? AND status = 'CREATED'").bind(nowIso(), via, row.id).run();
      return { state: "EXPIRED" };
    }
    if (look.failed) { await env.DB.prepare("UPDATE helper_payments SET last_fail = ? WHERE id = ?").bind(look.failed, row.id).run(); return { state: "FAILED" }; }
    return { state: "WAITING" };
  }
  const method = String(paid.method || "").replace(/[^a-z_]/gi, "").slice(0, 20) || null;
  if (Number(paid.amount) !== row.amount_paise || paid.currency !== "INR" || !PAY_RE.test(String(paid.id || ""))) {
    const r = await env.DB.prepare("UPDATE helper_payments SET status = 'EXTRA', payment_id = ?, method = ?, settled_at = ?, settled_via = ?, last_fail = ?, refund_why = 'AMOUNT' WHERE id = ? AND status = 'CREATED'")
      .bind(paid.id, method, nowIso(), via, "AMOUNT:" + Math.max(0, Math.round(Number(paid.amount) || 0)), row.id).run();
    if (r.meta && r.meta.changes === 1) {
      await logHelper(env, row.helper_id, "razorpay", "PAY_EXTRA", { payment: paid.id, why: "AMOUNT" });
      await tellStaff(env, origin, "GrievIQ: a Community helper payment to refund", "A Community helper payment was of a different amount than the fee. Please refund it.");
    }
    return { state: "EXTRA" };
  }
  if (row.mode === "TEST") {
    const r = await env.DB.prepare("UPDATE helper_payments SET status = 'TEST_PAID', payment_id = ?, method = ?, settled_at = ?, settled_via = ? WHERE id = ? AND status = 'CREATED'")
      .bind(paid.id, method, nowIso(), via, row.id).run();
    if (r.meta && r.meta.changes === 1) await logHelper(env, row.helper_id, "razorpay", "PAY_TEST", { payment: paid.id });
    return { state: "TEST_PAID" };
  }
  // Claim it (with a receipt number) so only one of checkout / webhook / hourly finishes it.
  let claimed = false;
  for (let i = 0; i < 4 && !claimed; i++) {
    try {
      const r = await env.DB.prepare("UPDATE helper_payments SET status = 'PAID', payment_id = ?, method = ?, settled_at = ?, settled_via = ?, receipt_no = ? WHERE id = ? AND status = 'CREATED'")
        .bind(paid.id, method, nowIso(), via, await nextReceipt(env), row.id).run();
      if (!r.meta || r.meta.changes !== 1) return { state: "DONE" };
      claimed = true;
    } catch (e) { if (!/UNIQUE/i.test(String(e && e.message))) throw e; }
  }
  if (!claimed) return { state: "WAITING" };
  return applyHelperPayment(env, origin, row, paid, via);
}

async function refundDue(env, origin, row, why) {
  await env.DB.prepare("UPDATE helper_payments SET status = 'REFUND_DUE', refund_why = ? WHERE id = ? AND status = 'PAID'").bind(why, row.id).run();
  await logHelper(env, row.helper_id, "razorpay", "REFUND_DUE", { payment: row.id, why });
  await tellStaff(env, origin, "GrievIQ: a Community helper payment to refund", "A Community helper payment needs a refund.");
}

async function applyHelperPayment(env, origin, row, paid, via) {
  const h = await env.DB.prepare("SELECT * FROM helpers WHERE id = ?").bind(row.helper_id).first();
  const today = istToday(), now = new Date().toISOString();
  if (!h) return { state: "PAID" };
  if (row.kind === "FIRST") {
    const up = await env.DB.prepare("UPDATE helpers SET status = 'WAITING', submitted_at = ?, updated_at = ? WHERE id = ? AND status = 'DRAFT'").bind(now, now, h.id).run();
    if (!up.meta || up.meta.changes !== 1) { await refundDue(env, origin, row, "NOT_NEEDED"); return { state: "PAID" }; }
    await logHelper(env, h.id, "razorpay", "SUBMITTED", { payment: paid.id, via });
    await emailHelper(env, origin, h, "GrievIQ: your Community helper application is in",
      ["Thank you. Your application and the first month's fee have been received.",
       "Next, GrievIQ staff check your ID and selfie and set up a short video call with you. A different staff member then makes the decision. Your month starts on the day you are approved.",
       "If your application is refused for a reason that isn't your fault, the fee is refunded in full."]);
    await tellStaff(env, origin, "GrievIQ: a Community helper application to check", "A new Community helper application is waiting to be checked.");
    return { state: "PAID" };
  }
  // A month's renewal.
  if (!["ACTIVE", "LAPSED"].includes(h.status)) { await refundDue(env, origin, row, "CLOSED"); return { state: "PAID" }; }
  const st = stateOf(h, today, null);
  // Carries on from the paid-up date (also during the grace days); after a pause, from today.
  const start = st.lapsed || !h.paid_until ? today : addDays(h.paid_until, 1);
  const to = monthEnd(start);
  await env.DB.batch([
    env.DB.prepare("UPDATE helpers SET status = 'ACTIVE', paid_until = ?, reminded_for = NULL, updated_at = ? WHERE id = ?").bind(to, now, h.id),
    env.DB.prepare("UPDATE helper_payments SET period_from = ?, period_to = ? WHERE id = ?").bind(start, to, row.id),
  ]);
  await logHelper(env, h.id, "razorpay", "RENEWED", { payment: paid.id, from: start, to, via, wasLapsed: st.lapsed });
  await emailHelper(env, origin, h, "GrievIQ: payment received — Community helper",
    [`Thank you. Your Community helper role is paid up to <b>${escH(dmy(to))}</b>.`, "Your receipt is on your Community helper page."]);
  return { state: "PAID" };
}

// After Razorpay's payment window says "paid".
export async function helperCheckoutDone(env, origin, h, input) {
  const orderId = String(input.orderId || ""), paymentId = String(input.paymentId || "");
  if (!goodIds(orderId, paymentId)) return { status: 400, body: { error: "BAD_PAYMENT" } };
  const row = await env.DB.prepare("SELECT * FROM helper_payments WHERE order_id = ? AND helper_id = ?").bind(orderId, h.id).first();
  if (!row) return { status: 404, body: { error: "NOT_FOUND" } };
  if (!(await checkoutSigOk(env, orderId, paymentId, input.signature))) {
    await logHelper(env, h.id, "razorpay", "PAY_BAD_SIGNATURE", { order: orderId });
    return { status: 400, body: { error: "BAD_PAYMENT" } };
  }
  await syncHelperOrder(env, origin, row, "CHECKOUT", paymentId);
  const now = await env.DB.prepare("SELECT status FROM helper_payments WHERE id = ?").bind(row.id).first();
  const st = now ? now.status : row.status;
  return { status: 200, body: { ok: true, result: st === "PAID" || st === "REFUND_DUE" ? "PAID" : st === "TEST_PAID" ? "TEST_PAID" : st === "EXTRA" ? "EXTRA" : "WAITING" } };
}

// Staff: refund through Razorpay (full amount). Returns { ok } or { error }.
export async function refundThroughRazorpay(env, p, actor, note) {
  if (!rzpConfig(env).on || p.mode !== rzpConfig(env).mode) return { error: "GATEWAY_OFF" };
  if (!PAY_RE.test(String(p.payment_id || ""))) return { error: "NO_PAYMENT" };
  const m = /^AMOUNT:(\d+)$/.exec(String(p.last_fail || ""));
  const amount = m ? Number(m[1]) : p.amount_paise;
  let r;
  try { r = await rzp(env, "POST", "/payments/" + encodeURIComponent(p.payment_id) + "/refund", { amount, notes: { reason: "Community helper fee refund" } }); }
  catch (e) { return { error: "GATEWAY" }; }
  const rid = r && /^rfnd_[A-Za-z0-9]{6,40}$/.test(String(r.id || "")) ? r.id : null;
  if (!rid) return { error: "GATEWAY" };
  const up = await env.DB.prepare("UPDATE helper_payments SET status = 'REFUNDED', staff_by = ?, staff_at = ?, staff_note = ? WHERE id = ? AND status IN ('REFUND_DUE','EXTRA')")
    .bind(actor, new Date().toISOString(), ("Razorpay refund " + rid + (note ? " · " + note : "")).slice(0, 300), p.id).run();
  return up.meta && up.meta.changes === 1 ? { ok: true, refundId: rid } : { error: "STATE" };
}

// ---- the hourly job ----
export async function runHelpers(env, origin, nowMs) {
  const out = { checked: 0, reminded: 0, lapsed: 0, credited: 0, filesDeleted: 0, drafts: 0, rechecks: 0 };
  if (!(await helpersReady(env))) return out;
  const now = new Date(nowMs).toISOString(), today = istToday(nowMs);
  // 1. Payments still waiting (in case Razorpay's message didn't arrive).
  if (rzpConfig(env).on && (await onlineReady(env))) {
    const { results } = await env.DB.prepare("SELECT * FROM helper_payments WHERE status = 'CREATED' AND started_at < ? ORDER BY started_at LIMIT 30").bind(new Date(nowMs - 600000).toISOString()).all();
    for (const row of results || []) { out.checked++; try { await syncHelperOrder(env, origin, row, "HOURLY"); } catch (e) { /* next hour */ } }
  }
  const pauses = await activePauses(env);
  const { results: act } = await env.DB.prepare("SELECT * FROM helpers WHERE status = 'ACTIVE' LIMIT 2000").all();
  for (const h of act || []) {
    try {
      // 2. An election-code day in the helper's area is added to their month.
      if (h.paid_until && pausedOn(pauses, h.area_id, h.state, today) && h.credit_day !== today && today <= addDays(h.paid_until, GRACE_DAYS)) {
        const r = await env.DB.prepare("UPDATE helpers SET paid_until = ?, credit_day = ?, updated_at = ? WHERE id = ? AND COALESCE(credit_day, '') <> ?").bind(addDays(h.paid_until, 1), today, now, h.id, today).run();
        if (r.meta && r.meta.changes === 1) { out.credited++; await logHelper(env, h.id, "system", "ELECTION_DAY_ADDED", { day: today }); h.paid_until = addDays(h.paid_until, 1); }
        continue;
      }
      // 3. Grace over: the helper role pauses until paid.
      if (h.paid_until && today > addDays(h.paid_until, GRACE_DAYS)) {
        const r = await env.DB.prepare("UPDATE helpers SET status = 'LAPSED', updated_at = ? WHERE id = ? AND status = 'ACTIVE'").bind(now, h.id).run();
        if (r.meta && r.meta.changes === 1) {
          out.lapsed++; await logHelper(env, h.id, "system", "LAPSED", { paidUntil: h.paid_until });
          await emailHelper(env, origin, h, "GrievIQ: your Community helper role is paused", ["The month's fee wasn't paid, so your Community helper role is paused. Pay on your Community helper page to start again."]);
        }
        continue;
      }
      // 4. Reminder 5 days before the month ends (once per month).
      if (h.paid_until && today >= addDays(h.paid_until, -REMIND_DAYS) && today <= h.paid_until && h.reminded_for !== h.paid_until) {
        const r = await env.DB.prepare("UPDATE helpers SET reminded_for = ? WHERE id = ? AND COALESCE(reminded_for, '') <> ?").bind(h.paid_until, h.id, h.paid_until).run();
        if (r.meta && r.meta.changes === 1) {
          out.reminded++; await logHelper(env, h.id, "system", "REMINDED", { paidUntil: h.paid_until });
          await emailHelper(env, origin, h, "GrievIQ: your Community helper month ends soon",
            [`Your Community helper month ends on <b>${escH(dmy(h.paid_until))}</b>. Pay the next month on your Community helper page to carry on. After ${GRACE_DAYS} more days the helper role pauses until paid.`]);
        }
      }
      // 5. The yearly ID check opens 30 days before it is due (told once).
      if (h.kyc_due && today >= addDays(h.kyc_due, -RECHECK_OPEN_DAYS) && !h.recheck) {
        const seen = await env.DB.prepare("SELECT 1 FROM helper_events WHERE helper_id = ? AND action = 'RECHECK_OPENED' AND detail = ?").bind(h.id, JSON.stringify({ due: h.kyc_due })).first();
        if (!seen) {
          out.rechecks++; await logHelper(env, h.id, "system", "RECHECK_OPENED", { due: h.kyc_due });
          await emailHelper(env, origin, h, "GrievIQ: time for your yearly ID check",
            [`Every Community helper's ID is checked again once a year. Please send a new photo of your ID and a selfie holding it by <b>${escH(dmy(h.kyc_due))}</b>, on your Community helper page.`]);
        }
      }
    } catch (e) { /* next hour */ }
  }
  // 6. ID photos and selfies: deleted 30 days after the decision.
  const { results: files } = await env.DB.prepare("SELECT id, id_key, selfie_key FROM helpers WHERE files_deleted_at IS NULL AND files_decided_at IS NOT NULL AND files_decided_at < ? AND (id_key IS NOT NULL OR selfie_key IS NOT NULL) LIMIT 100")
    .bind(new Date(nowMs - FILE_KEEP_DAYS * 86400000).toISOString()).all();
  for (const h of files || []) {
    try {
      await deleteFiles(env, [h.id_key, h.selfie_key]);
      await env.DB.prepare("UPDATE helpers SET id_key = NULL, selfie_key = NULL, files_deleted_at = ? WHERE id = ?").bind(now, h.id).run();
      await logHelper(env, h.id, "system", "FILES_DELETED", { after: FILE_KEEP_DAYS + " days" });
      out.filesDeleted++;
    } catch (e) { /* next hour */ }
  }
  // 7. Applications saved but never paid for: closed after 30 days, files deleted.
  const { results: drafts } = await env.DB.prepare("SELECT id, id_key, selfie_key FROM helpers WHERE status = 'DRAFT' AND updated_at < ? LIMIT 100").bind(new Date(nowMs - DRAFT_DAYS * 86400000).toISOString()).all();
  for (const h of drafts || []) {
    try {
      const r = await env.DB.prepare("UPDATE helpers SET status = 'WITHDRAWN', id_key = NULL, selfie_key = NULL, files_deleted_at = ?, updated_at = ? WHERE id = ? AND status = 'DRAFT'").bind(now, now, h.id).run();
      if (r.meta && r.meta.changes === 1) { await deleteFiles(env, [h.id_key, h.selfie_key]); await logHelper(env, h.id, "system", "DRAFT_CLOSED", { after: DRAFT_DAYS + " days" }); out.drafts++; }
    } catch (e) { /* next hour */ }
  }
  return out;
}
