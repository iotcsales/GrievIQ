// functions/api/dept/billing.js
//
// "Billing" on the department dashboard (grieviq-41): the bills of the
// signed-in officer's own office, GrievIQ's payment details and
// "I have paid". Same rules as the representative console.
// GET  -> { bills, pay }
// POST { billId, method: UPI|BANK, utr, amount, paidOn }

import { getVerifiedOfficer } from "../../_shared/dept-auth.js";
import { billingReady, billOut, paymentsFor, payInfo, reportPayment } from "../../_shared/billing.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedOfficer(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await billingReady(env))) return json({ ready: false, bills: [], pay: await payInfo(env) });
  const { results } = await env.DB.prepare("SELECT * FROM bills WHERE office_type = 'DEPT' AND office_id = ? ORDER BY issued_at DESC LIMIT 60").bind(String(auth.officer.office_id)).all();
  const bills = results || [];
  const pays = await paymentsFor(env, bills.map((b) => b.id));
  return json({ ready: true, office: { id: auth.officer.office_id, name: auth.officer.office_name_en, nameHi: auth.officer.office_name_hi }, bills: bills.map((b) => billOut(b, pays)), pay: await payInfo(env) });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedOfficer(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await billingReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const bill = await env.DB.prepare("SELECT * FROM bills WHERE id = ? AND office_type = 'DEPT' AND office_id = ?").bind(String(b.billId || ""), String(auth.officer.office_id)).first();
  if (!bill) return json({ error: "NOT_FOUND" }, 404);
  const r = await reportPayment(env, new URL(request.url).origin, bill, b, auth.officer.email);
  return json(r.body, r.status);
}
