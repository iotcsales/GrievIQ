/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/admin/bills.js
//
// Admin "Bills" (grieviq-41): bills for offices paid by UPI or bank
// transfer, and checking the payments offices record.
// GET  (view_bills: super, operations, auditor, accounts staff; sales staff
//        (view_quotations) get only ?offices= and ?quote=, for quotations)
//        ?status=DUE|REPORTED|PAID|CANCELLED (optional) -> bills, newest first
//        ?offices=REP|DEPT&q=text                       -> offices to bill (up to 20)
//        ?quote=1&plan=&period=                         -> what that bill would cost today
// POST { action, ... } (grieviq-75: make_bills = super, operations, accounts
// executive and manager; confirm_bills = super, operations, accounts manager;
// operations admins only read when billing is for accounts staff only):
//   create  { officeType, officeTier?, officeId, planId, period, from, dueDays?, note? }   make_bills
//   send    { id }                                                                       make_bills
//   cancel  { id, reason }                                                               confirm_bills
//   confirm { paymentId }            the payment matched the bank statement -> bill paid  confirm_bills
//   return  { paymentId, reason }    it didn't -> bill due again, office told why         confirm_bills
//   online-check    { id }                 grieviq-67: ask Razorpay now about this bill's online payments   make_bills
//   online-refunded { onlineId, note }     an online payment that wasn't needed has been refunded           confirm_bills
// An accounts manager never confirms or returns a payment on a bill they
// made themselves (another person checks the money).
// Every action goes to bill_events (cannot be changed) and the admin log.

import { getVerifiedAdmin, allows, billingAllows } from "../../_shared/get-verified-admin.js";
import { liveVersion, istToday } from "../../_shared/site-settings.js";
import { billingReady, quote, nextRef, periodEnd, addDays, realDate, repOffice, logBill, billOut, paymentsFor, emailOffice, TIER_TABLE, tierTable, hasDraftColumns, planBillFilter } from "../../_shared/billing.js";
import { applyPayment } from "../../_shared/subscriptions.js";
import { noticePaid, noticeBillCancelled } from "../../_shared/notices.js";
import { rzpConfig, onlineReady, onlineFor, onlineOut, syncOrder } from "../../_shared/razorpay.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const clean = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max + 1);

async function adminLog(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, target, detail == null ? null : JSON.stringify(detail)).run();
}
function billablePlans(s) {
  return s.plans.filter((p) => !p.retired && p.billing !== "QUOTE").map((p) => ({ id: p.id, nameEn: p.nameEn, nameHi: p.nameHi, billing: p.billing }));
}

// grieviq-67: is "Pay online" working, and online payments that need staff.
async function onlineStatus(env) {
  const c = rzpConfig(env);
  const out = { on: c.on, mode: c.mode, webhook: c.webhook, tables: await onlineReady(env), lastWebhook: null, refund: [] };
  if (!out.tables) return out;
  const w = await env.DB.prepare("SELECT received_at FROM payment_webhook_events ORDER BY received_at DESC LIMIT 1").first();
  out.lastWebhook = w ? w.received_at : null;
  const { results } = await env.DB.prepare("SELECT o.*, b.ref, b.office_name FROM bill_online_payments o JOIN bills b ON b.id = o.bill_id WHERE o.status = 'EXTRA' ORDER BY o.settled_at DESC LIMIT 50").all();
  out.refund = (results || []).map((r) => Object.assign(onlineOut(r, true), { billRef: r.ref, officeName: r.office_name }));
  const t = await env.DB.prepare("SELECT COUNT(*) AS n FROM bill_online_payments WHERE status = 'CREATED'").first();
  out.waiting = t ? t.n : 0;
  return out;
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const seeBills = allows(auth, "view_bills"), seeQuotes = allows(auth, "view_quotations");
  if (!seeBills && !seeQuotes) return json({ error: "INSUFFICIENT_ROLE" }, 403);
  const canManage = await billingAllows(env, auth, "make_bills");
  const canConfirm = await billingAllows(env, auth, "confirm_bills");
  if (!(await billingReady(env))) return json({ ready: false, canManage, canConfirm, bills: [], plans: [] });
  const url = new URL(request.url);
  const live = await liveVersion(env);
  const today = istToday();

  if (url.searchParams.get("quote")) {
    const plan = live.data.plans.find((p) => p.id === url.searchParams.get("plan"));
    const q = quote(live.data, plan, url.searchParams.get("period") === "YEAR" ? "YEAR" : "MONTH", today);
    return json(q ? { ok: true, quote: q } : { error: "NO_PRICE" }, q ? 200 : 400);
  }

  const kind = url.searchParams.get("offices");
  if (kind) {
    const q = "%" + clean(url.searchParams.get("q"), 60).replace(/[%_]/g, "") + "%";
    const out = [];
    if (kind === "DEPT") {
      const { results } = await env.DB.prepare(
        "SELECT d.id, d.name_en, d.name_hi, (SELECT COUNT(*) FROM dept_officers o WHERE o.office_id = d.id AND o.status = 'ACTIVE') AS officers FROM dept_offices d WHERE d.retired_at IS NULL AND (d.name_en LIKE ? OR d.name_hi LIKE ?) ORDER BY d.name_en LIMIT 20"
      ).bind(q, q).all();
      for (const r of results || []) out.push({ type: "DEPT", tier: null, id: r.id, name: r.name_en, nameHi: r.name_hi, label: "Department office", canSee: r.officers > 0 });
    } else {
      for (const tier of ["LOCAL", "MAYOR", "MLA", "MP"]) {
        const t = await tierTable(env, tier);
        const extra = tier === "LOCAL" ? ", unit_type" : "";
        const { results } = await env.DB.prepare(`SELECT id, name, ${t.email} AS email${extra} FROM ${t.table} WHERE name LIKE ? ORDER BY name LIMIT 20`).bind(q).all();
        for (const r of results || []) {
          out.push({ type: "REP", tier, id: r.id, name: r.name, label: tier === "LOCAL" ? (r.unit_type === "URBAN" ? "Corporator" : "Gram Pradhan") : tier === "MAYOR" ? "Mayor" : tier,
            suggest: tier === "LOCAL" ? (r.unit_type === "URBAN" ? "councillor" : "pradhan") : tier === "MLA" ? "mla" : "mp_mayor", canSee: !!r.email });
        }
      }
    }
    return json({ offices: out.slice(0, 20) });
  }

  // Sales staff: the plans and prices for quotations, never the bills.
  if (!seeBills) return json({ ready: true, quotesOnly: true, canManage: false, canConfirm: false, today, gstRate: live.data.gst.rate, plans: billablePlans(live.data), counts: {}, bills: [] });

  const status = url.searchParams.get("status");
  const drafts = await hasDraftColumns(env);
  const where = status === "WAITING" && drafts ? " WHERE status = 'DUE' AND auto = 1 AND sent_at IS NULL"
    : ["DUE", "REPORTED", "PAID", "CANCELLED"].includes(status) ? " WHERE status = ?" : "";
  const st = env.DB.prepare("SELECT * FROM bills" + where + " ORDER BY issued_at DESC LIMIT 300");
  const { results } = await (where && status !== "WAITING" ? st.bind(status) : st).all();
  const bills = results || [];
  const pays = await paymentsFor(env, bills.map((b) => b.id));
  const counts = {};
  const { results: cr } = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM bills GROUP BY status").all();
  for (const r of cr || []) counts[r.status] = r.n;
  if (drafts) { const w = await env.DB.prepare("SELECT COUNT(*) AS n FROM bills WHERE status = 'DUE' AND auto = 1 AND sent_at IS NULL").first(); counts.WAITING = w ? w.n : 0; }
  const online = await onlineFor(env, bills.map((b) => b.id));
  return json({
    ready: true, canManage, canConfirm, me: auth.email, ownRule: !allows(auth, "approve_changes"), today, gstRate: live.data.gst.rate, settingsVersion: live.version,
    plans: billablePlans(live.data), counts,
    online: await onlineStatus(env),
    bills: bills.map((b) => Object.assign(billOut(b, pays), { online: online.filter((o) => o.bill_id === b.id).map((o) => onlineOut(o, true)) })),
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_bills");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await billingReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const CONFIRM = ["cancel", "confirm", "return", "online-refunded"];
  const perm = CONFIRM.includes(b && b.action) ? "confirm_bills" : "make_bills";
  if (!allows(auth, perm)) return json({ error: "INSUFFICIENT_ROLE" }, 403);
  if (!(await billingAllows(env, auth, perm))) return json({ error: "BILLING_ACCOUNTS_ONLY" }, 403);
  // An accounts manager doesn't check the money on a bill they made.
  const ownRule = !allows(auth, "approve_changes");
  const origin = new URL(request.url).origin;
  const now = new Date().toISOString();
  const today = istToday();

  if (b.action === "create") {
    const f = {};
    const type = b.officeType === "DEPT" ? "DEPT" : b.officeType === "REP" ? "REP" : null;
    if (!type) f.office = "REQUIRED";
    let office = null;
    if (type === "REP") {
      office = await repOffice(env, String(b.officeTier || ""), b.officeId);
      if (!office) f.office = "REQUIRED"; else if (!office.email) f.office = "NO_REP";
    } else if (type === "DEPT") {
      const d = await env.DB.prepare("SELECT id, name_en FROM dept_offices WHERE id = ? AND retired_at IS NULL").bind(String(b.officeId || "")).first();
      if (!d) f.office = "REQUIRED"; else office = { tier: null, id: d.id, name: d.name_en };
    }
    const live = await liveVersion(env);
    const plan = live.data.plans.find((p) => p.id === String(b.planId || ""));
    const period = b.period === "YEAR" ? "YEAR" : b.period === "MONTH" ? "MONTH" : null;
    if (!plan) f.plan = "REQUIRED";
    if (!period) f.period = "REQUIRED";
    const q = plan && period ? quote(live.data, plan, period, today) : null;
    if (plan && period && !q) f.period = "NO_PRICE";
    const from = String(b.from || "");
    if (!from) f.from = "REQUIRED"; else if (!realDate(from)) f.from = "DATE"; else if (from < addDays(today, -366) || from > addDays(today, 366)) f.from = "RANGE";
    const dueDays = b.dueDays === "" || b.dueDays == null ? 15 : Number(b.dueDays);
    if (!Number.isInteger(dueDays) || dueDays < 1 || dueDays > 60) f.dueDays = "RANGE";
    const note = clean(b.note, 300);
    if (note.length > 300) f.note = "LENGTH";
    if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
    // The same office can't be billed twice for a period starting the same day.
    const twice = await env.DB.prepare("SELECT ref FROM bills WHERE office_type = ? AND office_id = ? AND period_from = ? AND status != 'CANCELLED'" + (await planBillFilter(env))).bind(type, office.id, from).first();
    if (twice) return json({ error: "CHECK_FIELDS", fields: { from: "TWICE" }, ref: twice.ref }, 400);
    const id = crypto.randomUUID();
    let ref = null;
    for (let i = 0; i < 3 && !ref; i++) {
      const r = await nextRef(env);
      try {
        await env.DB.prepare(
          `INSERT INTO bills (id, ref, office_type, office_tier, office_id, office_name, plan_id, plan_name, period, period_from, period_to, amount, gst_rate, gst, total, offer_id, settings_version, due_on, status, issued_by, issued_at, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DUE', ?, ?, ?)`
        ).bind(id, r, type, office.tier, office.id, office.name, plan.id, plan.nameEn, period, from, periodEnd(from, period), q.amount, q.gstRate, q.gst, q.total, q.offerId, live.version, addDays(today, dueDays), auth.email, now, note || null).run();
        ref = r;
      } catch (e) { if (!/UNIQUE/i.test(String(e && e.message))) throw e; }
    }
    if (!ref) return json({ error: "CONFLICT" }, 409);
    await logBill(env, id, auth.email, "ISSUED", { ref, plan: plan.id, period, from, total: q.total, settingsVersion: live.version });
    await adminLog(env, auth.email, "bill_issued", ref, { office: office.name, total: q.total });
    const bill = await env.DB.prepare("SELECT * FROM bills WHERE id = ?").bind(id).first();
    const emailed = await emailOffice(env, origin, bill, "ISSUED");
    return json({ ok: true, id, ref, total: q.total, emailed });
  }

  // grieviq-46: a bill made by the hourly job is sent to the office here.
  if (b.action === "send") {
    const bill = await env.DB.prepare("SELECT * FROM bills WHERE id = ?").bind(String(b.id || "")).first();
    if (!bill) return json({ error: "NOT_FOUND" }, 404);
    if (!(await hasDraftColumns(env)) || !bill.auto || bill.sent_at) return json({ error: "ALREADY_SENT" }, 409);
    if (bill.status !== "DUE") return json({ error: "NOT_OPEN" }, 409);
    await env.DB.prepare("UPDATE bills SET sent_at = ? WHERE id = ? AND sent_at IS NULL").bind(now, bill.id).run();
    await logBill(env, bill.id, auth.email, "SENT", null);
    await adminLog(env, auth.email, "bill_sent", bill.ref, { office: bill.office_name, total: bill.total });
    const emailed = await emailOffice(env, origin, bill, "ISSUED");
    return json({ ok: true, emailed });
  }

  if (b.action === "cancel") {
    const bill = await env.DB.prepare("SELECT * FROM bills WHERE id = ?").bind(String(b.id || "")).first();
    if (!bill) return json({ error: "NOT_FOUND" }, 404);
    if (bill.status === "PAID" || bill.status === "CANCELLED") return json({ error: "NOT_OPEN" }, 409);
    const reason = clean(b.reason, 300);
    if (reason.length < 5 || reason.length > 300) return json({ error: "CHECK_FIELDS", fields: { reason: reason.length > 300 ? "LENGTH" : "REQUIRED" } }, 400);
    const stmts = [env.DB.prepare("UPDATE bills SET status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ? AND status IN ('DUE','REPORTED')").bind(now, auth.email, reason, bill.id)];
    stmts.push(env.DB.prepare("UPDATE bill_payments SET status = 'RETURNED', checked_by = ?, checked_at = ?, reason = ? WHERE bill_id = ? AND status = 'REPORTED'").bind(auth.email, now, "Bill cancelled: " + reason, bill.id));
    await env.DB.batch(stmts);
    await logBill(env, bill.id, auth.email, "CANCELLED", { reason });
    try { await noticeBillCancelled(env, bill, auth.email, reason); } catch (e) { /* bill is cancelled either way */ }
    await adminLog(env, auth.email, "bill_cancelled", bill.ref, { reason });
    return json({ ok: true });
  }

  if (b.action === "confirm" || b.action === "return") {
    const p = await env.DB.prepare("SELECT * FROM bill_payments WHERE id = ?").bind(String(b.paymentId || "")).first();
    if (!p) return json({ error: "NOT_FOUND" }, 404);
    if (p.status !== "REPORTED") return json({ error: "ALREADY_CHECKED" }, 409);
    if (ownRule) {
      const ob = await env.DB.prepare("SELECT issued_by FROM bills WHERE id = ?").bind(p.bill_id).first();
      if (ob && String(ob.issued_by || "").toLowerCase() === auth.email) return json({ error: "OWN_BILL" }, 403);
    }
    const bill = await env.DB.prepare("SELECT * FROM bills WHERE id = ?").bind(p.bill_id).first();
    if (b.action === "confirm") {
      await env.DB.batch([
        env.DB.prepare("UPDATE bill_payments SET status = 'CONFIRMED', checked_by = ?, checked_at = ? WHERE id = ? AND status = 'REPORTED'").bind(auth.email, now, p.id),
        env.DB.prepare("UPDATE bills SET status = 'PAID', paid_at = ?, paid_checked_by = ? WHERE id = ?").bind(now, auth.email, bill.id),
      ]);
      await logBill(env, bill.id, auth.email, "PAYMENT_CONFIRMED", { payment: p.id, utr: p.utr, amount: p.amount });
      // grieviq-46: the office is paid up to the end of this bill's period.
      try { await applyPayment(env, bill, auth.email); } catch (e) { /* bill is paid either way */ }
      try { await noticePaid(env, bill, auth.email); } catch (e) { /* grieviq-55: the notice can be started by hand if this failed */ }
      await adminLog(env, auth.email, "bill_payment_confirmed", bill.ref, { amount: p.amount, utrEnds: p.utr.slice(-4) });
      await emailOffice(env, origin, bill, "CONFIRMED");
      return json({ ok: true, status: "PAID" });
    }
    const reason = clean(b.reason, 300);
    if (reason.length < 5 || reason.length > 300) return json({ error: "CHECK_FIELDS", fields: { reason: reason.length > 300 ? "LENGTH" : "REQUIRED" } }, 400);
    await env.DB.batch([
      env.DB.prepare("UPDATE bill_payments SET status = 'RETURNED', checked_by = ?, checked_at = ?, reason = ? WHERE id = ? AND status = 'REPORTED'").bind(auth.email, now, reason, p.id),
      env.DB.prepare("UPDATE bills SET status = 'DUE' WHERE id = ? AND status = 'REPORTED'").bind(bill.id),
    ]);
    await logBill(env, bill.id, auth.email, "PAYMENT_RETURNED", { payment: p.id, reason });
    await adminLog(env, auth.email, "bill_payment_returned", bill.ref, { reason });
    await emailOffice(env, origin, bill, "RETURNED", reason);
    return json({ ok: true, status: "DUE" });
  }

  // grieviq-67: ask Razorpay now about a bill's online payments (the hourly
  // job does this anyway; this is for an office on the phone saying "I paid").
  if (b.action === "online-check") {
    if (!(await onlineReady(env))) return json({ error: "NOT_READY" }, 409);
    const bill = await env.DB.prepare("SELECT * FROM bills WHERE id = ?").bind(String(b.id || "")).first();
    if (!bill) return json({ error: "NOT_FOUND" }, 404);
    const { results } = await env.DB.prepare("SELECT * FROM bill_online_payments WHERE bill_id = ? AND status = 'CREATED' ORDER BY started_at DESC LIMIT 10").bind(bill.id).all();
    const states = [];
    for (const row of results || []) { try { states.push((await syncOrder(env, origin, row, "STAFF")).state); } catch (e) { states.push("WAITING"); } }
    await adminLog(env, auth.email, "bill_online_checked", bill.ref, { orders: states.length, states });
    const after = await env.DB.prepare("SELECT status FROM bills WHERE id = ?").bind(bill.id).first();
    return json({ ok: true, orders: states.length, states, status: after.status });
  }

  if (b.action === "online-refunded") {
    if (!(await onlineReady(env))) return json({ error: "NOT_READY" }, 409);
    const o = await env.DB.prepare("SELECT * FROM bill_online_payments WHERE id = ?").bind(String(b.onlineId || "")).first();
    if (!o) return json({ error: "NOT_FOUND" }, 404);
    if (o.status !== "EXTRA") return json({ error: "ALREADY_CHECKED" }, 409);
    const note = clean(b.note, 300);
    if (note.length < 5 || note.length > 300) return json({ error: "CHECK_FIELDS", fields: { reason: note.length > 300 ? "LENGTH" : "REQUIRED" } }, 400);
    const r = await env.DB.prepare("UPDATE bill_online_payments SET status = 'REFUNDED', staff_by = ?, staff_at = ?, staff_note = ? WHERE id = ? AND status = 'EXTRA'").bind(auth.email, now, note, o.id).run();
    if (!r.meta || r.meta.changes !== 1) return json({ error: "ALREADY_CHECKED" }, 409);
    const bill = await env.DB.prepare("SELECT ref FROM bills WHERE id = ?").bind(o.bill_id).first();
    await logBill(env, o.bill_id, auth.email, "ONLINE_REFUNDED", { payment: o.payment_id, note });
    await adminLog(env, auth.email, "bill_online_refunded", bill ? bill.ref : o.bill_id, { payment: o.payment_id });
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 400);
}
