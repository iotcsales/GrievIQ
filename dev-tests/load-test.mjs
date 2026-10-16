/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// dev-tests/load-test.mjs   (grieviq-47)
//
// Load test: a rush of citizens filing complaints while offices open their
// consoles, and how fast GrievIQ answered.
//
//   node dev-tests/load-test.mjs                        (the local test copy)
//   node dev-tests/load-test.mjs --citizens 500 --offices 40 --concurrency 100
//   node dev-tests/load-test.mjs --url https://staging.example.pages.dev --staging
//
// SAFETY: it files real complaints in whatever copy it points at, so it
// refuses GrievIQ's live addresses. Another address needs --staging (a
// separate copy with its own database, never the live one).
// Offices are signed in with the test copy's "test-email" header, so the
// office part runs only on the local test copy.

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const URL0 = String(args.url || "http://localhost:8788").replace(/\/$/, "");
const CITIZENS = Number(args.citizens || 200), OFFICES = Number(args.offices || 20), CONC = Number(args.concurrency || 50);
const WARD = String(args.ward || "lu-hazratganj"), CATEGORY = String(args.category || "water-sanitation");
// Test-copy offices: email and the office key the console sends for its Overview.
const OFFICES_LIST = String(args["office-emails"] || "r1@x.in=LOCAL:lu-hazratganj,om@x.in=LOCAL:lu-hazratganj,r2@x.in=LOCAL:lu-tilak").split(",").map((x) => x.split("="));

const host = new URL(URL0).hostname.toLowerCase();
const LIVE = [atob("Z3JpZXZpcS5pbg=="), "www." + atob("Z3JpZXZpcS5pbg=="), atob("Z3JpZXZpcS5wYWdlcy5kZXY=")];
if (LIVE.includes(host)) { console.error("Refused: " + host + " is GrievIQ's live site. Load tests must never run on live data."); process.exit(2); }
const local = host === "localhost" || host === "127.0.0.1";
if (!local && !args.staging) { console.error("Refused: " + host + " is not the local test copy. If it is a separate staging copy with its own database, add --staging."); process.exit(2); }

const results = {};
async function timed(kind, fn) {
  const t0 = performance.now();
  let ok = false;
  try { const r = await fn(); ok = r.ok; await r.arrayBuffer().catch(() => null); } catch (e) { ok = false; }
  const ms = performance.now() - t0;
  (results[kind] = results[kind] || []).push({ ms, ok });
}
async function pool(tasks, n) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => { while (i < tasks.length) { const t = tasks[i++]; await t(); } }));
}
const run = Date.now().toString(36);
const tasks = [];
for (let i = 0; i < CITIZENS; i++) {
  const phone = "9" + String(100000000 + Math.floor(Math.random() * 899999999)).slice(0, 9);
  tasks.push(() => timed("citizen: open the form", () => fetch(URL0 + "/api/intake-options")));
  tasks.push(() => timed("citizen: file a complaint", () => fetch(URL0 + "/api/grievances/submit", {
    method: "POST", headers: { "content-type": "application/json", "user-agent": "loadtest-" + run + "-" + i, "cf-connecting-ip": "10.77." + (i % 250) + "." + (i % 200) },
    body: JSON.stringify({ category_id: CATEGORY, local_unit_id: WARD, description: "Load test complaint " + i + ": water pipe leaking near the park gate", citizen_phone: phone, consent: true, form_loaded_at: Date.now() - 60000, lang: "en" }),
  })));
}
if (local) for (let i = 0; i < OFFICES; i++) {
  const [email, office] = OFFICES_LIST[i % OFFICES_LIST.length];
  tasks.push(() => timed("office: open the console", () => fetch(URL0 + "/api/grievances?closed=50", { headers: { "test-email": email } })));
  if (office) tasks.push(() => timed("office: overview", () => fetch(URL0 + "/api/overview?office=" + encodeURIComponent(office), { headers: { "test-email": email } })));
}
// Mix the work so citizens and offices arrive together.
tasks.sort(() => Math.random() - 0.5);

console.log(`Load test on ${URL0}: ${CITIZENS} citizens filing, ${local ? OFFICES : 0} office visits, ${CONC} at a time…`);
const t0 = performance.now();
await pool(tasks, CONC);
const secs = (performance.now() - t0) / 1000;
const pct = (a, q) => { const s = a.map((x) => x.ms).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] : 0; };
const rows = Object.entries(results).map(([k, a]) => ({
  "what": k, "requests": a.length, "failed": a.filter((x) => !x.ok).length,
  "typical (s)": (pct(a, 0.5) / 1000).toFixed(2), "95 of 100 within (s)": (pct(a, 0.95) / 1000).toFixed(2), "slowest (s)": (pct(a, 1) / 1000).toFixed(2),
}));
console.table(rows);
const all = Object.values(results).flat();
console.log(`${all.length} requests in ${secs.toFixed(1)} s (${(all.length / secs).toFixed(0)} a second); ${all.filter((x) => !x.ok).length} failed.`);
console.log(local ? "Measured on the local test copy (SQLite on this computer), not on Cloudflare: treat as a guide." : "Measured on the staging copy.");
process.exit(all.some((x) => !x.ok) && args.strict ? 1 : 0);
