/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/speed.js   (grieviq-47)
//
// Speed monitor. The site-wide middleware records about 1 in 20 requests
// to /api/ (the part of GrievIQ, how long it took, whether it failed: no
// person, address or case), after the response has been sent. Every hour
// the scheduler turns the samples into hourly figures per part of GrievIQ
// (the time within which 95 of every 100 requests finished, "p95"), keeps
// them 30 days and deletes raw samples after 2 days. When a part has been
// slower than SLOW_MS for 2 hours in a row, every super admin gets one email
// that day (numbers only). Storage: part31.

export const SAMPLE_EVERY = 20;
export const SLOW_MS = 500;
export const AREAS = ["CITIZEN", "REP", "DEPT", "ADMIN"];
export const DB_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;   // Cloudflare D1, paid plan
export const DB_WARN_BYTES = 5 * 1024 * 1024 * 1024;
const MIN_SAMPLES = 5;   // fewer than this in an hour is too few to judge

const CITIZEN = /^\/api\/(otp\/|grievances\/(submit|upload-photo|rate|confirm-resolution|dispute-resolution|reopen)$|intake-options$|resolve-ward$|place$|similar$|photo-place-check$|citizen-updates$|feedback\/|demand$|site-info$|pilot-request$|photo$|visit$)/;
// Which part of GrievIQ a request belongs to (null = not measured).
export function areaOf(pathname) {
  const p = String(pathname || "");
  if (!p.startsWith("/api/") || p === "/api/b") return null;
  if (p.startsWith("/api/admin/")) return "ADMIN";
  if (p.startsWith("/api/dept/")) return "DEPT";
  if (CITIZEN.test(p)) return "CITIZEN";
  return "REP";
}

export async function recordSample(env, area, ms, failed, nowMs) {
  if (!env || !env.DB || !AREAS.includes(area)) return;
  try {
    await env.DB.prepare("INSERT INTO speed_samples (at, area, ms, failed) VALUES (?, ?, ?, ?)")
      .bind(new Date(nowMs || Date.now()).toISOString(), area, Math.max(0, Math.round(ms)), failed ? 1 : 0).run();
  } catch (e) { /* before part31, or a busy moment: never in the way */ }
}

// Called by the middleware: about 1 in SAMPLE_EVERY requests, after sending.
export function maybeSample(context, pathname, startedMs, status) {
  const area = areaOf(pathname);
  if (!area || Math.random() * SAMPLE_EVERY >= 1) return;
  const p = recordSample(context.env, area, Date.now() - startedMs, status >= 500);
  if (context.waitUntil) context.waitUntil(p);
}

function pct(sorted, q) { if (!sorted.length) return 0; return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]; }
const hourOf = (ms) => new Date(Math.floor(ms / 3600000) * 3600000).toISOString().slice(0, 13) + ":00";

export async function speedReady(env) {
  try { await env.DB.prepare("SELECT 1 FROM speed_hourly LIMIT 1").all(); return true; } catch (e) { return false; }
}

// Hourly: summarise the last 6 finished hours (re-summarising is harmless),
// tidy old rows, and send the slow alert when due.
export async function runSpeed(env, nowMs, sendEmail) {
  if (!(await speedReady(env))) return { skipped: true };
  const now = nowMs || Date.now();
  const thisHour = Math.floor(now / 3600000) * 3600000;
  const from = new Date(thisHour - 6 * 3600000).toISOString();
  const to = new Date(thisHour).toISOString();
  const { results } = await env.DB.prepare("SELECT at, area, ms, failed FROM speed_samples WHERE at >= ? AND at < ? ORDER BY ms").bind(from, to).all();
  const groups = new Map();
  for (const r of results || []) {
    const k = hourOf(Date.parse(r.at)) + "|" + r.area;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const stmts = [];
  for (const [k, rows] of groups) {
    const [hour, area] = k.split("|");
    const ms = rows.map((r) => r.ms);   // already in order
    stmts.push(env.DB.prepare("INSERT OR REPLACE INTO speed_hourly (hour, area, n, p50, p95, max_ms, failed) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(hour, area, ms.length, pct(ms, 0.5), pct(ms, 0.95), ms[ms.length - 1], rows.filter((r) => r.failed).length));
  }
  stmts.push(env.DB.prepare("DELETE FROM speed_samples WHERE at < ?").bind(new Date(now - 2 * 86400000).toISOString()));
  stmts.push(env.DB.prepare("DELETE FROM speed_hourly WHERE hour < ?").bind(hourOf(now - 30 * 86400000)));
  await env.DB.batch(stmts);
  const st = await speedStatus(env, now);
  let alerted = false;
  if (st.status === "SLOW" && sendEmail) alerted = await slowAlert(env, st, now, sendEmail);
  return { hours: groups.size, status: st.status, alerted };
}

// The status in plain words, from the last 2 finished hours.
//   FAST            every part within SLOW_MS (or too little traffic to judge)
//   GETTING_SLOWER  a part was slow in the last hour only
//   SLOW            a part was slow in both of the last 2 hours
export async function speedStatus(env, nowMs) {
  const now = nowMs || Date.now();
  const h1 = hourOf(now - 3600000), h2 = hourOf(now - 7200000);
  const { results } = await env.DB.prepare("SELECT hour, area, n, p95 FROM speed_hourly WHERE hour IN (?, ?)").bind(h1, h2).all();
  const get = (h, a) => (results || []).find((r) => r.hour === h && r.area === a) || null;
  const slow = [], slower = [];
  let any = false;
  for (const a of AREAS) {
    const last = get(h1, a), prev = get(h2, a);
    if (last && last.n >= MIN_SAMPLES) any = true;
    const lastSlow = last && last.n >= MIN_SAMPLES && last.p95 > SLOW_MS;
    const prevSlow = prev && prev.n >= MIN_SAMPLES && prev.p95 > SLOW_MS;
    if (lastSlow && prevSlow) slow.push({ area: a, p95: last.p95, prevP95: prev.p95 });
    else if (lastSlow) slower.push({ area: a, p95: last.p95 });
  }
  return { status: slow.length ? "SLOW" : slower.length ? "GETTING_SLOWER" : any ? "FAST" : "NO_DATA", slow, slower, hour: h1 };
}

const AREA_EN = { CITIZEN: "citizen pages", REP: "representative console", DEPT: "department dashboard", ADMIN: "admin console" };
async function slowAlert(env, st, now, sendEmail) {
  const day = new Date(now + 5.5 * 3600000).toISOString().slice(0, 10);   // one email per India day
  try {
    const r = await env.DB.prepare("INSERT OR IGNORE INTO speed_alerts (day, at, detail) VALUES (?, ?, ?)").bind(day, new Date(now).toISOString(), JSON.stringify(st.slow)).run();
    if (!r.meta || !r.meta.changes) return false;   // already sent today
  } catch (e) { return false; }
  let to = [];
  try { const { results } = await env.DB.prepare("SELECT email FROM admin_users WHERE role = 'super_admin' AND left_at IS NULL").all(); to = (results || []).map((x) => x.email); } catch (e) { to = []; }
  const lines = st.slow.map((s) => `${AREA_EN[s.area]}: ${(s.p95 / 1000).toFixed(1)} s`).join(", ");
  const origin = env.SITE_ORIGIN || "https://grieviq.in";
  const html = `<p>GrievIQ has been slow for 2 hours in a row: <b>${lines}</b> (95 of every 100 requests finished within this time; the target is ${(SLOW_MS / 1000).toFixed(1)} s).</p>` +
    `<p>See the details in the admin console: <a href="${origin}/admin-speed.html">Speed</a>.</p>` +
    `<hr><p>GrievIQ लगातार 2 घंटे से धीमा है: <b>${lines}</b>। विवरण एडमिन कंसोल के "गति" पृष्ठ पर देखें।</p>`;
  let n = 0;
  for (const e of to) { try { if (await sendEmail(env, e, `GrievIQ is running slow: ${lines}`, html)) n++; } catch (x) { /* next */ } }
  return n > 0 || to.length === 0;
}

// Database size in bytes (Cloudflare reports it with every query).
export async function dbSize(env) {
  try { const r = await env.DB.prepare("SELECT 1").run(); const s = r && r.meta && Number(r.meta.size_after); return s > 0 ? s : null; } catch (e) { return null; }
}
