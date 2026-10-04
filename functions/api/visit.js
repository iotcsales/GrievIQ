// POST /api/visit   { path }
//
// Counts one page view on a citizen page, for the admin visitor map.
// Privacy-first, in the way of Plausible / Fathom analytics:
//  - no cookies and nothing stored on the device;
//  - the network address is never stored: a visitor is recognised for one
//    day only, by a one-way fingerprint made with that day's random secret
//    (deleted after the day, so fingerprints can't be linked to anyone);
//  - place is city level only, as Cloudflare reports it (its city centre,
//    rounded), never a precise location;
//  - browsers that send "Global Privacy Control" or "Do Not Track" are not
//    counted at all (site.js doesn't send the beacon; checked here too).
// Recent views are kept 2 days for the live map; daily totals 400 days.

import { fingerprint, todaysSalt, istDay } from "../_shared/daily-salt.js";

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|java\/|go-http|axios|node-fetch|okhttp/i;
// Only GrievIQ's own citizen pages are counted.
const PAGE = /^\/(index(\.html)?|submit(\.html)?|status(\.html)?|feedback(\.html)?|about(\.html)?|privacy(\.html)?|terms(\.html)?|help(\.html)?|accessibility(\.html)?|policies(\.html)?|sitemap(\.html)?|time-limits(\.html)?|lucknow\/[a-z0-9\-]{1,80})?$/;

const none = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
const text = (v, n) => String(v == null ? "" : v).normalize("NFC").replace(/[\u0000-\u001f]/g, "").trim().slice(0, n);
const round1 = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 10) / 10 : null; };

export async function onRequestPost({ request, env }) {
  const h = request.headers;
  const ua = (h.get("User-Agent") || "").slice(0, 300);
  if (!ua || BOT.test(ua) || h.get("Sec-GPC") === "1" || h.get("DNT") === "1") return none();
  let body = {};
  try { body = await request.json(); } catch (e) { return none(); }
  const path = String(body && body.path || "/").split(/[?#]/)[0].slice(0, 120);
  if (!PAGE.test(path)) return none();

  const cf = request.cf || {};
  const country = text(cf.country, 2).toUpperCase();
  const region = text(cf.region, 60);
  const city = text(cf.city, 60);
  const lat = round1(cf.latitude), lng = round1(cf.longitude);

  const DB = env.DB;
  const day = istDay();
  try {
    const salt = await todaysSalt(DB, day);
    const vid = await fingerprint(salt, ["visit", h.get("CF-Connecting-IP") || "", ua]);
    // Forget earlier days and old live-map views.
    await DB.prepare("DELETE FROM visit_fps WHERE day < ?").bind(day).run();
    await DB.prepare("DELETE FROM visit_events WHERE at < datetime('now', '-2 days')").run();

    const ins = await DB.prepare("INSERT OR IGNORE INTO visit_fps (fp, day) VALUES (?, ?)").bind(vid, day).run();
    const isNew = !!(ins && ins.meta && ins.meta.changes);
    await DB.prepare(
      `INSERT INTO visit_daily (day, visitors, pageviews) VALUES (?, ?, 1)
       ON CONFLICT(day) DO UPDATE SET visitors = visitors + excluded.visitors, pageviews = pageviews + 1`
    ).bind(day, isNew ? 1 : 0).run();
    if (isNew) {
      await DB.prepare(
        `INSERT INTO visit_city_daily (day, country, region, city, lat, lng, visitors) VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(day, country, region, city) DO UPDATE SET visitors = visitors + 1, lat = COALESCE(excluded.lat, lat), lng = COALESCE(excluded.lng, lng)`
      ).bind(day, country, region, city, lat, lng).run();
      // Once a day (the day's first visitor): drop totals older than 400 days.
      const first = await DB.prepare("SELECT visitors FROM visit_daily WHERE day = ?").bind(day).first();
      if (first && Number(first.visitors) === 1) {
        await DB.prepare("DELETE FROM visit_daily WHERE day < date('now', '-400 days')").run();
        await DB.prepare("DELETE FROM visit_city_daily WHERE day < date('now', '-400 days')").run();
      }
    }
    await DB.prepare(
      "INSERT INTO visit_events (at, vid, country, region, city, lat, lng) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)"
    ).bind(vid, country, region, city, lat, lng).run();
  } catch (e) {
    // Counting must never affect the citizen's page (e.g. tables not set up yet).
  }
  return none();
}
