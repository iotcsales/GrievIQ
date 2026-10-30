/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/tax-doc?id=<doc>&k=<key>   (grieviq-76, public with the private key)
// A GST tax invoice, credit note, receipt voucher or refund voucher, for the
// person it was issued to: the link in their email, on the office's Billing
// tab or on the helper's page. Without the right key: NOT_FOUND.

import { docOut } from "../_shared/tax-docs.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" } });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").slice(0, 60), k = String(url.searchParams.get("k") || "").slice(0, 64);
  if (!id || !/^[0-9a-f]{32}$/.test(k)) return json({ error: "NOT_FOUND" }, 404);
  let r = null;
  try { r = await env.DB.prepare("SELECT * FROM tax_docs WHERE id = ? AND view_key = ?").bind(id, k).first(); } catch (e) { r = null; }
  if (!r) return json({ error: "NOT_FOUND" }, 404);
  let ref = null;
  if (r.ref_doc_id) { const x = await env.DB.prepare("SELECT * FROM tax_docs WHERE id = ?").bind(r.ref_doc_id).first(); if (x) ref = { number: x.number, date: x.doc_date, kind: x.kind }; }
  return json({ doc: docOut(r), ref });
}
