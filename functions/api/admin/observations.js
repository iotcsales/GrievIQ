// /api/admin/observations   (item 9a: audit findings; rules in _shared/audit.js)
//
// GET  ?id=<id>                  one observation, its history and amendments,
//                                and what the caller may do with it
// GET  ?status=&rating=&overdue=1&owner=&q=   the register
//      (auditor and super admin: every observation, drafts for the auditor
//       only; other staff: those they own, once issued)
// GET  ...&format=csv            the register as CSV (logged)
// POST { action, id?, ... }
//   create / update / withdraw / issue / amend   auditor
//   respond / report_done                        the owner
//   comment                                      auditor, owner, super admin
//   close / send_back                            auditor
//   accept_risk                                  super admin (not the owner)
// Every action is written to observation_events, which can't be changed.

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import {
  RATINGS, STATUSES, OPEN_STATUSES, AMENDABLE, LIMITS, DEFAULT_DUE_DAYS,
  todayIst, isDay, defaultDue, readDraft, shapeObservation, effective, isOverdue, nextRef, logObservation,
} from "../../_shared/audit.js";
import { officeOptions, officeByKey, officeRecipients, addOwnerLabels, notifyAudit, ownerAction, officeText } from "../../_shared/audit-office.js";

const can = (role, perm) => [].concat(role).some((r) => (PERMISSIONS[perm] || []).includes(r));
const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function load(env, id) {
  const o = await env.DB.prepare("SELECT * FROM observations WHERE id = ?").bind(id).first();
  if (!o) return null;
  const { results } = await env.DB.prepare("SELECT * FROM observation_amendments WHERE observation_id = ? ORDER BY amended_at ASC").bind(id).all();
  return { o, amendments: results || [] };
}

// Item 10: the owner, or someone covering for the owner during their leave.
// Returns the owner's email (whose behalf it is) or null.
function ownsAs(auth, o) {
  if (o.owner_type === "OFFICE") return null;
  const owner = String(o.owner_email || "").toLowerCase();
  if (!owner) return null;
  if (owner === auth.email) return owner;
  return (auth.coverFor || []).includes(owner) ? owner : null;
}

// Who may see this observation at all.
function canSee(auth, o) {
  if (can(auth.roles || auth.role, "audit_observations")) return true;                       // auditor: all, drafts too
  if (o.status === "DRAFT" || o.status === "WITHDRAWN") return false;
  if (can(auth.roles || auth.role, "view_all_observations")) return true;                    // super admin
  return ownsAs(auth, o) !== null;                                               // the owner, or covering for them
}

function permissionsFor(auth, o) {
  const auditor = can(auth.roles || auth.role, "audit_observations");
  const owner = ownsAs(auth, o) !== null;
  const open = OPEN_STATUSES.includes(o.status);
  return {
    edit: auditor && o.status === "DRAFT",
    issue: auditor && o.status === "DRAFT",
    withdraw: auditor && o.status === "DRAFT",
    amend: auditor && open,
    respond: owner && (o.status === "ISSUED" || o.status === "RESPONDED"),
    reportDone: owner && o.status === "RESPONDED",
    comment: o.status !== "DRAFT" && o.status !== "WITHDRAWN" && (auditor || owner || can(auth.roles || auth.role, "view_all_observations")),
    close: auditor && o.status === "DONE_REPORTED",
    sendBack: auditor && o.status === "DONE_REPORTED",
    acceptRisk: can(auth.roles || auth.role, "accept_risk") && open && !owner,
  };
}

async function staffList(env) {
  let rows;
  try {
    // Item 10: people who have left can't be given new observations.
    rows = (await env.DB.prepare("SELECT email, name, employee_id, role FROM admin_users WHERE role <> 'auditor' AND COALESCE(status, 'PRESENT') <> 'LEFT' ORDER BY name, email").all()).results;
  } catch (e) {
    rows = (await env.DB.prepare("SELECT email, name, role FROM admin_users WHERE role <> 'auditor' ORDER BY name, email").all()).results;
  }
  return (rows || []).map((r) => ({ email: String(r.email).toLowerCase(), name: r.name || null, employeeId: r.employee_id || null, role: r.role }));
}

// Who hears about an observation: a staff owner, or the office's
// representative and office managers (item 9c).
async function ownerRecipients(env, o) {
  if (o.owner_type === "OFFICE") return { to: await officeRecipients(env, o.owner_office), link: "office" };
  const to = o.owner_email ? [o.owner_email] : [];
  // Item 10: whoever is covering for the owner today hears too.
  if (o.owner_email) {
    try {
      const today = todayIst();
      const { results } = await env.DB.prepare("SELECT cover_email FROM staff_covers WHERE LOWER(away_email) = ? AND ended_at IS NULL AND from_date <= ? AND to_date >= ?")
        .bind(String(o.owner_email).toLowerCase(), today, today).all();
      for (const r of results || []) to.push(String(r.cover_email).toLowerCase());
    } catch (e) { /* item 10 tables not there yet */ }
  }
  return { to, link: "staff" };
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const u = new URL(request.url);
  const today = todayIst();
  const auditor = can(auth.roles || auth.role, "audit_observations");

  const id = u.searchParams.get("id");
  if (id) {
    const got = await load(env, id);
    if (!got || !canSee(auth, got.o)) return json({ error: "Observation not found." }, 404);
    const { results: events } = await env.DB.prepare("SELECT * FROM observation_events WHERE observation_id = ? ORDER BY created_at ASC, rowid ASC").bind(id).all();
    const shaped = (await addOwnerLabels(env, [shapeObservation(got.o, got.amendments, today)]))[0];
    return json({
      role: auth.role, me: auth.email, today,
      observation: shaped,
      events: (events || []).map((e) => ({ kind: e.kind, by: e.actor_email, role: e.actor_role, text: e.text, detail: e.detail ? JSON.parse(e.detail) : null, at: e.created_at })),
      can: permissionsFor(auth, got.o),
      staff: auditor ? await staffList(env) : null,
      offices: auditor && got.o.status === "DRAFT" ? await officeOptions(env) : null,
      defaults: DEFAULT_DUE_DAYS,
    });
  }

  // The register.
  const where = [], binds = [];
  if (!auditor) {
    where.push("status NOT IN ('DRAFT', 'WITHDRAWN')");
    if (!can(auth.roles || auth.role, "view_all_observations")) {
      const mine = [auth.email].concat(auth.coverFor || []);
      where.push("LOWER(owner_email) IN (SELECT value FROM json_each(?))"); binds.push(JSON.stringify(mine));
    }
  }
  const { results: rows } = await env.DB.prepare(`SELECT * FROM observations ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC`).bind(...binds).all();
  const ids = (rows || []).map((r) => r.id);
  const amendBy = new Map();
  if (ids.length) {
    const { results: am } = await env.DB.prepare("SELECT * FROM observation_amendments WHERE observation_id IN (SELECT value FROM json_each(?)) ORDER BY amended_at ASC").bind(JSON.stringify(ids)).all();
    for (const a of am || []) { if (!amendBy.has(a.observation_id)) amendBy.set(a.observation_id, []); amendBy.get(a.observation_id).push(a); }
  }
  let list = await addOwnerLabels(env, (rows || []).map((r) => shapeObservation(r, amendBy.get(r.id) || [], today)));

  // Totals (before filters): open observations by rating, overdue, waiting for verification.
  const totals = { byRating: Object.fromEntries(RATINGS.map((r) => [r, 0])), open: 0, overdue: 0, waitingVerification: 0, drafts: 0 };
  for (const o of list) {
    if (OPEN_STATUSES.includes(o.status)) { totals.open++; totals.byRating[o.rating] = (totals.byRating[o.rating] || 0) + 1; }
    if (o.overdue) totals.overdue++;
    if (o.status === "DONE_REPORTED") totals.waitingVerification++;
    if (o.status === "DRAFT") totals.drafts++;
  }

  const status = (u.searchParams.get("status") || "").toUpperCase();
  const rating = (u.searchParams.get("rating") || "").toUpperCase();
  const owner = (u.searchParams.get("owner") || "").toLowerCase();
  const q = (u.searchParams.get("q") || "").trim().toLowerCase();
  if (status === "OPEN") list = list.filter((o) => OPEN_STATUSES.includes(o.status));
  else if (STATUSES.includes(status)) list = list.filter((o) => o.status === status);
  if (RATINGS.includes(rating)) list = list.filter((o) => o.rating === rating);
  if (u.searchParams.get("overdue") === "1") list = list.filter((o) => o.overdue);
  if (owner) list = list.filter((o) => String(o.ownerEmail || "").toLowerCase() === owner || String(o.ownerOffice || "").toLowerCase() === owner);
  if (q) list = list.filter((o) => [o.ref, o.title, (o.subjectCases || []).join(" "), o.subjectProcess, o.ownerEmail, o.ownerLabel].join(" ").toLowerCase().includes(q));

  if (u.searchParams.get("format") === "csv") {
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), auth.email, "observations_exported", null, JSON.stringify({ rows: list.length, status, rating, owner, q, role: auth.role })).run();
    return csvResponse(list);
  }
  return json({
    role: auth.role, me: auth.email, today, canCreate: auditor, canSeeLog: can(auth.roles || auth.role, "view_audit_log"),
    totals, observations: list, staff: auditor ? await staffList(env) : null, offices: auditor ? await officeOptions(env) : null, defaults: DEFAULT_DUE_DAYS,
  });
}

function cell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvResponse(list) {
  const head = ["Ref", "Title", "Rating", "Status", "Overdue", "About", "Owner", "Due date", "Issued", "Criteria", "Condition", "Cause", "Effect", "Recommendation", "Owner agrees", "Owner reply", "Action plan", "Target date", "Closed"];
  const about = (o) => o.subjectType === "CASE" ? "Cases: " + (o.subjectCases || []).join(" ") : o.subjectType === "OFFICE" ? "Office: " + (o.subjectOffice || "") : "Process: " + (o.subjectProcess || "");
  const lines = [head].concat(list.map((o) => [o.ref, o.title, o.rating, o.status, o.overdue ? "Yes" : "", about(o), o.ownerLabel || o.ownerEmail, o.dueDate, o.issuedAt,
    o.criteria, o.condition, o.cause, o.effect, o.recommendation, o.response ? (o.response.agree ? "Agrees" : "Disagrees") : "", o.response && o.response.text, o.response && o.response.actionPlan, o.response && o.response.targetDate, o.closedAt]));
  const body = "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="grieviq-observations-${todayIst()}.csv"`, "Cache-Control": "no-store" } });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const action = String(body.action || "");
  const auditor = can(auth.roles || auth.role, "audit_observations");
  const now = new Date().toISOString();
  const today = todayIst();
  const log = (id, kind, text, detail) => logObservation(env, id, kind, auth.email, auth.role, text, detail);
  const need = (ok) => ok ? null : json({ error: "Your role can't do this.", code: "ROLE" }, 403);
  const note = (k, lo, hi) => { const t = String(body[k] || "").trim(); return t.length >= lo && t.length <= hi ? t : null; };

  // Owners must be staff who aren't auditors (IIA Standard 7: independence),
  // or a representative's office that exists (item 9c).
  // Returns null, or a Response with the field error.
  async function checkOwner(v) {
    if (v.owner_type === "OFFICE") {
      if (!v.owner_office) return null;
      if (!(await officeByKey(env, v.owner_office))) return json({ error: "Choose an office from the list.", fields: { ownerOffice: "NOT_FOUND" } }, 400);
      return null;
    }
    if (!v.owner_email) return null;
    let s = null;
    try { s = await env.DB.prepare("SELECT email, role, status FROM admin_users WHERE LOWER(email) = ?").bind(v.owner_email).first(); }
    catch (e) { s = await env.DB.prepare("SELECT email, role FROM admin_users WHERE LOWER(email) = ?").bind(v.owner_email).first(); }
    if (s && s.status === "LEFT") s = null;
    if (!s || s.role === "auditor") return json({ error: "Choose a staff member who isn't an auditor.", fields: { ownerEmail: !s ? "NOT_STAFF" : "AUDITOR" } }, 400);
    return null;
  }

  if (action === "create") {
    const denied = need(auditor); if (denied) return denied;
    const d = readDraft(body, false);
    if (d.fields) return json({ error: "Please correct the highlighted fields.", fields: d.fields }, 400);
    const ownerErr = await checkOwner(d.value);
    if (ownerErr) return ownerErr;
    const id = crypto.randomUUID();
    let src = null;
    if (body.source && typeof body.source === "object") src = JSON.stringify({ kind: String(body.source.kind || "").slice(0, 20), id: String(body.source.id || "").slice(0, 80), label: String(body.source.label || "").slice(0, 160) });
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = await nextRef(env, today);
      try {
        const v = d.value;
        await env.DB.prepare(
          `INSERT INTO observations (id, ref, title, subject_type, subject_cases, subject_office, subject_process, criteria, condition, cause, effect, recommendation,
             rating, owner_type, owner_email, owner_office, due_date, due_reason, source, status, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`
        ).bind(id, ref, v.title, v.subject_type, JSON.stringify(v.subject_cases), v.subject_office, v.subject_process, v.criteria || null, v.condition || null, v.cause || null, v.effect || null, v.recommendation || null,
          v.rating, v.owner_type, v.owner_email, v.owner_office, v.due_date, v.due_reason, src, auth.email, now, now).run();
        await log(id, "CREATED", null, { ref });
        return json({ ok: true, id, ref });
      } catch (e) {
        if (!/UNIQUE/i.test(String(e && e.message))) throw e;
      }
    }
    return json({ error: "Please try again." }, 409);
  }

  const id = String(body.id || "");
  const got = await load(env, id);
  if (!got || !canSee(auth, got.o)) return json({ error: "Observation not found." }, 404);
  const o = got.o;
  const p = permissionsFor(auth, o);
  const eff = effective(o, got.amendments);
  const stale = () => json({ error: "This observation has changed. Refresh the page.", code: "STALE" }, 409);
  const setStatus = async (sql, ...binds) => {
    const r = await env.DB.prepare(sql).bind(...binds).run();
    return !(r && r.meta && r.meta.changes === 0);
  };

  if (action === "update") {
    const denied = need(p.edit); if (denied) return denied;
    const d = readDraft(body, false);
    if (d.fields) return json({ error: "Please correct the highlighted fields.", fields: d.fields }, 400);
    const ownerErr = await checkOwner(d.value);
    if (ownerErr) return ownerErr;
    const v = d.value;
    const ok = await setStatus(
      `UPDATE observations SET title = ?, subject_type = ?, subject_cases = ?, subject_office = ?, subject_process = ?, criteria = ?, condition = ?, cause = ?, effect = ?,
         recommendation = ?, rating = ?, owner_type = ?, owner_email = ?, owner_office = ?, due_date = ?, due_reason = ?, updated_at = ? WHERE id = ? AND status = 'DRAFT'`,
      v.title, v.subject_type, JSON.stringify(v.subject_cases), v.subject_office, v.subject_process, v.criteria || null, v.condition || null, v.cause || null, v.effect || null,
      v.recommendation || null, v.rating, v.owner_type, v.owner_email, v.owner_office, v.due_date, v.due_reason, now, id);
    if (!ok) return stale();
    await log(id, "EDITED", null, null);
    return json({ ok: true });
  }

  if (action === "withdraw") {
    const denied = need(p.withdraw); if (denied) return denied;
    const reason = note("reason", 5, 500);
    if (!reason) return json({ error: "Say why the draft is withdrawn.", fields: { reason: "LENGTH" } }, 400);
    if (!(await setStatus("UPDATE observations SET status = 'WITHDRAWN', updated_at = ? WHERE id = ? AND status = 'DRAFT'", now, id))) return stale();
    await log(id, "WITHDRAWN", reason, null);
    return json({ ok: true });
  }

  if (action === "issue") {
    const denied = need(p.issue); if (denied) return denied;
    // Everything must be complete to issue.
    const d = readDraft({
      title: o.title, subjectType: o.subject_type, subjectCases: JSON.parse(o.subject_cases || "[]"), subjectOffice: o.subject_office, subjectProcess: o.subject_process,
      criteria: o.criteria, condition: o.condition, cause: o.cause, effect: o.effect, recommendation: o.recommendation, rating: o.rating,
      ownerType: o.owner_type, ownerEmail: o.owner_email, ownerOffice: o.owner_office, dueDate: o.due_date, dueReason: o.due_reason,
    }, true);
    if (d.fields) return json({ error: "Complete every field before issuing.", fields: d.fields, code: "INCOMPLETE" }, 400);
    const ownerErr = await checkOwner(d.value);
    if (ownerErr) return ownerErr;
    // Due date: the one set, or the default for the rating from today. A
    // date other than the default needs a reason.
    const def = defaultDue(o.rating, today);
    const due = o.due_date || def;
    if (due < today) return json({ error: "The due date can't be in the past.", fields: { dueDate: "PAST" } }, 400);
    if (due !== def && !(o.due_reason && o.due_reason.length >= 5)) return json({ error: "Give a reason for a due date other than the default.", fields: { dueReason: "REQUIRED" } }, 400);
    if (!(await setStatus("UPDATE observations SET status = 'ISSUED', due_date = ?, issued_at = ?, issued_by = ?, updated_at = ? WHERE id = ? AND status = 'DRAFT'", due, now, auth.email, now, id))) return stale();
    const office = o.owner_type === "OFFICE" ? await officeByKey(env, o.owner_office) : null;
    await log(id, "ISSUED", null, { dueDate: due, owner: office ? officeText(office) : o.owner_email, ownerOffice: o.owner_office || undefined });
    const rc = await ownerRecipients(env, o);
    const emailed = await notifyAudit(env, request, rc.to, `${o.ref} — ${o.title}`, [
      office ? `An audit observation has been issued to your office (${officeText(office)}): ${o.ref} — ${o.title} (rating: ${o.rating}).`
        : `An audit observation has been issued to you: ${o.ref} — ${o.title} (rating: ${o.rating}).`,
      `Please reply with whether you agree and your action plan by ${due}.` + (office ? " Open the Audit tab in the GrievIQ representative console." : ""),
    ], id, rc.link);
    return json({ ok: true, emailed, recipients: rc.to.length, dueDate: due });
  }

  if (action === "amend") {
    const denied = need(p.amend); if (denied) return denied;
    const field = String(body.field || "");
    const reason = note("reason", 5, 500);
    let value = String(body.value == null ? "" : body.value).trim();
    const fields = {};
    if (!AMENDABLE.includes(field)) fields.field = "FIELD";
    if (!reason) fields.reason = "LENGTH";
    if (field === "rating") { value = value.toUpperCase(); if (!RATINGS.includes(value)) fields.value = "RATING"; }
    else if (field === "due_date") { if (!isDay(value)) fields.value = "DATE"; else if (value < today) fields.value = "PAST"; }
    else if (field === "title") { if (value.length < LIMITS.title[0] || value.length > LIMITS.title[1]) fields.value = "LENGTH"; }
    else if (field && (value.length < LIMITS.text[0] || value.length > LIMITS.text[1])) fields.value = "LENGTH";
    if (!fields.value && field && value === String(eff[field] == null ? "" : eff[field])) fields.value = "SAME";
    if (Object.keys(fields).length) return json({ error: "Please correct the highlighted fields.", fields }, 400);
    await env.DB.prepare("INSERT INTO observation_amendments (id, observation_id, field, old_value, new_value, reason, amended_by, amended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), id, field, eff[field] == null ? null : String(eff[field]), value, reason, auth.email, now).run();
    await env.DB.prepare("UPDATE observations SET updated_at = ? WHERE id = ?").bind(now, id).run();
    await log(id, "AMENDED", reason, { field, from: eff[field], to: value });
    return json({ ok: true });
  }

  if (action === "respond" || action === "report_done" || action === "comment") {
    const allowed = action === "respond" ? p.respond : action === "report_done" ? p.reportDone : p.comment;
    const denied = need(allowed); if (denied) return denied;
    // Item 10: a person covering for the owner acts on their behalf (recorded).
    const behalf = ownsAs(auth, o);
    const covering = behalf && behalf !== auth.email ? behalf : null;
    return ownerAction(action, { env, request, o, body, json, who: covering ? `${auth.email} (covering for ${covering})` : auth.email,
      log: (kind, text, detail) => log(id, kind, text, covering ? Object.assign({}, detail || {}, { onBehalfOf: covering }) : detail) });
  }

  if (action === "close") {
    const denied = need(p.close); if (denied) return denied;
    const n = note("note", 10, 2000);
    if (!n) return json({ error: "Record how you verified the action (at least 10 characters).", fields: { note: "LENGTH" } }, 400);
    if (!(await setStatus("UPDATE observations SET status = 'CLOSED', closed_at = ?, closed_by = ?, updated_at = ? WHERE id = ? AND status = 'DONE_REPORTED'", now, auth.email, now, id))) return stale();
    await log(id, "CLOSED", n, null);
    { const rc = await ownerRecipients(env, o); await notifyAudit(env, request, rc.to, `${o.ref} — closed`, [`The auditor has verified the action for ${o.ref} — ${o.title} and closed it.`], id, rc.link); }
    return json({ ok: true });
  }

  if (action === "send_back") {
    const denied = need(p.sendBack); if (denied) return denied;
    const n = note("note", 10, 2000);
    if (!n) return json({ error: "Say what is still missing (at least 10 characters).", fields: { note: "LENGTH" } }, 400);
    if (!(await setStatus("UPDATE observations SET status = 'RESPONDED', updated_at = ? WHERE id = ? AND status = 'DONE_REPORTED'", now, id))) return stale();
    await log(id, "SENT_BACK", n, null);
    { const rc = await ownerRecipients(env, o); await notifyAudit(env, request, rc.to, `${o.ref} — sent back`, [`The auditor has sent ${o.ref} — ${o.title} back: ${n}`], id, rc.link); }
    return json({ ok: true });
  }

  if (action === "accept_risk") {
    if (can(auth.roles || auth.role, "accept_risk") && ownsAs(auth, o) !== null) {
      return json({ error: "You can't accept the risk on an observation you own.", code: "OWNER" }, 403);
    }
    const denied = need(p.acceptRisk); if (denied) return denied;
    const reason = note("reason", 20, 2000);
    const review = String(body.reviewDate || "");
    const fields = {};
    if (!reason) fields.reason = "LENGTH";
    if (!isDay(review)) fields.reviewDate = "DATE"; else if (review <= today) fields.reviewDate = "PAST";
    if (Object.keys(fields).length) return json({ error: "Please correct the highlighted fields.", fields }, 400);
    if (!(await setStatus(
      "UPDATE observations SET status = 'RISK_ACCEPTED', risk_reason = ?, risk_review_date = ?, closed_at = ?, closed_by = ?, updated_at = ? WHERE id = ? AND status IN ('ISSUED', 'RESPONDED', 'DONE_REPORTED')",
      reason, review, now, auth.email, now, id))) return stale();
    await log(id, "RISK_ACCEPTED", reason, { reviewDate: review });
    const riskLine = [`${auth.email} (super admin) has formally accepted the risk for ${o.ref} — ${o.title}. Reason: ${reason}. To be looked at again by ${review}.`];
    await notifyAudit(env, request, [o.issued_by || o.created_by], `${o.ref} — risk accepted`, riskLine, id, "staff");
    { const rc = await ownerRecipients(env, o); await notifyAudit(env, request, rc.to, `${o.ref} — risk accepted`, riskLine, id, rc.link); }
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 400);
}
