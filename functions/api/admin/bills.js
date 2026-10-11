// functions/api/admin/bills.js
//
// Admin "Bills" (grieviq-41): bills for offices paid by UPI or bank
// transfer, and checking the payments offices record.
// GET  (view_bills: super, operations, auditor)
//        ?status=DUE|REPORTED|PAID|CANCELLED (optional) -> bills, newest first
//        ?offices=REP|DEPT&q=text                       -> offices to bill (up to 20)
//        ?quote=1&plan=&period=                         -> what that bill would cost today
// POST (manage_bills: super, operations), { action, ... }:
//   create  { officeType, officeTier?, officeId, planId, period, from, dueDays?, note? }
//   cancel  { id, reason }
//   confirm { paymentId }            the payment matched the bank statement -> bill paid
//   return  { paymentId, reason }    it didn't -> bill due again, office told why
// Every action goes to bill_events (cannot be changed) and the admin log.

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { liveVersion, istToday } from "../../_shared/site-settings.js";
import { billingReady, quote, nextRef, periodEnd, addDays, realDate, repOffice, logBill, billOut, paymentsFor, emailOffice, TIER_TABLE } from "../../_shared/billing.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const clean = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max + 1);

async function adminLog(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, target, detail == null ? null : JSON.stringify(detail)).run();
}
function billablePlans(s) {
  return s.plans.filter((p) => !p.retired && p.billing !== "QUOTE").map((p) => ({ id: p.id, nameEn: p.nameEn, nameHi: p.nameHi, billing: p.billing }));
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_bills");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const canManage = allows(auth, "manage_bills");
  if (!(await billingReady(env))) return json({ ready: false, canManage, bills: [], plans: [] });
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
        const t = TIER_TABLE[tier];
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

  const status = url.searchParams.get("status");
  const where = ["DUE", "REPORTED", "PAID", "CANCELLED"].includes(status) ? " WHERE status = ?" : "";
  const st = env.DB.prepare("SELECT * FROM bills" + where + " ORDER BY issued_at DESC LIMIT 300");
  const { results } = await (where ? st.bind(status) : st).all();
  const bills = results || [];
  const pays = await paymentsFor(env, bills.map((b) => b.id));
  const counts = {};
  const { results: cr } = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM bills GROUP BY status").all();
  for (const r of cr || []) counts[r.status] = r.n;
  return json({
    ready: true, canManage, today, gstRate: live.data.gst.rate, settingsVersion: live.version,
    plans: billablePlans(live.data), counts,
    bills: bills.map((b) => billOut(b, pays)),
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_bills");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await billingReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
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
    const twice = await env.DB.prepare("SELECT ref FROM bills WHERE office_type = ? AND office_id = ? AND period_from = ? AND status != 'CANCELLED'").bind(type, office.id, from).first();
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
    await adminLog(env, auth.email, "bill_cancelled", bill.ref, { reason });
    return json({ ok: true });
  }

  if (b.action === "confirm" || b.action === "return") {
    const p = await env.DB.prepare("SELECT * FROM bill_payments WHERE id = ?").bind(String(b.paymentId || "")).first();
    if (!p) return json({ error: "NOT_FOUND" }, 404);
    if (p.status !== "REPORTED") return json({ error: "ALREADY_CHECKED" }, 409);
    const bill = await env.DB.prepare("SELECT * FROM bills WHERE id = ?").bind(p.bill_id).first();
    if (b.action === "confirm") {
      await env.DB.batch([
        env.DB.prepare("UPDATE bill_payments SET status = 'CONFIRMED', checked_by = ?, checked_at = ? WHERE id = ? AND status = 'REPORTED'").bind(auth.email, now, p.id),
        env.DB.prepare("UPDATE bills SET status = 'PAID', paid_at = ?, paid_checked_by = ? WHERE id = ?").bind(now, auth.email, bill.id),
      ]);
      await logBill(env, bill.id, auth.email, "PAYMENT_CONFIRMED", { payment: p.id, utr: p.utr, amount: p.amount });
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

  return json({ error: "Unknown action." }, 400);
}
