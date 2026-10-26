/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/quote.js (grieviq-70)
// GET /api/quote?ref=GIQ-QT-000001&k=<private key> -> the quotation, for the
// office to open and print from the link in its email. Without the right
// key: "not found" (the same answer whether or not the reference exists).

import { istToday } from "../_shared/site-settings.js";
import { quotesReady, quoteOut, sameKey } from "../_shared/quotes.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const ref = String(url.searchParams.get("ref") || ""), k = String(url.searchParams.get("k") || "");
  if (!/^GIQ-QT-\d{6}$/.test(ref) || !/^[0-9a-f]{48}$/.test(k) || !(await quotesReady(env))) return json({ error: "NOT_FOUND" }, 404);
  const q = await env.DB.prepare("SELECT * FROM quotations WHERE ref = ?").bind(ref).first();
  if (!q || !sameKey(q.view_key, k)) return json({ error: "NOT_FOUND" }, 404);
  return json({ ok: true, quotation: quoteOut(q, istToday(), false) });
}
