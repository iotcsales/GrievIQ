/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/tax-docs.js (grieviq-76)
//
// GST documents for what GrievIQ sells (CGST Rules 2017):
//   - office bills (continuous supply of services, section 31(5)): a TAX
//     INVOICE is issued with the bill (on or before the due date); a bill
//     cancelled after that gets a CREDIT NOTE (section 34).
//   - Community helper fees: the first ₹499 is paid with the application,
//     before the service starts, so it is an advance: a RECEIPT VOUCHER
//     (Rule 50) at payment; the TAX INVOICE (referring to it) when the helper
//     is approved; a REFUND VOUCHER (Rule 51) if the advance is refunded (or
//     a credit note if an invoice was already issued). Monthly renewals: a tax
//     invoice at payment. Test-mode payments get nothing.
// Numbers: <prefix>/<FY>/<serial>, e.g. GIQ-R/26-27/0001: at most 16
// characters (Rule 46(b)), one series per prefix, starting again each
// 1 April, worked out inside the INSERT so there are no gaps or repeats.
// Documents can't be changed or deleted (part50 triggers).
//
// Defaults until the CA confirms (all editable by the super admin in
// Accounts → Settings, kept in admin_settings 'accounts'):
//   SAC 998315 for office plans and helper fees; tax invoices from the day
//   this first runs; series R (representatives), D (departments), H
//   (helpers), S (State and District dashboards), N (National).
// Place of supply: the buyer's GSTIN state; else the office's or helper's
// state (their area); else GrievIQ's own state. Same state: CGST + SGST;
// otherwise IGST.
//
// syncTaxDocs() issues whatever is due, oldest first. It runs after the
// actions that need it, every hour (worker), and when Accounts opens, so a
// failed email or a slow step never loses a document.

import { liveVersion, istToday } from "./site-settings.js";
import { billPeople } from "./billing.js";
import { sendEmailNow } from "./dept-auth.js";

export const GST_STATES = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
  "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
  "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala",
  "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
};
export function stateCodeOf(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  for (const [c, s] of Object.entries(GST_STATES)) if (s.toLowerCase() === n) return c;
  return null;
}
// GSTIN: 2-digit state, 10-character PAN, entity number, Z, check character.
export const GSTIN_RE = /^(0[1-9]|[1-2][0-9]|3[0-8]|97)[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export function cleanGstin(v) { const g = String(v || "").toUpperCase().replace(/\s+/g, ""); return g || null; }

export const DEFAULTS = {
  sacOffice: "998315", sacHelper: "998315", invoiceFrom: null,
  prefixes: { R: "GIQ-R", D: "GIQ-D", H: "GIQ-H", S: "GIQ-S", N: "GIQ-N" },
  cnPrefixes: { R: "CN-R", D: "CN-D", H: "CN-H", S: "CN-S", N: "CN-N" },
  rvPrefix: "RV-H", rfPrefix: "RF-H",
};
export const PREFIX_RE = /^[A-Z][A-Z0-9-]{0,4}$/;   // with "/26-27/0001" a number stays within 16 characters
export const SAC_RE = /^99\d{4}$/;

export async function accountsReady(env) {
  try { await env.DB.prepare("SELECT 1 FROM tax_docs LIMIT 1").all(); return true; } catch (e) { return false; }
}
export async function accountsSettings(env) {
  let raw = null;
  try { const r = await env.DB.prepare("SELECT value FROM admin_settings WHERE key = 'accounts'").first(); raw = r ? JSON.parse(r.value) : null; } catch (e) { raw = null; }
  const s = JSON.parse(JSON.stringify(DEFAULTS));
  if (raw) {
    for (const k of ["sacOffice", "sacHelper", "invoiceFrom", "rvPrefix", "rfPrefix"]) if (raw[k] != null) s[k] = raw[k];
    for (const k of ["prefixes", "cnPrefixes"]) if (raw[k]) Object.assign(s[k], raw[k]);
  }
  return s;
}
export async function saveAccountsSettings(env, s, actor) {
  await env.DB.prepare("INSERT INTO admin_settings (key, value, updated_by, updated_at) VALUES ('accounts', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
    .bind(JSON.stringify(s), actor, new Date().toISOString()).run();
}
// GrievIQ itself, as printed on every document (from the published site details).
export async function supplierOf(env) {
  const live = await liveVersion(env);
  const c = live.data.company || {}, g = (live.data.gst || {});
  const gstin = cleanGstin(g.gstin);
  return { legalName: c.legalName || "", address: c.address || "", gstin, state: gstin ? gstin.slice(0, 2) : null, email: c.supportEmail || "", rate: Number(g.rate || 18) };
}

export function fyOf(day) {
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7));
  const s = m >= 4 ? y : y - 1;
  return String(s % 100).padStart(2, "0") + "-" + String((s + 1) % 100).padStart(2, "0");
}
// Which series a bill belongs to: departments D; State, District and
// National dashboards S / N; every other office R.
export function seriesOfBill(bill) {
  const p = String(bill.plan_id || "").toLowerCase();
  if (/^national/.test(p)) return "N";
  if (/^(state|district)/.test(p)) return "S";
  return bill.office_type === "DEPT" ? "D" : "R";
}
export function splitTax(gstPaise, placeCode, supplierState) {
  if (placeCode && supplierState && placeCode === supplierState) {
    const c = Math.floor(gstPaise / 2);
    return { cgst: c, sgst: gstPaise - c, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: gstPaise };
}

function newKey() { const a = new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join(""); }

// Issue one document. Returns the row, or null if it already exists.
export async function issueDoc(env, d) {
  const today = d.docDate || istToday();
  const fy = fyOf(today);
  const top = await env.DB.prepare("SELECT MAX(seq) AS m FROM tax_docs WHERE prefix = ? AND fy = ?").bind(d.prefix, fy).first();
  if (top && top.m >= 9999) throw new Error("SERIES_FULL");
  const id = crypto.randomUUID(), now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO tax_docs (id, kind, series, prefix, fy, seq, number, doc_date, issued_at, issued_by, source_type, source_id, ref_doc_id,
         party_name, party_gstin, party_email, party_state, supplier, place_code, sac, description, period_from, period_to, rate,
         taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, reason, view_key)
       SELECT ?, ?, ?, ?, ?, COALESCE(MAX(seq), 0) + 1, ? || '/' || ? || '/' || substr('0000' || (COALESCE(MAX(seq), 0) + 1), -4), ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       FROM tax_docs WHERE prefix = ? AND fy = ?`
    ).bind(id, d.kind, d.series, d.prefix, fy, d.prefix, fy, today, now, d.by || "system", d.sourceType, d.sourceId, d.refDocId || null,
      d.partyName, d.partyGstin || null, d.partyEmail || null, d.partyState || null, JSON.stringify(d.supplier), d.placeCode, d.sac, d.description,
      d.periodFrom || null, d.periodTo || null, d.rate, d.taxable, d.cgst, d.sgst, d.igst, d.total, d.reason || null, newKey(), d.prefix, fy).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) {
      const again = await env.DB.prepare("SELECT * FROM tax_docs WHERE kind = ? AND source_type = ? AND source_id = ?").bind(d.kind, d.sourceType, d.sourceId).first();
      if (again) return null;
    }
    throw e;
  }
  const row = await env.DB.prepare("SELECT * FROM tax_docs WHERE id = ?").bind(id).first();
  try {
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), d.by || "system", "tax_doc_issued", row.number, JSON.stringify({ kind: d.kind, source: d.sourceType, total: d.total / 100 })).run();
  } catch (e) { /* the document stands either way */ }
  return row;
}

// ---- who the buyer is ----
async function officeState(env, bill, sup) {
  try {
    if (bill.office_type === "REP" && bill.office_tier === "LOCAL") {
      const r = await env.DB.prepare("SELECT a.state FROM local_units lu JOIN areas a ON a.id = lu.area_id WHERE lu.id = ?").bind(bill.office_id).first();
      const c = r && stateCodeOf(r.state); if (c) return c;
    }
  } catch (e) { /* fall back */ }
  return sup.state;
}
async function helperState(env, h, sup) {
  const c1 = stateCodeOf(h.state); if (c1) return c1;
  try { const r = await env.DB.prepare("SELECT state FROM areas WHERE id = ?").bind(h.area_id).first(); const c = r && stateCodeOf(r.state); if (c) return c; } catch (e) { /* fall back */ }
  return sup.state;
}
function supplierSnap(sup) { return { legalName: sup.legalName, address: sup.address, gstin: sup.gstin, state: sup.state }; }

// ---- documents for one bill ----
export async function invoiceForBill(env, bill, set, sup, by) {
  const gstin = cleanGstin(bill.buyer_gstin);
  const place = gstin && GSTIN_RE.test(gstin) ? gstin.slice(0, 2) : await officeState(env, bill, sup);
  const gstP = Math.round(Number(bill.gst) * 100), taxP = Math.round(Number(bill.amount) * 100);
  const t = splitTax(gstP, place, sup.state);
  const series = seriesOfBill(bill);
  const emails = await billPeople(env, bill).catch(() => []);
  return issueDoc(env, { kind: "INVOICE", series, prefix: set.prefixes[series], sourceType: "BILL", sourceId: bill.id, by,
    partyName: bill.office_name, partyGstin: gstin, partyEmail: emails[0] || null, partyState: place, supplier: supplierSnap(sup), placeCode: place,
    sac: set.sacOffice, description: (bill.plan_name || "GrievIQ") + (bill.kind === "NOTICE" ? "" : " · " + (bill.period === "YEAR" ? "1 year" : "1 month")) + " · bill " + bill.ref,
    periodFrom: bill.period_from, periodTo: bill.period_to, rate: Number(bill.gst_rate), taxable: taxP, cgst: t.cgst, sgst: t.sgst, igst: t.igst, total: taxP + gstP });
}
export async function creditNoteFor(env, inv, set, reason, by) {
  return issueDoc(env, { kind: "CREDIT_NOTE", series: inv.series, prefix: set.cnPrefixes[inv.series], sourceType: inv.source_type, sourceId: inv.source_id, refDocId: inv.id, by,
    partyName: inv.party_name, partyGstin: inv.party_gstin, partyEmail: inv.party_email, partyState: inv.party_state, supplier: JSON.parse(inv.supplier), placeCode: inv.place_code,
    sac: inv.sac, description: "Credit note for " + inv.number + " (" + inv.description + ")", periodFrom: inv.period_from, periodTo: inv.period_to, rate: inv.rate,
    taxable: inv.taxable_paise, cgst: inv.cgst_paise, sgst: inv.sgst_paise, igst: inv.igst_paise, total: inv.total_paise, reason });
}
// ---- documents for one helper payment ----
async function helperDoc(env, kind, p, h, set, sup, extra) {
  const place = await helperState(env, h, sup);
  const gstP = Math.round(Number(p.gst) * 100), taxP = Math.round(Number(p.base) * 100);
  const t = splitTax(gstP, place, sup.state);
  const prefix = kind === "RECEIPT_VOUCHER" ? set.rvPrefix : kind === "REFUND_VOUCHER" ? set.rfPrefix : kind === "CREDIT_NOTE" ? set.cnPrefixes.H : set.prefixes.H;
  const what = (p.kind === "FIRST" ? "Community helper fee, first month" : "Community helper fee, next month") + (p.receipt_no ? " · receipt " + p.receipt_no : "");
  return issueDoc(env, Object.assign({ kind, series: "H", prefix, sourceType: "HELPER_PAYMENT", sourceId: p.id,
    partyName: h.name, partyGstin: null, partyEmail: h.email, partyState: place, supplier: supplierSnap(sup), placeCode: place, sac: set.sacHelper,
    description: (kind === "RECEIPT_VOUCHER" ? "Advance received: " : kind === "REFUND_VOUCHER" ? "Advance refunded: " : "") + what,
    periodFrom: p.period_from, periodTo: p.period_to, rate: Number(p.gst_rate), taxable: taxP, cgst: t.cgst, sgst: t.sgst, igst: t.igst, total: taxP + gstP }, extra || {}));
}

// ---- issue everything that is due ----
// Returns { on, reason?, issued: [numbers] }.
export async function syncTaxDocs(env, opts) {
  const o = opts || {};
  if (!(await accountsReady(env))) return { on: false, reason: "NOT_READY", issued: [] };
  const sup = await supplierOf(env);
  if (!sup.gstin || !GSTIN_RE.test(sup.gstin)) return { on: false, reason: "NO_GSTIN", issued: [] };
  const set = await accountsSettings(env);
  const today = istToday();
  if (!set.invoiceFrom) {   // first run: tax invoices start today (the super admin can set an earlier date)
    set.invoiceFrom = today;
    await saveAccountsSettings(env, set, "system");
    try { await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, 'system', 'accounts_started', 'accounts', ?)").bind(crypto.randomUUID(), JSON.stringify({ invoiceFrom: today })).run(); } catch (e) { /* noted either way */ }
  }
  const from = set.invoiceFrom, by = o.by || "system", issued = [], origin = o.origin || null;
  const done = async (row) => { if (row) { issued.push(row.number); if (origin && !o.noEmail) await emailDoc(env, origin, row).catch(() => {}); } };
  const limit = o.limit || 200;
  // 1. bills sent to offices (not waiting, not cancelled before invoicing)
  let bills = [];
  try {
    bills = (await env.DB.prepare(
      `SELECT b.* FROM bills b WHERE substr(b.issued_at, 1, 10) >= ? AND (b.auto = 0 OR b.sent_at IS NOT NULL) AND b.status <> 'CANCELLED'
       AND NOT EXISTS (SELECT 1 FROM tax_docs t WHERE t.kind = 'INVOICE' AND t.source_type = 'BILL' AND t.source_id = b.id) ORDER BY b.issued_at LIMIT ?`
    ).bind(from, limit).all()).results || [];
  } catch (e) { bills = []; }
  for (const b of bills) await done(await invoiceForBill(env, b, set, sup, by));
  // 2. bills cancelled after their invoice: a credit note
  const cancelled = (await env.DB.prepare(
    `SELECT t.*, b.cancel_reason FROM tax_docs t JOIN bills b ON b.id = t.source_id WHERE t.kind = 'INVOICE' AND t.source_type = 'BILL' AND b.status = 'CANCELLED'
     AND NOT EXISTS (SELECT 1 FROM tax_docs c WHERE c.kind = 'CREDIT_NOTE' AND c.source_type = 'BILL' AND c.source_id = t.source_id) ORDER BY t.issued_at LIMIT ?`
  ).bind(limit).all()).results || [];
  for (const inv of cancelled) await done(await creditNoteFor(env, inv, set, "Bill cancelled: " + (inv.cancel_reason || ""), by));
  // 3. helper payments (live money only)
  let pays = [];
  try {
    pays = (await env.DB.prepare(
      `SELECT p.*, h.name, h.email, h.state, h.area_id, h.approved_at, h.status AS h_status FROM helper_payments p JOIN helpers h ON h.id = p.helper_id
       WHERE p.mode = 'LIVE' AND p.status IN ('PAID','REFUND_DUE','REFUNDED') AND p.settled_at IS NOT NULL AND substr(p.settled_at, 1, 10) >= ?
       ORDER BY p.settled_at LIMIT ?`
    ).bind(from, limit * 2).all()).results || [];
  } catch (e) { pays = []; }
  for (const p of pays) {
    const h = { name: p.name, email: p.email, state: p.state, area_id: p.area_id };
    const docs = (await env.DB.prepare("SELECT * FROM tax_docs WHERE source_type = 'HELPER_PAYMENT' AND source_id = ?").bind(p.id).all()).results || [];
    const has = (k) => docs.find((d) => d.kind === k);
    if (p.kind === "FIRST") {
      let rv = has("RECEIPT_VOUCHER");
      if (!rv && !has("INVOICE")) { rv = await helperDoc(env, "RECEIPT_VOUCHER", p, h, set, sup, { by }); await done(rv); }
      const inv = has("INVOICE");
      if (p.status === "REFUNDED") {
        if (inv && !has("CREDIT_NOTE")) await done(await creditNoteFor(env, inv, set, "Fee refunded", by));
        else if (!inv && rv && !has("REFUND_VOUCHER")) await done(await helperDoc(env, "REFUND_VOUCHER", p, h, set, sup, { by, refDocId: rv.id }));
      } else if (p.status === "PAID" && p.approved_at && !inv && rv) {
        await done(await helperDoc(env, "INVOICE", p, h, set, sup, { by, refDocId: rv.id }));
      }
    } else {
      const inv = has("INVOICE");
      if (!inv) { const row = await helperDoc(env, "INVOICE", p, h, set, sup, { by }); await done(row); if (p.status === "REFUNDED" && row) await done(await creditNoteFor(env, row, set, "Fee refunded", by)); }
      else if (p.status === "REFUNDED" && !has("CREDIT_NOTE")) await done(await creditNoteFor(env, inv, set, "Fee refunded", by));
    }
  }
  return { on: true, issued };
}

// ---- emails (a link; the document opens on GrievIQ) ----
function escH(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export const KIND_EN = { INVOICE: "Tax invoice", CREDIT_NOTE: "Credit note", RECEIPT_VOUCHER: "Receipt voucher", REFUND_VOUCHER: "Refund voucher" };
const KIND_HI = { INVOICE: "कर बीजक", CREDIT_NOTE: "क्रेडिट नोट", RECEIPT_VOUCHER: "रसीद वाउचर", REFUND_VOUCHER: "धनवापसी वाउचर" };
export function docLink(origin, row) { return origin + "/tax-doc?id=" + encodeURIComponent(row.id) + "&k=" + row.view_key; }
export async function emailDoc(env, origin, row) {
  if (!row.party_email) return false;
  const link = docLink(origin, row);
  const ok = await sendEmailNow(env, row.party_email, `GrievIQ ${KIND_EN[row.kind].toLowerCase()} ${row.number} · ${KIND_HI[row.kind]}`,
    `<p>Your GrievIQ ${escH(KIND_EN[row.kind].toLowerCase())} <b>${escH(row.number)}</b> is ready: ₹${(row.total_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}.</p>` +
    `<p>Open, print or save it: <a href="${escH(link)}">${escH(link)}</a></p><hr><p>आपका GrievIQ ${KIND_HI[row.kind]} <b>${escH(row.number)}</b> तैयार है। ऊपर दिए लिंक से खोलें, प्रिंट करें या सहेजें।</p>`);
  if (ok) await env.DB.prepare("UPDATE tax_docs SET emailed_at = ? WHERE id = ? AND emailed_at IS NULL").bind(new Date().toISOString(), row.id).run();
  return ok;
}

// The document as shown (to its payer through the private link, or to staff).
export function docOut(r) {
  return { id: r.id, kind: r.kind, series: r.series, number: r.number, date: r.doc_date, issuedAt: r.issued_at, sourceType: r.source_type, sourceId: r.source_id,
    refDocId: r.ref_doc_id, partyName: r.party_name, partyGstin: r.party_gstin, partyState: r.party_state, partyStateName: GST_STATES[r.party_state] || null,
    supplier: JSON.parse(r.supplier), placeCode: r.place_code, placeName: GST_STATES[r.place_code] || r.place_code, sac: r.sac, description: r.description,
    periodFrom: r.period_from, periodTo: r.period_to, rate: r.rate, taxable: r.taxable_paise / 100, cgst: r.cgst_paise / 100, sgst: r.sgst_paise / 100,
    igst: r.igst_paise / 100, total: r.total_paise / 100, reason: r.reason, emailedAt: r.emailed_at, b2b: !!r.party_gstin };
}

// The documents for some bills or helper payments: { sourceId: [{ id, kind, number, date, url }] }.
// forPayer: the private link (with its key) for the office or helper;
// otherwise the staff link.
export async function docsFor(env, sourceType, ids, forPayer) {
  const out = {};
  if (!ids || !ids.length) return out;
  try {
    const { results } = await env.DB.prepare("SELECT id, kind, number, doc_date, source_id, view_key FROM tax_docs WHERE source_type = ? AND source_id IN (SELECT value FROM json_each(?)) ORDER BY issued_at")
      .bind(sourceType, JSON.stringify(ids.slice(0, 500))).all();
    for (const r of results || []) (out[r.source_id] = out[r.source_id] || []).push({ id: r.id, kind: r.kind, number: r.number, date: r.doc_date,
      url: forPayer ? "/tax-doc?id=" + encodeURIComponent(r.id) + "&k=" + r.view_key : "/tax-doc?id=" + encodeURIComponent(r.id) + "&src=admin" });
  } catch (e) { /* part50 not run yet */ }
  return out;
}
