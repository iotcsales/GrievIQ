/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/admin/accounts (grieviq-76): GST documents and reports for the CA.
// GET  (view_accounts: super, auditor, accounts staff)
//   ?view=summary                    status, settings, turnover this year, months
//   ?view=register&month=YYYY-MM     invoices, credit notes and vouchers of the month
//   ?view=gst&month=                 the month's GST summary (B2B invoice by invoice;
//                                    B2C by state and rate; SAC summary; documents)
//   ?view=tds                        tax deducted by buyers, to claim
//   ?view=receivables                bills not yet paid, by age
//   ?view=deferred&month=            the part of yearly plans not yet earned at month end
//   ?view=settlements&month=         Razorpay's settlement lines, matched
//   ?doc=<id>                        one document (staff)
//   ?export=register|gstr1|tally&month=   CSV for the CA
// POST { action, ... }
//   sync                 (manage_accounts) issue whatever is due now
//   lock { month, note? }        (manage_accounts) the CA has filed this month
//   unlock { month, reason }     (super admin)
//   fetch_settlements { month }  (manage_accounts) from Razorpay
//   settings { sacOffice, sacHelper, invoiceFrom, prefixes, cnPrefixes, rvPrefix, rfPrefix, reason }  (super admin)
// Every action goes to admin_events. Documents are never changed or deleted:
// to correct a bill's invoice (a wrong GSTIN, say), cancel the bill (a
// credit note is issued) and make a new bill.

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { istToday } from "../../_shared/site-settings.js";
import { accountsReady, accountsSettings, saveAccountsSettings, supplierOf, syncTaxDocs, docOut, fyOf, GSTIN_RE, PREFIX_RE, SAC_RE, GST_STATES, KIND_EN } from "../../_shared/tax-docs.js";
import { rzp, rzpConfig } from "../../_shared/razorpay.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const rupees = (p) => Math.round(Number(p || 0)) / 100;
async function log(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), actor, action, target, detail ? JSON.stringify(detail) : null).run();
}
function monthOf(d) { return String(d || "").slice(0, 7); }
function lastDay(month) { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
async function docsOfMonth(env, month) {
  return (await env.DB.prepare("SELECT * FROM tax_docs WHERE substr(doc_date, 1, 7) = ? ORDER BY prefix, seq").bind(month).all()).results || [];
}
async function locks(env) { return (await env.DB.prepare("SELECT * FROM accounts_months ORDER BY month DESC").all()).results || []; }

// The month's GST summary (signs: credit notes reduce; vouchers are listed apart).
function gstSummary(docs) {
  const sign = (d) => d.kind === "CREDIT_NOTE" ? -1 : d.kind === "INVOICE" ? 1 : 0;
  const tax = docs.filter((d) => sign(d) !== 0);
  const tot = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
  const b2b = [], b2c = {}, sac = {};
  for (const d of tax) {
    const s = sign(d);
    for (const k of ["taxable", "cgst", "sgst", "igst", "total"]) tot[k] += s * d[k + "_paise"];
    if (d.party_gstin) b2b.push({ number: d.number, kind: d.kind, date: d.doc_date, gstin: d.party_gstin, name: d.party_name, place: d.place_code, rate: d.rate,
      taxable: rupees(s * d.taxable_paise), cgst: rupees(s * d.cgst_paise), sgst: rupees(s * d.sgst_paise), igst: rupees(s * d.igst_paise), total: rupees(s * d.total_paise) });
    else {
      const k = d.place_code + "|" + d.rate;
      const x = b2c[k] || (b2c[k] = { place: d.place_code, placeName: GST_STATES[d.place_code] || d.place_code, rate: d.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, count: 0 });
      x.taxable += s * d.taxable_paise; x.cgst += s * d.cgst_paise; x.sgst += s * d.sgst_paise; x.igst += s * d.igst_paise; x.count++;
    }
    const q = sac[d.sac + "|" + d.rate] || (sac[d.sac + "|" + d.rate] = { sac: d.sac, rate: d.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, count: 0 });
    q.taxable += s * d.taxable_paise; q.cgst += s * d.cgst_paise; q.sgst += s * d.sgst_paise; q.igst += s * d.igst_paise; q.count++;
  }
  const r = (o) => Object.assign({}, o, { taxable: rupees(o.taxable), cgst: rupees(o.cgst), sgst: rupees(o.sgst), igst: rupees(o.igst) });
  const ranges = {};
  for (const d of docs) { const x = ranges[d.prefix] || (ranges[d.prefix] = { prefix: d.prefix, kind: d.kind, from: d.number, to: d.number, count: 0 }); x.to = d.number; x.count++; }
  const advances = docs.filter((d) => d.kind !== "INVOICE" && d.kind !== "CREDIT_NOTE").map((d) => ({ number: d.number, kind: d.kind, date: d.doc_date, place: d.place_code,
    taxable: rupees(d.taxable_paise), cgst: rupees(d.cgst_paise), sgst: rupees(d.sgst_paise), igst: rupees(d.igst_paise), total: rupees(d.total_paise) }));
  return { totals: r(tot), b2b, b2c: Object.values(b2c).map(r), sac: Object.values(sac).map(r), documents: Object.values(ranges), advances };
}
function csv(rows) {
  const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""') + '"' : s; };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
function dmy(d) { const [y, m, dd] = String(d).split("-"); return dd + "-" + m + "-" + y; }

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_accounts");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await accountsReady(env))) return json({ ready: false });
  const url = new URL(request.url);
  const today = istToday();
  const month = MONTH_RE.test(url.searchParams.get("month") || "") ? url.searchParams.get("month") : today.slice(0, 7);
  const docId = url.searchParams.get("doc");
  if (docId) {
    const r = await env.DB.prepare("SELECT * FROM tax_docs WHERE id = ?").bind(String(docId).slice(0, 60)).first();
    return r ? json({ doc: docOut(r), ref: r.ref_doc_id ? docOut(await env.DB.prepare("SELECT * FROM tax_docs WHERE id = ?").bind(r.ref_doc_id).first()) : null }) : json({ error: "NOT_FOUND" }, 404);
  }
  const exp = url.searchParams.get("export");
  if (exp) {
    const docs = await docsOfMonth(env, month);
    let rows, name;
    if (exp === "gstr1") {
      name = "gstr1-" + month;
      rows = [["Type", "Document", "Number", "Date", "Recipient GSTIN", "Recipient", "Place of supply", "SAC", "Rate", "Taxable value", "IGST", "CGST", "SGST", "Total", "Against"]];
      for (const d of docs) rows.push([d.party_gstin ? "B2B" : "B2CS", KIND_EN[d.kind], d.number, dmy(d.doc_date), d.party_gstin || "", d.party_name, d.place_code + "-" + (GST_STATES[d.place_code] || ""), d.sac, d.rate,
        rupees(d.taxable_paise).toFixed(2), rupees(d.igst_paise).toFixed(2), rupees(d.cgst_paise).toFixed(2), rupees(d.sgst_paise).toFixed(2), rupees(d.total_paise).toFixed(2),
        d.ref_doc_id ? ((docs.find((x) => x.id === d.ref_doc_id) || {}).number || d.ref_doc_id) : ""]);
    } else if (exp === "tally") {
      name = "tally-" + month;
      rows = [["Voucher type", "Voucher number", "Date", "Party ledger", "Party GSTIN", "Sales ledger", "Taxable", "CGST ledger", "CGST", "SGST ledger", "SGST", "IGST ledger", "IGST", "Total", "Narration"]];
      for (const d of docs) rows.push([d.kind === "INVOICE" ? "Sales" : d.kind === "CREDIT_NOTE" ? "Credit Note" : d.kind === "RECEIPT_VOUCHER" ? "Receipt" : "Payment", d.number, dmy(d.doc_date), d.party_name, d.party_gstin || "",
        "GrievIQ services " + d.rate + "%", rupees(d.taxable_paise).toFixed(2), "Output CGST", rupees(d.cgst_paise).toFixed(2), "Output SGST", rupees(d.sgst_paise).toFixed(2), "Output IGST", rupees(d.igst_paise).toFixed(2),
        rupees(d.total_paise).toFixed(2), d.description]);
    } else {
      name = "register-" + month;
      rows = [["Number", "Kind", "Date", "Party", "GSTIN", "Place of supply", "SAC", "Rate", "Taxable", "CGST", "SGST", "IGST", "Total", "Description", "Reason"]];
      for (const d of docs) rows.push([d.number, KIND_EN[d.kind], dmy(d.doc_date), d.party_name, d.party_gstin || "", d.place_code, d.sac, d.rate, rupees(d.taxable_paise).toFixed(2), rupees(d.cgst_paise).toFixed(2),
        rupees(d.sgst_paise).toFixed(2), rupees(d.igst_paise).toFixed(2), rupees(d.total_paise).toFixed(2), d.description, d.reason || ""]);
    }
    await log(env, auth.email, "accounts_exported", month, { what: exp });
    return new Response(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="grieviq-${name}.csv"`, "Cache-Control": "no-store" } });
  }
  const view = url.searchParams.get("view") || "summary";
  const base = { ready: true, today, month, canManage: allows(auth, "manage_accounts"), isSuper: auth.role === "super_admin", locked: !!(await env.DB.prepare("SELECT 1 FROM accounts_months WHERE month = ?").bind(month).first()) };
  if (view === "register") {
    const docs = await docsOfMonth(env, month);
    const cn = new Set(((await env.DB.prepare("SELECT ref_doc_id FROM tax_docs WHERE kind = 'CREDIT_NOTE' AND ref_doc_id IS NOT NULL").all()).results || []).map((r) => r.ref_doc_id));
    return json(Object.assign(base, { docs: docs.map((d) => Object.assign(docOut(d), { cancelled: cn.has(d.id) })) }));
  }
  if (view === "gst") return json(Object.assign(base, gstSummary(await docsOfMonth(env, month))));
  if (view === "tds") {
    let rows = [];
    try {
      rows = (await env.DB.prepare(
        `SELECT p.id, p.gst_tds, p.it_tds, p.tds_ref, p.checked_at, b.ref, b.office_name, b.buyer_gstin, (SELECT number FROM tax_docs t WHERE t.kind = 'INVOICE' AND t.source_type = 'BILL' AND t.source_id = b.id) AS invoice
         FROM bill_payments p JOIN bills b ON b.id = p.bill_id WHERE p.status = 'CONFIRMED' AND (COALESCE(p.gst_tds, 0) > 0 OR COALESCE(p.it_tds, 0) > 0) ORDER BY p.checked_at DESC LIMIT 300`
      ).all()).results || [];
    } catch (e) { rows = []; }
    return json(Object.assign(base, { tds: rows.map((r) => ({ bill: r.ref, office: r.office_name, gstin: r.buyer_gstin, invoice: r.invoice, gstTds: r.gst_tds || 0, itTds: r.it_tds || 0, cert: r.tds_ref, at: r.checked_at })) }));
  }
  if (view === "receivables") {
    const rows = (await env.DB.prepare("SELECT b.*, (SELECT number FROM tax_docs t WHERE t.kind = 'INVOICE' AND t.source_type = 'BILL' AND t.source_id = b.id) AS invoice FROM bills b WHERE b.status IN ('DUE','REPORTED') AND (b.auto = 0 OR b.sent_at IS NOT NULL) ORDER BY b.due_on").all()).results || [];
    const days = (d) => Math.floor((Date.parse(today + "T00:00:00Z") - Date.parse(d + "T00:00:00Z")) / 86400000);
    const bucket = (n) => n <= 0 ? "NOT_DUE" : n <= 30 ? "D30" : n <= 60 ? "D60" : n <= 90 ? "D90" : "OVER90";
    const list = rows.map((b) => ({ bill: b.ref, office: b.office_name, invoice: b.invoice, total: b.total, dueOn: b.due_on, late: days(b.due_on), bucket: bucket(days(b.due_on)), reported: b.status === "REPORTED" }));
    const sums = {}; for (const x of list) sums[x.bucket] = (sums[x.bucket] || 0) + x.total;
    return json(Object.assign(base, { receivables: list, sums }));
  }
  if (view === "deferred") {
    const end = lastDay(month);
    const rows = (await env.DB.prepare("SELECT * FROM bills WHERE status = 'PAID' AND period = 'YEAR' AND period_to > ? AND period_from <= ? ORDER BY period_to").bind(end, end).all()).results || [];
    const list = rows.map((b) => {
      const span = Math.max(1, (Date.parse(b.period_to) - Date.parse(b.period_from)) / 86400000 + 1);
      const left = Math.max(0, (Date.parse(b.period_to) - Date.parse(end)) / 86400000);
      return { bill: b.ref, office: b.office_name, from: b.period_from, to: b.period_to, amount: b.amount, unearned: Math.round(b.amount * left / span) };
    });
    return json(Object.assign(base, { asOf: end, deferred: list, totalUnearned: list.reduce((a, x) => a + x.unearned, 0) }));
  }
  if (view === "settlements") {
    const rows = (await env.DB.prepare("SELECT * FROM razorpay_recon WHERE month = ? ORDER BY settled_at, entity_id").bind(month).all()).results || [];
    const t = rows.reduce((a, r) => ({ amount: a.amount + r.amount_paise, fee: a.fee + r.fee_paise, tax: a.tax + r.tax_paise }), { amount: 0, fee: 0, tax: 0 });
    return json(Object.assign(base, { rzpOn: rzpConfig(env).on, settlements: rows.map((r) => ({ type: r.type, payment: r.entity_id, amount: rupees(r.amount_paise), fee: rupees(r.fee_paise), tax: rupees(r.tax_paise),
      net: rupees(r.amount_paise - r.fee_paise - r.tax_paise), settlement: r.settlement_id, utr: r.settlement_utr, settledAt: r.settled_at, matched: r.matched_kind ? { kind: r.matched_kind, ref: r.matched_ref } : null })),
      totals: { amount: rupees(t.amount), fee: rupees(t.fee), tax: rupees(t.tax), net: rupees(t.amount - t.fee - t.tax) } }));
  }
  // summary
  const sup = await supplierOf(env), set = await accountsSettings(env);
  const fy = fyOf(today);
  const turn = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind = 'INVOICE' THEN taxable_paise WHEN kind = 'CREDIT_NOTE' THEN -taxable_paise ELSE 0 END), 0) AS t FROM tax_docs WHERE fy = ?").bind(fy).first();
  const months = ((await env.DB.prepare("SELECT DISTINCT substr(doc_date, 1, 7) AS m FROM tax_docs ORDER BY m DESC LIMIT 36").all()).results || []).map((r) => r.m);
  const next = {};
  for (const [label, prefix] of Object.entries(Object.assign({}, set.prefixes, { RV: set.rvPrefix, RF: set.rfPrefix }))) {
    const r = await env.DB.prepare("SELECT MAX(seq) AS m FROM tax_docs WHERE prefix = ? AND fy = ?").bind(prefix, fy).first();
    next[label] = prefix + "/" + fy + "/" + String(((r && r.m) || 0) + 1).padStart(4, "0");
  }
  const turnover = rupees(turn ? turn.t : 0);
  return json(Object.assign(base, { gstin: sup.gstin, gstOk: !!(sup.gstin && GSTIN_RE.test(sup.gstin)), supplierState: sup.state, supplierStateName: GST_STATES[sup.state] || null,
    settings: set, fy, turnover, eInvoiceWarn: turnover >= 40000000, nextNumbers: next, months: Array.from(new Set([today.slice(0, 7)].concat(months))), locks: await locks(env) }));
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_accounts");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await accountsReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const origin = new URL(request.url).origin, me = auth.email, today = istToday();
  const isSuper = auth.role === "super_admin";
  const need = (perm) => allows(auth, perm);
  const reasonOk = (r, min) => { const t = String(r || "").trim(); return t.length >= (min || 5) && t.length <= 300 ? t : null; };

  if (b.action === "settings") {
    if (!isSuper) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const cur = await accountsSettings(env), f = {}, next = JSON.parse(JSON.stringify(cur));
    for (const k of ["sacOffice", "sacHelper"]) { const v = String(b[k] || "").trim(); if (!SAC_RE.test(v)) f[k] = "FORMAT"; else next[k] = v; }
    const from = String(b.invoiceFrom || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || isNaN(Date.parse(from)) || from > today) f.invoiceFrom = "DATE"; else next.invoiceFrom = from;
    const all = [];
    for (const grp of ["prefixes", "cnPrefixes"]) for (const k of ["R", "D", "H", "S", "N"]) {
      const v = String(((b[grp] || {})[k]) || "").trim().toUpperCase();
      if (!PREFIX_RE.test(v)) f[grp + "." + k] = "FORMAT"; else { next[grp][k] = v; all.push(v); }
    }
    for (const k of ["rvPrefix", "rfPrefix"]) { const v = String(b[k] || "").trim().toUpperCase(); if (!PREFIX_RE.test(v)) f[k] = "FORMAT"; else { next[k] = v; all.push(v); } }
    if (!f.prefixes && new Set(all).size !== all.length) f.prefixes = "SAME";
    const reason = reasonOk(b.reason); if (!reason) f.reason = "REQUIRED";
    if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
    await saveAccountsSettings(env, next, me);
    await log(env, me, "accounts_settings_changed", "accounts", { from: cur, to: next, reason });
    return json({ ok: true });
  }
  if (b.action === "unlock") {
    if (!isSuper) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const reason = reasonOk(b.reason, 10); if (!reason) return json({ error: "CHECK_FIELDS", fields: { reason: "REQUIRED" } }, 400);
    const r = await env.DB.prepare("DELETE FROM accounts_months WHERE month = ?").bind(String(b.month || "")).run();
    if (!r.meta || r.meta.changes !== 1) return json({ error: "NOT_LOCKED" }, 409);
    await log(env, me, "accounts_month_unlocked", String(b.month), { reason });
    return json({ ok: true });
  }
  if (!need("manage_accounts")) return json({ error: "INSUFFICIENT_ROLE" }, 403);

  if (b.action === "sync") {
    const r = await syncTaxDocs(env, { origin, by: me });
    await log(env, me, "accounts_synced", "accounts", { issued: r.issued.length, on: r.on });
    return json(Object.assign({ ok: true }, r));
  }
  if (b.action === "lock") {
    const m = String(b.month || "");
    if (!MONTH_RE.test(m) || m >= today.slice(0, 7)) return json({ error: "CHECK_FIELDS", fields: { month: "PAST_ONLY" } }, 400);
    try { await env.DB.prepare("INSERT INTO accounts_months (month, locked_at, locked_by, note) VALUES (?, ?, ?, ?)").bind(m, new Date().toISOString(), me, String(b.note || "").trim().slice(0, 300) || null).run(); }
    catch (e) { return json({ error: "ALREADY_LOCKED" }, 409); }
    await log(env, me, "accounts_month_locked", m, { note: b.note || null });
    return json({ ok: true });
  }
  if (b.action === "fetch_settlements") {
    const m = String(b.month || "");
    if (!MONTH_RE.test(m) || m > today.slice(0, 7)) return json({ error: "CHECK_FIELDS", fields: { month: "DATE" } }, 400);
    if (!rzpConfig(env).on) return json({ error: "RZP_OFF" }, 409);
    let d;
    try { d = await rzp(env, "GET", "/settlements/recon/combined?year=" + m.slice(0, 4) + "&month=" + Number(m.slice(5, 7)) + "&count=1000"); }
    catch (e) { return json({ error: "RZP_FAILED", status: e.status || null }, 502); }
    let n = 0;
    const now = new Date().toISOString();
    for (const it of (d && d.items) || []) {
      const pid = String(it.entity_id || "");
      let kind = null, ref = null;
      const bp = await env.DB.prepare("SELECT o.payment_id, b.ref FROM bill_online_payments o JOIN bills b ON b.id = o.bill_id WHERE o.payment_id = ?").bind(pid).first().catch(() => null);
      if (bp) { kind = "BILL"; ref = bp.ref; }
      else { const hp = await env.DB.prepare("SELECT receipt_no FROM helper_payments WHERE payment_id = ?").bind(pid).first().catch(() => null); if (hp) { kind = "HELPER"; ref = hp.receipt_no; } }
      await env.DB.prepare(
        `INSERT INTO razorpay_recon (id, month, type, entity_id, amount_paise, fee_paise, tax_paise, settlement_id, settlement_utr, settled_at, matched_kind, matched_ref, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(type, entity_id) DO UPDATE SET fee_paise = excluded.fee_paise, tax_paise = excluded.tax_paise, settlement_id = excluded.settlement_id, settlement_utr = excluded.settlement_utr,
           settled_at = excluded.settled_at, matched_kind = excluded.matched_kind, matched_ref = excluded.matched_ref, fetched_at = excluded.fetched_at`
      ).bind(crypto.randomUUID(), m, String(it.type || "payment"), pid, Number(it.amount || 0), Number(it.fee || 0), Number(it.tax || 0), it.settlement_id || null, it.settlement_utr || null,
        it.settled_at ? new Date(Number(it.settled_at) * 1000).toISOString() : null, kind, ref, now).run();
      n++;
    }
    await log(env, me, "accounts_settlements_fetched", m, { lines: n });
    return json({ ok: true, lines: n });
  }
  return json({ error: "Unknown action." }, 400);
}
