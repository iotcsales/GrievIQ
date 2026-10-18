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
//   add     { email, name, designation, level: NATIONAL|STATE|DISTRICT, stateId,
//             (NATIONAL, grieviq-51: a Union ministry's official, on the
//             ministry's letter; no state)
//             districtId?, letterRef, letterDate,
//             otherEmail?, letterNamesEmail?, otherReason? }
//           The email should be an official one (gov.in or nic.in), as the
//           Government of India's email policy asks; access is reviewed
//           every year. grieviq-49 (owner's decision, 16 Oct 2026): another
//           email is allowed as a recorded exception only when the state's
//           letter names it (letterNamesEmail) and a reason is given; the
//           account is marked OTHER and reviewed every 90 days. Access is
//           given only on a letter from the state (number and date kept).
//   renew   { id, letterRef?, reason }  review done: one more year
//   remove  { id, reason, leaveEmpty? } takes effect at once (sessions end)
//   transfer { id, level, stateId?, districtId?, designation?, email?,
//             letterRef, letterDate, reason, leaveEmpty? }   (grieviq-54)
//           the official moves to another state, district or level, or
//           gets a new post email, on a new letter: the old record closes
//           (moved_to), a new one opens (moved_from), sessions end, their
//           report-email choices go with them. A new email must be an
//           official one.
//   The last official who can open a state's or district's dashboard
//   (aloneIn) can be removed or moved away only with leaveEmpty: true
//   (fields.leaveEmpty = REQUIRED otherwise).
// Every action is kept in admin_events; users are removed, never deleted.

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { govReady, listStates, listDistricts, isOfficialEmail, GOV_LEVELS, REVIEW_DAYS, addDays, istToday, realDate } from "../../_shared/gov.js";
import { emailDomainCanReceive } from "../../_shared/contact-validation.js";
import { transfersReady, aloneIn, covers, scopeOf, govMovedEmail } from "../../_shared/transfers.js";
import { sendEmailNow } from "../../_shared/dept-auth.js";

const REVIEW_DAYS_OTHER = 90;
async function hasKind(env) { try { await env.DB.prepare("SELECT email_kind FROM gov_users LIMIT 1").first(); return true; } catch (e) { return false; } }

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const clean = (v, max) => String(v == null ? "" : v).normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max + 1);
const PERSON_RE = /^[\p{L}\p{M} .'\-]{2,80}$/u;
const REF_RE = /^[\p{L}\p{M}0-9 .,\/()&:#\-]{3,80}$/u;

function userOut(r, today, all) {
  return {
    movedTo: r.moved_to || null, movedFrom: r.moved_from || null, alone: all ? aloneIn(r, all) : false,
    id: r.id, email: r.email, name: r.name, designation: r.designation, level: r.level,
    stateId: r.state_id, districtId: r.district_id, letterRef: r.letter_ref, letterDate: r.letter_date,
    emailKind: r.email_kind || "OFFICIAL", otherReason: r.other_reason || null,
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
    ready: true, canManage, today, reviewDays: REVIEW_DAYS, reviewDaysOther: REVIEW_DAYS_OTHER, otherAllowed: await hasKind(env),
    states: states.filter((s) => !s.demo).map((s) => ({ id: s.id, nameEn: s.nameEn, nameHi: s.nameHi, lgd: s.lgd })),
    districts,
    users: (users.results || []).map((r) => userOut(r, today, users.results || [])),
    transfersReady: await transfersReady(env),
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
    const official = isOfficialEmail(email);
    const kindReady = await hasKind(env);
    let otherReason = null;
    if (!email) f.email = "REQUIRED";
    else if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) f.email = "FORMAT";
    else if (!official) {
      // Another email: only as a recorded exception the state's letter asks for.
      if (!kindReady || b.otherEmail !== true) f.email = "OFFICIAL";
      else {
        otherReason = clean(b.otherReason, 300);
        if (b.letterNamesEmail !== true) f.letterNamesEmail = "REQUIRED";
        if (otherReason.length < 10) f.otherReason = "REQUIRED"; else if (otherReason.length > 300) f.otherReason = "LENGTH";
        if (!f.letterNamesEmail && !f.otherReason) { const dns = await emailDomainCanReceive(email); if (!dns.ok) f.email = "DOMAIN"; }
      }
    }
    if (!name) f.name = "REQUIRED"; else if (!PERSON_RE.test(name)) f.name = "FORMAT";
    if (!designation) f.designation = "REQUIRED"; else if (designation.length < 2 || designation.length > 100 || /[<>]/.test(designation)) f.designation = "FORMAT";
    if (!GOV_LEVELS.includes(level)) f.level = "REQUIRED";
    let state = null, district = null;
    if (level !== "NATIONAL") {
      if (b.stateId) state = await env.DB.prepare("SELECT id, name_en FROM states WHERE id = ? AND demo = 0").bind(String(b.stateId)).first();
      if (!state) f.stateId = "REQUIRED";
    }
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
    const kind = official ? "OFFICIAL" : "OTHER";
    const reviewBy = addDays(today, official ? REVIEW_DAYS : REVIEW_DAYS_OTHER);
    if (kindReady) {
      await env.DB.prepare(
        `INSERT INTO gov_users (id, email, name, designation, level, state_id, district_id, letter_ref, letter_date, review_by, status, added_by, added_at, email_kind, other_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`
      ).bind(id, email, name, designation, level, state ? state.id : null, district ? district.id : null, letterRef, letterDate, reviewBy, auth.email, now, kind, otherReason).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO gov_users (id, email, name, designation, level, state_id, district_id, letter_ref, letter_date, review_by, status, added_by, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
      ).bind(id, email, name, designation, level, state ? state.id : null, district ? district.id : null, letterRef, letterDate, reviewBy, auth.email, now).run();
    }
    await logEvent(env, auth.email, official ? "gov_user_added" : "gov_user_added_other_email", email, { name, designation, level, state: state ? state.id : null, district: district ? district.id : null, letterRef, letterDate, reviewBy, emailKind: kind, otherReason });
    return json({ ok: true, id, reviewBy, emailKind: kind });
  }

  if (b.action === "renew" || b.action === "remove") {
    const row = await env.DB.prepare("SELECT * FROM gov_users WHERE id = ?").bind(String(b.id || "")).first();
    if (!row) return json({ error: "NOT_FOUND" }, 404);
    if (row.status !== "ACTIVE") return json({ error: "ALREADY_REMOVED" }, 409);
    const reason = clean(b.reason, 300);
    if (reason.length < 5) f.reason = "REQUIRED"; else if (reason.length > 300) f.reason = "LENGTH";
    // grieviq-54: never leave a state or district with nobody by accident.
    if (b.action === "remove" && b.leaveEmpty !== true) {
      const all = (await env.DB.prepare("SELECT * FROM gov_users WHERE status = 'ACTIVE'").all()).results || [];
      if (aloneIn(row, all)) f.leaveEmpty = "REQUIRED";
    }
    if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
    if (b.action === "renew") {
      const reviewBy = addDays(today, row.email_kind === "OTHER" ? REVIEW_DAYS_OTHER : REVIEW_DAYS);
      await env.DB.prepare("UPDATE gov_users SET review_by = ?, renewed_by = ?, renewed_at = ? WHERE id = ?").bind(reviewBy, auth.email, now, row.id).run();
      await logEvent(env, auth.email, "gov_user_renewed", row.email, { reason, before: row.review_by, after: reviewBy });
      return json({ ok: true, reviewBy });
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE gov_users SET status = 'REMOVED', removed_by = ?, removed_at = ?, remove_reason = ? WHERE id = ?").bind(auth.email, now, reason, row.id),
      env.DB.prepare("UPDATE gov_sessions SET ended_at = ?, end_reason = 'REMOVED' WHERE user_id = ? AND ended_at IS NULL").bind(now, row.id),
    ]);
    const allNow = (await env.DB.prepare("SELECT * FROM gov_users WHERE status = 'ACTIVE' AND id <> ?").bind(row.id).all()).results || [];
    const leftEmpty = !allNow.some((x) => covers(x, scopeOf(row)));
    await logEvent(env, auth.email, "gov_user_removed", row.email, { reason, leftEmpty });
    return json({ ok: true, leftEmpty });
  }

  if (b.action === "transfer") {
    if (!(await transfersReady(env))) return json({ error: "NOT_READY", code: "NOT_SET_UP" }, 503);
    const row = await env.DB.prepare("SELECT * FROM gov_users WHERE id = ?").bind(String(b.id || "")).first();
    if (!row) return json({ error: "NOT_FOUND" }, 404);
    if (row.status !== "ACTIVE") return json({ error: "ALREADY_REMOVED" }, 409);
    const level = String(b.level || "").toUpperCase();
    const designation = clean(b.designation, 100) || row.designation;
    const email = (clean(b.email, 120) || row.email).toLowerCase();
    const letterRef = clean(b.letterRef, 80), letterDate = clean(b.letterDate, 10);
    const reason = clean(b.reason, 300);
    const sameEmail = email === String(row.email).toLowerCase();
    if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) f.email = "FORMAT";
    else if (!sameEmail) {
      if (!isOfficialEmail(email)) f.email = "OFFICIAL";
      else if (await env.DB.prepare("SELECT id FROM gov_users WHERE email = ? AND status = 'ACTIVE'").bind(email).first()) f.email = "TAKEN";
    }
    if (designation.length < 2 || designation.length > 100 || /[<>]/.test(designation)) f.designation = "FORMAT";
    if (!GOV_LEVELS.includes(level)) f.level = "REQUIRED";
    let state = null, district = null;
    if (level && level !== "NATIONAL") {
      if (b.stateId) state = await env.DB.prepare("SELECT id, name_en, name_hi FROM states WHERE id = ? AND demo = 0").bind(String(b.stateId)).first();
      if (!state) f.stateId = "REQUIRED";
    }
    if (level === "DISTRICT") {
      if (b.districtId) district = await env.DB.prepare("SELECT id, state_id, name_en, name_hi FROM districts WHERE id = ?").bind(String(b.districtId)).first();
      if (!district) f.districtId = "REQUIRED"; else if (state && district.state_id !== state.id) f.districtId = "WRONG_STATE";
    }
    if (!letterRef) f.letterRef = "REQUIRED"; else if (!REF_RE.test(letterRef)) f.letterRef = "FORMAT";
    if (!letterDate) f.letterDate = "REQUIRED"; else if (!realDate(letterDate)) f.letterDate = "DATE"; else if (letterDate > today) f.letterDate = "FUTURE";
    if (reason.length < 5) f.reason = "REQUIRED"; else if (reason.length > 300) f.reason = "LENGTH";
    const next = { status: "ACTIVE", level, state_id: state ? state.id : null, district_id: district ? district.id : null };
    if (!f.level && !f.stateId && !f.districtId && sameEmail && designation === row.designation &&
        next.level === row.level && next.state_id === (row.state_id || null) && next.district_id === (row.district_id || null)) f.level = "SAME";
    if (!f.level && !f.stateId && !f.districtId && b.leaveEmpty !== true) {
      const all = (await env.DB.prepare("SELECT * FROM gov_users WHERE status = 'ACTIVE'").all()).results || [];
      if (aloneIn(row, all) && !covers(next, scopeOf(row))) f.leaveEmpty = "REQUIRED";
    }
    if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
    const id = crypto.randomUUID();
    const kind = sameEmail ? (row.email_kind || "OFFICIAL") : "OFFICIAL";
    const reviewBy = addDays(today, kind === "OTHER" ? REVIEW_DAYS_OTHER : REVIEW_DAYS);
    const kindCols = await hasKind(env);
    await env.DB.batch([
      kindCols
        ? env.DB.prepare(`INSERT INTO gov_users (id, email, name, designation, level, state_id, district_id, letter_ref, letter_date, review_by, status, added_by, added_at, email_kind, other_reason, moved_from)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`).bind(id, email, row.name, designation, level, next.state_id, next.district_id, letterRef, letterDate, reviewBy, auth.email, now, kind, kind === "OTHER" ? row.other_reason : null, row.id)
        : env.DB.prepare(`INSERT INTO gov_users (id, email, name, designation, level, state_id, district_id, letter_ref, letter_date, review_by, status, added_by, added_at, moved_from)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`).bind(id, email, row.name, designation, level, next.state_id, next.district_id, letterRef, letterDate, reviewBy, auth.email, now, row.id),
      env.DB.prepare("UPDATE gov_users SET status = 'REMOVED', removed_by = ?, removed_at = ?, remove_reason = ?, moved_to = ? WHERE id = ? AND status = 'ACTIVE'").bind(auth.email, now, "Transferred: " + reason, id, row.id),
      env.DB.prepare("UPDATE gov_sessions SET ended_at = ?, end_reason = 'TRANSFERRED' WHERE user_id = ? AND ended_at IS NULL").bind(now, row.id),
    ]);
    try {
      await env.DB.prepare("INSERT INTO gov_report_prefs (user_id, monthly, weekly, updated_at) SELECT ?, monthly, weekly, ? FROM gov_report_prefs WHERE user_id = ?").bind(id, now, row.id).run();
    } catch (e) { /* report choices not set up yet */ }
    const scopeEn = level === "NATIONAL" ? "the whole country (National Dashboard)" : level === "STATE" ? state.name_en + " (State Dashboard)" : district.name_en + ", " + state.name_en + " (State Dashboard, district view)";
    const scopeHi = level === "NATIONAL" ? "पूरा देश (राष्ट्रीय डैशबोर्ड)" : level === "STATE" ? (state.name_hi || state.name_en) + " (राज्य डैशबोर्ड)" : (district.name_hi || district.name_en) + ", " + (state.name_hi || state.name_en) + " (राज्य डैशबोर्ड, ज़िला दृश्य)";
    const m = govMovedEmail(row.name, scopeEn, scopeHi, new URL(request.url).origin, level === "NATIONAL" ? "/national" : "/state");
    const sent = await sendEmailNow(env, email, m.subject, m.html);
    await logEvent(env, auth.email, "gov_user_transferred", email, { from: { email: row.email, level: row.level, state: row.state_id, district: row.district_id }, to: { level, state: next.state_id, district: next.district_id },
      newId: id, letterRef, letterDate, reason, reviewBy, emailChanged: !sameEmail, leftEmpty: b.leaveEmpty === true });
    return json({ ok: true, id, reviewBy, emailed: sent });
  }
  return json({ error: "Unknown action." }, 400);
}
