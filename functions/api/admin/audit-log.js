// GET /api/admin/audit-log   (auditor and super admin, item 9a)
//
// One read-only, searchable view of what GrievIQ already records:
//   staff    admin_events (case views, phone-number reveals, checks, staff
//            reopens, photo clean-ups, imports, staff changes...)
//   signin   rep_auth_events (representative sign-ins, sign-outs, refusals)
//   team     team_activity (representatives' teams)
// These tables can't be edited or deleted (part9a-audit.sql, NIST AU-9).
//
//   ?source=staff|signin|team   (default: all)
//   &from=YYYY-MM-DD&to=YYYY-MM-DD   India dates
//   &who=<text>   part of the person's email
//   &action=<text>   part of the action name
//   &case=<tracking ref>
//   &page=<n>   100 rows a page, newest first
//   &format=csv   the whole filtered result (up to 20,000 rows), logged

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";

const PAGE = 100;
const CSV_MAX = 20000;
// Stored times come as ISO ("...T...Z") or, for admin_events, SQLite's
// "YYYY-MM-DD HH:MM:SS" (UTC). Both are turned into ISO for sorting.
const AT = (col) => `(CASE WHEN instr(${col}, 'T') > 0 THEN ${col} ELSE replace(${col}, ' ', 'T') || '.000Z' END)`;

function istStartIso(d) { return new Date(Date.parse(d + "T00:00:00.000+05:30")).toISOString(); }
function istEndIso(d) { return new Date(Date.parse(d + "T23:59:59.999+05:30")).toISOString(); }
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) && !isNaN(Date.parse(d + "T00:00:00Z"));

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_audit_log");
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const u = new URL(request.url);
  const source = u.searchParams.get("source") || "";
  const from = u.searchParams.get("from") || "";
  const to = u.searchParams.get("to") || "";
  const who = (u.searchParams.get("who") || "").trim().toLowerCase().slice(0, 120);
  const action = (u.searchParams.get("action") || "").trim().toLowerCase().slice(0, 60);
  const caseRef = (u.searchParams.get("case") || "").trim().toUpperCase().slice(0, 40);
  const page = Math.max(1, Math.min(1000, parseInt(u.searchParams.get("page") || "1", 10) || 1));
  const csv = u.searchParams.get("format") === "csv";

  const fields = {};
  if (source && !["staff", "signin", "team"].includes(source)) fields.source = "SOURCE";
  if (from && !isDay(from)) fields.from = "DATE";
  if (to && !isDay(to)) fields.to = "DATE";
  if (!fields.from && !fields.to && from && to && from > to) fields.to = "BEFORE_FROM";
  if (Object.keys(fields).length) return Response.json({ error: "Please check the filters.", fields }, { status: 400 });

  // One normalised shape: source, at, actor, role, action, caseRef, target, detail.
  const parts = [];
  if (!source || source === "staff") parts.push(
    `SELECT 'staff' AS source, ${AT("ae.created_at")} AS at, ae.actor_email AS actor, NULL AS role, ae.action AS action,
            COALESCE(g.tracking_ref, json_extract(CASE WHEN json_valid(ae.detail) THEN ae.detail END, '$.trackingRef')) AS case_ref,
            ae.target AS target, ae.detail AS detail, ae.id AS id
     FROM admin_events ae LEFT JOIN grievances g ON g.id = ae.target`);
  if (!source || source === "signin") parts.push(
    `SELECT 'signin' AS source, ${AT("ra.created_at")} AS at, ra.email AS actor, NULL AS role, ra.event AS action,
            NULL AS case_ref, ra.ip AS target, ra.detail AS detail, ra.id AS id
     FROM rep_auth_events ra`);
  if (!source || source === "team") parts.push(
    `SELECT 'team' AS source, ${AT("ta.created_at")} AS at, ta.actor_email AS actor, ta.actor_role AS role, ta.action AS action,
            g2.tracking_ref AS case_ref, ta.office_tier || ':' || ta.office_id AS target, ta.detail AS detail, ta.id AS id
     FROM team_activity ta LEFT JOIN grievances g2 ON g2.id = ta.grievance_id`);

  const where = [], binds = [];
  if (from) { where.push("at >= ?"); binds.push(istStartIso(from)); }
  if (to) { where.push("at <= ?"); binds.push(istEndIso(to)); }
  if (who) { where.push("LOWER(actor) LIKE ?"); binds.push("%" + who + "%"); }
  if (action) { where.push("LOWER(action) LIKE ?"); binds.push("%" + action + "%"); }
  if (caseRef) { where.push("UPPER(case_ref) = ?"); binds.push(caseRef); }
  const base = `SELECT * FROM (${parts.join(" UNION ALL ")}) ${where.length ? "WHERE " + where.join(" AND ") : ""}`;

  if (csv) {
    const { results } = await env.DB.prepare(`${base} ORDER BY at DESC, id DESC LIMIT ${CSV_MAX}`).bind(...binds).all();
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), auth.email, "audit_log_exported", null, JSON.stringify({ source: source || "all", from, to, who, action, case: caseRef, rows: (results || []).length, role: auth.role })).run();
    return csvResponse(results || []);
  }

  const [countRes, rowsRes] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM (${base})`).bind(...binds),
    env.DB.prepare(`${base} ORDER BY at DESC, id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`).bind(...binds),
  ]);
  const total = (countRes.results && countRes.results[0] && countRes.results[0].n) || 0;
  return new Response(JSON.stringify({
    role: auth.role, canObserve: auth.role === "auditor",
    total, page, pageSize: PAGE, pages: Math.max(1, Math.ceil(total / PAGE)),
    rows: (rowsRes.results || []).map(shape),
  }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function shape(r) {
  let detail = null;
  try { detail = r.detail ? JSON.parse(r.detail) : null; } catch (e) { detail = r.detail; }
  return { id: r.id, source: r.source, at: r.at, actor: r.actor, role: r.role || (detail && detail.role) || null, action: r.action, caseRef: r.case_ref || null, target: r.target || null, detail };
}

function cell(v) {
  let s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // never run as a spreadsheet formula (OWASP)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvResponse(rows) {
  const head = ["When (UTC)", "Log", "Person", "Role", "Action", "Case", "Target", "Details"];
  const lines = [head].concat(rows.map((r) => { const x = shape(r); return [x.at, x.source, x.actor, x.role, x.action, x.caseRef, x.target, x.detail]; }));
  const body = "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(body, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="grieviq-audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    "Cache-Control": "no-store",
  } });
}
