/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// GET /api/similar?unit=<ward id>&category=<category id>[&lat=&lng=]
//
// grieviq-86: also up to 5 of those complaints, so someone with the same
// problem can follow one ("this is my problem too") instead of filing it
// again: a short code for each (never its reference or id), how many days
// old, whether it was acknowledged, and (when both have a map spot) about
// how far away it is. Nothing the citizen wrote, and no place.
//
// "Already reported?" on the complaint form: how many complaints of the
// same kind are already open in the same ward, and how old the oldest is.
// Public and anonymous: it returns only a count and a number of days --
// never a description, a place, a reference number or anything about who
// filed them (Home already shows each ward's 30-day totals publicly).

import { supportKey, distanceM } from "../_shared/case-tools.js";

const ID = /^[A-Za-z0-9_\-]{1,64}$/;
const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=60" },
});

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const unit = url.searchParams.get("unit") || "";
  const category = url.searchParams.get("category") || "";
  if (!ID.test(unit) || !ID.test(category)) return json({ error: "Bad request." }, 400);
  let row;
  try {
    row = await env.DB.prepare(
      `SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM grievances
        WHERE local_unit_id = ? AND category_id = ?
          AND status NOT IN ('RESOLVED', 'CLOSED', 'PENDING_CONFIRMATION')`
    ).bind(unit, category).first();
  } catch (e) {
    return json({ open: 0, oldestDays: null });
  }
  const n = Number(row && row.n) || 0;
  let oldestDays = null;
  if (n && row.oldest) {
    const s = String(row.oldest);
    const ms = new Date(s.indexOf("T") !== -1 ? s : s.replace(" ", "T") + "Z").getTime();
    if (!isNaN(ms)) oldestDays = Math.max(0, Math.floor((Date.now() - ms) / 86400000));
  }
  let cases = [];
  if (n) {
    try {
      const lat = Number(url.searchParams.get("lat")), lng = Number(url.searchParams.get("lng"));
      const here = Number.isFinite(lat) && Number.isFinite(lng) && url.searchParams.get("lat") ? { lat, lng } : null;
      const { results } = await env.DB.prepare(
        `SELECT id, created_at, acknowledged_at, pin_lat, pin_lng FROM grievances
          WHERE local_unit_id = ? AND category_id = ? AND status IN ('OPEN', 'ACKNOWLEDGED')
          ORDER BY created_at DESC LIMIT 50`
      ).bind(unit, category).all();
      const now = Date.now();
      cases = await Promise.all((results || []).map(async (r) => {
        const s = String(r.created_at || "");
        const ms = new Date(s.indexOf("T") !== -1 ? s : s.replace(" ", "T") + "Z").getTime();
        let dist = null;
        if (here && r.pin_lat != null && r.pin_lng != null) {
          const d = distanceM(here.lat, here.lng, Number(r.pin_lat), Number(r.pin_lng));
          if (d <= 3000) dist = d < 1000 ? Math.max(10, Math.round(d / 10) * 10) : Math.round(d / 100) * 100;
        }
        return { k: await supportKey(r.id), days: isNaN(ms) ? null : Math.max(0, Math.floor((now - ms) / 86400000)), ack: !!r.acknowledged_at, dist };
      }));
      cases.sort((a, b) => (a.dist == null) - (b.dist == null) || (a.dist || 0) - (b.dist || 0) || (a.days || 0) - (b.days || 0));
      cases = cases.slice(0, 5);
    } catch (e) { cases = []; }
  }
  return json({ open: n, oldestDays, cases });
}
