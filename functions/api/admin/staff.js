/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
import { idKey } from "../../_shared/employee-id.js";
// functions/api/admin/staff.js
//
// GrievIQ staff (admin_users). Item 10 (Oct 2026), following NIST SP 800-53
// AC-2 / IA-4 and ISO 27001:2022 A.5.16-A.5.18 and A.5.3:
//  - each person has a name, an employee ID (unique, never reused), a mobile
//    number (shown in full only to the super admin and the person) and an
//    optional designation;
//  - status: PRESENT, ON_LEAVE (with a return date, optionally pausing their
//    access, optionally with a colleague covering) or LEFT (access stops; the
//    record stays, so the audit log still shows who they were);
//  - leave cover ("additional charge", as in FR 49): the colleague keeps
//    their own sign-in and also holds the away person's duties until the end
//    date. Auditor duties only between auditors; super admin duties can't be
//    covered; nobody covers two people at once;
//  - the super admin confirms the list every 90 days.
// Every change is logged to admin_events with the old and new values.
//
// GET                        list (super admin; auditor read-only)
// PATCH { email, role }      change the role (super admin)
// POST  { action, ... }      (super admin)
//   add        { name, employeeId, phone, designation?, email, role }
//   edit       { email, name, employeeId, phone, designation? }
//   leave      { email, until, pause?, coverEmail?, reason? }   (status ON_LEAVE)
//   present    { email }                                           (back)
//   left       { email, reason, lastDay }
//   reactivate { email, reason }
//   cover_end  { id, reason }
//   review     {}
//   duty       { email, duty, on, areas?, reason, understood? }   grieviq-75: give,
//              change the areas of, or remove a named duty (staff_duties)
//   billing_accounts_only { on, reason }   grieviq-75: billing for accounts staff only
//
// grieviq-75, named duties: only the super admin gives them, to a named
// person who is still with GrievIQ. Helper checker / approver: any role but
// the auditor (whose independence they would break); outside the roles that
// held them before, the super admin confirms a warning ("understood"). The
// Grievance Officer and the Security contact are one person each: giving
// the duty to someone else ends it for the previous holder. Every change is
// in admin_events, and the person gets a content-free email.

import { getVerifiedAdmin, PERMISSIONS, ROLES, DUTIES, HELPER_DUTIES, DUTY_USUAL_ROLES, parseAreas, adminSetting } from "../../_shared/get-verified-admin.js";
import { sendEmailNow } from "../../_shared/dept-auth.js";

const VALID_ROLES = ROLES;
export const REVIEW_DAYS = 90;
export const MAX_COVER_DAYS = 90;
export const MAX_LEAVE_DAYS = 365;
const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function todayIst() { return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); }
function addDays(day, n) { return new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10); }
function isDay(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) && !isNaN(Date.parse(d + "T00:00:00Z")); }
export function normPhone(p) {
  let d = String(p || "").replace(/[\s()-]/g, "");
  if (d.startsWith("+91")) d = d.slice(3); else if (d.length === 12 && d.startsWith("91")) d = d.slice(2); else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
export function maskPhone(p) { const d = String(p || ""); return d.length >= 6 ? d.slice(0, 2) + "•••••" + d.slice(-3) : d ? "•••" : ""; }
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9/-]{0,19}$/;

async function logEvent(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, target, detail == null ? null : JSON.stringify(detail)).run();
}

// Leave that has passed its return date ends by itself (and its pause).
async function endFinishedLeave(env) {
  const today = todayIst();
  const { results } = await env.DB.prepare("SELECT email, leave_until FROM admin_users WHERE status = 'ON_LEAVE' AND leave_until IS NOT NULL AND leave_until < ?").bind(today).all();
  for (const r of results || []) {
    await env.DB.prepare("UPDATE admin_users SET status = 'PRESENT', leave_until = NULL, access_paused = 0, updated_at = ? WHERE LOWER(email) = ? AND status = 'ON_LEAVE'")
      .bind(new Date().toISOString(), String(r.email).toLowerCase()).run();
    await logEvent(env, "system", "staff_back_from_leave", String(r.email).toLowerCase(), { leaveUntil: r.leave_until, automatic: true });
  }
}

function shapeStaff(r, seeFull, me) {
  const self = String(r.email).toLowerCase() === me;
  return {
    email: String(r.email).toLowerCase(), role: r.role, name: r.name || null, employeeId: r.employee_id || null,
    phone: r.phone ? (seeFull || self ? r.phone : maskPhone(r.phone)) : null, phoneMasked: !!r.phone && !(seeFull || self),
    designation: r.designation || null, status: r.status || "PRESENT", leaveUntil: r.leave_until || null, accessPaused: r.access_paused === 1,
    leftAt: r.left_at || null, leftReason: r.left_reason || null, createdAt: r.created_at, isMe: self,
  };
}


// ---- "added by mistake": has this person ever done anything? ----
// Every place that records an action by a staff member. Someone who appears
// in none of them can be deleted outright; anyone else can only be marked
// as having left, so the audit trail always points to a real record.
const ACTIVITY = [
  ["audit_log", "admin_events", "actor_email"], ["audit_log", "admin_settings", "updated_by"],
  ["cases", "grievance_events", "actor"], ["cases", "grievance_reopens", "actor"], ["cases", "grievance_reopens", "staff_email"],
  ["cases", "resolution_reports", "created_by"], ["cases", "resolution_reports", "reviewed_by"], ["cases", "resolution_checks", "checked_by"],
  ["cases", "rep_suggestions", "reviewed_by"], ["cases", "case_assignments", "assigned_by"], ["cases", "case_assignments", "ended_by"],
  ["changes", "change_requests", "requested_by"], ["changes", "change_requests", "reviewed_by"],
  ["audit_work", "observations", "owner_email"], ["audit_work", "observations", "created_by"], ["audit_work", "observations", "issued_by"],
  ["audit_work", "observations", "closed_by"], ["audit_work", "observation_events", "actor_email"], ["audit_work", "observation_amendments", "amended_by"],
  ["audit_work", "audit_engagements", "created_by"], ["audit_work", "audit_reports", "issued_by"],
  ["retention", "retention_holds", "by_email"], ["retention", "retention_runs", "ran_by"],
  // Being put on leave, or named as the stand-in, is done TO the person by
  // the super admin, so only setting up or ending a cover counts here; what
  // a stand-in actually does is recorded under their own email above.
  ["covers", "staff_covers", "created_by"], ["covers", "staff_covers", "ended_by"],
];
// Returns Map(email -> [areas]) for the given emails, or null if the check
// could not run (then nobody may be deleted). One small query per place, so
// one awkward table can't stop the rest; a table or column that doesn't
// exist holds no activity and is skipped. Any other error fails closed.
// lastActivityCheck keeps what happened, for the super admin to see.
export let lastActivityCheck = { skipped: [], failed: [] };
export async function activityOf(env, emails) {
  const list = Array.from(new Set((emails || []).map((e) => String(e).toLowerCase())));
  const out = new Map(list.map((e) => [e, []]));
  const check = { skipped: [], failed: [] };
  lastActivityCheck = check;
  if (!list.length) return out;
  // The database takes at most 100 values per query, so long lists go in parts.
  const parts = [];
  for (let i = 0; i < list.length; i += 50) parts.push(list.slice(i, i + 50));
  await Promise.all(ACTIVITY.map(async ([area, t, c]) => {
    try {
      for (const part of parts) {
        const { results } = await env.DB.prepare(`SELECT DISTINCT LOWER(${c}) AS e FROM ${t} WHERE LOWER(${c}) IN (${part.map(() => "?").join(", ")})`).bind(...part).all();
        for (const r of results || []) { const a = out.get(r.e); if (a && !a.includes(area)) a.push(area); }
      }
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/no such (table|column)/i.test(msg)) check.skipped.push(t + "." + c);
      else check.failed.push(t + "." + c + ": " + msg.slice(0, 160));
    }
  }));
  return check.failed.length ? null : out;
}

// Item 10b: earlier sign-in emails, by person (admin id). Empty if the
// table isn't there yet.
async function pastEmails(env) {
  const m = new Map();
  try {
    const { results } = await env.DB.prepare("SELECT old_email, admin_id, changed_at FROM staff_email_history ORDER BY changed_at ASC").all();
    for (const r of results || []) { if (!m.has(r.admin_id)) m.set(r.admin_id, []); m.get(r.admin_id).push({ email: String(r.old_email).toLowerCase(), until: r.changed_at }); }
  } catch (e) { /* item 10b table not there yet */ }
  return m;
}
async function wasEmailOf(env, email) {
  try { return await env.DB.prepare("SELECT admin_id FROM staff_email_history WHERE old_email = ?").bind(email).first(); } catch (e) { return null; }
}

export async function onRequestGet({ request, env }) {
  // The auditor may read the list (who holds which role is a core audit
  // check); only the super admin changes it.
  const auth = await getVerifiedAdmin(request, env, "view_staff");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const manage = (auth.roles || [auth.role]).includes("super_admin");
  let rows, extended = true;
  try {
    await endFinishedLeave(env);
    rows = (await env.DB.prepare("SELECT * FROM admin_users ORDER BY COALESCE(name, email) COLLATE NOCASE").all()).results || [];
  } catch (e) {
    extended = false;
    rows = (await env.DB.prepare("SELECT id, email, role, name, created_at FROM admin_users ORDER BY created_at ASC").all()).results || [];
  }
  const today = todayIst();
  let covers = [], review = null;
  if (extended) {
    covers = (await env.DB.prepare("SELECT * FROM staff_covers WHERE (ended_at IS NULL AND to_date >= ?) OR created_at > datetime('now', '-60 days') ORDER BY from_date DESC").bind(today).all()).results || [];
    const rv = await env.DB.prepare("SELECT actor_email, created_at FROM admin_events WHERE action = 'staff_list_reviewed' ORDER BY created_at DESC LIMIT 1").first();
    const last = rv ? String(rv.created_at).slice(0, 10) : null;
    review = { lastAt: rv ? rv.created_at : null, by: rv ? rv.actor_email : null, due: !last || addDays(last, REVIEW_DAYS) <= today, everyDays: REVIEW_DAYS };
  }
  const byEmail = new Map(rows.map((r) => [String(r.email).toLowerCase(), r]));
  const nameOf = (e) => { const r = byEmail.get(String(e).toLowerCase()); return r ? { name: r.name || null, employeeId: r.employee_id || null } : { name: null, employeeId: null }; };
  const staff = rows.map((r) => shapeStaff(r, manage, auth.email));
  if (extended) { const pe = await pastEmails(env); rows.forEach((r, i) => { staff[i].previousEmails = (pe.get(r.id) || []).map((x) => x.email); }); }
  let activityCheck;
  if (manage && extended) {
    const act = await activityOf(env, staff.map((x) => x.email));
    for (const x of staff) { const a = act ? act.get(x.email) : null; x.canDelete = !!a && !a.length && !x.isMe && !(x.previousEmails || []).length; x.activity = a || null; }
    activityCheck = lastActivityCheck;
  }
  // grieviq-75: named duties, the areas to choose from, the billing switch.
  let duties = [], areas = [], dutiesReady = true;
  try {
    const { results } = await env.DB.prepare("SELECT d.*, a.email FROM staff_duties d JOIN admin_users a ON a.id = d.admin_id WHERE d.ended_at IS NULL ORDER BY d.given_at").all();
    duties = (results || []).map((d) => ({ email: String(d.email).toLowerCase(), duty: d.duty, areas: parseAreas(d.areas), reason: d.reason || null, givenBy: d.given_by, givenAt: d.given_at }));
  } catch (e) { dutiesReady = false; }
  try { areas = ((await env.DB.prepare("SELECT id, name, state FROM areas ORDER BY name").all()).results || []).map((a) => ({ id: a.id, name: a.name, state: a.state })); } catch (e) { areas = []; }
  for (const x of staff) x.duties = duties.filter((d) => d.email === x.email);
  return json({
    dutiesReady, areas, duties: { list: DUTIES, helper: HELPER_DUTIES, usualRoles: DUTY_USUAL_ROLES },
    billingAccountsOnly: (await adminSetting(env, "billing_accounts_only")) === "1",
    role: auth.role, canManage: manage, ready: extended, today,
    staff: staff.filter((s) => s.status !== "LEFT"),
    former: staff.filter((s) => s.status === "LEFT"),
    covers: covers.map((c) => ({
      id: c.id, away: String(c.away_email).toLowerCase(), cover: String(c.cover_email).toLowerCase(), awayName: nameOf(c.away_email), coverName: nameOf(c.cover_email),
      from: c.from_date, to: c.to_date, reason: c.reason, by: c.created_by, endedAt: c.ended_at || null, endReason: c.end_reason || null,
      state: c.ended_at ? "ENDED" : c.to_date < today ? "FINISHED" : c.from_date > today ? "UPCOMING" : "ACTIVE",
    })),
    review,
    rules: { maxCoverDays: MAX_COVER_DAYS, maxLeaveDays: MAX_LEAVE_DAYS },
    activityCheck,
  });
}

// ---- validation of the person's details ----
async function readDetails(env, body, exceptEmail) {
  const name = String(body.name || "").trim().replace(/\s+/g, " ");
  const employeeId = String(body.employeeId || "").trim().toUpperCase();
  const phone = normPhone(body.phone);
  const designation = String(body.designation || "").trim().replace(/\s+/g, " ");
  const fields = {};
  if (name.length < 2 || name.length > 80) fields.name = "LENGTH";
  if (!employeeId) fields.employeeId = "REQUIRED";
  else if (!ID_RE.test(employeeId)) fields.employeeId = "FORMAT";
  if (!String(body.phone || "").trim()) fields.phone = "REQUIRED";
  else if (!phone) fields.phone = "FORMAT";
  if (designation.length > 60) fields.designation = "LENGTH";
  let usedBy = null;
  if (!fields.employeeId) {
    const { results: ids } = await env.DB.prepare("SELECT email, name, employee_id FROM admin_users WHERE employee_id IS NOT NULL AND LOWER(email) <> ?").bind(exceptEmail || "").all();
    const u = (ids || []).find((r) => idKey(r.employee_id) === idKey(employeeId));
    if (u) { fields.employeeId = "TAKEN"; usedBy = u.name || u.email; }
  }
  return { value: { name, employeeId, phone, designation: designation || null }, fields, usedBy };
}

export async function onRequestPatch({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_admins");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  const role = String(body.role || "").trim();
  if (!email) return json({ error: "Email is required." }, 400);
  if (!VALID_ROLES.includes(role)) return json({ error: "Invalid role." }, 400);
  const existing = await env.DB.prepare("SELECT id, role FROM admin_users WHERE LOWER(email) = ?").bind(email).first();
  if (!existing) return json({ error: "No staff member with that email." }, 404);
  if (email === auth.email && role !== "super_admin") return json({ error: "You cannot remove your own super_admin role.", code: "SELF" }, 400);
  // Separation of duties: changing a role ends covers that would break the rules.
  await env.DB.prepare("UPDATE admin_users SET role = ? WHERE LOWER(email) = ?").bind(role, email).run();
  try {
    if ((existing.role === "auditor") !== (role === "auditor") || role === "super_admin") {
      await env.DB.prepare("UPDATE staff_covers SET ended_at = ?, ended_by = ?, end_reason = 'Role changed' WHERE ended_at IS NULL AND (LOWER(away_email) = ? OR LOWER(cover_email) = ?)")
        .bind(new Date().toISOString(), auth.email, email, email).run();
    }
  } catch (e) { /* item 10 tables not there yet */ }
  await logEvent(env, auth.email, "staff_role_changed", email, { fromRole: existing.role, toRole: role });
  // grieviq-75: an auditor holds no helper duty.
  if (role === "auditor") await endDuties(env, auth.email, existing.id, email, HELPER_DUTIES, "Became the auditor");
  return json({ ok: true, email, role });
}

export async function onRequestDelete() {
  // Staff are never deleted (the audit log must keep saying who acted).
  return json({ error: "Staff can't be deleted. Mark them as having left instead.", code: "USE_LEFT" }, 405);
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_admins");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
  const action = String(body.action || "add");
  const now = new Date().toISOString();
  const today = todayIst();
  const bad = (error, fields, extra) => json(Object.assign({ error, fields }, extra || {}), 400);
  const get = (email) => env.DB.prepare("SELECT * FROM admin_users WHERE LOWER(email) = ?").bind(String(email || "").trim().toLowerCase()).first();
  const presentSupers = async (except) => (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM admin_users WHERE role = 'super_admin' AND status <> 'LEFT' AND NOT (status = 'ON_LEAVE' AND access_paused = 1) AND LOWER(email) <> ?"
  ).bind(except).first()).n;

  if (action === "add") {
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "").trim();
    const d = await readDetails(env, body, null);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) d.fields.email = "FORMAT";
    if (!VALID_ROLES.includes(role)) d.fields.role = "REQUIRED";
    if (Object.keys(d.fields).length) return bad("Please correct the highlighted fields.", d.fields, { usedBy: d.usedBy });
    const existing = await get(email);
    if (existing) return bad(existing.status === "LEFT" ? "This email belonged to someone who has left. Use a new email for a new person." : "That email is already a staff member.", { email: existing.status === "LEFT" ? "FORMER" : "TAKEN" });
    if (await wasEmailOf(env, email)) return bad("This email was used by a staff member before. Use a new email for a new person.", { email: "PREVIOUS" });
    const id = `admin-${crypto.randomUUID().slice(0, 8)}`;
    const v = d.value;
    await env.DB.prepare(
      "INSERT INTO admin_users (id, email, role, name, employee_id, phone, designation, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'PRESENT', ?)"
    ).bind(id, email, role, v.name, v.employeeId, v.phone, v.designation, now).run();
    await logEvent(env, auth.email, "staff_added", email, { role, name: v.name, employeeId: v.employeeId, designation: v.designation });
    return json({ ok: true, email, role });
  }

  if (action === "review") {
    const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_users WHERE status <> 'LEFT'").first()).n;
    await logEvent(env, auth.email, "staff_list_reviewed", null, { activeStaff: n });
    return json({ ok: true });
  }

  if (action === "cover_end") {
    const reason = String(body.reason || "").trim();
    if (reason.length < 5 || reason.length > 300) return bad("Say why the cover ends early.", { reason: "LENGTH" });
    const c = await env.DB.prepare("SELECT * FROM staff_covers WHERE id = ? AND ended_at IS NULL").bind(String(body.id || "")).first();
    if (!c) return json({ error: "That cover isn't running.", code: "NOT_FOUND" }, 404);
    await env.DB.prepare("UPDATE staff_covers SET ended_at = ?, ended_by = ?, end_reason = ? WHERE id = ?").bind(now, auth.email, reason, c.id).run();
    await logEvent(env, auth.email, "staff_cover_ended", String(c.away_email).toLowerCase(), { cover: c.cover_email, reason });
    return json({ ok: true });
  }

  if (action === "billing_accounts_only") {
    const reason = String(body.reason || "").trim();
    if (reason.length < 5 || reason.length > 300) return bad("Say why.", { reason: "LENGTH" });
    const on = body.on === true;
    await env.DB.prepare("INSERT INTO admin_settings (key, value, updated_by, updated_at) VALUES ('billing_accounts_only', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
      .bind(on ? "1" : "0", auth.email, now).run();
    await logEvent(env, auth.email, on ? "billing_accounts_only_on" : "billing_accounts_only_off", "billing", { reason });
    return json({ ok: true, on });
  }

  const p = await get(body.email);
  if (!p) return json({ error: "No staff member with that email.", code: "NOT_FOUND" }, 404);
  const email = String(p.email).toLowerCase();

  if (action === "duty") {
    const duty = String(body.duty || "");
    if (!DUTIES.includes(duty)) return bad("Unknown duty.", { duty: "UNKNOWN" });
    const on = body.on === true;
    const reason = String(body.reason || "").trim();
    const helper = HELPER_DUTIES.includes(duty);
    const fields = {};
    if (reason.length < 5 || reason.length > 300) fields.reason = "LENGTH";
    const cur = await env.DB.prepare("SELECT * FROM staff_duties WHERE admin_id = ? AND duty = ? AND ended_at IS NULL").bind(p.id, duty).first();
    if (!on) {
      if (!cur) return json({ error: "That person doesn't hold this duty.", code: "NOT_HELD" }, 409);
      if (Object.keys(fields).length) return bad("Please correct the highlighted fields.", fields);
      await env.DB.prepare("UPDATE staff_duties SET ended_at = ?, ended_by = ?, end_reason = ? WHERE id = ? AND ended_at IS NULL").bind(now, auth.email, reason, cur.id).run();
      await logEvent(env, auth.email, "staff_duty_removed", email, { duty, reason });
      await tellDuty(env, request, p);
      return json({ ok: true });
    }
    if (p.status === "LEFT") return bad("This person has left GrievIQ.", { email: "LEFT" });
    if ((helper || duty === "STAFF_RECORDS") && p.role === "auditor") return bad("The auditor stays independent: they can't check or approve helpers or keep staff records.", { duty: "AUDITOR" });
    let areas = null;
    if (helper && Array.isArray(body.areas) && body.areas.length) {
      const ids = Array.from(new Set(body.areas.map(String))).slice(0, 100);
      const { results } = await env.DB.prepare("SELECT id FROM areas WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).all();
      const known = new Set((results || []).map((r) => r.id));
      if (ids.some((x) => !known.has(x))) fields.areas = "UNKNOWN";
      areas = ids.filter((x) => known.has(x)).sort();
    } else if (helper && body.areas !== null && body.areas !== undefined && !Array.isArray(body.areas)) fields.areas = "UNKNOWN";
    const unusual = helper && !(DUTY_USUAL_ROLES[duty] || []).includes(p.role);
    if (unusual && body.understood !== true) fields.understood = "REQUIRED";
    if (Object.keys(fields).length) return bad("Please correct the highlighted fields.", fields, { unusual });
    const areasJson = areas && areas.length ? JSON.stringify(areas) : null;
    if (cur) {
      if ((cur.areas || null) === areasJson) return json({ ok: true, unchanged: true });
      await env.DB.prepare("UPDATE staff_duties SET areas = ?, reason = ?, given_by = ?, given_at = ? WHERE id = ? AND ended_at IS NULL").bind(areasJson, reason, auth.email, now, cur.id).run();
      await logEvent(env, auth.email, "staff_duty_areas_changed", email, { duty, from: parseAreas(cur.areas), to: areas && areas.length ? areas : null, reason });
      await tellDuty(env, request, p);
      return json({ ok: true });
    }
    // One Grievance Officer and one Security contact: the duty moves.
    if (!helper) {
      const { results: prev } = await env.DB.prepare("SELECT d.id, a.email FROM staff_duties d JOIN admin_users a ON a.id = d.admin_id WHERE d.duty = ? AND d.ended_at IS NULL").bind(duty).all();
      for (const x of prev || []) {
        await env.DB.prepare("UPDATE staff_duties SET ended_at = ?, ended_by = ?, end_reason = ? WHERE id = ? AND ended_at IS NULL").bind(now, auth.email, "Given to " + email, x.id).run();
        await logEvent(env, auth.email, "staff_duty_removed", String(x.email).toLowerCase(), { duty, reason: "Given to " + email });
      }
    }
    await env.DB.prepare("INSERT INTO staff_duties (id, admin_id, duty, areas, reason, given_by, given_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), p.id, duty, helper ? areasJson : null, reason, auth.email, now).run();
    await logEvent(env, auth.email, "staff_duty_given", email, { duty, areas: helper && areas && areas.length ? areas : null, reason, unusual: unusual || undefined, role: p.role });
    await tellDuty(env, request, p);
    return json({ ok: true });
  }

  if (action === "edit") {
    const d = await readDetails(env, body, email);
    if (Object.keys(d.fields).length) return bad("Please correct the highlighted fields.", d.fields, { usedBy: d.usedBy });
    const v = d.value, changes = {};
    if ((p.name || null) !== v.name) changes.name = { from: p.name || null, to: v.name };
    if ((p.employee_id || null) !== v.employeeId) changes.employeeId = { from: p.employee_id || null, to: v.employeeId };
    if ((p.phone || null) !== v.phone) changes.phone = { from: p.phone ? maskPhone(p.phone) : null, to: maskPhone(v.phone) };
    if ((p.designation || null) !== v.designation) changes.designation = { from: p.designation || null, to: v.designation };
    if (!Object.keys(changes).length) return json({ ok: true, unchanged: true });
    await env.DB.prepare("UPDATE admin_users SET name = ?, employee_id = ?, phone = ?, designation = ?, updated_at = ? WHERE LOWER(email) = ?")
      .bind(v.name, v.employeeId, v.phone, v.designation, now, email).run();
    await logEvent(env, auth.email, "staff_details_changed", email, { changes });
    return json({ ok: true });
  }

  if (action === "leave") {
    const until = String(body.until || "");
    const pause = body.pause === true;
    const coverEmail = String(body.coverEmail || "").trim().toLowerCase();
    const reason = String(body.reason || "").trim();
    const fields = {};
    if (p.status === "LEFT") return bad("This person has left.", { email: "LEFT" });
    if (!isDay(until)) fields.until = "DATE";
    else if (until < today) fields.until = "PAST";
    else if (until > addDays(today, MAX_LEAVE_DAYS)) fields.until = "TOO_LONG";
    if (pause && email === auth.email) fields.pause = "SELF";
    if (pause && p.role === "super_admin" && (await presentSupers(email)) === 0) fields.pause = "LAST_SUPER";
    let cover = null;
    if (coverEmail) {
      cover = await get(coverEmail);
      if (!cover || cover.status === "LEFT") fields.coverEmail = "NOT_STAFF";
      else if (String(cover.email).toLowerCase() === email) fields.coverEmail = "SAME";
      else if (p.role === "super_admin") fields.coverEmail = "SUPER";
      else if ((p.role === "auditor") !== (cover.role === "auditor")) fields.coverEmail = "AUDITOR";
      else if (cover.role === "super_admin") fields.coverEmail = "ALREADY_ALL";
      else if (cover.status === "ON_LEAVE" && (!cover.leave_until || cover.leave_until >= today)) fields.coverEmail = "COVER_ON_LEAVE";
      else {
        const end = fields.until ? today : until;
        const busy = await env.DB.prepare("SELECT 1 AS x FROM staff_covers WHERE LOWER(cover_email) = ? AND ended_at IS NULL AND from_date <= ? AND to_date >= ?").bind(coverEmail, end, today).first();
        if (busy) fields.coverEmail = "BUSY";
        const awayCovering = await env.DB.prepare("SELECT 1 AS x FROM staff_covers WHERE LOWER(cover_email) = ? AND ended_at IS NULL AND to_date >= ?").bind(email, today).first();
        if (awayCovering) fields.coverEmail = "AWAY_IS_COVERING";
      }
      if (!fields.until && until > addDays(today, MAX_COVER_DAYS - 1)) fields.until = "COVER_TOO_LONG";
      if (reason.length < 5 || reason.length > 300) fields.reason = "LENGTH";
    }
    if (Object.keys(fields).length) return bad("Please correct the highlighted fields.", fields);
    // Any earlier cover for this person ends; the new one starts today.
    await env.DB.prepare("UPDATE staff_covers SET ended_at = ?, ended_by = ?, end_reason = 'Replaced by a new leave entry' WHERE LOWER(away_email) = ? AND ended_at IS NULL").bind(now, auth.email, email).run();
    await env.DB.prepare("UPDATE admin_users SET status = 'ON_LEAVE', leave_until = ?, access_paused = ?, updated_at = ? WHERE LOWER(email) = ?").bind(until, pause ? 1 : 0, now, email).run();
    if (cover) {
      await env.DB.prepare("INSERT INTO staff_covers (id, away_email, cover_email, from_date, to_date, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), email, String(cover.email).toLowerCase(), today, until, reason, auth.email, now).run();
    }
    await logEvent(env, auth.email, "staff_on_leave", email, { until, accessPaused: pause, cover: cover ? String(cover.email).toLowerCase() : null, reason: cover ? reason : null });
    return json({ ok: true });
  }

  if (action === "present") {
    if (p.status !== "ON_LEAVE") return bad("This person isn't on leave.", { email: "NOT_ON_LEAVE" });
    await env.DB.prepare("UPDATE admin_users SET status = 'PRESENT', leave_until = NULL, access_paused = 0, updated_at = ? WHERE LOWER(email) = ?").bind(now, email).run();
    await env.DB.prepare("UPDATE staff_covers SET ended_at = ?, ended_by = ?, end_reason = 'Back from leave' WHERE LOWER(away_email) = ? AND ended_at IS NULL").bind(now, auth.email, email).run();
    await logEvent(env, auth.email, "staff_back_from_leave", email, { automatic: false });
    return json({ ok: true });
  }

  if (action === "left") {
    const reason = String(body.reason || "").trim();
    const lastDay = String(body.lastDay || "");
    const fields = {};
    if (p.status === "LEFT") return bad("This person has already left.", { email: "LEFT" });
    if (email === auth.email) return bad("You can't mark yourself as having left.", { email: "SELF" });
    if (p.role === "super_admin" && (await presentSupers(email)) === 0) return bad("Keep at least one super admin who can sign in.", { email: "LAST_SUPER" });
    if (reason.length < 10 || reason.length > 300) fields.reason = "LENGTH";
    if (!isDay(lastDay)) fields.lastDay = "DATE";
    else if (lastDay > addDays(today, 30)) fields.lastDay = "TOO_FAR";
    if (Object.keys(fields).length) return bad("Please correct the highlighted fields.", fields);
    await env.DB.prepare("UPDATE admin_users SET status = 'LEFT', left_at = ?, left_reason = ?, leave_until = NULL, access_paused = 0, updated_at = ? WHERE LOWER(email) = ?").bind(lastDay, reason, now, email).run();
    await env.DB.prepare("UPDATE staff_covers SET ended_at = ?, ended_by = ?, end_reason = 'Left GrievIQ' WHERE (LOWER(away_email) = ? OR LOWER(cover_email) = ?) AND ended_at IS NULL").bind(now, auth.email, email, email).run();
    await logEvent(env, auth.email, "staff_left", email, { lastDay, reason, role: p.role });
    await endDuties(env, auth.email, p.id, email, DUTIES, "Left GrievIQ");
    // grieviq-78: their confidentiality duty continues (ISO 27001 6.5); the
    // leaving checklist opens on the Staff records page.
    try {
      await sendEmailNow(env, email, "GrievIQ: your confidentiality duty continues",
        `<p>Dear ${escH(p.name || "colleague")},</p><p>Your work with GrievIQ has ended. Thank you.</p><p>The confidentiality agreement you signed continues after you leave: please don't keep, share or use any information about citizens, offices, GrievIQ or its systems, and delete any copies you may have. If you still hold a GrievIQ laptop, phone or ID card, please return it.</p><p>Questions: reply to the person who manages your account.</p>`);
    } catch (e) { /* recorded on the page either way */ }
    return json({ ok: true });
  }

  if (action === "change_email") {
    // Item 10b: the same person moves to a new sign-in email (e.g. from Gmail
    // to their @grieviq.in address). Name, ID, role and history stay; the old
    // address stays linked to them for good and stops working at once.
    const newEmail = String(body.newEmail || "").trim().toLowerCase();
    const reason = String(body.reason || "").trim();
    if (email === auth.email) return bad("You can't change your own email. Ask another super admin to do it.", { email: "SELF_EMAIL" });
    if (p.status === "LEFT") return bad("This person has left. Bring them back first.", { email: "LEFT" });
    const fields = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) || newEmail.length > 120) fields.newEmail = "FORMAT";
    else if (newEmail === email) fields.newEmail = "SAME";
    else {
      const other = await get(newEmail);
      if (other) fields.newEmail = other.status === "LEFT" ? "FORMER" : "TAKEN";
      else if (await wasEmailOf(env, newEmail)) fields.newEmail = "PREVIOUS";
    }
    if (reason.length < 10 || reason.length > 300) fields.reason = "LENGTH";
    if (Object.keys(fields).length) return bad("Please correct the highlighted fields.", fields);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO staff_email_history (old_email, admin_id, new_email, reason, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)").bind(email, p.id, newEmail, reason, auth.email, now),
      env.DB.prepare("UPDATE admin_users SET email = ?, updated_at = ? WHERE id = ?").bind(newEmail, now, p.id),
      // Leave covers and their own pending change requests follow them.
      env.DB.prepare("UPDATE staff_covers SET away_email = ? WHERE LOWER(away_email) = ?").bind(newEmail, email),
      env.DB.prepare("UPDATE staff_covers SET cover_email = ? WHERE LOWER(cover_email) = ?").bind(newEmail, email),
      env.DB.prepare("UPDATE change_requests SET requested_by = ? WHERE status = 'PENDING' AND LOWER(requested_by) = ?").bind(newEmail, email),
    ]);
    // grieviq-77: their sales leads and states follow them too.
    try {
      await env.DB.batch([
        env.DB.prepare("UPDATE sales_leads SET owner_email = ? WHERE owner_email = ?").bind(newEmail, email),
        env.DB.prepare("UPDATE sales_territories SET email = ? WHERE email = ?").bind(newEmail, email),
      ]);
    } catch (e) { /* part51 not run yet */ }
    await logEvent(env, auth.email, "staff_email_changed", newEmail, { from: email, to: newEmail, reason, name: p.name || null, employeeId: p.employee_id || null });
    return json({ ok: true, email: newEmail });
  }

  if (action === "delete") {
    // Only for an entry added by mistake: someone with no recorded activity.
    const reason = String(body.reason || "").trim();
    if (email === auth.email) return bad("You can't delete yourself.", { email: "SELF" });
    if (reason.length < 10 || reason.length > 300) return bad("Say why this entry is being deleted (at least 10 characters).", { reason: "LENGTH" });
    if ((await pastEmails(env)).has(p.id)) return bad("This person's email was changed before, so the entry can't be deleted. Mark them as having left instead.", { email: "HAS_ACTIVITY" }, { areas: ["email_change"] });
    const act = await activityOf(env, [email]);
    if (!act) return json({ error: "Couldn't check this person's activity, so nothing was deleted. Try again.", activityCheck: lastActivityCheck }, 503);
    const areas = act.get(email);
    if (areas.length) return bad("This person has activity on record, so the entry can't be deleted. Mark them as having left instead.", { email: "HAS_ACTIVITY" }, { areas });
    // Leave covers they were part of go with the entry (the audit log keeps
    // the leave and cover lines), so a reused email never inherits them.
    const cv = await env.DB.prepare("DELETE FROM staff_covers WHERE LOWER(away_email) = ? OR LOWER(cover_email) = ?").bind(email, email).run();
    await env.DB.prepare("DELETE FROM admin_users WHERE LOWER(email) = ?").bind(email).run();
    await logEvent(env, auth.email, "staff_deleted", email, { reason, name: p.name || null, employeeId: p.employee_id || null, role: p.role, status: p.status || "PRESENT", coversRemoved: (cv.meta && cv.meta.changes) || 0 });
    return json({ ok: true });
  }

  if (action === "reactivate") {
    const reason = String(body.reason || "").trim();
    if (p.status !== "LEFT") return bad("This person hasn't left.", { email: "NOT_LEFT" });
    if (reason.length < 10 || reason.length > 300) return bad("Say why they are coming back (at least 10 characters).", { reason: "LENGTH" });
    await env.DB.prepare("UPDATE admin_users SET status = 'PRESENT', left_at = NULL, left_reason = NULL, updated_at = ? WHERE LOWER(email) = ?").bind(now, email).run();
    await logEvent(env, auth.email, "staff_reactivated", email, { reason, wasLeftAt: p.left_at || null });
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 400);
}

// ---- grieviq-75: named duties ----
async function endDuties(env, actor, adminId, email, which, why) {
  try {
    const { results } = await env.DB.prepare("SELECT id, duty FROM staff_duties WHERE admin_id = ? AND ended_at IS NULL AND duty IN (SELECT value FROM json_each(?))").bind(adminId, JSON.stringify(which)).all();
    for (const d of results || []) {
      await env.DB.prepare("UPDATE staff_duties SET ended_at = ?, ended_by = ?, end_reason = ? WHERE id = ?").bind(new Date().toISOString(), actor, why, d.id).run();
      await logEvent(env, actor, "staff_duty_removed", email, { duty: d.duty, reason: why });
    }
  } catch (e) { /* part49 not run yet */ }
}
// A content-free email: what changed is seen only after signing in.
async function tellDuty(env, request, p) {
  try {
    const origin = new URL(request.url).origin;
    const who = p.name ? escH(p.name) + (p.employee_id ? " (" + escH(p.employee_id) + ")" : "") : "colleague";
    await sendEmailNow(env, String(p.email).toLowerCase(), "GrievIQ: your duties have changed",
      `<p>Dear ${who},</p><p>Your duties on GrievIQ have changed. Sign in to see them:</p><p><a href="${escH(origin)}/admin-dashboard.html">${escH(origin)}/admin-dashboard.html</a></p>` +
      "<p>For security, the details are shown only after you sign in.</p><p>GrievIQ will never ask for your sign-in code by email or phone.</p>");
  } catch (e) { /* the Staff page shows it either way */ }
}
function escH(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
