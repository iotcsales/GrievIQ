/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/webhooks/razorpay.js (grieviq-67)
//
// Razorpay's messages about payments ("webhook"). Address to give Razorpay:
//   https://grieviq.in/api/webhooks/razorpay
// Events to tick: payment.captured, payment.failed, order.paid.
//
// Every message is checked before anything is read from it: the
// X-Razorpay-Signature header must be the HMAC-SHA256 of the exact body with
// the webhook secret (RZP_WEBHOOK_SECRET). Even then GrievIQ does not take the
// message's word for the payment: it asks Razorpay for the order's payments
// and checks the amount (_shared/razorpay.js syncOrder). Razorpay may send
// the same message more than once and in any order; each message id is
// handled once, and settling a bill twice is impossible anyway.
// Answers quickly (Razorpay waits 5 seconds) with no details.

import { webhookSigOk, onlineReady, syncOrder } from "../../_shared/razorpay.js";

const reply = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const EVENT_ID = /^[A-Za-z0-9_-]{6,64}$/;

export async function onRequestPost({ request, env }) {
  if (!env.RZP_WEBHOOK_SECRET) return reply({ error: "NOT_SET_UP" }, 503);
  const len = Number(request.headers.get("content-length") || 0);
  if (len > 200000) return reply({ error: "TOO_LARGE" }, 413);
  const raw = await request.text();
  if (raw.length > 200000) return reply({ error: "TOO_LARGE" }, 413);
  if (!(await webhookSigOk(env, raw, request.headers.get("x-razorpay-signature")))) return reply({ error: "SIGNATURE" }, 401);
  if (!(await onlineReady(env))) return reply({ error: "NOT_READY" }, 503);
  let msg;
  try { msg = JSON.parse(raw); } catch (e) { return reply({ error: "BODY" }, 400); }
  const event = String(msg && msg.event || "").slice(0, 60);
  const evId = String(request.headers.get("x-razorpay-event-id") || "");
  if (evId && !EVENT_ID.test(evId)) return reply({ error: "EVENT_ID" }, 400);
  if (evId) {
    const seen = await env.DB.prepare("SELECT result FROM payment_webhook_events WHERE id = ?").bind(evId).first();
    if (seen) return reply({ ok: true, duplicate: true });
  }
  const pay = msg && msg.payload && msg.payload.payment && msg.payload.payment.entity;
  const order = msg && msg.payload && msg.payload.order && msg.payload.order.entity;
  const orderId = String((pay && pay.order_id) || (order && order.id) || "");
  let result = "IGNORED";
  if (["payment.captured", "payment.authorized", "order.paid", "payment.failed"].includes(event) && /^order_[A-Za-z0-9]{6,40}$/.test(orderId)) {
    const row = await env.DB.prepare("SELECT * FROM bill_online_payments WHERE order_id = ?").bind(orderId).first();
    if (!row) result = "UNKNOWN_ORDER";
    else {
      try {
        const r = await syncOrder(env, new URL(request.url).origin, row, "WEBHOOK", pay && pay.id);
        result = r.state;
      } catch (e) { result = "ERROR"; }
    }
  }
  // Remembered only when handled (an error is tried again when Razorpay resends).
  if (evId && result !== "ERROR") {
    try {
      await env.DB.prepare("INSERT OR IGNORE INTO payment_webhook_events (id, provider, event, received_at, result) VALUES (?, 'RAZORPAY', ?, ?, ?)")
        .bind(evId, event || "?", new Date().toISOString(), result).run();
    } catch (e) { /* handled either way */ }
  }
  // An error is answered 500 so that Razorpay sends the message again later.
  return result === "ERROR" ? reply({ error: "TRY_AGAIN" }, 500) : reply({ ok: true });
}

export async function onRequest() {
  return reply({ error: "POST only" }, 405);
}
