/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/admin/onboarding.js (grieviq-83): the onboarding form.
// GET  (view_sales)
//   ?lead=<id>               the lead's form (or none yet), the questions, and what the person may do
//   ?queue=1                 forms waiting for a check (manage_sales; the auditor reads)
//   ?find=<words>&type=ward|mla|mp|mayor     GrievIQ records to pick the office or a ward from
//   ?units=<type>&id=<id>    the wards and villages under an office (for the localities)
//   ?schema=OFFICE|DEPARTMENT the questions alone (the blank form to print)
// POST (work_sales; sales staff accept the sales code of conduct first)
//   save    { lead, version, answers }   saves itself as the form is filled; a refused answer
//                                        keeps its previous value and is named in "fields"
//   submit  { lead, version }            by the person filling it; moves the lead on (signed: Won,
//                                        declined: Lost with the reason, later: the next follow-up)
//   return  { lead, note }               manage_sales, not someone who edited it: sent back
//   check   { lead }                     manage_sales, not someone who edited it: signed forms are
//                                        sent for setup (change requests + a checklist), others closed
//   task    { lead, task, done }         a checklist item ticked or unticked
// grieviq-85: practice { kind, answers, submit: true } also returns the check report
// (advice + result) and records name, date, kind and result only (never answers)
// in onboarding_practice, kept 12 months. GET ?practiceLog=1 (sales managers,
// super and operations admins, the auditor) lists sales staff and their practice;
// GET ?practiceMine=1 is the person's own line.
//   practice { kind, answers }           (grieviq-84) practice mode: the same checks as save and
//                                        submit, on a made-up office; nothing is read or written

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { needsSalesCode } from "../../_shared/sales-code.js";
import { GST_STATES } from "../../_shared/tax-docs.js";
import { OPEN_STAGES, salesReady, statesOf, leadAccess, logLead, istToday } from "../../_shared/sales.js";
import {
  SIGNED, formKindOf, fieldsFor, sectionsFor, cleanAnswers, missing, maskAnswers, checklistFor, makeChangeRequests, onboardingReady, logForm,
  reviewAdvice, practiceResult,
} from "../../_shared/onboarding.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const clean = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max + 1);
async function adminLog(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, target, detail == null ? null : JSON.stringify(detail)).run();
}
const like = (q) => "%" + String(q).replace(/[\\%_]/g, (c) => "\\" + c) + "%";

function formOut(f, auditor) {
  if (!f) return null;
  const answers = parse(f.answers, {});
  return {
    id: f.id, kind: f.form_kind, status: f.status, outcome: f.outcome || null, version: f.version,
    answers: auditor ? maskAnswers(answers) : answers, editors: parse(f.editors, []),
    createdBy: f.created_by, createdAt: f.created_at, updatedBy: f.updated_by, updatedAt: f.updated_at,
    submittedBy: f.submitted_by || null, submittedAt: f.submitted_at || null, returnNote: f.return_note || "",
    checkedBy: f.checked_by || null, checkedAt: f.checked_at || null,
    checklist: parse(f.checklist, []), setupNotes: parse(f.setup_notes, []), erased: !!f.erased_at,
  };
}

async function officeSearch(env, type, q) {
  const w = like(q);
  if (type === "ward") {
    const { results } = await env.DB.prepare(
      `SELECT lu.id, lu.name, lu.unit_type AS ut, m.name AS mla, a.name AS area FROM local_units lu
       LEFT JOIN mla_constituencies m ON m.id = lu.mla_constituency_id LEFT JOIN areas a ON a.id = lu.area_id
       WHERE lu.name LIKE ? ESCAPE '\\' ORDER BY lu.name LIMIT 15`).bind(w).all();
    return (results || []).map((r) => ({ type: "ward", id: r.id, label: r.name + (r.area || r.mla ? " (" + [r.area, r.mla ? "MLA seat: " + r.mla : ""].filter(Boolean).join(", ") + ")" : ""), rural: r.ut === "RURAL" }));
  }
  const t = { mla: "mla_constituencies", mp: "mp_constituencies", mayor: "municipal_bodies" }[type];
  if (!t) return [];
  const { results } = await env.DB.prepare(`SELECT id, name FROM ${t} WHERE name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 15`).bind(w).all();
  return (results || []).map((r) => ({ type, id: r.id, label: r.name }));
}
async function unitsUnder(env, type, id) {
  let sql, b = [id];
  if (type === "ward") sql = "SELECT lu.id, lu.name FROM local_units lu WHERE lu.id = ?";
  else if (type === "mla") sql = "SELECT lu.id, lu.name FROM local_units lu WHERE lu.mla_constituency_id = ? ORDER BY lu.name LIMIT 400";
  else if (type === "mp") sql = "SELECT lu.id, lu.name FROM local_units lu JOIN mla_constituencies m ON m.id = lu.mla_constituency_id WHERE m.mp_constituency_id = ? ORDER BY lu.name LIMIT 400";
  else if (type === "mayor") sql = "SELECT lu.id, lu.name FROM local_units lu WHERE lu.municipal_body_id = ? ORDER BY lu.name LIMIT 400";
  else return [];
  const { results } = await env.DB.prepare(sql).bind(...b).all();
  return (results || []).map((r) => ({ type: "ward", id: r.id, label: r.name }));
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_sales");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await salesReady(env)) || !(await onboardingReady(env))) return json({ ready: false });
  const url = new URL(request.url);
  const canWork = allows(auth, "work_sales"), canManage = allows(auth, "manage_sales");
  const auditor = !canWork && auth.role === "auditor";
  if (!canWork && !auditor) return json({ error: "INSUFFICIENT_ROLE" }, 403);
  const myStates = canWork ? await statesOf(env, auth.email) : [];

  // The questions alone, for the blank form to print.
  if (url.searchParams.has("schema")) {
    const kind = url.searchParams.get("schema") === "DEPARTMENT" ? "DEPARTMENT" : "OFFICE";
    return json({ ready: true, kind, sections: sectionsFor(kind), fields: fieldsFor(kind), today: istToday(),
      states: Object.keys(GST_STATES).map((c) => ({ code: c, name: GST_STATES[c] })).sort((a, b) => a.name.localeCompare(b.name)) });
  }
  if (url.searchParams.has("find")) {
    if (!canWork) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const q = clean(url.searchParams.get("find"), 60);
    if (q.length < 2) return json({ results: [] });
    return json({ results: await officeSearch(env, String(url.searchParams.get("type") || ""), q) });
  }
  if (url.searchParams.has("units")) {
    if (!canWork) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    return json({ results: await unitsUnder(env, String(url.searchParams.get("units") || ""), String(url.searchParams.get("id") || "")) });
  }
  if (url.searchParams.has("practiceMine")) {
    try {
      const r = await env.DB.prepare("SELECT COUNT(*) AS n, MAX(created_at) AS last FROM onboarding_practice WHERE email = ?").bind(auth.email).first();
      const last = r && r.n ? await env.DB.prepare("SELECT form_kind, result, to_fix, created_at FROM onboarding_practice WHERE email = ? ORDER BY created_at DESC LIMIT 1").bind(auth.email).first() : null;
      return json({ ready: true, count: (r && r.n) || 0, last: last ? { at: last.created_at, kind: last.form_kind, result: last.result, toFix: last.to_fix } : null });
    } catch (e) { return json({ ready: false }); }
  }
  if (url.searchParams.has("practiceLog")) {
    if (!canManage && !auditor) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    try {
      const { results } = await env.DB.prepare(
        `SELECT u.email, u.name, u.employee_id, u.role, u.status,
           (SELECT COUNT(*) FROM onboarding_practice p WHERE p.email = u.email) AS n,
           (SELECT created_at || '|' || form_kind || '|' || result || '|' || to_fix FROM onboarding_practice p WHERE p.email = u.email ORDER BY created_at DESC LIMIT 1) AS last
         FROM admin_users u
         WHERE (u.role IN ('sales_executive', 'sales_manager') OR EXISTS (SELECT 1 FROM onboarding_practice p WHERE p.email = u.email))
           AND COALESCE(u.status, 'PRESENT') <> 'LEFT'
         ORDER BY u.name COLLATE NOCASE, u.email LIMIT 300`).all();
      return json({ ready: true, people: (results || []).map((r) => {
        const x = r.last ? r.last.split("|") : null;
        return { name: r.name || null, employeeId: r.employee_id || null, email: auditor ? null : r.email, role: r.role, count: r.n || 0,
          last: x ? { at: x[0], kind: x[1], result: x[2], toFix: Number(x[3]) || 0 } : null };
      }) });
    } catch (e) { return json({ ready: false }); }
  }
  if (url.searchParams.get("queue")) {
    if (!canManage && !auditor) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const { results } = await env.DB.prepare(
      `SELECT f.lead_id, f.status, f.outcome, f.submitted_by, f.submitted_at, f.editors, l.ref, l.office_name, l.office_kind FROM onboarding_forms f JOIN sales_leads l ON l.id = f.lead_id
       WHERE f.status = 'SUBMITTED' ORDER BY f.submitted_at LIMIT 200`).all();
    return json({ ready: true, me: auth.email, canManage, auditor, forms: (results || []).map((r) => ({ lead: r.lead_id, ref: r.ref, officeName: r.office_name, officeKind: r.office_kind,
      outcome: r.outcome, submittedBy: r.submitted_by, submittedAt: r.submitted_at, mine: parse(r.editors, []).includes(auth.email) })) });
  }

  const leadId = String(url.searchParams.get("lead") || "");
  const l = await env.DB.prepare("SELECT * FROM sales_leads WHERE id = ?").bind(leadId).first();
  const access = l ? leadAccess(auth, l, myStates) : null;
  if (!l || !access.see) return json({ error: "NOT_FOUND" }, 404);
  const f = await env.DB.prepare("SELECT * FROM onboarding_forms WHERE lead_id = ?").bind(l.id).first();
  const kind = f ? f.form_kind : formKindOf(l.office_kind);
  const form = formOut(f, auditor);
  const editable = !!access.edit && !l.erased_at && (!f || f.status === "DRAFT" || f.status === "RETURNED");
  const editors = form ? form.editors : [];
  let changes = [], events = [];
  if (f) {
    const ids = parse(f.change_ids, []);
    if (ids.length) {
      const { results } = await env.DB.prepare(`SELECT id, status, target_label, review_note FROM change_requests WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
      changes = (results || []).map((r) => ({ id: r.id, status: r.status, label: r.target_label, note: r.review_note || "" }));
    }
    const { results: ev } = await env.DB.prepare("SELECT at, by_email, kind, note FROM onboarding_events WHERE form_id = ? ORDER BY at DESC LIMIT 100").bind(f.id).all();
    events = (ev || []).map((e) => ({ at: e.at, by: e.by_email, kind: e.kind, note: e.note || "" }));
  }
  return json({
    ready: true, today: istToday(), me: auth.email, auditor,
    lead: { id: l.id, ref: l.ref, officeKind: l.office_kind, officeName: l.office_name, place: l.place || "", state: l.state_code || null, stage: l.stage, erased: !!l.erased_at },
    kind, sections: sectionsFor(kind), fields: fieldsFor(kind),
    states: Object.keys(GST_STATES).map((c) => ({ code: c, name: GST_STATES[c] })).sort((a, b) => a.name.localeCompare(b.name)),
    officeType: { PRADHAN: "ward", COUNCILLOR: "ward", MAYOR: "mayor", MLA: "mla", MP: "mp" }[l.office_kind] || null,
    form, changes, events,
    missing: f ? missing(kind, parse(f.answers, {})) : null,
    // grieviq-85: advice for the manager's check (never blocks)
    advice: f && (canManage || auditor) && f.status !== "DRAFT" ? reviewAdvice(kind, parse(f.answers, {}), l.office_kind) : null,
    can: {
      edit: editable,
      submit: editable && !!f,
      check: !!f && f.status === "SUBMITTED" && canManage && !editors.includes(auth.email) && !l.erased_at,
      tick: !!f && f.status === "SENT" && (access.edit || canManage) && !auditor,
      checkBlockedOwn: !!f && f.status === "SUBMITTED" && canManage && editors.includes(auth.email),
    },
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "work_sales");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await salesReady(env)) || !(await onboardingReady(env))) return json({ error: "NOT_READY" }, 409);
  if (await needsSalesCode(env, auth)) return json({ error: "CODE_NOT_ACCEPTED" }, 403);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  // Practice: the same checks as a real form. Nothing is sent and the answers are never stored;
  // a submit records only who, when, which form and the result (grieviq-85).
  if (b.action === "practice") {
    const kind = b.kind === "DEPARTMENT" ? "DEPARTMENT" : "OFFICE";
    if (JSON.stringify(b.answers || {}).length > 120000) return json({ error: "TOO_BIG" }, 413);
    const { answers, fields } = cleanAnswers(kind, b.answers, {});
    const miss = missing(kind, answers);
    if (!b.submit) return json({ ok: true, practice: true, fields, missing: miss });
    const advice = reviewAdvice(kind, answers, kind === "OFFICE" ? "COUNCILLOR" : "DEPARTMENT");
    const result = practiceResult(miss, fields, advice);
    const toFix = result === "REFUSED" ? miss.length + Object.keys(fields).length : advice.issues.length;
    let recorded = false;
    try {
      // One line per submit (not more than one every 10 seconds); never the answers.
      const recent = await env.DB.prepare("SELECT 1 FROM onboarding_practice WHERE email = ? AND created_at > ?").bind(auth.email, new Date(Date.now() - 10000).toISOString()).first();
      if (!recent) {
        await env.DB.prepare("INSERT INTO onboarding_practice (id, admin_id, email, form_kind, result, to_fix, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), auth.adminId || null, auth.email, kind, result, toFix, new Date().toISOString()).run();
        recorded = true;
      }
      await env.DB.prepare("DELETE FROM onboarding_practice WHERE created_at < ?").bind(new Date(Date.now() - 365 * 86400000).toISOString()).run();
    } catch (e) { /* the practice record is optional: the report still shows */ }
    return json({ ok: true, practice: true, fields, missing: miss, advice, result, toFix, recorded });
  }
  const canManage = allows(auth, "manage_sales");
  const now = new Date().toISOString();
  const myStates = await statesOf(env, auth.email);
  const l = await env.DB.prepare("SELECT * FROM sales_leads WHERE id = ?").bind(String(b.lead || "")).first();
  const access = l ? leadAccess(auth, l, myStates) : null;
  if (!l || !access.see) return json({ error: "NOT_FOUND" }, 404);
  if (l.erased_at) return json({ error: "ERASED" }, 409);
  let f = await env.DB.prepare("SELECT * FROM onboarding_forms WHERE lead_id = ?").bind(l.id).first();

  if (b.action === "save") {
    if (!access.edit) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    if (f && f.status !== "DRAFT" && f.status !== "RETURNED") return json({ error: "LOCKED", status: f.status }, 409);
    const kind = f ? f.form_kind : formKindOf(l.office_kind);
    if (f && Number(b.version) !== f.version) return json({ error: "CHANGED", version: f.version }, 409);
    const prev = f ? parse(f.answers, {}) : {};
    const { answers, fields } = cleanAnswers(kind, b.answers, prev);
    const text = JSON.stringify(answers);
    if (text.length > 120000) return json({ error: "TOO_BIG" }, 413);
    if (!f) {
      const id = crypto.randomUUID();
      try {
        await env.DB.prepare(`INSERT INTO onboarding_forms (id, lead_id, form_kind, answers, outcome, version, editors, created_by, created_at, updated_by, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`).bind(id, l.id, kind, text, answers.x_outcome || null, JSON.stringify([auth.email]), auth.email, now, auth.email, now).run();
      } catch (e) {
        if (/UNIQUE/i.test(String(e && e.message))) return json({ error: "CHANGED", version: 1 }, 409);
        throw e;
      }
      await logForm(env, id, auth.email, "STARTED");
      return json({ ok: true, version: 1, fields, missing: missing(kind, answers), answers });
    }
    const editors = parse(f.editors, []);
    if (!editors.includes(auth.email)) editors.push(auth.email);
    const r = await env.DB.prepare("UPDATE onboarding_forms SET answers = ?, outcome = ?, version = version + 1, editors = ?, updated_by = ?, updated_at = ? WHERE id = ? AND version = ?")
      .bind(text, answers.x_outcome || null, JSON.stringify(editors), auth.email, now, f.id, f.version).run();
    if (!r.meta || r.meta.changes !== 1) return json({ error: "CHANGED" }, 409);
    return json({ ok: true, version: f.version + 1, fields, missing: missing(kind, answers), answers });
  }

  if (!f) return json({ error: "NO_FORM" }, 404);
  const answers = parse(f.answers, {});
  const editors = parse(f.editors, []);

  if (b.action === "submit") {
    if (!access.edit) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    if (f.status !== "DRAFT" && f.status !== "RETURNED") return json({ error: "LOCKED", status: f.status }, 409);
    if (Number(b.version) !== f.version) return json({ error: "CHANGED", version: f.version }, 409);
    const need = missing(f.form_kind, answers);
    if (need.length) return json({ error: "MISSING", missing: need }, 400);
    const r = await env.DB.prepare("UPDATE onboarding_forms SET status = 'SUBMITTED', submitted_by = ?, submitted_at = ?, return_note = NULL, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
      .bind(auth.email, now, now, f.id, f.version).run();
    if (!r.meta || r.meta.changes !== 1) return json({ error: "CHANGED" }, 409);
    await logForm(env, f.id, auth.email, "SUBMITTED", answers.x_outcome);
    // The lead moves on with the outcome (only while it is open).
    let stage = l.stage;
    const o = answers.x_outcome;
    if (OPEN_STAGES.includes(l.stage)) {
      if (SIGNED.includes(o) || o === "DECLINED") {
        stage = o === "DECLINED" ? "LOST" : "WON";
        const note = (o === "DECLINED" ? [answers.x_reason, "onboarding form"] : ["onboarding form: " + (o === "SIGNED_PILOT" ? "signed for a pilot" : "signed, paid")]).filter(Boolean).join(" · ");
        await env.DB.prepare("UPDATE sales_leads SET stage = ?, lost_reason = ?, closed_at = ?, next_date = NULL, updated_at = ? WHERE id = ?")
          .bind(stage, o === "DECLINED" ? answers.x_reason : null, now, now, l.id).run();
        await logLead(env, l.id, auth.email, "STAGE", { from: l.stage, to: stage, note });
      } else if (answers.x_next_date) {
        await env.DB.prepare("UPDATE sales_leads SET next_date = ?, next_step = ?, updated_at = ? WHERE id = ?").bind(answers.x_next_date, answers.x_next_step || null, now, l.id).run();
        await logLead(env, l.id, auth.email, "NEXT", { note: [answers.x_next_date, answers.x_next_step].filter(Boolean).join(" · ") });
      }
    }
    await adminLog(env, auth.email, "onboarding_submitted", l.ref, { outcome: o, stage });
    return json({ ok: true, stage });
  }

  if (b.action === "return" || b.action === "check") {
    if (!canManage) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    if (f.status !== "SUBMITTED") return json({ error: "LOCKED", status: f.status }, 409);
    if (editors.includes(auth.email)) return json({ error: "OWN_FORM" }, 403);
    if (b.action === "return") {
      const note = clean(b.note, 300);
      if (note.length < 5) return json({ error: "CHECK_FIELDS", fields: { note: "REQUIRED" } }, 400);
      if (note.length > 300) return json({ error: "CHECK_FIELDS", fields: { note: "LENGTH" } }, 400);
      await env.DB.prepare("UPDATE onboarding_forms SET status = 'RETURNED', return_note = ?, version = version + 1, updated_at = ? WHERE id = ?").bind(note, now, f.id).run();
      await logForm(env, f.id, auth.email, "RETURNED", note);
      await adminLog(env, auth.email, "onboarding_returned", l.ref, null);
      return json({ ok: true, status: "RETURNED" });
    }
    if (!SIGNED.includes(answers.x_outcome)) {
      await env.DB.prepare("UPDATE onboarding_forms SET status = 'CHECKED', checked_by = ?, checked_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND status = 'SUBMITTED'").bind(auth.email, now, now, f.id).run();
      await logForm(env, f.id, auth.email, "CHECKED");
      await adminLog(env, auth.email, "onboarding_checked", l.ref, { outcome: answers.x_outcome });
      return json({ ok: true, status: "CHECKED" });
    }
    // Claim the form first, so two people can't send it twice.
    const claim = await env.DB.prepare("UPDATE onboarding_forms SET status = 'SENT', checked_by = ?, checked_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND status = 'SUBMITTED'").bind(auth.email, now, now, f.id).run();
    if (!claim.meta || claim.meta.changes !== 1) return json({ error: "LOCKED" }, 409);
    const made = await makeChangeRequests(env, auth.email, f, l, answers);
    await env.DB.prepare("UPDATE onboarding_forms SET checklist = ?, setup_notes = ?, change_ids = ? WHERE id = ?")
      .bind(JSON.stringify(checklistFor(f.form_kind, answers)), JSON.stringify(made.notes), JSON.stringify(made.ids), f.id).run();
    await logForm(env, f.id, auth.email, "SENT", String(made.ids.length));
    await adminLog(env, auth.email, "onboarding_sent_for_setup", l.ref, { changeRequests: made.ids.length, notes: made.notes.length });
    return json({ ok: true, status: "SENT", changeRequests: made.ids.length, notes: made.notes });
  }

  if (b.action === "task") {
    if (f.status !== "SENT") return json({ error: "LOCKED", status: f.status }, 409);
    if (!access.edit && !canManage) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const list = parse(f.checklist, []);
    const item = list.find((x) => x.k === String(b.task || ""));
    if (!item) return json({ error: "CHECK_FIELDS", fields: { task: "REQUIRED" } }, 400);
    const done = !!b.done;
    if (!!item.done === done) return json({ ok: true, same: true });
    item.done = done ? { at: now, by: auth.email } : null;
    await env.DB.prepare("UPDATE onboarding_forms SET checklist = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(list), now, f.id).run();
    await logForm(env, f.id, auth.email, done ? "TASK_DONE" : "TASK_UNDONE", item.k);
    return json({ ok: true, checklist: list });
  }

  return json({ error: "Unknown action." }, 400);
}

