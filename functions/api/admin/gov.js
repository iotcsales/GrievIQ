/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/admin/gov.js   (grieviq-48)
//
// "Government access": who from a state government may open the government
// dashboard (grieviq-49), the view log, and the representatives' offices
// that chose to share their own figures.
//
// GET  (view_gov: super, operations, auditor)
//   -> { ready, canManage, today, reviewDays, states, districts, users,
//        sharing: [{ tier, id, name, at, by }], log: [...last 200] }
// POST (manage_gov: super admin), { action, ... }
//   add     { email, name, designation, level: STATE|DISTRICT, stateId,
//             districtId?, letterRef, letterDate }
//           The email must be an official one (gov.in or nic.in). Access
//           is given only on a letter from the state (its number and date
//           are kept); it is reviewed every year (review_by).
//   renew   { id, letterRef?, reason }  review done: one more year
//   remove  { id, reason }              takes effect at once (sessions end)
// Every action is kept in admin_events; users are removed, never deleted.

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { govReady, listStates, listDistricts, isOfficialEmail, GOV_LEVELS, REVIEW_DAYS, addDays, istToday, realDate } from "../../_shared/gov.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const clean = (v, max) => String(v == null ? "" : v).normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max + 1);
const PERSON_RE = /^[\p{L}\p{M} .'\-]{2,80}$/u;
const REF_RE = /^[\p{L}\p{M}0-9 .,\/()&:#\-]{3,80}$/u;

function userOut(r, today) {
  return {
    id: r.id, email: r.email, name: r.name, designation: r.designation, level: r.level,
    stateId: r.state_id, districtId: r.district_id, letterRef: r.letter_ref, letterDate: r.letter_date,
    reviewBy: r.review_by, reviewDue: r.status === "ACTIVE" && r.review_by <= today,
    status: r.status, addedBy: r.added_by, addedAt: r.added_at, renewedAt: r.renewed_at, renewedBy: r.renewed_by,
    removedAt: r.removed_at, removedBy: r.removed_by, removeReason: r.remove_reason, lastSignedIn: r.last_signed_in,
  };
}

async function logEvent(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, target, JSON.stringify(detail)).run();
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_gov");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const canManage = allows(auth, "manage_gov");
  if (!(await govReady(env))) return json({ ready: false, canManage });
  const today = istToday();
  const [states, districts, users, sharing, log] = await Promise.all([
    listStates(env), listDistricts(env),
    env.DB.prepare("SELECT * FROM gov_users ORDER BY status, name").all(),
    env.DB.prepare("SELECT office_tier, office_id, office_name, changed_at, changed_by FROM office_gov_share WHERE share = 1 ORDER BY office_name").all(),
    env.DB.prepare("SELECT at, email, action, scope FROM gov_view_log ORDER BY at DESC LIMIT 200").all(),
  ]);
  return json({
    ready: true, canManage, today, reviewDays: REVIEW_DAYS,
    states: states.filter((s) => !s.demo).map((s) => ({ id: s.id, nameEn: s.nameEn, nameHi: s.nameHi, lgd: s.lgd })),
    districts,
    users: (users.results || []).map((r) => userOut(r, today)),
    sharing: (sharing.results || []).map((r) => ({ tier: r.office_tier, id: r.office_id, name: r.office_name || r.office_id, at: r.changed_at, by: r.changed_by })),
    log: (log.results || []).map((r) => ({ at: r.at, email: r.email, action: r.action, scope: r.scope })),
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_gov");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await govReady(env))) return json({ error: "NOT_READY" }, 409);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const today = istToday();
  const now = new Date().toISOString();
  const f = {};

  if (b.action === "add") {
    const email = clean(b.email, 120).toLowerCase();
    const name = clean(b.name, 80), designation = clean(b.designation, 100);
    const level = String(b.level || "").toUpperCase();
    const letterRef = clean(b.letterRef, 80), letterDate = clean(b.letterDate, 10);
    if (!email) f.email = "REQUIRED"; else if (email.length > 120 || !isOfficialEmail(email)) f.email = "OFFICIAL";
    if (!name) f.name = "REQUIRED"; else if (!PERSON_RE.test(name)) f.name = "FORMAT";
    if (!designation) f.designation = "REQUIRED"; else if (designation.length < 2 || designation.length > 100 || /[<>]/.test(designation)) f.designation = "FORMAT";
    if (!GOV_LEVELS.includes(level)) f.level = "REQUIRED";
    let state = null, district = null;
    if (b.stateId) state = await env.DB.prepare("SELECT id, name_en FROM states WHERE id = ?").bind(String(b.stateId)).first();
    if (!state) f.stateId = "REQUIRED";
    if (level === "DISTRICT") {
      if (b.districtId) district = await env.DB.prepare("SELECT id, state_id, name_en FROM districts WHERE id = ?").bind(String(b.districtId)).first();
      if (!district) f.districtId = "REQUIRED"; else if (state && district.state_id !== state.id) f.districtId = "WRONG_STATE";
    }
    if (!letterRef) f.letterRef = "REQUIRED"; else if (!REF_RE.test(letterRef)) f.letterRef = "FORMAT";
    if (!letterDate) f.letterDate = "REQUIRED"; else if (!realDate(letterDate)) f.letterDate = "DATE"; else if (letterDate > today) f.letterDate = "FUTURE";
    if (!f.email) {
      const dup = await env.DB.prepare("SELECT id FROM gov_users WHERE email = ? AND status = 'ACTIVE'").bind(email).first();
      if (dup) f.email = "TAKEN";
    }
    if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
    const id = crypto.randomUUID();
    const reviewBy = addDays(today, REVIEW_DAYS);
    await env.DB.prepare(
      `INSERT INTO gov_users (id, email, name, designation, level, state_id, district_id, letter_ref, letter_date, review_by, status, added_by, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
    ).bind(id, email, name, designation, level, state.id, district ? district.id : null, letterRef, letterDate, reviewBy, auth.email, now).run();
    await logEvent(env, auth.email, "gov_user_added", email, { name, designation, level, state: state.id, district: district ? district.id : null, letterRef, letterDate, reviewBy });
    return json({ ok: true, id, reviewBy });
  }

  if (b.action === "renew" || b.action === "remove") {
    const row = await env.DB.prepare("SELECT * FROM gov_users WHERE id = ?").bind(String(b.id || "")).first();
    if (!row) return json({ error: "NOT_FOUND" }, 404);
    if (row.status !== "ACTIVE") return json({ error: "ALREADY_REMOVED" }, 409);
    const reason = clean(b.reason, 300);
    if (reason.length < 5) f.reason = "REQUIRED"; else if (reason.length > 300) f.reason = "LENGTH";
    if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
    if (b.action === "renew") {
      const reviewBy = addDays(today, REVIEW_DAYS);
      await env.DB.prepare("UPDATE gov_users SET review_by = ?, renewed_by = ?, renewed_at = ? WHERE id = ?").bind(reviewBy, auth.email, now, row.id).run();
      await logEvent(env, auth.email, "gov_user_renewed", row.email, { reason, before: row.review_by, after: reviewBy });
      return json({ ok: true, reviewBy });
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE gov_users SET status = 'REMOVED', removed_by = ?, removed_at = ?, remove_reason = ? WHERE id = ?").bind(auth.email, now, reason, row.id),
      env.DB.prepare("UPDATE gov_sessions SET ended_at = ?, end_reason = 'REMOVED' WHERE user_id = ? AND ended_at IS NULL").bind(now, row.id),
    ]);
    await logEvent(env, auth.email, "gov_user_removed", row.email, { reason });
    return json({ ok: true });
  }
  return json({ error: "Unknown action." }, 400);
}
