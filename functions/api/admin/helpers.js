/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/admin/helpers (grieviq-72): Community helpers for GrievIQ staff.
// GET                         (view_helpers) applications and helpers, payments to refund
// GET ?id=<helper>            (view_helpers) one helper with their history
// GET ?file=<helper>&kind=id|selfie   (view_helper_files) the ID photo or the
//                             selfie; every view is recorded in the helper's history
// GET ?receipt=<payment>      (view_helpers) a payment receipt
// POST { action, id, ... }
//   check     (check_helpers)  the first staff member: ID, selfie and video call
//             { idClear, selfieMatch, videoDone, videoOn, aadhaarMasked?, note? }
//   approve   (approve_helpers) a DIFFERENT staff member: the helper starts
//             (or, for the yearly ID check, it is accepted)
//   refuse    (check_helpers; FORGED needs approve_helpers) { kind: NOT_FAULT|FORGED, reason }
//             NOT_FAULT refunds the first month in full; FORGED refunds nothing
//   suspend   (approve_helpers) { reason }    remove (approve_helpers) { reason }
//   reinstate (approve_helpers) { note }      a suspended helper starts again
//   appeal    (approve_helpers) { result: UPHELD|OVERTURNED, note } decided by
//             someone other than the person who suspended or removed
//   refund    (approve_helpers) { paymentId, note? } refund through Razorpay
//   refunded  (approve_helpers) { paymentId, note }  refunded from the Razorpay dashboard
// grieviq-73, complaints filed by helpers for citizens:
// GET ?phone=<filing>        (reveal_citizen_phone) the citizen's mobile, to call; recorded
//   call      (approve_helpers) { filingId, outcome: CONFIRMED|NOT_ASKED|NO_ANSWER|NOT_NOW, note? }
//             the citizen confirmed on the phone (sent now), didn't ask (a strike),
//             didn't answer (tried again later), or doesn't want it now
//   flag      (approve_helpers) { filingId, review: FINE|FAKE, note } a flagged filing
//             looked at; FAKE is a strike (and drops it if it is still waiting)
// The applicant sees the reason for a refusal (except forged documents),
// suspension or removal; it must be about the application or conduct only.

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { istToday } from "../../_shared/site-settings.js";
import {
  helpersReady, idSecretOk, logHelper, adminLog, stateOf, paymentOut, maskMobile, unitInfo, nextHelperRef, monthEnd, addMonths, addDays,
  emailHelper, refundThroughRazorpay, LIMITS, KYC_MONTHS, electionPause, deleteFiles,
} from "../../_shared/helpers.js";
import { receiptOut } from "../helper.js";
import { filingsReady, confirmFiling, closeFiling, addStrike, maskEmail } from "../../_shared/helper-filing.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const clean = (v, max) => String(v == null ? "" : v).normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function staffRow(h, canSeeMobile, today, extra) {
  const st = stateOf(h, today, null);
  return Object.assign({
    id: h.id, ref: h.ref, status: st.status, rawStatus: h.status, name: h.name, mobile: canSeeMobile ? h.mobile : maskMobile(h.mobile), email: canSeeMobile ? h.email : null,
    unitId: h.unit_id, idType: h.id_type, idLast4: h.id_last4, about: h.about || "", filesIn: !!(h.id_key && h.selfie_key), filesDeleted: h.files_deleted_at,
    createdAt: h.created_at, submittedAt: h.submitted_at, checkedBy: h.checked_by, checkedAt: h.checked_at, checkNote: h.check_note, videoOn: h.video_on,
    decidedBy: h.decided_by, decidedAt: h.decided_at, decisionNote: h.decision_note, refuseKind: h.refuse_kind,
    approvedAt: h.approved_at, paidUntil: h.paid_until, kycDue: h.kyc_due, recheck: h.recheck, recheckBy: h.recheck_by, recheckAt: h.recheck_at,
    actionBy: h.action_by, actionAt: h.action_at, actionReason: h.action_reason,
    appeal: h.appeal_at ? { text: h.appeal_text, at: h.appeal_at, by: h.appeal_by, decidedAt: h.appeal_decided_at, result: h.appeal_result, note: h.appeal_note } : null,
    inGrace: st.inGrace, kycOverdue: st.kycOverdue, strikes: h.strikes || 0,
    card: { photo: !!h.card_key, status: h.card_status || null, by: h.card_by || null, at: h.card_at || null },
  }, extra || {});
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_helpers");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await helpersReady(env))) return json({ ready: false });
  const url = new URL(request.url);
  const today = istToday();
  const canFiles = allows(auth, "view_helper_files");
  const file = url.searchParams.get("file");
  if (file) {
    if (!canFiles) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const kq = url.searchParams.get("kind");
    const kind = kq === "selfie" ? "selfie" : kq === "card" ? "card" : "id";
    const h = await env.DB.prepare("SELECT * FROM helpers WHERE id = ?").bind(String(file).slice(0, 60)).first();
    const key = h && (kind === "selfie" ? h.selfie_key : kind === "card" ? h.card_key : h.id_key);
    if (!key || !env.PRIVATE_PHOTOS) return json({ error: "NOT_FOUND" }, 404);
    const obj = await env.PRIVATE_PHOTOS.get(key);
    if (!obj) return json({ error: "NOT_FOUND" }, 404);
    await logHelper(env, h.id, auth.email, "FILE_VIEWED", { kind });
    const type = /\.png$/.test(key) ? "image/png" : /\.webp$/.test(key) ? "image/webp" : "image/jpeg";
    return new Response(obj.body, { headers: { "Content-Type": type, "Cache-Control": "no-store, private", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
  }
  const ph = url.searchParams.get("phone");
  if (ph) {
    if (!allows(auth, "reveal_citizen_phone")) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const f = (await filingsReady(env)) ? await env.DB.prepare("SELECT * FROM helper_filings WHERE id = ?").bind(String(ph).slice(0, 60)).first() : null;
    if (!f || f.status !== "WAITING_CALL" || !f.payload) return json({ error: "NOT_FOUND" }, 404);
    await logHelper(env, f.helper_id, auth.email, "PHONE_SHOWN", { filing: f.id });
    return json({ mobile: String(JSON.parse(f.payload).citizen_phone || "") });
  }
  const rid = url.searchParams.get("receipt");
  if (rid) {
    const p = await env.DB.prepare("SELECT * FROM helper_payments WHERE id = ? AND receipt_no IS NOT NULL").bind(String(rid).slice(0, 60)).first();
    if (!p) return json({ error: "NOT_FOUND" }, 404);
    const h = await env.DB.prepare("SELECT * FROM helpers WHERE id = ?").bind(p.helper_id).first();
    return json(await receiptOut(env, p, h));
  }
  const one = url.searchParams.get("id");
  if (one) {
    const h = await env.DB.prepare("SELECT * FROM helpers WHERE id = ?").bind(String(one).slice(0, 60)).first();
    if (!h) return json({ error: "NOT_FOUND" }, 404);
    const unit = await unitInfo(env, h.unit_id);
    const { results: ev } = await env.DB.prepare("SELECT at, actor, action, detail FROM helper_events WHERE helper_id = ? ORDER BY at DESC LIMIT 200").bind(h.id).all();
    const { results: pays } = await env.DB.prepare("SELECT * FROM helper_payments WHERE helper_id = ? ORDER BY started_at DESC LIMIT 60").bind(h.id).all();
    const same = await sameAs(env, h);
    let filings = [];
    if (await filingsReady(env)) {
      const { results: fr } = await env.DB.prepare("SELECT f.id, f.status, f.created_at, f.flags, f.flag_review, f.consent_via, f.remove_reason, lu.name AS unit FROM helper_filings f LEFT JOIN local_units lu ON lu.id = f.unit_id WHERE f.helper_id = ? ORDER BY f.created_at DESC LIMIT 50").bind(h.id).all();
      filings = (fr || []).map((f) => ({ id: f.id, status: f.status, at: f.created_at, unit: f.unit, flags: f.flags ? JSON.parse(f.flags) : [], review: f.flag_review, via: f.consent_via, removed: f.remove_reason }));
    }
    return json({ helper: staffRow(h, canFiles, today, { unit: unit ? unit.name : h.unit_id, area: unit ? unit.area_name : "", same, filings,
      events: (ev || []).map((e) => ({ at: e.at, actor: e.actor, action: e.action, detail: e.detail ? JSON.parse(e.detail) : null })),
      payments: (pays || []).map((p) => Object.assign(paymentOut(p), { orderId: p.order_id, staffBy: p.staff_by, staffAt: p.staff_at, staffNote: p.staff_note, lastFail: p.last_fail })) }) });
  }
  const { results } = await env.DB.prepare(
    "SELECT h.*, lu.name AS unit_name, ar.name AS area_name FROM helpers h LEFT JOIN local_units lu ON lu.id = h.unit_id LEFT JOIN areas ar ON ar.id = h.area_id ORDER BY COALESCE(h.submitted_at, h.created_at) DESC LIMIT 500"
  ).all();
  const rows = results || [];
  // The same mobile number on two applications is shown to staff (a hint, not a block).
  const mob = {};
  rows.forEach((h) => { (mob[h.mobile] = mob[h.mobile] || []).push(h); });
  const helpers = rows.map((h) => staffRow(h, canFiles, today, { unit: h.unit_name || h.unit_id, area: h.area_name || "",
    sameMobile: (mob[h.mobile] || []).filter((x) => x.id !== h.id).map((x) => x.ref || x.id.slice(0, 8)) }));
  const { results: refunds } = await env.DB.prepare(
    "SELECT p.*, h.ref, h.name FROM helper_payments p JOIN helpers h ON h.id = p.helper_id WHERE p.status IN ('REFUND_DUE','EXTRA') ORDER BY p.settled_at"
  ).all();
  let calls = [], flagged = [];
  if (await filingsReady(env)) {
    const { results: fl } = await env.DB.prepare(
      `SELECT f.*, h.ref AS helper_ref, lu.name AS unit_name, c.name AS category_name FROM helper_filings f JOIN helpers h ON h.id = f.helper_id
       LEFT JOIN local_units lu ON lu.id = f.unit_id LEFT JOIN grievance_categories c ON c.id = f.category_id
       WHERE f.status = 'WAITING_CALL' OR (f.flags IS NOT NULL AND f.flag_review IS NULL AND f.status NOT IN ('CANCELLED','EXPIRED','NOT_ASKED','FAKE')) ORDER BY f.created_at LIMIT 200`
    ).all();
    const out = (f) => {
      const p = f.payload ? JSON.parse(f.payload) : null;
      return { id: f.id, helperId: f.helper_id, helperRef: f.helper_ref, status: f.status, createdAt: f.created_at, unit: f.unit_name, category: f.category_name,
        description: p ? p.description : null, place: p ? p.location_detail : null, mobile: p ? maskMobile(String(p.citizen_phone).slice(-10)) : null,
        email: p ? maskEmail(p.citizen_email) : null, callTries: f.call_tries, lastCallAt: f.last_call_at, flags: f.flags ? JSON.parse(f.flags) : [] };
    };
    calls = (fl || []).filter((f) => f.status === "WAITING_CALL").map(out);
    flagged = (fl || []).filter((f) => f.flags && !f.flag_review).map(out);
  }
  return json({
    calls, flagged, canCall: allows(auth, "approve_helpers") && allows(auth, "reveal_citizen_phone"),
    ready: true, setUp: idSecretOk(env) && !!env.PRIVATE_PHOTOS, today, me: auth.email,
    canCheck: allows(auth, "check_helpers"), canApprove: allows(auth, "approve_helpers"), canFiles,
    limits: { reason: LIMITS.reason, note: LIMITS.note },
    helpers,
    refunds: (refunds || []).map((p) => Object.assign(paymentOut(p), { helperId: p.helper_id, ref: p.ref, name: p.name, amountTaken: /^AMOUNT:(\d+)$/.test(String(p.last_fail || "")) ? Number(/^AMOUNT:(\d+)$/.exec(p.last_fail)[1]) / 100 : p.price })),
  });
}

async function sameAs(env, h) {
  const out = [];
  if (h.id_hash) {
    const { results } = await env.DB.prepare("SELECT id, ref, status FROM helpers WHERE id_hash = ? AND id <> ?").bind(h.id_hash, h.id).all();
    for (const r of results || []) out.push({ why: "ID", ref: r.ref || r.id.slice(0, 8), status: r.status });
  }
  const { results: m } = await env.DB.prepare("SELECT id, ref, status FROM helpers WHERE mobile = ? AND id <> ?").bind(h.mobile, h.id).all();
  for (const r of m || []) out.push({ why: "MOBILE", ref: r.ref || r.id.slice(0, 8), status: r.status });
  return out;
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_helpers");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await helpersReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const origin = new URL(request.url).origin;
  const now = new Date().toISOString(), today = istToday();
  const need = (perm) => allows(auth, perm);
  const me = auth.email;

  if (b.action === "refund" || b.action === "refunded") {
    if (!need("approve_helpers")) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const p = await env.DB.prepare("SELECT * FROM helper_payments WHERE id = ?").bind(String(b.paymentId || "").slice(0, 60)).first();
    if (!p || !["REFUND_DUE", "EXTRA"].includes(p.status)) return json({ error: "STATE" }, 409);
    if (b.action === "refund") {
      const r = await refundThroughRazorpay(env, p, me, clean(b.note, LIMITS.note).slice(0, LIMITS.note));
      if (r.error) return json({ error: r.error }, r.error === "STATE" ? 409 : 502);
      await logHelper(env, p.helper_id, me, "REFUNDED", { payment: p.id, via: "razorpay", refund: r.refundId });
      await adminLog(env, me, "helper_payment_refunded", p.receipt_no || p.id, { via: "razorpay" });
      return json({ ok: true });
    }
    const note = clean(b.note, LIMITS.note);
    if (note.length < 5) return json({ error: "CHECK_FIELDS", fields: { note: note ? "SHORT" : "REQUIRED" } }, 400);
    const r = await env.DB.prepare("UPDATE helper_payments SET status = 'REFUNDED', staff_by = ?, staff_at = ?, staff_note = ? WHERE id = ? AND status IN ('REFUND_DUE','EXTRA')").bind(me, now, note.slice(0, LIMITS.note), p.id).run();
    if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
    await logHelper(env, p.helper_id, me, "REFUNDED", { payment: p.id, via: "dashboard" });
    await adminLog(env, me, "helper_payment_refunded", p.receipt_no || p.id, { via: "dashboard" });
    return json({ ok: true });
  }

  if (b.action === "call" || b.action === "flag") {
    if (!need("approve_helpers")) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const f = (await filingsReady(env)) ? await env.DB.prepare("SELECT * FROM helper_filings WHERE id = ?").bind(String(b.filingId || "").slice(0, 60)).first() : null;
    if (!f) return json({ error: "NOT_FOUND" }, 404);
    const note = clean(b.note, LIMITS.note);
    if (note.length > LIMITS.note) return json({ error: "CHECK_FIELDS", fields: { note: "LENGTH" } }, 400);
    if (b.action === "call") {
      if (f.status !== "WAITING_CALL") return json({ error: "STATE" }, 409);
      const o = b.outcome;
      if (o === "CONFIRMED") {
        const r = await confirmFiling(env, origin, f, "CALL", me);
        if (r.error) return json({ error: r.error === "CANT_FILE" ? "CANT_FILE" : "STATE" }, 409);
        await adminLog(env, me, "helper_filing_confirmed_by_call", f.id, null);
        return json({ ok: true, trackingRef: r.trackingRef });
      }
      if (o === "NOT_ASKED") {
        if (!(await closeFiling(env, f, "NOT_ASKED", me, note || "The citizen said on the phone they didn't ask for it"))) return json({ error: "STATE" }, 409);
        await adminLog(env, me, "helper_filing_not_asked", f.id, null);
        await addStrike(env, origin, f.helper_id, "NOT_ASKED_CALL", me);
        return json({ ok: true });
      }
      if (o === "NOT_NOW") {
        if (!(await closeFiling(env, f, "CANCELLED", me, note || "The citizen doesn't want it filed now"))) return json({ error: "STATE" }, 409);
        await adminLog(env, me, "helper_filing_not_now", f.id, null);
        return json({ ok: true });
      }
      if (o === "NO_ANSWER") {
        await env.DB.prepare("UPDATE helper_filings SET call_tries = call_tries + 1, last_call_at = ? WHERE id = ? AND status = 'WAITING_CALL'").bind(now, f.id).run();
        await logHelper(env, f.helper_id, me, "CALL_NO_ANSWER", { filing: f.id });
        return json({ ok: true });
      }
      return json({ error: "CHECK_FIELDS", fields: { outcome: "REQUIRED" } }, 400);
    }
    // flag
    if (!f.flags || f.flag_review) return json({ error: "STATE" }, 409);
    if (!["FINE", "FAKE"].includes(b.review)) return json({ error: "CHECK_FIELDS", fields: { review: "REQUIRED" } }, 400);
    if (b.review === "FAKE" && note.length < LIMITS.reason[0]) return json({ error: "CHECK_FIELDS", fields: { note: note ? "SHORT" : "REQUIRED" } }, 400);
    const r = await env.DB.prepare("UPDATE helper_filings SET flag_review = ?, note = COALESCE(?, note) WHERE id = ? AND flag_review IS NULL").bind(b.review, note || null, f.id).run();
    if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
    await logHelper(env, f.helper_id, me, "FLAG_" + b.review, { filing: f.id });
    await adminLog(env, me, "helper_filing_flag_" + b.review.toLowerCase(), f.id, null);
    if (b.review === "FAKE") {
      await closeFiling(env, f, "FAKE", me, note);
      await addStrike(env, origin, f.helper_id, "FAKE", me);
    }
    return json({ ok: true });
  }

  const h = await env.DB.prepare("SELECT * FROM helpers WHERE id = ?").bind(String(b.id || "").slice(0, 60)).first();
  if (!h) return json({ error: "NOT_FOUND" }, 404);
  const target = h.ref || h.id;
  const reasonOf = () => {
    const r = clean(b.reason, LIMITS.reason[1]);
    if (!r) return { err: "REQUIRED" };
    if (r.length < LIMITS.reason[0]) return { err: "SHORT" };
    if (r.length > LIMITS.reason[1]) return { err: "LENGTH" };
    return { r };
  };
  const done = async (action, detail) => { await logHelper(env, h.id, me, action, detail); await adminLog(env, me, "helper_" + action.toLowerCase(), target, detail); };

  switch (b.action) {
    case "check": {
      if (!need("check_helpers")) return json({ error: "INSUFFICIENT_ROLE" }, 403);
      const rc = h.recheck === "WAITING";
      if (h.status !== "WAITING" && !rc) return json({ error: "STATE" }, 409);
      if (!h.id_key || !h.selfie_key) return json({ error: "FILES_GONE" }, 409);
      const f = {};
      if (b.idClear !== true) f.idClear = "REQUIRED";
      if (b.selfieMatch !== true) f.selfieMatch = "REQUIRED";
      if (b.videoDone !== true) f.videoDone = "REQUIRED";
      if (h.id_type === "AADHAAR" && b.aadhaarMasked !== true) f.aadhaarMasked = "REQUIRED";
      // grieviq-74: the card photo shows the same face as the video call.
      if (h.card_key && h.card_status !== "OK" && b.cardMatch !== true) f.cardMatch = "REQUIRED";
      const vo = String(b.videoOn || "");
      if (!DATE_RE.test(vo)) f.videoOn = "REQUIRED"; else if (vo > today) f.videoOn = "FUTURE"; else if (vo < addDays(today, -60)) f.videoOn = "OLD";
      const note = clean(b.note, LIMITS.note);
      if (note.length > LIMITS.note) f.note = "LENGTH";
      if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
      const r = rc
        ? await env.DB.prepare("UPDATE helpers SET recheck = 'CHECKED', recheck_by = ?, recheck_at = ?, video_on = ?, check_note = ?, updated_at = ? WHERE id = ? AND recheck = 'WAITING'").bind(me, now, vo, note || null, now, h.id).run()
        : await env.DB.prepare("UPDATE helpers SET status = 'CHECKED', checked_by = ?, checked_at = ?, video_on = ?, check_note = ?, updated_at = ? WHERE id = ? AND status = 'WAITING'").bind(me, now, vo, note || null, now, h.id).run();
      if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
      await done(rc ? "RECHECK_CHECKED" : "CHECKED", { videoOn: vo, aadhaarMasked: h.id_type === "AADHAAR" ? true : undefined });
      return json({ ok: true });
    }
    case "approve": {
      if (!need("approve_helpers")) return json({ error: "INSUFFICIENT_ROLE" }, 403);
      const rc = h.recheck === "CHECKED";
      if (h.status !== "CHECKED" && !rc) return json({ error: "STATE" }, 409);
      const checker = rc ? h.recheck_by : h.checked_by;
      if (String(checker || "").toLowerCase() === me) return json({ error: "SAME_PERSON" }, 409);
      if (rc) {
        const due = addMonths(h.kyc_due && h.kyc_due > today ? h.kyc_due : today, KYC_MONTHS);
        const r = await env.DB.prepare("UPDATE helpers SET recheck = NULL, kyc_due = ?, files_decided_at = ?, updated_at = ?, card_status = CASE WHEN card_key IS NOT NULL THEN 'OK' ELSE card_status END, card_at = CASE WHEN card_key IS NOT NULL AND card_status = 'PENDING' THEN ? ELSE card_at END, card_by = CASE WHEN card_key IS NOT NULL AND card_status = 'PENDING' THEN ? ELSE card_by END WHERE id = ? AND recheck = 'CHECKED'").bind(due, now, now, now, me, h.id).run();
        if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
        await done("RECHECK_APPROVED", { kycDue: due });
        await emailHelper(env, origin, h, "GrievIQ: your yearly ID check is done", [`Thank you. Your ID has been checked again. The next check is due by ${due}.`]);
        return json({ ok: true });
      }
      const p = await env.DB.prepare("SELECT * FROM helper_payments WHERE helper_id = ? AND kind = 'FIRST' AND status = 'PAID' ORDER BY settled_at DESC LIMIT 1").bind(h.id).first();
      if (!p) return json({ error: "NOT_PAID" }, 409);
      const to = monthEnd(today), due = addMonths(today, KYC_MONTHS);
      let ref = null;
      for (let i = 0; i < 4 && !ref; i++) {
        const tryRef = await nextHelperRef(env);
        try {
          const r = await env.DB.prepare("UPDATE helpers SET status = 'ACTIVE', ref = ?, decided_by = ?, decided_at = ?, approved_at = ?, paid_until = ?, kyc_due = ?, files_decided_at = ?, updated_at = ? WHERE id = ? AND status = 'CHECKED'")
            .bind(tryRef, me, now, now, to, due, now, now, h.id).run();
          if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
          ref = tryRef;
        } catch (e) { if (!/UNIQUE/i.test(String(e && e.message))) throw e; }
      }
      if (!ref) return json({ error: "TRY_AGAIN" }, 409);
      await env.DB.prepare("UPDATE helper_payments SET period_from = ?, period_to = ? WHERE id = ?").bind(today, to, p.id).run();
      if (h.card_key) await env.DB.prepare("UPDATE helpers SET card_status = 'OK', card_at = ?, card_by = ? WHERE id = ?").bind(now, me, h.id).run();
      await logHelper(env, h.id, me, "APPROVED", { ref, paidUntil: to, checkedBy: h.checked_by });
      await adminLog(env, me, "helper_approved", ref, { checkedBy: h.checked_by });
      await emailHelper(env, origin, h, "GrievIQ: you are now a Community helper — " + ref,
        [`Welcome. Your Community helper number is <b>${ref}</b>. Anyone can check it on grieviq.in/helper.`,
         `Your first month runs to <b>${to}</b>. Please keep to the code of conduct at all times: never ask for money, never speak for a party or a candidate, and file only what the citizen asks for.`]);
      return json({ ok: true, ref });
    }
    case "refuse": {
      const forged = b.kind === "FORGED";
      if (!need(forged ? "approve_helpers" : "check_helpers")) return json({ error: "INSUFFICIENT_ROLE" }, 403);
      if (!["WAITING", "CHECKED"].includes(h.status)) return json({ error: "STATE" }, 409);
      if (!["NOT_FAULT", "FORGED"].includes(b.kind)) return json({ error: "CHECK_FIELDS", fields: { kind: "REQUIRED" } }, 400);
      const rs = reasonOf();
      if (rs.err) return json({ error: "CHECK_FIELDS", fields: { reason: rs.err } }, 400);
      const r = await env.DB.prepare("UPDATE helpers SET status = 'REFUSED', refuse_kind = ?, decided_by = ?, decided_at = ?, decision_note = ?, files_decided_at = ?, updated_at = ? WHERE id = ? AND status IN ('WAITING','CHECKED')")
        .bind(b.kind, me, now, rs.r, now, now, h.id).run();
      if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
      let refund = false;
      if (!forged) {
        const pr = await env.DB.prepare("UPDATE helper_payments SET status = 'REFUND_DUE', refund_why = 'REFUSED' WHERE helper_id = ? AND kind = 'FIRST' AND status = 'PAID'").bind(h.id).run();
        refund = !!(pr.meta && pr.meta.changes);
      }
      await done("REFUSED", { kind: b.kind, refund });
      await emailHelper(env, origin, h, "GrievIQ: your Community helper application",
        forged ? ["Your application could not be accepted because the documents sent could not be accepted. The fee is not refunded in this case (see the Terms). If you think this is a mistake, write to GrievIQ support."]
          : [`Your application was not approved. Reason: ${rs.r.replace(/[<>&"']/g, "")}`, refund ? "Your fee will be refunded in full to the account you paid from, usually within 5–7 working days." : "", "You may apply again once the reason is put right."].filter(Boolean));
      return json({ ok: true, refund });
    }
    // grieviq-74: a card photo sent after approval: does it match the person?
    case "card-ok":
    case "card-refuse": {
      if (!need("check_helpers")) return json({ error: "INSUFFICIENT_ROLE" }, 403);
      if (!["ACTIVE", "LAPSED", "SUSPENDED"].includes(h.status) || h.card_status !== "PENDING" || !h.card_key) return json({ error: "STATE" }, 409);
      if (b.action === "card-ok") {
        if (b.matches !== true) return json({ error: "CHECK_FIELDS", fields: { matches: "REQUIRED" } }, 400);
        const r = await env.DB.prepare("UPDATE helpers SET card_status = 'OK', card_at = ?, card_by = ?, updated_at = ? WHERE id = ? AND card_status = 'PENDING' AND card_key = ?").bind(now, me, now, h.id, h.card_key).run();
        if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
        await done("CARD_PHOTO_OK", {});
        return json({ ok: true });
      }
      const rs = reasonOf();
      if (rs.err) return json({ error: "CHECK_FIELDS", fields: { reason: rs.err } }, 400);
      const r = await env.DB.prepare("UPDATE helpers SET card_key = NULL, card_status = NULL, updated_at = ? WHERE id = ? AND card_status = 'PENDING' AND card_key = ?").bind(now, h.id, h.card_key).run();
      if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
      await deleteFiles(env, [h.card_key]);
      await done("CARD_PHOTO_REFUSED", {});
      await emailHelper(env, origin, h, "GrievIQ: please send another card photo", [`Your card photo couldn't be used. Reason: ${rs.r.replace(/[<>&"']/g, "")}`, "Please send a new photo of your face only (no ID card in it) on your Community helper page."]);
      return json({ ok: true });
    }
    case "suspend":
    case "remove": {
      if (!need("approve_helpers")) return json({ error: "INSUFFICIENT_ROLE" }, 403);
      const from = b.action === "suspend" ? ["ACTIVE", "LAPSED"] : ["ACTIVE", "LAPSED", "SUSPENDED"];
      if (!from.includes(h.status)) return json({ error: "STATE" }, 409);
      const rs = reasonOf();
      if (rs.err) return json({ error: "CHECK_FIELDS", fields: { reason: rs.err } }, 400);
      const to = b.action === "suspend" ? "SUSPENDED" : "REMOVED";
      // A new suspension or removal opens a new appeal (one per decision).
      const r = await env.DB.prepare(`UPDATE helpers SET status = ?, action_by = ?, action_at = ?, action_reason = ?, appeal_text = NULL, appeal_at = NULL, appeal_by = NULL, appeal_decided_at = NULL, appeal_result = NULL, appeal_note = NULL, updated_at = ?
        WHERE id = ? AND status IN (${from.map(() => "?").join(",")})`).bind(to, me, now, rs.r, now, h.id, ...from).run();
      if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
      await done(to, {});
      await emailHelper(env, origin, h, to === "SUSPENDED" ? "GrievIQ: your Community helper role is suspended" : "GrievIQ: your Community helper role has ended",
        [`Reason: ${rs.r.replace(/[<>&"']/g, "")}`, to === "REMOVED" ? "The current month's fee is not refunded." : "", "You may appeal once, within 30 days, on your Community helper page. A different staff member decides the appeal."].filter(Boolean));
      return json({ ok: true });
    }
    case "reinstate": {
      if (!need("approve_helpers")) return json({ error: "INSUFFICIENT_ROLE" }, 403);
      if (h.status !== "SUSPENDED") return json({ error: "STATE" }, 409);
      const note = clean(b.note, LIMITS.note);
      if (note.length < 5) return json({ error: "CHECK_FIELDS", fields: { note: note ? "SHORT" : "REQUIRED" } }, 400);
      const r = await env.DB.prepare("UPDATE helpers SET status = 'ACTIVE', strikes = 0, updated_at = ? WHERE id = ? AND status = 'SUSPENDED'").bind(now, h.id).run();
      if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
      await done("REINSTATED", { note });
      await emailHelper(env, origin, h, "GrievIQ: your Community helper role has started again", ["Your suspension has ended and your Community helper role has started again."]);
      return json({ ok: true });
    }
    case "appeal": {
      if (!need("approve_helpers")) return json({ error: "INSUFFICIENT_ROLE" }, 403);
      if (!["SUSPENDED", "REMOVED"].includes(h.status) || !h.appeal_at || h.appeal_result) return json({ error: "STATE" }, 409);
      if (String(h.action_by || "").toLowerCase() === me) return json({ error: "SAME_PERSON" }, 409);
      if (!["UPHELD", "OVERTURNED"].includes(b.result)) return json({ error: "CHECK_FIELDS", fields: { result: "REQUIRED" } }, 400);
      const note = clean(b.note, LIMITS.reason[1]);
      if (note.length < LIMITS.reason[0]) return json({ error: "CHECK_FIELDS", fields: { note: note ? "SHORT" : "REQUIRED" } }, 400);
      const back = b.result === "OVERTURNED";
      const r = await env.DB.prepare("UPDATE helpers SET appeal_result = ?, appeal_by = ?, appeal_decided_at = ?, appeal_note = ?, status = CASE WHEN ? = 1 THEN 'ACTIVE' ELSE status END, strikes = CASE WHEN ? = 1 THEN 0 ELSE strikes END, updated_at = ? WHERE id = ? AND appeal_result IS NULL AND status IN ('SUSPENDED','REMOVED')")
        .bind(b.result, me, now, note.slice(0, LIMITS.reason[1]), back ? 1 : 0, back ? 1 : 0, now, h.id).run();
      if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
      await done("APPEAL_" + b.result, { firstDecisionBy: h.action_by });
      await emailHelper(env, origin, h, "GrievIQ: the decision on your appeal",
        [back ? "Your appeal was accepted and your Community helper role has started again." : "Your appeal was not accepted. The earlier decision stands.", `Note from GrievIQ: ${note.replace(/[<>&"']/g, "")}`]);
      return json({ ok: true });
    }
    default:
      return json({ error: "UNKNOWN_ACTION" }, 400);
  }
}
