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
  constructor(sql, binds) { this.sql = sql; this.binds = binds || []; }
  bind(...b) { return new Stmt(this.sql, b.map(norm)); }
  first(col) { const r = db.prepare(this.sql).get(...this.binds); const row = r ? { ...r } : null; return Promise.resolve(col && row ? row[col] : row); }
  all() { return Promise.resolve({ results: db.prepare(this.sql).all(...this.binds).map((r) => ({ ...r })), success: true }); }
  run() { const r = db.prepare(this.sql).run(...this.binds); return Promise.resolve({ success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }); }
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
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".csv": "text/csv" };

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
    let p = path.join(repo, "public", decodeURIComponent(url.pathname));
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!fs.existsSync(p) && fs.existsSync(p + ".html")) p += ".html";
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
    res.end(fs.readFileSync(p));
  } catch (e) {
    console.error(e);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(e && e.message) }));
  }
}).listen(port, () => console.log("listening " + port));
