// functions/api/billing.js
//
// "Billing" in the representative console (grieviq-41): the bills of the
// offices where this person is the representative or the office manager
// (owner decision 11 Oct 2026: not field workers or office assistants),
// with GrievIQ's payment details, and "I have paid".
// GET  -> { offices, bills, pay: { methods, company } }
// POST { billId, method: UPI|BANK, utr, amount, paidOn }

import { getVerifiedRep } from "../_shared/get-verified-rep.js";
import { ROLE } from "../_shared/team.js";
import { billingReady, billOut, paymentsFor, payInfo, reportPayment } from "../_shared/billing.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
function billingOffices(auth) {
  return auth.mandates.filter((m) => (m.role || ROLE.REP) === ROLE.REP || m.role === ROLE.OM).map((m) => ({ tier: m.tier, id: m.id, name: m.name, label: m.label }));
}
async function billsFor(env, offices) {
  if (!offices.length) return [];
  const keys = JSON.stringify(offices.map((o) => o.tier + "|" + o.id));
  const { results } = await env.DB.prepare(
    "SELECT * FROM bills WHERE office_type = 'REP' AND (office_tier || '|' || office_id) IN (SELECT value FROM json_each(?)) ORDER BY issued_at DESC LIMIT 60"
  ).bind(keys).all();
  return results || [];
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const offices = billingOffices(auth);
  if (!offices.length) return json({ error: "NOT_ALLOWED" }, 403);
  if (!(await billingReady(env))) return json({ ready: false, offices, bills: [], pay: await payInfo(env) });
  const bills = await billsFor(env, offices);
  const pays = await paymentsFor(env, bills.map((b) => b.id));
  return json({ ready: true, offices, bills: bills.map((b) => billOut(b, pays)), pay: await payInfo(env) });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const offices = billingOffices(auth);
  if (!offices.length) return json({ error: "NOT_ALLOWED" }, 403);
  if (!(await billingReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const bill = await env.DB.prepare("SELECT * FROM bills WHERE id = ? AND office_type = 'REP'").bind(String(b.billId || "")).first();
  // Only this person's own offices' bills.
  if (!bill || !offices.some((o) => o.tier === bill.office_tier && o.id === bill.office_id)) return json({ error: "NOT_FOUND" }, 404);
  const r = await reportPayment(env, new URL(request.url).origin, bill, b, auth.email);
  return json(r.body, r.status);
}
