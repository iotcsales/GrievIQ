// GET /api/admin/audit-log   (auditor and super admin, item 9a)
//
// One read-only, searchable view of what GrievIQ already records:
//   staff    admin_events (case views, phone-number reveals, checks, staff
//            reopens, photo clean-ups, imports, staff changes...)
//   signin   rep_auth_events (representative sign-ins, sign-outs, refusals)
//   team     team_activity (representatives' teams)
//   case     grievance_events (what happened on each case: acknowledged,
//            forwarded, marked resolved, citizen confirmed or disputed)
// These tables can't be edited or deleted (part9a-audit.sql, NIST AU-9).
//
// Built for the auditor (user-friendly, and in line with how audit tools
// work: every record links to the case it is about, and ready-made
// "exception" views bring risky activity to the top):
//   ?view=phone|refused|reopen|photos|exports|staff   a quick view
//   &source=staff|signin|team|case   (default: all)
//   &from=YYYY-MM-DD&to=YYYY-MM-DD   India dates
//   &who=<text>      part of the person's email
//   &action=<text>   part of the action name
//   &case=<text>     part of a case number
//   &timeline=1      with &case: every record of that case, oldest first
//   &page=<n>        100 rows a page, newest first
//   &format=csv      the whole filtered result (up to 20,000 rows), logged
// Each row carries the case's id, ward and issue type, so the page can
// link to the case and say what it was about.

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";

const PAGE = 100;
const CSV_MAX = 20000;
// Stored times come as ISO ("...T...Z") or SQLite's "YYYY-MM-DD HH:MM:SS"
// (UTC). Both are turned into ISO for sorting.
const AT = (col) => `(CASE WHEN instr(${col}, 'T') > 0 THEN ${col} ELSE replace(${col}, ' ', 'T') || '.000Z' END)`;

// Quick views: which actions each one gathers.
export const VIEWS = {
  phone: ["citizen_phone_revealed", "reveal_phone"],
  refused: ["sign_in_refused"],
  reopen: ["case_reopened_for_citizen", "reopen"],
  photos: ["purge", "photo_moved_private", "migrate"],
  exports: ["audit_log_exported", "observations_exported", "overview_exported"],
  staff: ["staff_added", "staff_removed", "staff_role_changed", "member_added", "member_removed", "role_changed", "member_confirmed"],
};

function istStartIso(d) { return new Date(Date.parse(d + "T00:00:00.000+05:30")).toISOString(); }
function istEndIso(d) { return new Date(Date.parse(d + "T23:59:59.999+05:30")).toISOString(); }
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) && !isNaN(Date.parse(d + "T00:00:00Z"));

// The case columns every part adds (g = grievances row, or NULLs).
const CASE_COLS = (g) => `${g}.id AS case_id, ${g}.tracking_ref AS case_ref, lu_${g}.name AS case_ward, gc_${g}.name AS case_type`;
const CASE_JOIN = (g, on) => `LEFT JOIN grievances ${g} ON ${g}.id = ${on}
  LEFT JOIN local_units lu_${g} ON lu_${g}.id = ${g}.local_unit_id
  LEFT JOIN grievance_categories gc_${g} ON gc_${g}.id = ${g}.category_id`;

function parts(source) {
  const p = [];
  if (!source || source === "staff") p.push(
    `SELECT 'staff' AS source, ${AT("ae.created_at")} AS at, ae.actor_email AS actor, NULL AS role, ae.action AS action,
            ${CASE_COLS("g1")}, ae.target AS target, ae.detail AS detail, ae.id AS id
     FROM admin_events ae ${CASE_JOIN("g1", "ae.target")}`);
  if (!source || source === "signin") p.push(
    `SELECT 'signin' AS source, ${AT("ra.created_at")} AS at, ra.email AS actor, NULL AS role, ra.event AS action,
            NULL AS case_id, NULL AS case_ref, NULL AS case_ward, NULL AS case_type, ra.ip AS target, ra.detail AS detail, ra.id AS id
     FROM rep_auth_events ra`);
  if (!source || source === "team") p.push(
    `SELECT 'team' AS source, ${AT("ta.created_at")} AS at, ta.actor_email AS actor, ta.actor_role AS role, ta.action AS action,
            ${CASE_COLS("g2")}, ta.office_tier || ':' || ta.office_id AS target, ta.detail AS detail, ta.id AS id
     FROM team_activity ta ${CASE_JOIN("g2", "ta.grievance_id")}`);
  if (!source || source === "case") p.push(
    `SELECT 'case' AS source, ${AT("COALESCE(ge.created_at, '')")} AS at, ge.actor AS actor, NULL AS role, ge.event_type AS action,
            ${CASE_COLS("g3")}, NULL AS target,
            json_object('reason', ge.reason, 'note', ge.note) AS detail, ge.id AS id
     FROM grievance_events ge ${CASE_JOIN("g3", "ge.grievance_id")}`);
  return p;
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_audit_log");
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const u = new URL(request.url);
  const source = u.searchParams.get("source") || "";
  const view = u.searchParams.get("view") || "";
  const from = u.searchParams.get("from") || "";
  const to = u.searchParams.get("to") || "";
  const who = (u.searchParams.get("who") || "").trim().toLowerCase().slice(0, 120);
  const action = (u.searchParams.get("action") || "").trim().toLowerCase().slice(0, 60);
  const caseRef = (u.searchParams.get("case") || "").trim().toUpperCase().slice(0, 40);
  const timeline = u.searchParams.get("timeline") === "1" && !!caseRef;
  const page = Math.max(1, Math.min(1000, parseInt(u.searchParams.get("page") || "1", 10) || 1));
  const csv = u.searchParams.get("format") === "csv";

  const fields = {};
  if (source && !["staff", "signin", "team", "case"].includes(source)) fields.source = "SOURCE";
  if (view && !VIEWS[view]) fields.view = "VIEW";
  if (from && !isDay(from)) fields.from = "DATE";
  if (to && !isDay(to)) fields.to = "DATE";
  if (!fields.from && !fields.to && from && to && from > to) fields.to = "BEFORE_FROM";
  if (Object.keys(fields).length) return Response.json({ error: "Please check the filters.", fields }, { status: 400 });

  const union = parts(source).join(" UNION ALL ");
  // Date range applies to everything, including the quick-view counts.
  const dateWhere = [], dateBinds = [];
  if (from) { dateWhere.push("at >= ?"); dateBinds.push(istStartIso(from)); }
  if (to) { dateWhere.push("at <= ?"); dateBinds.push(istEndIso(to)); }

  const where = dateWhere.slice(), binds = dateBinds.slice();
  if (who) { where.push("LOWER(actor) LIKE ?"); binds.push("%" + who + "%"); }
  if (action) { where.push("LOWER(action) LIKE ?"); binds.push("%" + action + "%"); }
  if (caseRef) {
    if (timeline) { where.push("UPPER(case_ref) = ?"); binds.push(caseRef); }
    else { where.push("UPPER(case_ref) LIKE ?"); binds.push("%" + caseRef + "%"); }
  }
  if (view) { where.push(`LOWER(action) IN (SELECT value FROM json_each(?))`); binds.push(JSON.stringify(VIEWS[view])); }
  const base = `SELECT * FROM (${union}) ${where.length ? "WHERE " + where.join(" AND ") : ""}`;
  const order = timeline ? "ORDER BY at ASC, id ASC" : "ORDER BY at DESC, id DESC";

  if (csv) {
    const { results } = await env.DB.prepare(`${base} ${order} LIMIT ${CSV_MAX}`).bind(...binds).all();
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), auth.email, "audit_log_exported", null, JSON.stringify({ view: view || null, source: source || "all", from, to, who, action, case: caseRef, rows: (results || []).length, role: auth.role })).run();
    return csvResponse(results || []);
  }

  // Counts for the quick views (whole log, within the date range).
  const allUnion = parts("").join(" UNION ALL ");
  const countCols = Object.keys(VIEWS).map((k) => `SUM(CASE WHEN LOWER(action) IN (${VIEWS[k].map(() => "?").join(",")}) THEN 1 ELSE 0 END) AS ${k}`).join(", ");
  const countBinds = Object.keys(VIEWS).flatMap((k) => VIEWS[k]);
  const [countRes, rowsRes, viewRes] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM (${base})`).bind(...binds),
    env.DB.prepare(`${base} ${order} LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`).bind(...binds),
    env.DB.prepare(`SELECT ${countCols} FROM (${allUnion}) ${dateWhere.length ? "WHERE " + dateWhere.join(" AND ") : ""}`).bind(...countBinds, ...dateBinds),
  ]);
  const total = (countRes.results && countRes.results[0] && countRes.results[0].n) || 0;
  const vc = (viewRes.results && viewRes.results[0]) || {};
  return new Response(JSON.stringify({
    role: auth.role, canObserve: auth.role === "auditor",
    total, page, pageSize: PAGE, pages: Math.max(1, Math.ceil(total / PAGE)), timeline,
    views: Object.fromEntries(Object.keys(VIEWS).map((k) => [k, Number(vc[k] || 0)])),
    rows: (rowsRes.results || []).map(shape),
  }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function shape(r) {
  let detail = null;
  try { detail = r.detail ? JSON.parse(r.detail) : null; } catch (e) { detail = r.detail; }
  if (detail && typeof detail === "object") {
    for (const k of Object.keys(detail)) if (detail[k] == null || detail[k] === "") delete detail[k];
    if (!Object.keys(detail).length) detail = null;
  }
  const caseRef = r.case_ref || (detail && typeof detail === "object" && detail.trackingRef) || null;
  return {
    id: r.id, source: r.source, at: r.at, actor: r.actor, role: r.role || (detail && detail.role) || null, action: r.action,
    caseId: r.case_id || null, caseRef, caseWard: r.case_ward || null, caseType: r.case_type || null,
    target: r.target || null, detail,
  };
}

function cell(v) {
  let s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // never run as a spreadsheet formula (OWASP)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvResponse(rows) {
  const head = ["When (UTC)", "Record", "Person", "Role", "Action", "Case", "Ward", "Issue type", "Target", "Details"];
  const lines = [head].concat(rows.map((r) => { const x = shape(r); return [x.at, x.source, x.actor, x.role, x.action, x.caseRef, x.caseWard, x.caseType, x.target, x.detail]; }));
  const body = "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(body, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="grieviq-audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    "Cache-Control": "no-store",
  } });
}
