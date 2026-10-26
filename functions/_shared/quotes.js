/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/quotes.js (grieviq-70): quotations for offices. Storage: part44.
// Prices always come from the published prices on the day the quotation is
// made (quote() in billing.js): never typed in, so every office is quoted
// the same. The private link (view_key) lets the office open and print it
// without signing in; it shows nothing but the quotation itself.

export const QUOTE_DAYS = { min: 7, max: 90, def: 30 };

let ready = null;
export async function quotesReady(env) {
  if (ready === true) return true;
  try { await env.DB.prepare("SELECT 1 FROM quotations LIMIT 1").all(); ready = true; return true; } catch (e) { return false; }
}
export async function nextQuoteRef(env) {
  const r = await env.DB.prepare("SELECT ref FROM quotations ORDER BY ref DESC LIMIT 1").first();
  const n = r ? Number(String(r.ref).replace(/\D/g, "")) + 1 : 1;
  return "GIQ-QT-" + String(n).padStart(6, "0");
}
export function newViewKey() {
  const b = new Uint8Array(24); crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
export function sameKey(a, b) {
  a = String(a || ""); b = String(b || "");
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0 && a.length === 48;
}
// What everyone may see of a quotation (staff get more: see quoteOut(q, true)).
export function quoteOut(q, today, staff) {
  const expired = q.status === "OPEN" && q.valid_until < today;
  const x = {
    id: q.id, ref: q.ref, officeName: q.office_name, addressee: q.addressee || null, planId: q.plan_id, planName: q.plan_name, period: q.period,
    amount: q.amount, gstRate: q.gst_rate, gst: q.gst, total: q.total, validUntil: q.valid_until, madeAt: q.made_at,
    status: expired ? "EXPIRED" : q.status, note: q.note || null,
  };
  if (staff) Object.assign(x, { email: q.email || null, madeBy: q.made_by, emailedTo: q.emailed_to || null, emailedAt: q.emailed_at || null,
    orderRef: q.order_ref || null, billId: q.bill_id || null, acceptedBy: q.accepted_by || null, acceptedAt: q.accepted_at || null,
    withdrawnBy: q.withdrawn_by || null, withdrawnAt: q.withdrawn_at || null, withdrawReason: q.withdraw_reason || null, viewKey: q.view_key });
  return x;
}
