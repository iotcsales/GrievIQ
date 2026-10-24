/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// Local test server for GrievIQ: serves public/ and runs functions/ (Cloudflare
// Pages Functions style) against a SQLite database that behaves like D1.
// Sign-in: Cloudflare Access is replaced by a header/cookie "test-email".
//
//   node server.mjs <repoDir> <dbFile> <port>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const [repo, dbFile, portArg] = process.argv.slice(2);
const port = Number(portArg || 8788);
const build = path.join(path.dirname(dbFile), "build-" + port);
fs.rmSync(build, { recursive: true, force: true });
fs.cpSync(path.join(repo, "functions"), build, { recursive: true });
// Replace the Access JWT check: the "token" is the email itself.
fs.writeFileSync(path.join(build, "_shared/verify-access-jwt.js"),
  "export async function verifyAccessJwt(token) { if (!token) throw new Error('No Access token'); return { email: token }; }\n");

// ---- D1 shim ----
const db = new DatabaseSync(dbFile);
db.exec("PRAGMA foreign_keys = ON"); db.exec("PRAGMA busy_timeout = 5000");   // D1 checks foreign keys
function norm(v) { if (v === undefined) throw new Error("D1_TYPE_ERROR: undefined bound"); return typeof v === "boolean" ? (v ? 1 : 0) : v; }
class Stmt {
  constructor(sql, binds) {
    // grieviq-60: refuse what D1 refuses, so the tests catch it before the
    // live site does: a compound SELECT with more than 5 terms (a person with
    // 6 ward offices got "too many terms in compound SELECT") and more than
    // 100 bound values in one statement.
    const terms = (String(sql).match(/\b(UNION|INTERSECT|EXCEPT)\b/gi) || []).length + 1;
    if (terms > 5) throw new Error("D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR");
    if (binds && binds.length > 100) throw new Error("D1_ERROR: too many SQL variables: SQLITE_ERROR");
    this.sql = sql; this.binds = binds || [];
  }
  bind(...b) { return new Stmt(this.sql, b.map(norm)); }
  first(col) { const r = db.prepare(this.sql).get(...this.binds); const row = r ? { ...r } : null; return Promise.resolve(col && row ? row[col] : row); }
  all() { return Promise.resolve({ results: db.prepare(this.sql).all(...this.binds).map((r) => ({ ...r })), success: true }); }
  run() { const r = db.prepare(this.sql).run(...this.binds); const size = Number(db.prepare('PRAGMA page_count').get().page_count) * Number(db.prepare('PRAGMA page_size').get().page_size); return Promise.resolve({ success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid), size_after: size } }); }
  _runSync() { const s = db.prepare(this.sql); if (/^\s*(select|with)/i.test(this.sql)) return { results: s.all(...this.binds), meta: { changes: 0 } }; const r = s.run(...this.binds); return { success: true, meta: { changes: Number(r.changes) } }; }
}
const DB = {
  prepare: (sql) => new Stmt(sql),
  batch: async (stmts) => { db.exec("BEGIN"); try { const out = stmts.map((s) => s._runSync()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } },
  exec: async (sql) => { db.exec(sql); return { count: 1 }; },
};
// A stand-in for the private photo bucket (R2), kept in memory.
const r2 = new Map();
const PRIVATE_PHOTOS = {
  put: async (k, v) => { r2.set(k, Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : v)); },
  get: async (k) => { const b = r2.get(k); return b ? { size: b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length), body: b, httpMetadata: {} } : null; },
  delete: async (ks) => { for (const k of [].concat(ks)) r2.delete(k); },
};
const env = { DB, ACCESS_TEAM_DOMAIN: "test", ACCESS_AUD: "test", RESEND_API_KEY: "test-key", PRIVATE_PHOTOS, PHOTO_LINK_SECRET: "test-secret-0123456789abcdef" };
// Emails "sent" in tests are written here (one JSON per line).
const MAIL_LOG = path.join(path.dirname(dbFile), "mail.log");
fs.writeFileSync(MAIL_LOG, "");

// grieviq-35: phone alerts in tests. A throw-away VAPID key pair made at
// start-up (never a real key), and browser push services answered here:
// each alert is written to push.log; an address containing "gone" answers
// 410 like a device that turned alerts off.
{
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  env.VAPID_PUBLIC_KEY = Buffer.from(raw).toString("base64url");
  env.VAPID_PRIVATE_KEY = jwk.d;
}
const PUSH_LOG = path.join(path.dirname(dbFile), "push.log");
fs.writeFileSync(PUSH_LOG, "");

// DNS-over-HTTPS email checks: answer "can receive" instantly (no network here).
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith("https://cloudflare-dns.com/")) {
    const nomail = /name=nomail\.invalid/.test(u);
    return new Response(JSON.stringify(nomail ? { Status: 3 } : { Status: 0, Answer: [{ type: 15, data: "10 mx.example." }] }), { headers: { "content-type": "application/dns-json" } });
  }
  if (u.startsWith("https://api.resend.com/")) {
    fs.appendFileSync(MAIL_LOG, String(opts && opts.body || "") + "\n");
    return new Response(JSON.stringify({ id: "test" }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (/^https:\/\/(fcm\.googleapis\.com|[^/]*push\.apple\.com|[^/]*push\.services\.mozilla\.com)\//.test(u)) {
    const h = (opts && opts.headers) || {};
    fs.appendFileSync(PUSH_LOG, JSON.stringify({ endpoint: u, auth: String(h.Authorization || h.authorization || "").slice(0, 12), bytes: opts && opts.body ? opts.body.byteLength || opts.body.length || 0 : 0 }) + "\n");
    return new Response("", { status: u.includes("gone") ? 410 : 201 });
  }
  return realFetch(url, opts);
};

// ---- routing ----
function findFunction(parts) {
  // exact file, or [param] file/dir at each level
  function walk(dir, rest, params) {
    if (!rest.length) return null;
    const [head, ...tail] = rest;
    if (!tail.length) {
      const f = path.join(dir, head + ".js");
      if (fs.existsSync(f)) return { file: f, params };
      const idx = path.join(dir, head, "index.js");
      if (fs.existsSync(idx)) return { file: idx, params };
      for (const n of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
        const m = /^\[(\w+)\]\.js$/.exec(n);
        if (m) return { file: path.join(dir, n), params: { ...params, [m[1]]: head } };
      }
      return null;
    }
    const sub = path.join(dir, head);
    if (fs.existsSync(sub) && fs.statSync(sub).isDirectory()) { const r = walk(sub, tail, params); if (r) return r; }
    for (const n of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      const m = /^\[(\w+)\]$/.exec(n);
      if (m) { const r = walk(path.join(dir, n), tail, { ...params, [m[1]]: head }); if (r) return r; }
    }
    return null;
  }
  return walk(build, parts, {});
}
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".csv": "text/csv", ".webp": "image/webp" };

function emailOf(req) {
  if (req.headers["test-email"]) return req.headers["test-email"];
  const m = /(?:^|;\s*)test_email=([^;]+)/.exec(req.headers.cookie || "");
  return m ? decodeURIComponent(m[1]) : "";
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost:" + port);
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : null;
    // Test only: run the hourly job's subscriptions part now (grieviq-46).
    // Test only (grieviq-47): add speed samples; run the hourly speed summary.
    if (url.pathname === "/__test/speed-sample" && req.method === "POST") {
      const m = await import(pathToFileURL(path.join(repo, "functions", "_shared", "speed.js")).href);
      const b = JSON.parse(body ? body.toString() : "{}");
      for (const x of b.samples || []) await m.recordSample(env, x.area, x.ms, x.failed, x.at ? Date.parse(x.at) : Date.now());
      res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: true }));
    }
    if (url.pathname === "/__test/run-speed" && req.method === "POST") {
      const m = await import(pathToFileURL(path.join(repo, "functions", "_shared", "speed.js")).href);
      const da = await import(pathToFileURL(path.join(repo, "functions", "_shared", "dept-auth.js")).href);
      const b = JSON.parse(body ? body.toString() : "{}");
      const out = await m.runSpeed(env, b.now ? Date.parse(b.now) : Date.now(), da.sendEmailNow);
      res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(out));
    }
    if (url.pathname === "/__test/run-gov-reports" && req.method === "POST") {
      const m = await import(pathToFileURL(path.join(repo, "functions", "_shared", "gov-report-run.js")).href);
      const da = await import(pathToFileURL(path.join(repo, "functions", "_shared", "dept-auth.js")).href);
      const b = JSON.parse(body ? body.toString() : "{}");
      const out = await m.runGovReports(env, "http://localhost:" + port, b.now ? Date.parse(b.now) : Date.now(), da.sendEmailNow);
      res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(out));
    }
    // Test only (grieviq-57): the hourly check that gives cases back to the ward.
    if (url.pathname === "/__test/return-stuck" && req.method === "POST") {
      const m = await import(pathToFileURL(path.join(repo, "functions", "_shared", "seats.js")).href);
      const n = await import(pathToFileURL(path.join(repo, "functions", "_shared", "notify.js")).href);
      const back = await m.returnStuckCases(env, "system");
      await n.notifyReturned(env, "http://localhost:" + port, back);
      res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ returned: back.map((x) => ({ id: x.g.id, from: x.from, why: x.why })) }));
    }
    // Test only (grieviq-65): the hourly follow-up job, at a chosen time.
    if (url.pathname === "/__test/run-followups" && req.method === "POST") {
      const m = await import(pathToFileURL(path.join(repo, "functions", "_shared", "followups.js")).href);
      const b = JSON.parse(body ? body.toString() : "{}");
      const out = await m.runFollowups(env, "http://localhost:" + port, b.now ? Date.parse(b.now) : Date.now());
      res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(out));
    }
    if (url.pathname === "/__test/run-subscriptions" && req.method === "POST") {
      const m = await import(pathToFileURL(path.join(repo, "functions", "_shared", "subscription-run.js")).href);
      const out = await m.runSubscriptions(env, "http://localhost:" + port, Date.now());
      res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(out));
    }
    if (url.pathname.startsWith("/api/")) {
      const hit = findFunction(url.pathname.slice(1).split("/").filter(Boolean));
      if (!hit) { res.writeHead(404); return res.end("no function"); }
      const mod = await import(pathToFileURL(hit.file).href);
      const method = req.method[0] + req.method.slice(1).toLowerCase();
      const fn = mod["onRequest" + method] || mod.onRequest;
      if (!fn) { res.writeHead(405); return res.end(); }
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(",") : v);
      const email = emailOf(req);
      if (email) headers.set("Cf-Access-Jwt-Assertion", email);
      const request = new Request(url.href, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
      const out = await fn({ request, env, params: hit.params, waitUntil() {}, next: async () => new Response("", { status: 404 }) });
      const h = {}; out.headers.forEach((v, k) => { h[k] = v; });
      res.writeHead(out.status, h);
      return res.end(Buffer.from(await out.arrayBuffer()));
    }
    // Like Cloudflare Pages: a file, a page without ".html", or else (for a
    // page address) the home page; then the site's "Page not found" check.
    const asset = (pathname) => {
      let p = path.join(repo, "public", decodeURIComponent(pathname));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
      if (!fs.existsSync(p) && fs.existsSync(p + ".html")) p += ".html";
      return fs.existsSync(p) ? p : null;
    };
    let p = asset(url.pathname);
    if (!p && !path.extname(url.pathname)) p = path.join(repo, "public", "index.html");
    if (!p) { res.writeHead(404); return res.end("not found"); }
    const type = TYPES[path.extname(p)] || "application/octet-stream";
    if (type.startsWith("text/html")) {
      const mw = await import(pathToFileURL(path.join(repo, "functions", "_middleware.js")).href);
      const assets = { fetch: async (r) => { const a = asset(new URL(r.url).pathname); return a ? new Response(fs.readFileSync(a), { headers: { "content-type": "text/html; charset=utf-8" } }) : new Response("", { status: 404 }); } };
      const nf = await mw.notFoundFor(new Request(url.href, { method: req.method }), new Response(fs.readFileSync(p), { headers: { "content-type": type } }), { ASSETS: assets });
      if (nf) { res.writeHead(404, { "content-type": "text/html; charset=utf-8" }); return res.end(Buffer.from(await nf.arrayBuffer())); }
    }
    res.writeHead(200, { "content-type": type });
    res.end(fs.readFileSync(p));
  } catch (e) {
    console.error(e);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(e && e.message) }));
  }
}).listen(port, () => console.log("listening " + port));
