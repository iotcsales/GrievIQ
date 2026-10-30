/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/dept/billing.js
//
// "Billing" on the department dashboard (grieviq-41): the bills of the
// signed-in officer's own office, GrievIQ's payment details and
// "I have paid". Same rules as the representative console.
// GET  -> { bills, pay }
// POST { billId, method: UPI|BANK, utr, amount, paidOn }
// grieviq-67: POST { action: "online" | "online-done", ... } as in /api/billing.

import { getVerifiedOfficer } from "../../_shared/dept-auth.js";
import { billingReady, billOut, paymentsFor, payInfo, reportPayment, officeBillFilter } from "../../_shared/billing.js";
import { onlineInfo, onlineFor, onlineOut, startOnline, checkoutDone } from "../../_shared/razorpay.js";
import { docsFor } from "../../_shared/tax-docs.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedOfficer(request, env, { allowPaused: true });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await billingReady(env))) return json({ ready: false, bills: [], pay: await payInfo(env) });
  const { results } = await env.DB.prepare("SELECT * FROM bills WHERE office_type = 'DEPT' AND office_id = ?" + (await officeBillFilter(env)) + " ORDER BY issued_at DESC LIMIT 60").bind(String(auth.officer.office_id)).all();
  const bills = results || [];
  const pays = await paymentsFor(env, bills.map((b) => b.id));
  const online = await onlineFor(env, bills.map((b) => b.id));
  const pay = Object.assign(await payInfo(env), { online: await onlineInfo(env) });
  const docs = await docsFor(env, "BILL", bills.map((b) => b.id), true);   // grieviq-76
  return json({ ready: true, office: { id: auth.officer.office_id, name: auth.officer.office_name_en, nameHi: auth.officer.office_name_hi }, bills: bills.map((b) => Object.assign(billOut(b, pays), { online: online.filter((o) => o.bill_id === b.id).map((o) => onlineOut(o)), docs: docs[b.id] || [] })), pay });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedOfficer(request, env, { allowPaused: true });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await billingReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const bill = await env.DB.prepare("SELECT * FROM bills WHERE id = ? AND office_type = 'DEPT' AND office_id = ?" + (await officeBillFilter(env))).bind(String(b.billId || ""), String(auth.officer.office_id)).first();
  if (!bill) return json({ error: "NOT_FOUND" }, 404);
  const origin = new URL(request.url).origin;
  const r = b.action === "online" ? await startOnline(env, bill, auth.officer.email, b)
    : b.action === "online-done" ? await checkoutDone(env, origin, bill, b)
    : await reportPayment(env, origin, bill, b, auth.officer.email);
  return json(r.body, r.status);
}
