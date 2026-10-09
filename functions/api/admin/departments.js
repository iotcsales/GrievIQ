// /api/admin/departments   -- the department directory (Departments stage 1)
//
// GET  ?area=<id>          the area's offices, its wards and villages, and
//                          the coverage table (view_departments)
// GET  ?template=1         the CSV template, as a file
// POST { action, ... }
//   save     { areaId, officeId?, expectedUpdatedAt?, office: {...}, reason? }
//   retire   { officeId, expectedUpdatedAt, reason }
//   restore  { officeId, expectedUpdatedAt, reason? }
//   import_check { areaId, csv }       checks a file; nothing is saved
//   import       { areaId, csv, reason? }  saves the whole file, only if
//                                         every row passes (all or nothing)
//
// Super and operations admins save directly (manage_departments). Data entry
// operators (request_changes) never change the directory: the same actions
// from them become change requests, applied only when someone else approves
// them (NIST SP 800-53 AC-5, as for Jurisdiction). The auditor reads.
// Every change is recorded in admin_events. Errors name the field they belong
// to, so the page shows them next to it.

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { listAreas } from "../../_shared/areas.js";
import { DEPARTMENTS } from "../../_shared/departments.js";
import { emailDomainCanReceive } from "../../_shared/contact-validation.js";
import {
  checkOffice, insertOffice, updateOffice, retireOffice, restoreOffice, getOffice, listOffices, areaUnits,
  coverage, rowsFromCsv, checkRows, insertStatement, csvTemplate, isMissingDeptTable, officeValues, valuesToInput,
  STALE_DAYS, IMPORT_MAX_ROWS,
} from "../../_shared/dept-directory.js";

const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const NOT_SET_UP = { error: "The department directory isn't set up yet. Run the database update part21-departments.sql.", code: "NOT_SET_UP" };

async function logEvent(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, target, detail == null ? null : JSON.stringify(detail)).run();
}
function clip(v, n) { return v == null ? "" : String(v).replace(/\s+/g, " ").trim().slice(0, n); }

async function areasFor(env) {
  const list = await listAreas(env);
  if (list && list.length) return list.map((a) => ({ id: a.id, name: a.name, live: !!a.live }));
  return [{ id: "lucknow", name: "Lucknow", live: true }];   // before the Areas update
}

// Waiting requests for this area's offices (so the page can say "change waiting").
async function pendingFor(env, areaId) {
  const { results } = await env.DB.prepare(
    "SELECT id, kind, target_id, new_values, requested_by, requested_at FROM change_requests WHERE status = 'PENDING' AND kind IN ('dept_office', 'dept_import')"
  ).all();
  const out = [];
  for (const r of results || []) {
    let nv = null; try { nv = JSON.parse(r.new_values); } catch (e) { nv = null; }
    if (!nv || nv.areaId !== areaId) continue;
    out.push({ id: r.id, kind: r.kind, op: r.kind === "dept_import" ? "import" : nv.op, officeId: nv.officeId || null,
      name: r.kind === "dept_import" ? null : (nv.values && nv.values.nameEn) || nv.name || null,
      count: r.kind === "dept_import" ? (nv.rows || []).length : null, requestedBy: r.requested_by, requestedAt: r.requested_at });
  }
  return out;
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_departments");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const url = new URL(request.url);
  if (url.searchParams.get("template")) {
    return new Response("﻿" + csvTemplate(), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="grieviq-departments-template.csv"', "Cache-Control": "no-store" } });
  }
  const areas = await areasFor(env);
  const areaId = url.searchParams.get("area") || areas[0].id;
  const area = areas.find((a) => a.id === areaId);
  if (!area) return json({ error: "Area not found.", code: "NOT_FOUND" }, 404);
  let offices;
  try { offices = await listOffices(env, area.id); }
  catch (e) { if (isMissingDeptTable(e)) return json(NOT_SET_UP, 503); throw e; }
  const units = await areaUnits(env, area.id);
  let pending = [];
  try { pending = await pendingFor(env, area.id); } catch (e) { pending = []; }
  return json({
    ready: true, areas, area, departments: DEPARTMENTS, staleDays: STALE_DAYS, importMax: IMPORT_MAX_ROWS,
    canManage: allows(auth, "manage_departments"), canRequest: allows(auth, "request_changes") && !allows(auth, "manage_departments"),
    offices, units, coverage: coverage(units, offices), pending,
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_departments");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const manage = allows(auth, "manage_departments");
  const requestOnly = !manage && allows(auth, "request_changes");
  if (!manage && !requestOnly) return json({ error: "INSUFFICIENT_ROLE" }, 403);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const ctx = { env, auth, body, manage, requestOnly };
  try {
    switch (String(body.action || "")) {
      case "save": return await save(ctx);
      case "retire": return await retire(ctx);
      case "restore": return await restore(ctx);
      case "import_check": return await importFile(ctx, false);
      case "import": return await importFile(ctx, true);
      default: return json({ error: "Unknown action." }, 400);
    }
  } catch (e) {
    if (isMissingDeptTable(e)) return json(NOT_SET_UP, 503);
    throw e;
  }
}

function sameValues(a, b) {
  return Object.keys(a).every((k) => JSON.stringify(a[k] == null ? null : a[k]) === JSON.stringify(b[k] == null ? null : b[k]));
}

async function areaOf(env, id) {
  const areas = await areasFor(env);
  return areas.find((a) => a.id === String(id || "")) || null;
}

// A data entry operator's reason for the request (shown to the approver).
function reasonOf(ctx) {
  const reason = clip(ctx.body.reason, 500);
  return reason.length >= 5 ? reason : null;
}

async function alreadyWaiting(env, officeId) {
  const { results } = await env.DB.prepare(
    "SELECT id FROM change_requests WHERE status = 'PENDING' AND kind = 'dept_office' AND target_id = ?"
  ).bind(officeId).all();
  return (results || []).length > 0;
}

async function request(ctx, kind, targetId, label, oldValues, newValues, reason) {
  const id = crypto.randomUUID();
  await ctx.env.DB.prepare(
    `INSERT INTO change_requests (id, kind, target_type, target_id, target_label, old_values, new_values, reason, source, requested_by, requested_at)
     VALUES (?, ?, 'dept', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, kind, targetId, label, oldValues ? JSON.stringify(oldValues) : null, JSON.stringify(newValues), reason,
    (newValues.values && newValues.values.source) || null, ctx.auth.email, new Date().toISOString()).run();
  await logEvent(ctx.env, ctx.auth.email, "change_request_submitted", targetId, { requestId: id, kind, op: newValues.op || "import", reason });
  return json({ ok: true, requested: true, requestId: id });
}

async function save(ctx) {
  const { env, auth, body } = ctx;
  const officeId = body.officeId ? String(body.officeId) : null;
  let cur = null, areaId = body.areaId;
  if (officeId) {
    cur = await getOffice(env, officeId);
    if (!cur) return json({ error: "Office not found.", code: "NOT_FOUND" }, 404);
    if (cur.retired) return json({ error: "This office is retired. Bring it back before changing it.", code: "RETIRED" }, 409);
    areaId = cur.areaId;
  }
  const area = await areaOf(env, areaId);
  if (!area) return json({ error: "Area not found.", code: "NOT_FOUND" }, 404);
  const reason = reasonOf(ctx);
  const checked = await checkOffice(env, area.id, body.office || {}, { excludeId: officeId });
  const fields = checked.ok ? {} : Object.assign({}, checked.fields);
  if (ctx.requestOnly && !reason) fields.reason = "REQUIRED";
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);
  const v = checked.values;
  if (v.officeEmail && (!cur || cur.officeEmail !== v.officeEmail)) {
    const d = await emailDomainCanReceive(v.officeEmail);
    if (!d.ok) return json({ error: "Please check the highlighted fields.", fields: { officeEmail: "NO_MAIL" } }, 400);
  }
  if (cur && sameValues(officeValues(cur), v)) {
    return json({ error: "Nothing has changed.", code: "UNCHANGED" }, 400);
  }

  if (ctx.requestOnly) {
    if (officeId && await alreadyWaiting(env, officeId)) return json({ error: "A change to this office is already waiting for approval.", code: "WAITING" }, 409);
    return request(ctx, "dept_office", officeId || "new:" + area.id, v.nameEn,
      cur ? { updatedAt: cur.updatedAt } : null,
      { op: cur ? "update" : "create", areaId: area.id, officeId, values: v, before: cur ? officeValues(cur) : null }, reason);
  }

  if (!cur) {
    const id = await insertOffice(env, area.id, v, auth.email);
    await logEvent(env, auth.email, "dept_office_added", id, { areaId: area.id, after: v });
    return json({ ok: true, officeId: id, created: true });
  }
  const ok = await updateOffice(env, cur.id, v, auth.email, body.expectedUpdatedAt || "");
  if (!ok) return json({ error: "Someone else changed this office while you were editing. Your changes were not saved. Reload to see the latest version.", code: "STALE" }, 409);
  await logEvent(env, auth.email, "dept_office_changed", cur.id, { before: officeValues(cur), after: v });
  return json({ ok: true, officeId: cur.id });
}

async function retire(ctx) {
  const { env, auth, body } = ctx;
  const cur = await getOffice(env, body.officeId);
  if (!cur) return json({ error: "Office not found.", code: "NOT_FOUND" }, 404);
  if (cur.retired) return json({ error: "This office is already retired.", code: "RETIRED" }, 409);
  const reason = clip(body.reason, 300);
  if (reason.length < 10) return json({ error: "Please check the highlighted fields.", fields: { retireReason: "SHORT" } }, 400);
  if (ctx.requestOnly) {
    if (await alreadyWaiting(env, cur.id)) return json({ error: "A change to this office is already waiting for approval.", code: "WAITING" }, 409);
    return request(ctx, "dept_office", cur.id, cur.nameEn, { updatedAt: cur.updatedAt }, { op: "retire", areaId: cur.areaId, officeId: cur.id, name: cur.nameEn, reason }, reason);
  }
  if (!(await retireOffice(env, cur.id, auth.email, reason, body.expectedUpdatedAt || ""))) {
    return json({ error: "Someone else changed this office a moment ago. Reload and try again.", code: "STALE" }, 409);
  }
  await logEvent(env, auth.email, "dept_office_retired", cur.id, { name: cur.nameEn, reason });
  return json({ ok: true });
}

async function restore(ctx) {
  const { env, auth, body } = ctx;
  const cur = await getOffice(env, body.officeId);
  if (!cur) return json({ error: "Office not found.", code: "NOT_FOUND" }, 404);
  if (!cur.retired) return json({ error: "This office is not retired.", code: "NOT_RETIRED" }, 409);
  const c = await checkOffice(env, cur.areaId, valuesToInput(officeValues(cur)), { excludeId: cur.id });
  if (!c.ok && c.fields.nameEn === "TAKEN") return json({ error: "Another office in this area now has the same name. Rename one of them first.", code: "TAKEN" }, 409);
  const reason = clip(body.reason, 500);
  if (ctx.requestOnly) {
    if (reason.length < 5) return json({ error: "Please check the highlighted fields.", fields: { reason: "REQUIRED" } }, 400);
    if (await alreadyWaiting(env, cur.id)) return json({ error: "A change to this office is already waiting for approval.", code: "WAITING" }, 409);
    return request(ctx, "dept_office", cur.id, cur.nameEn, { updatedAt: cur.updatedAt }, { op: "restore", areaId: cur.areaId, officeId: cur.id, name: cur.nameEn }, reason);
  }
  if (!(await restoreOffice(env, cur.id, auth.email, body.expectedUpdatedAt || ""))) {
    return json({ error: "Someone else changed this office a moment ago. Reload and try again.", code: "STALE" }, 409);
  }
  await logEvent(env, auth.email, "dept_office_restored", cur.id, { name: cur.nameEn });
  return json({ ok: true });
}

async function importFile(ctx, save) {
  const { env, auth, body } = ctx;
  const area = await areaOf(env, body.areaId);
  if (!area) return json({ error: "Area not found.", code: "NOT_FOUND" }, 404);
  const csv = String(body.csv || "");
  if (!csv.trim()) return json({ error: "The file is empty.", code: "EMPTY" }, 400);
  if (csv.length > 500000) return json({ error: "The file is too large.", code: "TOO_LARGE" }, 400);
  const units = await areaUnits(env, area.id);
  const parsed = rowsFromCsv(csv, units, area.name);
  if (!parsed.ok) return json({ error: "The file can't be read.", code: parsed.error, missing: parsed.missing || null, max: parsed.max || null }, 400);
  if (!parsed.rows.length) return json({ error: "The file has no offices in it.", code: "EMPTY" }, 400);
  const rows = await checkRows(env, area.id, parsed.rows, units);
  const bad = rows.filter((r) => !r.ok).length;
  const report = rows.map((r) => ({ line: r.line, nameEn: r.nameEn, ok: r.ok, fields: r.fields, unknownWards: r.unknownWards,
    departments: r.values ? r.values.departments : null, wholeArea: r.values ? !r.values.wards : null, wardCount: r.values && r.values.wards ? r.values.wards.length : null }));
  if (!save || bad) return json({ ok: !bad, checked: true, total: rows.length, bad, rows: report }, save && bad ? 400 : 200);

  const values = rows.map((r) => r.values);
  if (ctx.requestOnly) {
    const reason = reasonOf(ctx);
    if (!reason) return json({ error: "Please check the highlighted fields.", fields: { reason: "REQUIRED" } }, 400);
    return request(ctx, "dept_import", area.id, "Departments file for " + area.name + " (" + values.length + ")", null, { areaId: area.id, rows: values }, reason);
  }
  const taken = new Set();
  const stmts = [], ids = [];
  for (const v of values) { const s = await insertStatement(env, area.id, v, auth.email, taken); stmts.push(s.stmt); ids.push(s.id); }
  await env.DB.batch(stmts);
  await logEvent(env, auth.email, "dept_offices_imported", area.id, { count: ids.length, ids, names: values.map((v) => v.nameEn) });
  return json({ ok: true, saved: ids.length, ids });
}
