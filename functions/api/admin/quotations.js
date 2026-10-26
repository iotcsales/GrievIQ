/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/admin/quotations.js (grieviq-70)
// GET  (view_bills: super, operations, auditor) -> quotations, newest first
// POST (manage_bills: super, operations), { action, ... }:
//   create   { officeName, addressee?, email?, planId, period, validDays?, note? }
//   email    { id, email? }        the quotation and its private link, to the office
//   withdraw { id, reason }
//   accept   { id, officeType, officeTier?, officeId, from, orderRef, dueDays? }
//            the office's order arrived: a bill at the quoted price
// Every action goes to the admin log (admin_events cannot be changed).

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { liveVersion, istToday } from "../../_shared/site-settings.js";
import { quote, nextRef, periodEnd, addDays, realDate, repOffice, logBill, emailOffice, planBillFilter, billingReady } from "../../_shared/billing.js";
import { sendEmailNow } from "../../_shared/dept-auth.js";
import { validateContact } from "../../_shared/contact-validation.js";
import { quotesReady, nextQuoteRef, newViewKey, quoteOut, QUOTE_DAYS } from "../../_shared/quotes.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const clean = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max + 1);
const escH = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN");
function dmy(s) { try { return new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); } catch (e) { return s; } }
async function adminLog(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, target, detail == null ? null : JSON.stringify(detail)).run();
}
function cleanEmail(v) {
  const r = validateContact({ email: v });
  return r.ok && r.values.email ? String(r.values.email).toLowerCase() : null;
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_bills");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await quotesReady(env))) return json({ ready: false, quotations: [] });
  const today = istToday();
  const { results } = await env.DB.prepare("SELECT * FROM quotations ORDER BY made_at DESC LIMIT 200").all();
  return json({ ready: true, canManage: allows(auth, "manage_bills"), today, days: QUOTE_DAYS, quotations: (results || []).map((q) => quoteOut(q, today, true)) });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_bills");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await quotesReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const origin = new URL(request.url).origin;
  const now = new Date().toISOString(), today = istToday();

  if (b.action === "create") {
    const f = {};
    const officeName = clean(b.officeName, 160);
    if (!officeName) f.officeName = "REQUIRED"; else if (officeName.length > 160) f.officeName = "LENGTH";
    const addressee = clean(b.addressee, 160);
    if (addressee.length > 160) f.addressee = "LENGTH";
    let email = null;
    if (String(b.email || "").trim()) { email = cleanEmail(b.email); if (!email) f.email = "FORMAT"; }
    const live = await liveVersion(env);
    const plan = live.data.plans.find((p) => p.id === String(b.planId || ""));
    const period = b.period === "YEAR" ? "YEAR" : b.period === "MONTH" ? "MONTH" : null;
    if (!plan) f.plan = "REQUIRED";
    if (!period) f.period = "REQUIRED";
    const q = plan && period ? quote(live.data, plan, period, today) : null;
    if (plan && period && !q) f.period = "NO_PRICE";
    const days = b.validDays === "" || b.validDays == null ? QUOTE_DAYS.def : Number(b.validDays);
    if (!Number.isInteger(days) || days < QUOTE_DAYS.min || days > QUOTE_DAYS.max) f.validDays = "RANGE";
    const note = clean(b.note, 300);
    if (note.length > 300) f.note = "LENGTH";
    if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
    const id = crypto.randomUUID();
    let ref = null;
    for (let i = 0; i < 3 && !ref; i++) {
      const r = await nextQuoteRef(env);
      try {
        await env.DB.prepare(
          `INSERT INTO quotations (id, ref, office_name, addressee, email, plan_id, plan_name, period, amount, gst_rate, gst, total, offer_id, settings_version, valid_until, status, note, view_key, made_by, made_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`
        ).bind(id, r, officeName, addressee || null, email, plan.id, plan.nameEn, period, q.amount, q.gstRate, q.gst, q.total, q.offerId, live.version, addDays(today, days), note || null, newViewKey(), auth.email, now).run();
        ref = r;
      } catch (e) { if (!/UNIQUE/i.test(String(e && e.message))) throw e; }
    }
    if (!ref) return json({ error: "CONFLICT" }, 409);
    await adminLog(env, auth.email, "quotation_made", ref, { office: officeName, plan: plan.id, period, total: q.total, validUntil: addDays(today, days) });
    return json({ ok: true, id, ref, total: q.total, validUntil: addDays(today, days) });
  }

  const row = await env.DB.prepare("SELECT * FROM quotations WHERE id = ?").bind(String(b.id || "")).first();
  if (!row) return json({ error: "NOT_FOUND" }, 404);
  const expired = row.status === "OPEN" && row.valid_until < today;

  if (b.action === "email") {
    if (row.status !== "OPEN" || expired) return json({ error: expired ? "EXPIRED" : "NOT_OPEN" }, 409);
    const to = String(b.email || "").trim() ? cleanEmail(b.email) : row.email;
    if (!to) return json({ error: "CHECK_FIELDS", fields: { email: String(b.email || "").trim() ? "FORMAT" : "REQUIRED" } }, 400);
    const s = (await liveVersion(env)).data;
    const link = origin + "/quote?ref=" + encodeURIComponent(row.ref) + "&k=" + row.view_key;
    const en = `<p>Dear ${escH(row.addressee || row.office_name)},</p><p>Please find GrievIQ's quotation <b>${escH(row.ref)}</b> for <b>${escH(row.office_name)}</b>: ${escH(row.plan_name)}, ${row.period === "YEAR" ? "one year" : "one month"}. Amount ${inr(row.amount)} + GST ${inr(row.gst)} = <b>${inr(row.total)}</b>. Valid until ${dmy(row.valid_until)}.</p>` +
      `<p>Open, print or save it as a PDF: <a href="${escH(link)}">${escH(link)}</a></p><p>Every office pays the same published price. Payments by a political party or an election campaign are not accepted. After your order, GrievIQ sends a bill; pay only through the details shown when you sign in to GrievIQ.</p><p>${escH(s.company.legalName)} · ${escH(s.company.supportEmail)}</p>`;
    const hi = `<p>GrievIQ का कोटेशन <b>${escH(row.ref)}</b> (<b>${escH(row.office_name)}</b>): कुल <b>${inr(row.total)}</b> (GST सहित), ${dmy(row.valid_until)} तक मान्य। खोलें, प्रिंट करें या PDF सहेजें: <a href="${escH(link)}">${escH(link)}</a></p>`;
    const sent = await sendEmailNow(env, to, `GrievIQ quotation ${row.ref}: ${inr(row.total)} · कोटेशन`, en + "<hr>" + hi);
    if (!sent) return json({ error: "EMAIL_FAILED" }, 502);
    await env.DB.prepare("UPDATE quotations SET emailed_to = ?, emailed_at = ?, email = COALESCE(email, ?) WHERE id = ?").bind(to, now, to, row.id).run();
    await adminLog(env, auth.email, "quotation_emailed", row.ref, { to });
    return json({ ok: true, to });
  }

  if (b.action === "withdraw") {
    if (row.status !== "OPEN") return json({ error: "NOT_OPEN" }, 409);
    const reason = clean(b.reason, 300);
    if (reason.length < 5 || reason.length > 300) return json({ error: "CHECK_FIELDS", fields: { reason: reason.length > 300 ? "LENGTH" : "REQUIRED" } }, 400);
    await env.DB.prepare("UPDATE quotations SET status = 'WITHDRAWN', withdrawn_by = ?, withdrawn_at = ?, withdraw_reason = ? WHERE id = ? AND status = 'OPEN'").bind(auth.email, now, reason, row.id).run();
    await adminLog(env, auth.email, "quotation_withdrawn", row.ref, { reason });
    return json({ ok: true });
  }

  if (b.action === "accept") {
    if (!(await billingReady(env))) return json({ error: "NOT_READY" }, 409);
    if (row.status !== "OPEN") return json({ error: "NOT_OPEN" }, 409);
    if (expired) return json({ error: "EXPIRED" }, 409);
    const f = {};
    const type = b.officeType === "DEPT" ? "DEPT" : b.officeType === "REP" ? "REP" : null;
    let office = null;
    if (!type) f.office = "REQUIRED";
    else if (type === "REP") {
      office = await repOffice(env, String(b.officeTier || ""), b.officeId);
      if (!office) f.office = "REQUIRED"; else if (!office.email) f.office = "NO_REP";
    } else {
      const d = await env.DB.prepare("SELECT id, name_en FROM dept_offices WHERE id = ? AND retired_at IS NULL").bind(String(b.officeId || "")).first();
      if (!d) f.office = "REQUIRED"; else office = { tier: null, id: d.id, name: d.name_en };
    }
    const from = String(b.from || "");
    if (!from) f.from = "REQUIRED"; else if (!realDate(from)) f.from = "DATE"; else if (from < addDays(today, -366) || from > addDays(today, 366)) f.from = "RANGE";
    const orderRef = clean(b.orderRef, 80);
    if (orderRef.length < 2 || orderRef.length > 80) f.orderRef = orderRef.length > 80 ? "LENGTH" : "REQUIRED";
    const dueDays = b.dueDays === "" || b.dueDays == null ? 15 : Number(b.dueDays);
    if (!Number.isInteger(dueDays) || dueDays < 1 || dueDays > 60) f.dueDays = "RANGE";
    if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
    const twice = await env.DB.prepare("SELECT ref FROM bills WHERE office_type = ? AND office_id = ? AND period_from = ? AND status != 'CANCELLED'" + (await planBillFilter(env))).bind(type, office.id, from).first();
    if (twice) return json({ error: "CHECK_FIELDS", fields: { from: "TWICE" }, ref: twice.ref }, 400);
    // Claim the quotation first, so it can only become one bill.
    const claim = await env.DB.prepare("UPDATE quotations SET status = 'ACCEPTED', accepted_by = ?, accepted_at = ?, order_ref = ? WHERE id = ? AND status = 'OPEN'").bind(auth.email, now, orderRef, row.id).run();
    if (!claim.meta || claim.meta.changes !== 1) return json({ error: "NOT_OPEN" }, 409);
    const id = crypto.randomUUID();
    let ref = null;
    for (let i = 0; i < 3 && !ref; i++) {
      const r = await nextRef(env);
      try {
        await env.DB.prepare(
          `INSERT INTO bills (id, ref, office_type, office_tier, office_id, office_name, plan_id, plan_name, period, period_from, period_to, amount, gst_rate, gst, total, offer_id, settings_version, due_on, status, issued_by, issued_at, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DUE', ?, ?, ?)`
        ).bind(id, r, type, office.tier, office.id, office.name, row.plan_id, row.plan_name, row.period, from, periodEnd(from, row.period), row.amount, row.gst_rate, row.gst, row.total, row.offer_id, row.settings_version, addDays(today, dueDays), auth.email, now,
          ("Quotation " + row.ref + ", order " + orderRef).slice(0, 300)).run();
        ref = r;
      } catch (e) { if (!/UNIQUE/i.test(String(e && e.message))) throw e; }
    }
    if (!ref) {
      await env.DB.prepare("UPDATE quotations SET status = 'OPEN', accepted_by = NULL, accepted_at = NULL, order_ref = NULL WHERE id = ?").bind(row.id).run();
      return json({ error: "CONFLICT" }, 409);
    }
    await env.DB.prepare("UPDATE quotations SET bill_id = ? WHERE id = ?").bind(id, row.id).run();
    await logBill(env, id, auth.email, "ISSUED", { ref, quotation: row.ref, orderRef, total: row.total, settingsVersion: row.settings_version });
    await adminLog(env, auth.email, "quotation_accepted", row.ref, { bill: ref, office: office.name, orderRef, total: row.total });
    const bill = await env.DB.prepare("SELECT * FROM bills WHERE id = ?").bind(id).first();
    const emailed = await emailOffice(env, origin, bill, "ISSUED");
    return json({ ok: true, billId: id, billRef: ref, total: row.total, emailed });
  }

  return json({ error: "Unknown action." }, 400);
}
