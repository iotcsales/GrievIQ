/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/helper (grieviq-72): a Community helper's own page.
// Signed in with "Sign in with Google" (/api/auth/google/start?for=helper).
// GET                    the fee, whether applications are open, and the
//                        signed-in person's application or helper role
// GET ?receipt=<id>      one payment receipt (their own)
// POST multipart/form-data, action = apply | recheck
//   apply    name, mobile, unitId, about?, idType, idNumber, conduct, id_photo, selfie
//            (a saved application that isn't paid yet can be changed; the
//            photos can then be left out to keep the ones sent)
//   recheck  idType, idNumber, id_photo, selfie (the yearly ID check)
//   card-photo  card_photo: a new card photo (face only), checked by GrievIQ staff
// GET ?card=1            grieviq-74: the digital ID card: a fresh QR value (every minute)
// GET ?cardphoto=1       the helper's own card photo
// POST JSON { action }
//   pay {ownFunds: true}                       first month (sends the application) or the next month
//   paid {orderId, paymentId, signature}       after Razorpay's payment window
//   withdraw                                   before the decision (a paid first month is refunded in full)
//   stop {confirm: true}                       stop being a helper (no part-month refund)
//   appeal {text}                              once, within 30 days of a suspension or removal
// grieviq-73, filing for a citizen (see _shared/helper-filing.js):
//   file {complaint fields as on /submit, consent}   held until the citizen confirms
//   code {filingId, code}                      the code the citizen got by email
//   resend {filingId}                          the code again (at most 3)
//   cancel-filing {filingId}                   drop a filing still waiting
// See _shared/helpers.js for the rules.

import { sessionEmail } from "../_shared/rep-session.js";
import { verifyAccessJwt } from "../_shared/verify-access-jwt.js";
import { lookupMandates } from "../_shared/get-verified-rep.js";
import { onlineInfo } from "../_shared/razorpay.js";
import { istToday } from "../_shared/site-settings.js";
import {
  helpersReady, idSecretOk, cleanApplication, unitInfo, idHash, normaliseId, readImage, deleteFiles, logHelper, adminLog,
  helperOut, stateOf, electionPause, feeNow, startHelperPay, helperCheckoutDone, tellStaff, emailHelper, OPEN, LIMITS, cardToken, CARD_MINUTES,
} from "../_shared/helpers.js";
import { fileForCitizen, checkCode, resendCode, closeFiling, filingsFor, todayCount, filingsReady, DAILY_FILINGS } from "../_shared/helper-filing.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function helperEmail(request, env) {
  try { const e = await sessionEmail(request, env); if (e) return e; } catch (e) { /* no sessions table */ }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  try {
    const p = await verifyAccessJwt(token, { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD });
    return String(p.email || "").toLowerCase() || null;
  } catch (e) { return null; }
}
// Representatives' offices and GrievIQ staff can't be helpers (conflict of interest).
async function blockedRole(env, email) {
  if ((await lookupMandates(env, email)).length) return "IS_OFFICE";
  try {
    const a = await env.DB.prepare("SELECT 1 AS x FROM admin_users WHERE LOWER(email) = ?").bind(email).first();
    if (a) return "IS_STAFF";
  } catch (e) { /* no staff table */ }
  return null;
}
async function latest(env, email) {
  return env.DB.prepare("SELECT * FROM helpers WHERE email = ? ORDER BY created_at DESC LIMIT 1").bind(email).first();
}
async function everBarred(env, email, hash) {
  const r = await env.DB.prepare("SELECT 1 AS x FROM helpers WHERE (email = ? OR (? IS NOT NULL AND id_hash = ?)) AND (status = 'REMOVED' OR (status = 'REFUSED' AND refuse_kind = 'FORGED')) LIMIT 1")
    .bind(email, hash, hash).first();
  return !!r;
}
async function paymentsOf(env, id) {
  return (await env.DB.prepare("SELECT * FROM helper_payments WHERE helper_id = ? ORDER BY started_at DESC LIMIT 60").bind(id).all()).results || [];
}
async function view(env, h) {
  const unit = await unitInfo(env, h.unit_id);
  const today = istToday();
  const pause = await electionPause(env, h, today);
  return helperOut(h, unit, await paymentsOf(env, h.id), today, pause);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!(await helpersReady(env))) return json({ ready: false });
  const fee = await feeNow(env);
  const online = await onlineInfo(env);
  const base = { ready: true, setUp: idSecretOk(env) && !!env.PRIVATE_PHOTOS, fee: { open: fee.open, price: fee.price, base: fee.base, gst: fee.gst, rate: fee.rate }, online,
    limits: { about: LIMITS.about, appeal: LIMITS.appeal } };
  const email = await helperEmail(request, env);
  if (!email) return json(Object.assign(base, { signedIn: false }));
  const h = await latest(env, email);
  // grieviq-74: the digital ID card.
  if (url.searchParams.get("card") && h) {
    if (!h.ref || !["ACTIVE", "LAPSED", "SUSPENDED"].includes(h.status)) return json({ error: "NO_CARD" }, 409);
    const unit = await unitInfo(env, h.unit_id);
    const today = istToday();
    const st = stateOf(h, today, await electionPause(env, h, today));
    const t = await cardToken(env, h.ref);
    return json({ ref: h.ref, place: unit ? unit.name + ", " + unit.area_name : "", active: h.status === "ACTIVE" && st.canHelp, status: st.status, paidUntil: h.paid_until,
      photo: !!h.card_key, photoStatus: h.card_status || null, url: new URL(request.url).origin + "/verify?h=" + encodeURIComponent(h.ref) + "&t=" + encodeURIComponent(t), validMinutes: CARD_MINUTES, now: new Date().toISOString() });
  }
  if (url.searchParams.get("cardphoto") && h) {
    if (!h.card_key || !env.PRIVATE_PHOTOS) return json({ error: "NOT_FOUND" }, 404);
    const obj = await env.PRIVATE_PHOTOS.get(h.card_key);
    if (!obj) return json({ error: "NOT_FOUND" }, 404);
    return new Response(obj.body, { headers: { "Content-Type": /\.png$/.test(h.card_key) ? "image/png" : /\.webp$/.test(h.card_key) ? "image/webp" : "image/jpeg", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
  }
  const rid = url.searchParams.get("receipt");
  if (rid) {
    if (!h) return json({ error: "NOT_FOUND" }, 404);
    const p = await env.DB.prepare("SELECT p.* FROM helper_payments p JOIN helpers h ON h.id = p.helper_id WHERE p.id = ? AND h.email = ? AND p.receipt_no IS NOT NULL").bind(String(rid).slice(0, 60), email).first();
    if (!p) return json({ error: "NOT_FOUND" }, 404);
    const owner = await env.DB.prepare("SELECT * FROM helpers WHERE id = ?").bind(p.helper_id).first();
    return json(await receiptOut(env, p, owner));
  }
  const out = Object.assign(base, { signedIn: true, email, blocked: await blockedRole(env, email), helper: h ? await view(env, h) : null });
  // grieviq-73: complaints filed for citizens (all of this person's helper records).
  if (h && h.ref && (await filingsReady(env))) {
    const { results: mine } = await env.DB.prepare("SELECT id FROM helpers WHERE email = ? AND ref IS NOT NULL").bind(email).all();
    out.filings = await filingsFor(env, (mine || []).map((x) => x.id));
    out.today = { count: await todayCount(env, h.id), max: DAILY_FILINGS };
  }
  return json(out);
}

export async function receiptOut(env, p, h) {
  const { liveVersion } = await import("../_shared/site-settings.js");
  const s = (await liveVersion(env)).data;
  const unit = h ? await unitInfo(env, h.unit_id) : null;
  return {
    receipt: { id: p.id, receiptNo: p.receipt_no, kind: p.kind, status: p.status, price: p.price, base: p.base, gst: p.gst, rate: p.gst_rate, method: p.method, paymentId: p.payment_id,
      paidAt: p.settled_at, periodFrom: p.period_from, periodTo: p.period_to, refundWhy: p.refund_why, mode: p.mode },
    helper: h ? { ref: h.ref, name: h.name, email: h.email, unit: unit ? unit.name + ", " + unit.area_name : "" } : null,
    seller: { legalName: s.company.legalName, address: s.company.address, gstin: s.gst.gstin || "", sac: s.gst.sac || "", supportEmail: s.company.supportEmail },
  };
}

export async function onRequestPost({ request, env }) {
  const origin = new URL(request.url).origin;
  const o = request.headers.get("Origin");
  if (o && o !== origin) return json({ error: "Not allowed." }, 403);
  if (!(await helpersReady(env))) return json({ error: "NOT_READY" }, 409);
  const email = await helperEmail(request, env);
  if (!email) return json({ error: "SIGNED_OUT" }, 401);
  const blocked = await blockedRole(env, email);
  const ct = String(request.headers.get("Content-Type") || "");
  if (ct.startsWith("multipart/form-data")) {
    let form;
    try { form = await request.formData(); } catch (e) { return json({ error: "BODY" }, 400); }
    const action = String(form.get("action") || "");
    if (blocked) return json({ error: blocked }, 403);
    if (!idSecretOk(env) || !env.PRIVATE_PHOTOS) return json({ error: "NOT_SET_UP" }, 503);
    if (action === "apply") return apply(env, origin, email, form);
    if (action === "recheck") return recheck(env, origin, email, form);
    if (action === "card-photo") return cardPhoto(env, origin, email, form);
    return json({ error: "UNKNOWN_ACTION" }, 400);
  }
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "BODY" }, 400); }
  const h = await latest(env, email);
  if (!h) return json({ error: "NOT_FOUND" }, 404);
  const now = new Date().toISOString();
  switch (b.action) {
    case "pay": {
      if (blocked) return json({ error: blocked }, 403);
      const r = await startHelperPay(env, h, email, b);
      return json(r.body, r.status);
    }
    case "paid": {
      const r = await helperCheckoutDone(env, origin, h, b);
      return json(r.body, r.status);
    }
    case "withdraw": {
      if (h.status === "DRAFT") {
        const r = await env.DB.prepare("UPDATE helpers SET status = 'WITHDRAWN', id_key = NULL, selfie_key = NULL, card_key = NULL, card_status = NULL, files_deleted_at = ?, updated_at = ? WHERE id = ? AND status = 'DRAFT'").bind(now, now, h.id).run();
        if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
        await deleteFiles(env, [h.id_key, h.selfie_key, h.card_key]);
        await logHelper(env, h.id, email, "WITHDRAWN", { stage: "DRAFT" });
        return json({ ok: true });
      }
      if (["WAITING", "CHECKED"].includes(h.status)) {
        const r = await env.DB.prepare("UPDATE helpers SET status = 'WITHDRAWN', id_key = NULL, selfie_key = NULL, card_key = NULL, card_status = NULL, files_deleted_at = ?, updated_at = ? WHERE id = ? AND status IN ('WAITING','CHECKED')").bind(now, now, h.id).run();
        if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
        await deleteFiles(env, [h.id_key, h.selfie_key, h.card_key]);
        const pr = await env.DB.prepare("UPDATE helper_payments SET status = 'REFUND_DUE', refund_why = 'WITHDRAWN' WHERE helper_id = ? AND kind = 'FIRST' AND status = 'PAID'").bind(h.id).run();
        await logHelper(env, h.id, email, "WITHDRAWN", { stage: h.status, refund: !!(pr.meta && pr.meta.changes) });
        if (pr.meta && pr.meta.changes) await tellStaff(env, origin, "GrievIQ: a Community helper payment to refund", "An applicant withdrew before the decision: their first month's fee is to be refunded.");
        await emailHelper(env, origin, h, "GrievIQ: your Community helper application is withdrawn",
          ["Your application has been withdrawn and your ID photo and selfie deleted." + (pr.meta && pr.meta.changes ? " Your fee will be refunded in full to the account you paid from, usually within 5–7 working days." : "")]);
        return json({ ok: true, refund: !!(pr.meta && pr.meta.changes) });
      }
      return json({ error: "STATE" }, 409);
    }
    case "stop": {
      if (b.confirm !== true) return json({ error: "CONFIRM" }, 400);
      if (!["ACTIVE", "LAPSED"].includes(h.status)) return json({ error: "STATE" }, 409);
      const r = await env.DB.prepare("UPDATE helpers SET status = 'STOPPED', updated_at = ?, files_decided_at = COALESCE(files_decided_at, ?) WHERE id = ? AND status IN ('ACTIVE','LAPSED')").bind(now, now, h.id).run();
      if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
      await logHelper(env, h.id, email, "STOPPED", { paidUntil: h.paid_until });
      // The card photo is kept only while the person is a helper.
      if (h.card_key) { await deleteFiles(env, [h.card_key]); await env.DB.prepare("UPDATE helpers SET card_key = NULL, card_status = NULL WHERE id = ?").bind(h.id).run(); }
      await emailHelper(env, origin, h, "GrievIQ: you have stopped being a Community helper",
        ["You have stopped being a Community helper. Your helper number no longer shows as active. Part-months are not refunded.", "You can apply again at any time."]);
      return json({ ok: true });
    }
    case "file": {
      if (blocked) return json({ error: blocked }, 403);
      const r = await fileForCitizen(env, origin, h, b);
      return json(r.body, r.status);
    }
    case "code":
    case "resend":
    case "cancel-filing": {
      const f = await env.DB.prepare("SELECT f.* FROM helper_filings f JOIN helpers h ON h.id = f.helper_id WHERE f.id = ? AND h.email = ?").bind(String(b.filingId || "").slice(0, 60), email).first();
      if (!f) return json({ error: "NOT_FOUND" }, 404);
      if (b.action === "code") { const r = await checkCode(env, origin, f, String(b.code || "").replace(/\s+/g, "")); return json(r.body, r.status); }
      if (b.action === "resend") { const r = await resendCode(env, origin, f, h); return json(r.body, r.status); }
      return (await closeFiling(env, f, "CANCELLED", email, "Cancelled by the helper")) ? json({ ok: true }) : json({ error: "STATE" }, 409);
    }
    case "appeal": {
      const out = await view(env, h);
      if (!out.canAppeal) return json({ error: "STATE" }, 409);
      const text = String(b.text == null ? "" : b.text).normalize("NFC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (text.length < LIMITS.appeal[0]) return json({ error: "CHECK_FIELDS", fields: { text: text ? "SHORT" : "REQUIRED" } }, 400);
      if (text.length > LIMITS.appeal[1]) return json({ error: "CHECK_FIELDS", fields: { text: "LENGTH" } }, 400);
      const r = await env.DB.prepare("UPDATE helpers SET appeal_text = ?, appeal_at = ?, updated_at = ? WHERE id = ? AND appeal_at IS NULL AND status IN ('SUSPENDED','REMOVED')").bind(text, now, now, h.id).run();
      if (!r.meta || r.meta.changes !== 1) return json({ error: "STATE" }, 409);
      await logHelper(env, h.id, email, "APPEALED", { chars: text.length });
      await tellStaff(env, origin, "GrievIQ: a Community helper appeal to decide", "A Community helper has appealed. A staff member who didn't make the first decision should decide it.");
      return json({ ok: true });
    }
    default:
      return json({ error: "UNKNOWN_ACTION" }, 400);
  }
}

function fieldsOf(form, names) { const o = {}; for (const n of names) o[n] = form.get(n); return o; }

async function apply(env, origin, email, form) {
  const fee = await feeNow(env);
  if (!fee.open) return json({ error: "CLOSED" }, 409);
  const prev = await latest(env, email);
  if (prev && OPEN.includes(prev.status) && prev.status !== "DRAFT") return json({ error: "ALREADY" }, 409);
  const draft = prev && prev.status === "DRAFT" ? prev : null;
  const raw = fieldsOf(form, ["name", "mobile", "unitId", "about", "idType", "idNumber", "conduct"]);
  const { fields, v } = cleanApplication(raw);
  const unit = v.unitId && !fields.unitId ? await unitInfo(env, v.unitId) : null;
  if (v.unitId && !fields.unitId && !unit) fields.unitId = "UNKNOWN";
  if (unit && (await electionPause(env, { area_id: unit.area_id, state: unit.state }))) return json({ error: "ELECTION_PAUSE" }, 409);
  let hash = null;
  if (!fields.idNumber && v.idNumber) {
    hash = await idHash(env, v.idType, v.idNumber);
    if (await everBarred(env, email, hash)) return json({ error: "NOT_ALLOWED" }, 403);
    if (hash) {
      const other = await env.DB.prepare("SELECT 1 AS x FROM helpers WHERE id_hash = ? AND email <> ? LIMIT 1").bind(hash, email).first();
      if (other) fields.idNumber = "USED";
    }
  } else if (await everBarred(env, email, null)) return json({ error: "NOT_ALLOWED" }, 403);
  // The photos: required, except when changing a saved application that has them.
  const files = {};
  // grieviq-74: and the card photo (face only), for the digital ID card.
  const COL = { idPhoto: "id_key", selfie: "selfie_key", cardPhoto: "card_key" };
  for (const [k, name] of [["idPhoto", "id_photo"], ["selfie", "selfie"], ["cardPhoto", "card_photo"]]) {
    const f = form.get(name);
    const keep = draft && draft[COL[k]] && (!f || typeof f === "string" || !f.size);
    if (keep) continue;
    const r = await readImage(f);
    if (r.code) fields[k] = r.code; else files[k] = r;
  }
  if (Object.keys(fields).length) return json({ error: "CHECK_FIELDS", fields }, 400);
  const id = draft ? draft.id : crypto.randomUUID();
  const now = new Date().toISOString();
  const keys = {};
  for (const k of Object.keys(files)) {
    keys[k] = "helper-kyc/" + id + "/" + ({ idPhoto: "id", selfie: "selfie", cardPhoto: "card" }[k]) + "-" + crypto.randomUUID().slice(0, 8) + "." + files[k].ext;
    await env.PRIVATE_PHOTOS.put(keys[k], files[k].buf, { httpMetadata: { contentType: files[k].type } });
  }
  const idKey = keys.idPhoto || (draft && draft.id_key), selfieKey = keys.selfie || (draft && draft.selfie_key), cardKey = keys.cardPhoto || (draft && draft.card_key);
  try {
    if (draft) {
      await env.DB.prepare(`UPDATE helpers SET name = ?, mobile = ?, unit_id = ?, area_id = ?, state = ?, about = ?, id_type = ?, id_last4 = ?, id_hash = ?, id_key = ?, selfie_key = ?,
        files_at = ?, conduct_at = ?, updated_at = ? WHERE id = ? AND status = 'DRAFT'`)
        .bind(v.name, v.mobile, unit.id, unit.area_id, unit.state, v.about || null, v.idType, v.idLast4, hash, idKey, selfieKey, Object.keys(keys).length ? now : draft.files_at, now, now, id).run();
      await deleteFiles(env, [keys.idPhoto ? draft.id_key : null, keys.selfie ? draft.selfie_key : null, keys.cardPhoto ? draft.card_key : null]);
    } else {
      await env.DB.prepare(`INSERT INTO helpers (id, email, name, mobile, unit_id, area_id, state, about, id_type, id_last4, id_hash, id_key, selfie_key, files_at, conduct_at, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`)
        .bind(id, email, v.name, v.mobile, unit.id, unit.area_id, unit.state, v.about || null, v.idType, v.idLast4, hash, idKey, selfieKey, now, now, now, now).run();
    }
    await env.DB.prepare("UPDATE helpers SET card_key = ?, card_status = 'PENDING', card_at = NULL, card_by = NULL WHERE id = ?").bind(cardKey, id).run();
  } catch (e) {
    await deleteFiles(env, Object.values(keys));
    if (/UNIQUE/i.test(String(e && e.message))) return json({ error: "ALREADY" }, 409);
    throw e;
  }
  await logHelper(env, id, email, draft ? "APPLICATION_CHANGED" : "APPLICATION_SAVED", { unit: unit.id, idType: v.idType, newPhotos: Object.keys(keys) });
  const h = await env.DB.prepare("SELECT * FROM helpers WHERE id = ?").bind(id).first();
  return json({ ok: true, helper: await view(env, h) });
}

async function recheck(env, origin, email, form) {
  const h = await latest(env, email);
  if (!h) return json({ error: "NOT_FOUND" }, 404);
  const st = stateOf(h, istToday(), null);
  if (!["ACTIVE", "LAPSED"].includes(h.status) || h.recheck || !(st.recheckOpen || st.kycOverdue)) return json({ error: "STATE" }, 409);
  const fields = {};
  const idType = String(form.get("idType") || "");
  const id = normaliseId(idType, form.get("idNumber"));
  if (!id.ok) fields[id.code === "TYPE" ? "idType" : "idNumber"] = id.code === "TYPE" ? "REQUIRED" : id.code;
  let hash = null;
  if (id.ok) {
    hash = await idHash(env, idType, id.number);
    if (hash) {
      const other = await env.DB.prepare("SELECT 1 AS x FROM helpers WHERE id_hash = ? AND email <> ? LIMIT 1").bind(hash, email).first();
      if (other) fields.idNumber = "USED";
    }
  }
  const files = {};
  for (const [k, name] of [["idPhoto", "id_photo"], ["selfie", "selfie"]]) {
    const r = await readImage(form.get(name));
    if (r.code) fields[k] = r.code; else files[k] = r;
  }
  if (Object.keys(fields).length) return json({ error: "CHECK_FIELDS", fields }, 400);
  const now = new Date().toISOString();
  const keys = {};
  for (const k of Object.keys(files)) {
    keys[k] = "helper-kyc/" + h.id + "/" + (k === "idPhoto" ? "id" : "selfie") + "-" + crypto.randomUUID().slice(0, 8) + "." + files[k].ext;
    await env.PRIVATE_PHOTOS.put(keys[k], files[k].buf, { httpMetadata: { contentType: files[k].type } });
  }
  const r = await env.DB.prepare(`UPDATE helpers SET id_type = ?, id_last4 = ?, id_hash = ?, id_key = ?, selfie_key = ?, files_at = ?, files_decided_at = NULL, files_deleted_at = NULL,
    recheck = 'WAITING', recheck_by = NULL, recheck_at = NULL, updated_at = ? WHERE id = ? AND recheck IS NULL`)
    .bind(idType, id.last4, hash, keys.idPhoto, keys.selfie, now, now, h.id).run();
  if (!r.meta || r.meta.changes !== 1) { await deleteFiles(env, Object.values(keys)); return json({ error: "STATE" }, 409); }
  await deleteFiles(env, [h.id_key, h.selfie_key]);
  await logHelper(env, h.id, email, "RECHECK_SENT", { idType });
  await adminLog(env, email, "helper_recheck_sent", h.ref || h.id, null);
  await tellStaff(env, origin, "GrievIQ: a Community helper's yearly ID check", "A Community helper has sent their yearly ID check.");
  const nh = await env.DB.prepare("SELECT * FROM helpers WHERE id = ?").bind(h.id).first();
  return json({ ok: true, helper: await view(env, nh) });
}

// grieviq-74: a new card photo from a helper (face only). Shown on the card
// as "waiting for GrievIQ" until a staff member confirms it matches the person.
async function cardPhoto(env, origin, email, form) {
  const h = await latest(env, email);
  if (!h || !["ACTIVE", "LAPSED"].includes(h.status)) return json({ error: "STATE" }, 409);
  const r = await readImage(form.get("card_photo"));
  if (r.code) return json({ error: "CHECK_FIELDS", fields: { cardPhoto: r.code } }, 400);
  const key = "helper-kyc/" + h.id + "/card-" + crypto.randomUUID().slice(0, 8) + "." + r.ext;
  await env.PRIVATE_PHOTOS.put(key, r.buf, { httpMetadata: { contentType: r.type } });
  await env.DB.prepare("UPDATE helpers SET card_key = ?, card_status = 'PENDING', card_at = NULL, card_by = NULL, updated_at = ? WHERE id = ?").bind(key, new Date().toISOString(), h.id).run();
  if (h.card_key) await deleteFiles(env, [h.card_key]);
  await logHelper(env, h.id, email, "CARD_PHOTO_SENT", null);
  await tellStaff(env, origin, "GrievIQ: a Community helper card photo to confirm", "A Community helper sent a new card photo. Please confirm it matches the person.");
  const nh = await env.DB.prepare("SELECT * FROM helpers WHERE id = ?").bind(h.id).first();
  return json({ ok: true, helper: await view(env, nh) });
}
