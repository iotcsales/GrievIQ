// Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt.
// dev-tests/demo-build.mjs (grieviq-81): builds the data behind the public demos.
//
//   node dev-tests/demo-build.mjs <repo>
//
// 1. Makes a throw-away database in /tmp/grieviq-demo from the same SQL files as the tests, plus
//    demo-seed.sql (invented city, wards, village, offices and people).
// 2. Starts the dev server on it (port 8790) and creates the complaints through GrievIQ's own
//    API, so every screen shows exactly what the real console would: new, late, with a field
//    worker, forwarded, replied, sent back, waiting for approval, waiting for the citizen, closed
//    and rated, and complaints that have moved up to the Mayor, MLA and MP.
// 3. demo-record.py then opens the consoles and saves what they read (public/demo/).
// Nothing here ever touches the live database.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(process.argv[2] || ".");
const HERE = path.join(REPO, "dev-tests");
const WORK = "/tmp/grieviq-demo";
const DB = path.join(WORK, "demo.db");
const PORT = 8790, B = "http://localhost:" + PORT;
const IMG = process.env.DEMO_IMG || "/tmp/demo81/img";

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

// ---- 1. the database: the same files as setup.sh, then the demo seed ----
const setup = fs.readFileSync(path.join(HERE, "setup.sh"), "utf8");
const files = JSON.parse("[" + /for f in \[([^\]]+)\]/.exec(setup)[1].replace(/'/g, '"') + "]").map((f) => (f === "seed.sql" ? "demo-seed.sql" : f));
execFileSync("python3", ["-c", `
import sqlite3, sys, os, re, datetime
db, here, files = sys.argv[1], sys.argv[2], sys.argv[3].split(",")
c = sqlite3.connect(db)
for f in files: c.executescript(open(os.path.join(here, f), encoding="utf-8").read())
pol = open(os.path.join(here, "..", "functions", "_shared", "staff-policies.js"), encoding="utf-8").read()
vers = dict(re.findall(r'^\\s*([A-Z_]+): "(\\d{4}-\\d\\d-\\d\\d)",', re.search(r"POLICY_VERSIONS = \\{([^}]*)\\}", pol).group(1), re.M))
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
for (aid,) in c.execute("SELECT id FROM admin_users").fetchall():
    for k, v in vers.items():
        c.execute("INSERT INTO staff_policy_acceptances (id, admin_id, policy, version, accepted_at) VALUES (?, ?, ?, ?, ?)", ("seed-" + aid + "-" + k, aid, k, v, now))
c.commit()
`, DB, HERE, files.join(",")], { stdio: "inherit" });

// ---- 2. the server ----
const srv = spawn("node", ["--no-warnings", path.join(HERE, "server.mjs"), REPO, DB, String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok) => srv.stdout.on("data", (d) => { if (/listening/.test(String(d))) ok(); }));
process.on("exit", () => { if (!process.env.DEMO_KEEP) try { srv.kill(); } catch (e) { /* gone */ } });
process.on("uncaughtException", (e) => { console.error(e); process.exit(1); });
const { DatabaseSync } = await import("node:sqlite");
const sdb = new DatabaseSync(DB); sdb.exec("PRAGMA busy_timeout = 5000");

const C = "councillor@demo.grieviq.in", OM = "manager@demo.grieviq.in", FW = "field1@demo.grieviq.in", FW2 = "field2@demo.grieviq.in";
const PR = "pradhan@demo.grieviq.in", FWV = "fieldv@demo.grieviq.in", SA = "super@demo.grieviq.in";
async function call(who, method, p, body, cookie) {
  if (process.env.DEMO_LOG) console.log(method, p);
  const h = { "content-type": "application/json" };
  if (who) h["test-email"] = who;
  if (cookie) h.cookie = cookie;
  const r = await fetch(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) { /* not json */ }
  if (r.status >= 300) throw new Error(method + " " + p + " -> " + r.status + " " + JSON.stringify(j));
  return j;
}
async function upload(who, p, file, cookie) {
  const fd = new FormData();
  const buf = fs.readFileSync(path.join(IMG, file));
  fd.append("photo", new Blob([buf], { type: "image/jpeg" }), "photo.jpg");
  fd.append("thumb", new Blob([buf], { type: "image/jpeg" }), "thumb.jpg");
  const h = {}; if (who) h["test-email"] = who; if (cookie) h.cookie = cookie;
  const r = await fetch(B + p, { method: "POST", headers: h, body: fd });
  const j = await r.json();
  if (r.status >= 300) throw new Error("upload " + p + " -> " + r.status + " " + JSON.stringify(j));
  return j.id || j.photoId || (j.photo && j.photo.id);
}
let n = 0;
async function file(unit, cat, text, place, photo, email) {
  n++; if (process.env.DEMO_LOG) console.log("file", n);
  const ids = photo ? [await upload("", "/api/grievances/upload-photo", photo)] : [];
  const r = await fetch(B + "/api/grievances/submit", { method: "POST", headers: { "content-type": "application/json", "user-agent": "demo-" + n, "cf-connecting-ip": "10.81.0." + n },
    body: JSON.stringify({ category_id: cat, local_unit_id: unit, description: text, location_detail: place, citizen_phone: "90000" + String(10000 + n), citizen_email: email === false ? "" : "citizen" + n + "@demo.grieviq.in",
      consent: true, form_loaded_at: Date.now() - 60000, lang: "en", photo_ids: ids }) });
  const j = await r.json();
  if (r.status !== 200) throw new Error("file: " + JSON.stringify(j));
  // grieviq-82: most demo citizens confirmed their phone (SMS code) or email; a few not yet.
  sdb.prepare("UPDATE grievances SET contact_verified = ? WHERE tracking_ref = ?").run(n % 5 === 0 ? null : n % 3 === 0 ? "EMAIL" : "PHONE", j.tracking_ref);
  return sdb.prepare("SELECT id, tracking_ref FROM grievances WHERE tracking_ref = ?").get(j.tracking_ref);
}
const DAY = 86400000, HOUR = 3600000;
const iso = (ms) => new Date(ms).toISOString();
// Move a case's whole history back in time by `ms` (filing, every step and every log line).
function age(g, ms) {
  const tables = [["grievances", "id", ["created_at", "updated_at", "acknowledged_at", "resolved_at", "citizen_confirmed_at", "closed_at", "consent_at"]],
    ["grievance_audit", "grievance_id", ["created_at"]], ["case_assignments", "grievance_id", ["assigned_at", "ended_at"]],
    ["case_dept_steps", "grievance_id", ["created_at", "overdue_notified_at"]], ["resolution_photos", "grievance_id", ["created_at"]], ["resolution_reports", "grievance_id", ["created_at", "reviewed_at"]],
    ["complaint_photos", "grievance_id", ["created_at"]], ["case_ratings", "grievance_id", ["submitted_at", "updated_at", "round_closed_at"]],
    ["notifications", "grievance_id", ["created_at", "due_at", "read_at", "seen_at"]], ["team_activity", "grievance_id", ["created_at"]],
    ["grievance_events", "grievance_id", ["created_at"]], ["dept_access_log", "grievance_id", ["created_at"]], ["notify_state", "grievance_id", ["updated_at"]]];
  for (const [t, k, cols] of tables) {
    let have; try { have = sdb.prepare("SELECT name FROM pragma_table_info(?)").all(t).map((r) => r.name); } catch (e) { continue; }
    // This throw-away database only: lift the "records can't be changed" rules while moving dates back.
    const trig = sdb.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?").all(t);
    for (const tr of trig) sdb.exec("DROP TRIGGER " + tr.name);
    for (const c of cols) if (have.includes(c)) {
      sdb.prepare(`UPDATE ${t} SET ${c} = strftime('%Y-%m-%dT%H:%M:%fZ', julianday(${c}) - ?) WHERE ${k} = ? AND ${c} IS NOT NULL`).run(ms / DAY, g.id);
    }
    for (const tr of trig) sdb.exec(tr.sql);
  }
}

// ---- department offices: water on the dashboard, electricity reached by phone ----
const today = new Date().toISOString().slice(0, 10), now = new Date().toISOString();
const mkOffice = (id, name, nameHi, dept, phone) => sdb.prepare("INSERT INTO dept_offices (id, area_id, name_en, name_hi, departments, office_phone, source, last_checked, created_at, created_by, updated_at, updated_by) VALUES (?, 'demo-city', ?, ?, ?, ?, 'demo', ?, ?, 'demo', ?, 'demo')")
  .run(id, name, nameHi, JSON.stringify([dept]), phone, today, now, now);
mkOffice("do-water", "Demo Jal Sansthan, Zone 1", "डेमो जल संस्थान, ज़ोन 1", "Water Supply", "0100 000 001");
mkOffice("do-power", "Demo Vidyut Vitran, Division 2", "डेमो विद्युत वितरण, खंड 2", "Electricity", "0100 000 002");
mkOffice("do-sanit", "Demo City Sanitation Cell", "डेमो नगर स्वच्छता प्रकोष्ठ", "Sanitation / Garbage", "0100 000 003");
mkOffice("do-roads", "Demo Public Works, City Division", "डेमो लोक निर्माण, नगर खंड", "Roads & Public Works", "0100 000 004");
const OFF = "je.water@demo.grieviq.in";
await call(SA, "POST", "/api/admin/dept-officers", { action: "agreement_save", officeId: "do-water", signedOn: iso(Date.now() - 60 * DAY).slice(0, 10), signedBy: "Demo Executive Engineer", documentRef: "DEMO/AGR/1, signed copy in the office file" });
await call(SA, "POST", "/api/admin/dept-officers", { action: "officer_add", officeId: "do-water", name: "Anil Mehra", designation: "Junior Engineer, Zone 1", email: OFF });
// The officer signs in with an emailed code, then accepts the rules.
await call("", "POST", "/api/dept/code", { email: OFF });
const mail = fs.readFileSync(path.join(WORK, "mail.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((m) => m.to && m.to[0] === OFF).pop();
const code = /letter-spacing:4px">(\d{6})</.exec(mail.html)[1];
const vr = await fetch(B + "/api/dept/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: OFF, code }) });
const deptCookie = (vr.headers.get("set-cookie") || "").split(";")[0];
fs.writeFileSync(path.join(WORK, "dept-cookie.txt"), deptCookie);
const rules = await call("", "GET", "/api/dept/rules", null, deptCookie);
await call("", "POST", "/api/dept/rules", { version: rules.version, agree: true }, deptCookie);
const dReply = (g, b) => call("", "POST", "/api/dept/reply", Object.assign({ id: g.id }, b), deptCookie);
const dPhoto = (g, f) => upload("", "/api/dept/photo?id=" + g.id, f, deptCookie);
const ack = (g, who) => call(who || C, "POST", "/api/grievances/" + g.id + "/acknowledge");
const assign = (g, to) => call(C, "POST", "/api/grievances/" + g.id + "/assign", { email: to });
const fwd = (g, dept, office, channel, note, who) => call(who || C, "POST", "/api/grievances/" + g.id + "/add-followup", { department: dept, officeId: office, channel, note });
const step = (g, b, who) => call(who || C, "POST", "/api/grievances/" + g.id + "/dept-step", b);
const rPhoto = (g, f, who) => upload(who || C, "/api/grievances/" + g.id + "/resolution-photo", f);
const resolve = (g, note, photos, who) => call(who || C, "POST", "/api/grievances/" + g.id + "/mark-resolved", { note, photoIds: photos });

// ---- the ward office's complaints (Ward 1, Demo Nagar) ----
// 1. New, just filed
const g1 = await file("dw-1", "water-sanitation", "No water in the taps in Lane 3 since yesterday morning. About 20 houses are affected.", "Lane 3, behind the community hall", "leak-before.jpg");
age(g1, 2 * HOUR);
// 2. New and already late to acknowledge
const g2 = await file("dw-1", "streetlight", "The street light at the park gate has not worked for a week. The lane is completely dark at night.", "Park gate, Demo Nagar", "light-before.jpg");
age(g2, 2 * DAY);
// 3. Acknowledged, with a field worker
const g3 = await file("dw-1", "garbage", "Garbage has not been collected from the corner of Block B for four days and it is spreading onto the road.", "Corner of Block B", "garbage-before.jpg");
await ack(g3); await assign(g3, FW); age(g3, 1 * DAY);
// 4. Forwarded to the water office (on the dashboard); it replied with a date
const g4 = await file("dw-1", "water-sanitation", "A water pipe is leaking on Main Road near the bus stop and the road is flooding.", "Main Road, near the bus stop", "leak-before.jpg");
await ack(g4); await fwd(g4, "Water Supply", "do-water", "DASHBOARD", "Please send a team to repair the leak.");
await dReply(g4, { kind: "SCHEDULED", expectedDate: iso(Date.now() + 2 * DAY).slice(0, 10), note: "Repair team booked; the road will need a short closure." });
age(g4, 2 * DAY);
// 5. Forwarded to public works by phone, now past the department's target
const g5 = await file("dw-1", "roads", "The road outside Sector 4 was dug up for a cable two weeks ago and never repaired.", "Sector 4, Demo Nagar", "road-before.jpg");
await ack(g5); await fwd(g5, "Roads & Public Works", "do-roads", "PHONE", "Spoke to the city division; they will send a team to refill the trench.");
age(g5, 9 * DAY);
// 6. The water office says the work is done, with photos: waiting for the check on the spot
const g6 = await file("dw-1", "water-sanitation", "Sewer overflowing outside house 14, Gali 2. The smell is very bad.", "Gali 2, near house 14", "leak-before.jpg");
await ack(g6); await fwd(g6, "Water Supply", "do-water", "DASHBOARD", "Overflowing sewer, please clear the line.");
{ const p = await dPhoto(g6, "leak-after.jpg"); await dReply(g6, { kind: "DONE_CLAIMED", photoIds: [p], note: "Line cleared with the jetting machine." }); }
age(g6, 3 * DAY);
// 7. Checked on the spot, only partly fixed: sent back to the water office
const g7 = await file("dw-1", "water-sanitation", "Dirty water coming from the taps in Block C for three days.", "Block C, Demo Nagar", null);
await ack(g7); await assign(g7, FW); await fwd(g7, "Water Supply", "do-water", "DASHBOARD", "Residents report dirty water; please check the line.");
{ const p = await dPhoto(g7, "leak-after.jpg"); await dReply(g7, { kind: "DONE_CLAIMED", photoIds: [p], note: "Line flushed." }); }
{ const p = await rPhoto(g7, "leak-before.jpg", FW); await step(g7, { kind: "CHECK_PARTLY", note: "Water is clearer but still not clean at the end of the lane.", photoIds: [p] }, FW); }
age(g7, 5 * DAY);
// 8. A field worker's fix report, waiting for approval
const g8 = await file("dw-1", "roads", "A deep pothole on Station Road near the school. Two scooters have fallen this week.", "Station Road, near the school gate", "road-before.jpg");
await ack(g8); await assign(g8, FW2);
{ const p = await rPhoto(g8, "road-after.jpg", FW2); await resolve(g8, "Pothole filled and levelled by the ward team.", [p], FW2); }
age(g8, 6 * DAY);
// 9. Resolved: waiting for the citizen to confirm
const g9 = await file("dw-1", "garbage", "The garbage bin at the market is broken and overflowing.", "Demo Nagar market", "garbage-before.jpg");
await ack(g9); await fwd(g9, "Sanitation / Garbage", "do-sanit", "PHONE", "Asked for a new bin and extra pickup.");
{ const p = await rPhoto(g9, "garbage-after.jpg"); await resolve(g9, "New bins placed and the area cleaned.", [p]); }
age(g9, 3 * DAY);
// 10. Closed: confirmed by the citizen and rated
const g10 = await file("dw-1", "streetlight", "Three street lights on Temple Road are off.", "Temple Road", "light-before.jpg");
await ack(g10); await assign(g10, FW);
{ const p = await rPhoto(g10, "light-after.jpg"); await resolve(g10, "Lights repaired with the electricity office.", [p]); }
sdb.prepare("INSERT INTO grievance_otp (id, phone, otp_code, purpose, verified, expires_at, email, channel, verified_at) VALUES ('demo-otp', '', '', 'STATUS_CHECK', 1, ?, 'citizen10@demo.grieviq.in', 'EMAIL', ?)").run(new Date().toISOString(), new Date().toISOString());
await call("", "POST", "/api/grievances/confirm-resolution", { email: "citizen10@demo.grieviq.in", trackingRef: g10.tracking_ref });
await call("", "POST", "/api/grievances/rate", { email: "citizen10@demo.grieviq.in", trackingRef: g10.tracking_ref, office: "SATISFIED", comment: "Fixed in two days. Thank you." });
age(g10, 9 * DAY);
// 11-13. Not resolved in time: moved up to the Mayor, the MLA and the MP
const g11 = await file("dw-1", "water-sanitation", "The handpump near the primary school has not worked for over a week.", "Primary school, Demo Nagar", null);
await ack(g11); age(g11, 9 * DAY);
const g12 = await file("dw-2", "water-sanitation", "Drain on Canal Road blocked; water stands on the road after every rain.", "Canal Road, Demo Bazaar", "leak-before.jpg");
age(g12, 16 * DAY);
const g13 = await file("dw-3", "water-sanitation", "No piped water in the new houses of Demo Colony Phase 2.", "Phase 2, Demo Colony", null);
age(g13, 24 * DAY);
// A few more in the other wards, so the Mayor's, MLA's and MP's figures have something in every row
for (const [u, c, t, d] of [["dw-2", "garbage", "Garbage dumped on the empty plot next to the park.", 4], ["dw-2", "streetlight", "Street light flickering on Bazaar Lane.", 1], ["dw-3", "roads", "Broken footpath tiles outside the bank.", 5], ["dw-3", "garbage", "Bins not emptied near the dispensary.", 2]]) {
  const g = await file(u, c, t, null, null); age(g, d * DAY);
}

// ---- the village (Demo Gaon) ----
const v1 = await file("dv-1", "water-sanitation", "The handpump near the panchayat bhawan gives no water.", "Near the panchayat bhawan", null);
await ack(v1, PR); age(v1, 1 * DAY);
const v2 = await file("dv-1", "streetlight", "The solar street light at the bus stop is broken.", "Bus stop, Demo Gaon", "light-before.jpg", false);
age(v2, 3 * HOUR);
const v3 = await file("dv-1", "roads", "The village road to the fields is broken after the rains.", "Road to the fields", "road-before.jpg");
await ack(v3, PR); await fwd(v3, "Roads & Public Works", "do-roads", "LETTER", "Letter sent to the division office.", PR); age(v3, 6 * DAY);

const counts = sdb.prepare("SELECT status, current_tier, COUNT(*) n FROM grievances GROUP BY 1, 2").all();
console.log("demo data ready", JSON.stringify(counts));
// ---- 3. record what the consoles read ----
// Every GET the page makes is saved (JSON as it came back; photos as files). demo-mode.js plays
// them back, moving every date forward by the time since recording, so "filed 2 hours ago" stays
// true whenever the demo is opened.
const { chromium } = (await import("node:module")).createRequire(import.meta.url)("playwright");
const OUT = path.join(REPO, "public", "demo");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "img"), { recursive: true });
const photoMap = new Map();
const VOLATILE = new Set(["from", "to", "_", "t", "ts", "e", "s", "v"]);
const keyOf = (u) => {
  const url = new URL(u);
  const q = [...url.searchParams.entries()].filter(([k]) => !VOLATILE.has(k)).sort().map(([k, v]) => k + "=" + v).join("&");
  return url.pathname + (q ? "?" + q : "");
};
async function record(name, setup, walk) {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  await setup(ctx);
  const got = {};
  await ctx.route("**/api/**", async (route) => {
    const req = route.request();
    const resp = await route.fetch();
    const u = new URL(req.url());
    if (req.method() === "GET") {
      const ct = resp.headers()["content-type"] || "";
      const body = await resp.body();
      if (u.pathname === "/api/photo") {
        const id = u.searchParams.get("p") + (u.searchParams.get("v") || "");
        if (!photoMap.has(id)) { const f = "p" + (photoMap.size + 1) + ".jpg"; fs.writeFileSync(path.join(OUT, "img", f), body); photoMap.set(id, f); }
      } else if (/json/.test(ct)) {
        got[keyOf(req.url())] = { status: resp.status(), body: JSON.parse(body.toString("utf8")) };
      }
    }
    await route.fulfill({ response: resp });
  });
  const p = await ctx.newPage();
  await walk(p);
  // every photo the recorded answers point to, full size and thumbnail
  const urls = new Set(); JSON.stringify(got).replace(/\/api\/photo\?[^"\\]+/g, (m) => urls.add(m));
  await p.evaluate((list) => Promise.all(list.map((u) => fetch(u).catch(() => null))), [...urls]);
  await br.close();
  return got;
}
const wait = (p, ms) => p.waitForTimeout(ms || 700);
async function walkRep(p) {
  await p.goto(B + "/rep"); await p.waitForSelector(".tab-btn", { timeout: 15000 }); await wait(p, 1500);
  for (const t of ["overview", "report", "team", "audit", "billing", "notices", "cases"]) {
    const b = p.locator('.tab-btn[data-tab="' + t + '"]');
    if (await b.count()) { await b.click(); await wait(p, 1500); }
  }
  // closed cases list too
  const more = p.locator("button:has-text('closed')").first();
  if (await more.count()) { try { await more.click({ timeout: 2000 }); await wait(p, 1000); } catch (e) { /* none */ } }
  await p.evaluate(() => Array.from(document.querySelectorAll("img")).forEach((i) => i.scrollIntoView()));
  await wait(p, 1500);
}
async function walkDept(p) {
  await p.goto(B + "/dept"); await wait(p, 2500);
  const ids = await p.evaluate(async () => { const r = await fetch("/api/dept/cases?closed=50"); const j = await r.json(); return (j.open || []).concat(j.closed || [], j.cases || []).map((c) => c.id).filter(Boolean); });
  for (const id of ids) { await p.evaluate((i) => fetch("/api/dept/case?id=" + encodeURIComponent(i)).then((r) => r.json()).then((j) => { const im = []; JSON.stringify(j).replace(/\/api\/photo\?[^"]+/g, (m) => im.push(m)); return Promise.all(im.map((u) => fetch(u))); }), id); }
  for (const sel of ["#go-billing", "#go-notices", "#go-fu"]) {
    const b = p.locator(sel); if (await b.count()) { try { await b.click({ timeout: 2000 }); await wait(p, 1500); await p.goto(B + "/dept"); await wait(p, 1500); } catch (e) { /* hidden */ } }
  }
}
const REPS = { councillor: C, pradhan: PR, mayor: "mayor@demo.grieviq.in", mla: "mla@demo.grieviq.in", mp: "mp@demo.grieviq.in" };
const fixtures = {};
for (const [as, email] of Object.entries(REPS)) {
  fixtures["rep-" + as] = await record(as, (ctx) => ctx.addCookies([{ name: "test_email", value: email, url: B }]), walkRep);
}
fixtures.dept = await record("dept", (ctx) => ctx.setExtraHTTPHeaders({ cookie: deptCookie }), walkDept);
const recordedAt = Date.now();
for (const [k, v] of Object.entries(fixtures)) {
  // no phone alerts in the demo: don't hand out the push key
  for (const [key, r] of Object.entries(v)) if (/notifications$/.test(key.split("?")[0]) && r.body && r.body.push) r.body.push = { configured: false };
  let txt = JSON.stringify({ recordedAt, responses: v });
  // photos: signed links become the saved files
  txt = txt.replace(/\/api\/photo\?p=([^&"]+)(?:&v=([^&"]+))?[^"]*/g, (m, id, ver) => { const f = photoMap.get(decodeURIComponent(id) + (ver || "")) || photoMap.get(decodeURIComponent(id)); return f ? "/demo/img/" + f : "/demo/img/none.jpg"; });
  fs.writeFileSync(path.join(OUT, k + ".json"), txt);
  console.log(k, Object.keys(v).length, "responses", Math.round(txt.length / 1024) + " KB");
}
console.log("photos", photoMap.size);
fs.writeFileSync(path.join(WORK, "server.pid"), String(srv.pid));
if (process.env.DEMO_KEEP) { console.log("server left running on", B); process.exit(0); }
srv.kill();
