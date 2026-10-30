/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/admin/staff-records.js (grieviq-78): staff records and
// access controls. Never salary, bank details, Aadhaar or PAN, ID copies,
// attendance or appraisals: those stay in the payroll / HR system.
// GET  (view_staff_records)   people with their record, joining checks,
//      policy sign-offs, last sign-in, pauses, the quarter's access review and
//      leaving checklists. Management: counts only.
// POST (manage_staff_records: super admin, "Staff records" duty holder)
//   record  { email, managerEmail, joinedOn, kind, probationEnd, contractEnd }
//   check   { email, item, doneOn, ref }      or { email, item, clear: true, reason }
//   restore { email, reason }                 access paused by GrievIQ
//   review_start {}                           this quarter's access review
//   review_decide { id, decision: KEEP|CHANGE|REMOVE, note }
//   exit    { email, item, note? }            leaving checklist
// Nobody records their own checks, record or review decision. Every change
// goes to admin_events (which can't be changed).

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import {
  recordsReady, policiesNeeded, checksNeeded, CHECK_ITEMS, EXIT_ITEMS, KINDS, DORMANT_FLAG_DAYS, DORMANT_PAUSE_DAYS, istToday, addDays, quarterOf, POLICIES,
} from "../../_shared/staff-policies.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const clean = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max + 1);
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) && !isNaN(Date.parse(d + "T00:00:00Z")) && new Date(d + "T00:00:00Z").toISOString().slice(0, 10) === d;
async function logEvent(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, target, detail == null ? null : JSON.stringify(detail)).run();
}
const daysSince = (iso, nowMs) => iso ? Math.floor(((nowMs || Date.now()) - Date.parse(iso)) / 86400000) : null;

async function loadPeople(env, today) {
  const yearAgo = addDays(today, -365);
  const { results: users } = await env.DB.prepare(
    `SELECT id, LOWER(email) AS email, name, employee_id, role, status, left_at, last_seen_at, auto_paused, auto_paused_at, created_at FROM admin_users
     WHERE COALESCE(status, 'PRESENT') <> 'LEFT' OR left_at >= ? ORDER BY COALESCE(status, 'PRESENT') = 'LEFT', name, email`
  ).bind(yearAgo).all();
  const { results: recs } = await env.DB.prepare("SELECT * FROM staff_records").all();
  const { results: checks } = await env.DB.prepare("SELECT * FROM staff_checks").all();
  const { results: exits } = await env.DB.prepare("SELECT * FROM staff_exit_items").all();
  const { results: duties } = await env.DB.prepare("SELECT admin_id, duty FROM staff_duties WHERE ended_at IS NULL").all();
  let leads = [];
  try { leads = (await env.DB.prepare("SELECT owner_email, COUNT(*) AS n FROM sales_leads WHERE closed_at IS NULL AND owner_email IS NOT NULL GROUP BY owner_email").all()).results || []; } catch (e) { leads = []; }
  return { users: users || [], recs: recs || [], checks: checks || [], exits: exits || [], duties: duties || [], leads };
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_staff_records");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await recordsReady(env))) return json({ ready: false });
  const today = istToday(), quarter = quarterOf(today), nowMs = Date.now();
  const canManage = allows(auth, "manage_staff_records");
  const full = canManage || allows(auth, "view_staff_records") && (auth.role === "auditor" || auth.role === "super_admin");
  const d = await loadPeople(env, today);
  const byId = Object.fromEntries(d.users.map((u) => [u.id, u]));
  const people = [];
  for (const u of d.users) {
    const left = u.status === "LEFT";
    const rec = d.recs.find((r) => r.admin_id === u.id) || {};
    const myDuties = d.duties.filter((x) => x.admin_id === u.id).map((x) => x.duty);
    const needed = checksNeeded(u.role, myDuties);
    const checks = {};
    for (const c of d.checks.filter((x) => x.admin_id === u.id)) checks[c.item] = { doneOn: c.done_on, ref: c.ref || "", by: c.recorded_by, at: c.recorded_at };
    const exit = {};
    for (const x of d.exits.filter((y) => y.admin_id === u.id)) exit[x.item] = { at: x.done_at, by: x.done_by, note: x.note || "" };
    const seen = daysSince(u.last_seen_at, nowMs);
    const leadsOpen = (d.leads.find((l) => l.owner_email === u.email) || {}).n || 0;
    people.push({
      id: u.id, email: u.email, name: u.name || u.email, employeeId: u.employee_id || null, role: u.role, status: u.status || "PRESENT", leftAt: u.left_at || null, duties: myDuties,
      record: { managerId: rec.manager_id || null, managerName: rec.manager_id && byId[rec.manager_id] ? (byId[rec.manager_id].name || byId[rec.manager_id].email) : null, joinedOn: rec.joined_on || null, kind: rec.kind || null,
        probationEnd: rec.probation_end || null, contractEnd: rec.contract_end || null, updatedBy: rec.updated_by || null, updatedAt: rec.updated_at || null },
      checks, needed, missing: left ? [] : needed.filter((i) => !checks[i]),
      policiesNeed: left ? [] : await policiesNeeded(env, u.id),
      lastSeen: u.last_seen_at || null, seenDays: seen, flag: !left && seen != null && seen >= DORMANT_FLAG_DAYS,
      autoPaused: u.auto_paused || null, autoPausedAt: u.auto_paused_at || null,
      contractSoon: !left && !!rec.contract_end && rec.contract_end >= today && rec.contract_end <= addDays(today, 30),
      exit: left ? { items: exit, open: EXIT_ITEMS.filter((i) => !exit[i]), leadsOpen, dutiesOpen: myDuties.length } : null,
    });
  }
  const active = people.filter((p) => p.status !== "LEFT");
  const review = await env.DB.prepare("SELECT * FROM access_reviews WHERE quarter = ?").bind(quarter).first();
  let reviewOut = { quarter, started: false };
  if (review) {
    const { results: items } = await env.DB.prepare("SELECT i.*, a.name, LOWER(a.email) AS email, a.employee_id FROM access_review_items i JOIN admin_users a ON a.id = i.admin_id WHERE i.review_id = ? ORDER BY a.name, a.email").bind(review.id).all();
    reviewOut = { quarter, started: true, startedAt: review.started_at, startedBy: review.started_by, finishedAt: review.finished_at || null, finishedBy: review.finished_by || null,
      items: (items || []).map((i) => ({ id: i.id, adminId: i.admin_id, name: i.name || i.email, email: i.email, employeeId: i.employee_id || null, role: i.role, duties: i.duties ? JSON.parse(i.duties) : [],
        lastSeen: i.last_seen || null, seenDays: daysSince(i.last_seen, nowMs), decision: i.decision || null, note: i.note || "", decidedBy: i.decided_by || null, decidedAt: i.decided_at || null, mine: i.admin_id === auth.adminId })) };
  }
  const counts = {
    staff: active.length, checksComplete: active.filter((p) => !p.missing.length).length, policiesOk: active.filter((p) => !p.policiesNeed.length).length,
    contractsSoon: active.filter((p) => p.contractSoon).length, paused: active.filter((p) => p.autoPaused).length, flagged: active.filter((p) => p.flag).length,
    exitsOpen: people.filter((p) => p.exit && (p.exit.open.length || p.exit.leadsOpen)).length,
    review: review ? (review.finished_at ? "DONE" : "OPEN") : "NOT_STARTED",
  };
  if (!full) return json({ ready: true, totalsOnly: true, today, quarter, counts });
  const thresholds = [10, 20].filter((n) => active.length >= n);
  return json({ ready: true, totalsOnly: false, canManage, me: auth.email, myId: auth.adminId, today, quarter, counts, people, review: reviewOut, thresholds,
    items: CHECK_ITEMS, exitItems: EXIT_ITEMS, kinds: KINDS, policies: POLICIES, dormant: { flag: DORMANT_FLAG_DAYS, pause: DORMANT_PAUSE_DAYS } });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_staff_records");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await recordsReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const today = istToday(), now = new Date().toISOString();
  const bad = (fields) => json({ error: "CHECK_FIELDS", fields }, 400);
  const person = async (email) => env.DB.prepare("SELECT * FROM admin_users WHERE LOWER(email) = ?").bind(String(email || "").trim().toLowerCase()).first();

  if (b.action === "review_start") {
    const quarter = quarterOf(today);
    const have = await env.DB.prepare("SELECT id FROM access_reviews WHERE quarter = ?").bind(quarter).first();
    if (have) return json({ error: "STARTED" }, 409);
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO access_reviews (id, quarter, started_at, started_by) VALUES (?, ?, ?, ?)").bind(id, quarter, now, auth.email).run();
    const { results } = await env.DB.prepare("SELECT id, role, last_seen_at FROM admin_users WHERE COALESCE(status, 'PRESENT') <> 'LEFT'").all();
    const { results: du } = await env.DB.prepare("SELECT admin_id, duty FROM staff_duties WHERE ended_at IS NULL").all();
    for (const u of results || []) {
      const ds = (du || []).filter((x) => x.admin_id === u.id).map((x) => x.duty);
      await env.DB.prepare("INSERT INTO access_review_items (id, review_id, admin_id, role, duties, last_seen) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), id, u.id, u.role, ds.length ? JSON.stringify(ds) : null, u.last_seen_at || null).run();
    }
    await logEvent(env, auth.email, "access_review_started", quarter, { people: (results || []).length });
    return json({ ok: true, quarter });
  }

  if (b.action === "review_decide") {
    const it = await env.DB.prepare("SELECT i.*, r.quarter, r.finished_at FROM access_review_items i JOIN access_reviews r ON r.id = i.review_id WHERE i.id = ?").bind(String(b.id || "")).first();
    if (!it) return json({ error: "NOT_FOUND" }, 404);
    if (it.admin_id === auth.adminId) return json({ error: "SELF" }, 403);
    const decision = String(b.decision || "").toUpperCase(), note = clean(b.note, 300);
    const f = {};
    if (!["KEEP", "CHANGE", "REMOVE"].includes(decision)) f.decision = "REQUIRED";
    if (decision !== "KEEP" && note.length < 5) f.note = "REQUIRED";
    if (note.length > 300) f.note = "LENGTH";
    if (Object.keys(f).length) return bad(f);
    await env.DB.prepare("UPDATE access_review_items SET decision = ?, note = ?, decided_by = ?, decided_at = ? WHERE id = ?").bind(decision, note || null, auth.email, now, it.id).run();
    const who = await env.DB.prepare("SELECT LOWER(email) AS email FROM admin_users WHERE id = ?").bind(it.admin_id).first();
    await logEvent(env, auth.email, "access_review_decided", who ? who.email : it.admin_id, { quarter: it.quarter, decision, note: note || null });
    const left = (await env.DB.prepare("SELECT COUNT(*) AS n FROM access_review_items WHERE review_id = ? AND decision IS NULL").bind(it.review_id).first()).n;
    let finished = false;
    if (!left && !it.finished_at) {
      await env.DB.prepare("UPDATE access_reviews SET finished_at = ?, finished_by = ? WHERE id = ? AND finished_at IS NULL").bind(now, auth.email, it.review_id).run();
      await logEvent(env, auth.email, "access_review_finished", it.quarter, null);
      finished = true;
    }
    return json({ ok: true, finished });
  }

  const p = await person(b.email);
  if (!p) return json({ error: "NOT_FOUND" }, 404);
  const email = String(p.email).toLowerCase();

  if (b.action === "exit") {
    if (p.status !== "LEFT") return json({ error: "NOT_LEFT" }, 409);
    const item = String(b.item || "");
    if (!EXIT_ITEMS.includes(item)) return bad({ item: "REQUIRED" });
    const note = clean(b.note, 200);
    try {
      await env.DB.prepare("INSERT INTO staff_exit_items (id, admin_id, item, done_at, done_by, note) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), p.id, item, now, auth.email, note || null).run();
    } catch (e) { if (/UNIQUE/i.test(String(e && e.message))) return json({ ok: true, already: true }); throw e; }
    await logEvent(env, auth.email, "staff_exit_item_done", email, { item, note: note || null });
    return json({ ok: true });
  }

  if (p.id === auth.adminId) return json({ error: "SELF" }, 403);
  if (p.status === "LEFT" && b.action !== "check") return json({ error: "LEFT" }, 409);

  if (b.action === "record") {
    const f = {};
    let managerId = null;
    if (String(b.managerEmail || "").trim()) {
      const m = await person(b.managerEmail);
      if (!m || m.status === "LEFT") f.managerEmail = "REQUIRED"; else if (m.id === p.id) f.managerEmail = "SELF"; else managerId = m.id;
    }
    const d = {};
    for (const k of ["joinedOn", "probationEnd", "contractEnd"]) {
      const v = String(b[k] || "");
      if (v && !isDay(v)) f[k] = "DATE"; else d[k] = v || null;
    }
    if (d.joinedOn && d.joinedOn > addDays(today, 90)) f.joinedOn = "RANGE";
    if (d.joinedOn && d.contractEnd && d.contractEnd < d.joinedOn) f.contractEnd = "BEFORE_JOIN";
    if (d.joinedOn && d.probationEnd && d.probationEnd < d.joinedOn) f.probationEnd = "BEFORE_JOIN";
    const kind = String(b.kind || "").toUpperCase() || null;
    if (kind && !KINDS.includes(kind)) f.kind = "REQUIRED";
    if ((kind === "CONTRACT" || kind === "INTERN" || kind === "CONSULTANT") && !d.contractEnd) f.contractEnd = "REQUIRED";
    if (Object.keys(f).length) return bad(f);
    const cur = await env.DB.prepare("SELECT * FROM staff_records WHERE admin_id = ?").bind(p.id).first();
    const endChanged = !cur || (cur.contract_end || null) !== d.contractEnd;
    const probChanged = !cur || (cur.probation_end || null) !== d.probationEnd;
    await env.DB.prepare(
      `INSERT INTO staff_records (admin_id, manager_id, joined_on, kind, probation_end, contract_end, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(admin_id) DO UPDATE SET manager_id = excluded.manager_id, joined_on = excluded.joined_on, kind = excluded.kind, probation_end = excluded.probation_end,
         contract_end = excluded.contract_end, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
    ).bind(p.id, managerId, d.joinedOn, kind, d.probationEnd, d.contractEnd, auth.email, now).run();
    if (endChanged) await env.DB.prepare("UPDATE staff_records SET reminded_14 = NULL, reminded_3 = NULL WHERE admin_id = ?").bind(p.id).run();
    if (probChanged) await env.DB.prepare("UPDATE staff_records SET reminded_probation = NULL WHERE admin_id = ?").bind(p.id).run();
    await logEvent(env, auth.email, "staff_record_saved", email, { managerId, joinedOn: d.joinedOn, kind, probationEnd: d.probationEnd, contractEnd: d.contractEnd });
    // A contract extended past today restores access paused at its end.
    let restored = false;
    if (p.auto_paused === "CONTRACT_END" && (!d.contractEnd || d.contractEnd >= today)) {
      await env.DB.prepare("UPDATE admin_users SET auto_paused = NULL, auto_paused_at = NULL, last_seen_at = ? WHERE id = ?").bind(now, p.id).run();
      await logEvent(env, auth.email, "staff_access_restored", email, { why: "CONTRACT_EXTENDED", contractEnd: d.contractEnd });
      restored = true;
    }
    return json({ ok: true, restored });
  }

  if (b.action === "check") {
    const item = String(b.item || "");
    if (!CHECK_ITEMS.includes(item)) return bad({ item: "REQUIRED" });
    if (b.clear === true) {
      const reason = clean(b.reason, 300);
      if (reason.length < 5) return bad({ reason: "REQUIRED" });
      await env.DB.prepare("DELETE FROM staff_checks WHERE admin_id = ? AND item = ?").bind(p.id, item).run();
      await logEvent(env, auth.email, "staff_check_cleared", email, { item, reason });
      return json({ ok: true });
    }
    if (p.status === "LEFT") return json({ error: "LEFT" }, 409);
    const doneOn = String(b.doneOn || ""), ref = clean(b.ref, 80);
    const f = {};
    if (!isDay(doneOn)) f.doneOn = "DATE"; else if (doneOn > today || doneOn < "2000-01-01") f.doneOn = "RANGE";
    if (ref.length > 80) f.ref = "LENGTH";
    if (Object.keys(f).length) return bad(f);
    await env.DB.prepare(
      `INSERT INTO staff_checks (id, admin_id, item, done_on, ref, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(admin_id, item) DO UPDATE SET done_on = excluded.done_on, ref = excluded.ref, recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at`
    ).bind(crypto.randomUUID(), p.id, item, doneOn, ref || null, auth.email, now).run();
    await logEvent(env, auth.email, "staff_check_recorded", email, { item, doneOn, ref: ref || null });
    return json({ ok: true });
  }

  if (b.action === "restore") {
    const reason = clean(b.reason, 300);
    if (!p.auto_paused) return json({ error: "NOT_PAUSED" }, 409);
    if (reason.length < 10) return bad({ reason: "REQUIRED" });
    if (p.auto_paused === "CONTRACT_END") {
      const r = await env.DB.prepare("SELECT contract_end FROM staff_records WHERE admin_id = ?").bind(p.id).first();
      if (r && r.contract_end && r.contract_end < today) return json({ error: "CONTRACT_ENDED" }, 409);
    }
    await env.DB.prepare("UPDATE admin_users SET auto_paused = NULL, auto_paused_at = NULL, last_seen_at = ? WHERE id = ?").bind(now, p.id).run();
    await logEvent(env, auth.email, "staff_access_restored", email, { why: p.auto_paused, reason });
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 400);
}
