/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/admin/assisted   (grieviq-88) -- GrievIQ-assisted wards.
// The rules are in functions/_shared/assisted.js.
//
// GET                         pilots, their wards, the case list, wards ready for handover
// GET ?case=<id>              one case in full (for forwarding and replies)
// GET ?wards=<area id>        wards of an area that can join a pilot
// GET ?report=<ward id>       the ward's area report (staff preview)
//
// POST { action, ... }
//   pilot_save    { id?, name, startsOn, endsOn, dailyCap }       super admin
//   pilot_stop    { id }                                           super admin
//   ward_add      { pilotId, unitIds }                             super admin
//   ward_email    { wardRow, officeEmail, emailSource }            super admin
//   ward_remove   { wardRow }                                      super admin
//   forward       { id, office: { channel }, dept: { department, officeId?, channel }, minutes }
//   followup      { id, target, channel, text?, minutes }
//   reply         { id, target, targetName?, replyKind, text, expectedBy?, minutes }
//   note          { id, text, minutes }
//   ask_confirm   { id, text, minutes }   the office says it is done: the citizen confirms
//   handover      { unitId }              the ward's office has joined: its open cases move to it
//   report_link   { unitId, send }        a private 30-day link to the ward's report
//   report_revoke { reportId }
// Every action is logged (admin_events). Emails to offices go only to the
// official public address on record, never carry the citizen's name,
// phone or email, and the reply link is the only way in.

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import { logEvent } from "../../_shared/handover.js";
import {
  assistedReady, isAssisted, filingState, todayCount, loadSteps, addStep, nextFollowUp, caseState, totalMinutes, newToken, tokenHash,
  areaReport, istDay, validDay, daysBetween, toMs, REPLY_KINDS, RECORD_CHANNELS, LINK_DAYS, REPORT_DAYS, PILOT_MAX_DAYS, CAP_MIN, CAP_MAX,
  MINUTES_MAX, TEXT_MIN, TEXT_MAX, at, atVal,
} from "../../_shared/assisted.js";
import { complaintPhotoList, loadComplaintPhotos } from "../../_shared/photo-store.js";
import { STEP, addStep as addDeptStep, stepsReady, loadSteps as loadDeptSteps, shapeStepForRep } from "../../_shared/dept-steps.js";
import { activeDeptKeys, deptTypes, namesOf } from "../../_shared/departments.js";
import { dashboardOffices } from "../../_shared/dept-auth.js";
import { notifyDeptForwarded, notifyNewCase, emailCaseUpdate, queueEmail, flushOutbox } from "../../_shared/notify.js";
import { finalizeResolution } from "../../_shared/resolve-case.js";
import { maskPersonal } from "../../_shared/misuse.js";
import { markDone } from "../../_shared/alerts.js";

const json = (body, status) => Response.json(body, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const has = (roles, perm) => [].concat(roles).some((r) => (PERMISSIONS[perm] || []).includes(r));
const OPEN = ["OPEN", "ACKNOWLEDGED"];
const DAY = 86400000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEPT_CHANNEL = { LETTER: "LETTER", CALL: "PHONE", VISIT: "IN_PERSON", EMAIL: "EMAIL", DASHBOARD: "DASHBOARD" };

function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function clean(v, max) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max + 1); }
function minutesOf(v, fields) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > MINUTES_MAX) { fields.minutes = "RANGE"; return 0; }
  return n;
}
const joined = (u) => !!(u && u.rep_email && String(u.rep_email).trim());

async function notReady() { return json({ error: "This isn't set up yet. Run the database update part57-assisted.sql.", code: "NOT_SET_UP" }, 503); }

// ---------------------------------------------------------------------------
export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_assisted");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await assistedReady(env))) return notReady();
  const url = new URL(request.url);
  const roles = auth.roles || [auth.role];
  const perms = { manage: has(roles, "manage_pilots"), work: has(roles, "work_assisted") };
  if (url.searchParams.get("case")) return caseDetail(env, url.searchParams.get("case"), perms);
  if (url.searchParams.get("wards")) return areaWards(env, url.searchParams.get("wards"));
  if (url.searchParams.get("report")) {
    const unitId = url.searchParams.get("report");
    const w = await env.DB.prepare("SELECT p.starts_on, p.ends_on FROM assisted_wards w JOIN assisted_pilots p ON p.id = w.pilot_id WHERE w.unit_id = ? ORDER BY w.added_at DESC LIMIT 1").bind(unitId).first();
    if (!w) return json({ error: "This ward isn't in a pilot." }, 404);
    const rep = await areaReport(env, unitId, w.starts_on, istDay() < w.ends_on ? istDay() : w.ends_on);
    return json({ report: rep });
  }
  return overview(env, perms);
}

async function overview(env, perms) {
  const now = Date.now();
  const { results: pilots } = await env.DB.prepare("SELECT * FROM assisted_pilots ORDER BY created_at DESC").all();
  const { results: wards } = await env.DB.prepare(
    `SELECT w.id AS ward_row, w.pilot_id, w.unit_id, w.office_email, w.email_source, w.added_at, lu.name, lu.rep_email, ar.name AS area_name
     FROM assisted_wards w JOIN local_units lu ON lu.id = w.unit_id LEFT JOIN areas ar ON ar.id = lu.area_id
     WHERE w.removed_at IS NULL ORDER BY lu.name`
  ).all().catch(async () => env.DB.prepare(
    `SELECT w.id AS ward_row, w.pilot_id, w.unit_id, w.office_email, w.email_source, w.added_at, lu.name, lu.rep_email, NULL AS area_name
     FROM assisted_wards w JOIN local_units lu ON lu.id = w.unit_id WHERE w.removed_at IS NULL ORDER BY lu.name`).all());
  // Open assisted cases, and those closed in the last 30 days.
  const since = new Date(now - 30 * DAY).toISOString();
  const { results: cases } = await env.DB.prepare(
    `SELECT g.*, c.name AS cat_name, lu.name AS ward_name, lu.rep_email AS ward_rep_email
     FROM grievances g JOIN grievance_categories c ON c.id = g.category_id JOIN local_units lu ON lu.id = g.local_unit_id
     WHERE g.assisted_pilot IS NOT NULL AND (g.status IN ('OPEN', 'ACKNOWLEDGED') OR ${at("COALESCE(g.closed_at, g.resolved_at, g.updated_at, g.created_at)")} >= ? OR g.assisted_handed_at >= ?)
     ORDER BY g.created_at ASC`
  ).bind(atVal(since), since).all();
  const steps = await loadSteps(env, (cases || []).map((g) => g.id));
  const list = (cases || []).map((g) => {
    const s = steps.get(g.id) || [];
    const due = nextFollowUp(g, s);
    const last = s.length ? s[s.length - 1] : null;
    return {
      id: g.id, ref: g.tracking_ref, category: g.cat_name, categoryId: g.category_id, ward: g.ward_name, wardId: g.local_unit_id, createdAt: g.created_at, status: g.status,
      priority: !!(g.priority && !g.priority_off_at), state: caseState(g, s, joined({ rep_email: g.ward_rep_email }), now),
      nextFollowUp: due ? new Date(due).toISOString() : null, minutes: totalMinutes(s), steps: s.length,
      last: last ? { kind: last.kind, target: last.target, targetName: last.target_name, replyKind: last.reply_kind, at: last.created_at } : null,
      handedAt: g.assisted_handed_at || null,
    };
  });
  const { results: reps } = await env.DB.prepare("SELECT id, unit_id, sent_to, created_at, expires_at, revoked_at, opened_count FROM assisted_reports ORDER BY created_at DESC LIMIT 500").all();
  const pilotOut = [];
  for (const p of pilots || []) {
    const state = filingState(p, now);
    pilotOut.push({
      id: p.id, name: p.name, startsOn: p.starts_on, endsOn: p.ends_on, dailyCap: p.daily_cap, state, stoppedAt: p.stopped_at || null,
      today: state === "OPEN" ? await todayCount(env, p.id, now) : 0,
      filed: Number(((await env.DB.prepare("SELECT COUNT(*) AS n FROM grievances WHERE assisted_pilot = ?").bind(p.id).first()) || {}).n) || 0,
      wards: (wards || []).filter((w) => w.pilot_id === p.id).map((w) => ({
        row: w.ward_row, unitId: w.unit_id, name: w.name, area: w.area_name || null, officeEmail: w.office_email || null, emailSource: w.email_source || null,
        reports: (reps || []).filter((r) => r.unit_id === w.unit_id).map((r) => ({ id: r.id, sentTo: r.sent_to || null, at: r.created_at, expiresAt: r.expires_at,
          live: !r.revoked_at && toMs(r.expires_at) > now, opened: Number(r.opened_count) || 0 })),
        joined: joined(w), openCases: list.filter((c) => c.wardId === w.unit_id && OPEN.includes(c.status) && !c.handedAt).length,
      })),
    });
  }
  // Figures for the staffing estimate: minutes per case so far.
  const worked = list.filter((c) => c.minutes > 0);
  const stats = {
    open: list.filter((c) => OPEN.includes(c.status) && !c.handedAt).length,
    newToday: list.filter((c) => istDay(toMs(c.createdAt)) === istDay(now)).length,
    due: list.filter((c) => c.state === "DUE").length,
    avgMinutes: worked.length ? Math.round(worked.reduce((n, c) => n + c.minutes, 0) / worked.length) : null,
    casesTimed: worked.length,
  };
  let areas = [];
  if (perms.manage) {
    try { areas = (await env.DB.prepare("SELECT id, name, state FROM areas ORDER BY name").all()).results || []; } catch (e) { areas = []; }
  }
  return json({ perms, pilots: pilotOut, cases: list, stats, areas, today: istDay(now) });
}

async function areaWards(env, areaId) {
  const { results } = await env.DB.prepare(
    `SELECT lu.id, lu.name, lu.rep_email, lu.seat_status, lu.seat_count,
            (SELECT w.pilot_id FROM assisted_wards w WHERE w.unit_id = lu.id AND w.removed_at IS NULL LIMIT 1) AS pilot_id
     FROM local_units lu WHERE lu.area_id = ? ORDER BY lu.name LIMIT 2000`
  ).bind(String(areaId)).all().catch(async () => env.DB.prepare(
    `SELECT lu.id, lu.name, lu.rep_email, NULL AS seat_status, NULL AS seat_count,
            (SELECT w.pilot_id FROM assisted_wards w WHERE w.unit_id = lu.id AND w.removed_at IS NULL LIMIT 1) AS pilot_id
     FROM local_units lu WHERE lu.area_id = ? ORDER BY lu.name LIMIT 2000`).bind(String(areaId)).all());
  return json({ wards: (results || []).map((u) => ({
    id: u.id, name: u.name, inPilot: u.pilot_id || null,
    can: !joined(u) && u.seat_status !== "VACANT" && !(Number(u.seat_count) > 1) && !u.pilot_id,
    why: joined(u) ? "JOINED" : u.seat_status === "VACANT" ? "VACANT" : Number(u.seat_count) > 1 ? "MULTI" : u.pilot_id ? "IN_PILOT" : null,
  })) });
}

async function caseDetail(env, id, perms) {
  const g = await env.DB.prepare(
    `SELECT g.*, c.name AS cat_name, lu.name AS ward_name, lu.rep_email AS ward_rep_email, lu.area_id AS ward_area
     FROM grievances g JOIN grievance_categories c ON c.id = g.category_id JOIN local_units lu ON lu.id = g.local_unit_id WHERE g.id = ?`
  ).bind(String(id)).first();
  if (!g || !g.assisted_pilot) return json({ error: "Case not found." }, 404);
  const steps = (await loadSteps(env, [g.id])).get(g.id) || [];
  const ward = await env.DB.prepare("SELECT office_email, email_source FROM assisted_wards WHERE unit_id = ? AND pilot_id = ? ORDER BY added_at DESC LIMIT 1").bind(g.local_unit_id, g.assisted_pilot).first();
  const deptReady = await stepsReady(env);
  const deptSteps = deptReady ? ((await loadDeptSteps(env, [g.id])).get(g.id) || []).map(shapeStepForRep) : [];
  // Department offices that serve this ward, and whether they use GrievIQ.
  let offices = [];
  try {
    const { results } = await env.DB.prepare("SELECT id, name_en, departments, wards, office_email FROM dept_offices WHERE area_id = ? AND retired_at IS NULL ORDER BY name_en")
      .bind(g.ward_area || "lucknow").all();
    const rows = (results || []).filter((o) => { try { const w = o.wards ? JSON.parse(o.wards) : null; return !w || w.includes(g.local_unit_id); } catch (e) { return true; } });
    const dash = await dashboardOffices(env, rows.map((o) => o.id));
    offices = rows.map((o) => { let d = []; try { d = JSON.parse(o.departments) || []; } catch (e) { d = []; }
      return { id: o.id, name: o.name_en, departments: d, hasEmail: !!(o.office_email && EMAIL_RE.test(o.office_email)), dashboard: dash.has(String(o.id)) }; });
  } catch (e) { offices = []; }
  const { results: links } = await env.DB.prepare("SELECT id, target, target_name, sent_to, replies, created_at, expires_at, revoked_at FROM assisted_links WHERE grievance_id = ? ORDER BY created_at").bind(g.id).all();
  const due = nextFollowUp(g, steps);
  return json({
    perms,
    case: {
      id: g.id, ref: g.tracking_ref, category: g.cat_name, ward: g.ward_name, wardId: g.local_unit_id, status: g.status, createdAt: g.created_at,
      description: g.description, locationDetail: g.location_detail || null, pin: g.pin_lat != null ? { lat: g.pin_lat, lng: g.pin_lng } : null,
      priority: g.priority && !g.priority_off_at ? g.priority : null, hasEmail: !!(g.citizen_email && g.citizen_email.includes("@")),
      photos: await complaintPhotoList(env, g, await loadComplaintPhotos(env, g.id), true),
      officeJoined: joined({ rep_email: g.ward_rep_email }), handedAt: g.assisted_handed_at || null,
      officeEmail: ward && ward.office_email ? ward.office_email : null,
      state: caseState(g, steps, joined({ rep_email: g.ward_rep_email })), nextFollowUp: due ? new Date(due).toISOString() : null, minutes: totalMinutes(steps),
      steps: steps.map((s) => ({ id: s.id, kind: s.kind, target: s.target, targetName: s.target_name, channel: s.channel, replyKind: s.reply_kind,
        expectedBy: s.expected_by, text: s.text, repliedBy: s.replied_by, minutes: s.minutes, by: s.by_email, at: s.created_at })),
      deptSteps,
      links: (links || []).map((l) => ({ id: l.id, target: l.target, targetName: l.target_name, sentTo: l.sent_to, replies: l.replies, at: l.created_at, expiresAt: l.expires_at, revoked: !!l.revoked_at })),
    },
    departments: namesOf(await deptTypes(env)), activeDepartments: await activeDeptKeys(env), offices,
  });
}

// ---------------------------------------------------------------------------
export async function onRequestPost({ request, env, waitUntil }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const action = String(body.action || "");
  const manage = ["pilot_save", "pilot_stop", "ward_add", "ward_email", "ward_remove"].includes(action);
  const auth = await getVerifiedAdmin(request, env, manage ? "manage_pilots" : "work_assisted");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await assistedReady(env))) return notReady();
  const origin = new URL(request.url).origin;
  const ctx = { env, auth, origin, request, waitUntil: typeof waitUntil === "function" ? waitUntil : null };
  switch (action) {
    case "pilot_save": return pilotSave(ctx, body);
    case "pilot_stop": return pilotStop(ctx, body);
    case "ward_add": return wardAdd(ctx, body);
    case "ward_email": return wardEmail(ctx, body);
    case "ward_remove": return wardRemove(ctx, body);
    case "forward": return forward(ctx, body);
    case "followup": return followup(ctx, body);
    case "reply": return reply(ctx, body);
    case "note": return note(ctx, body);
    case "ask_confirm": return askConfirm(ctx, body);
    case "handover": return handover(ctx, body);
    case "report_link": return reportLink(ctx, body);
    case "report_revoke": return reportRevoke(ctx, body);
    default: return json({ error: "Unknown action." }, 400);
  }
}

// ---- Pilots and wards (super admin) ---------------------------------------
async function pilotSave({ env, auth }, b) {
  const fields = {};
  const name = clean(b.name, 80);
  if (name.length < 3 || name.length > 80) fields.name = "LENGTH";
  const startsOn = String(b.startsOn || ""), endsOn = String(b.endsOn || "");
  if (!validDay(startsOn)) fields.startsOn = "DATE";
  if (!validDay(endsOn)) fields.endsOn = "DATE";
  if (!fields.startsOn && !fields.endsOn) {
    if (endsOn < startsOn) fields.endsOn = "BEFORE_START";
    else if (daysBetween(startsOn, endsOn) + 1 > PILOT_MAX_DAYS) fields.endsOn = "TOO_LONG";
  }
  const cap = Number(b.dailyCap);
  if (!Number.isInteger(cap) || cap < CAP_MIN || cap > CAP_MAX) fields.dailyCap = "RANGE";
  const now = new Date().toISOString();
  let existing = null;
  if (b.id) {
    existing = await env.DB.prepare("SELECT * FROM assisted_pilots WHERE id = ?").bind(String(b.id)).first();
    if (!existing) return json({ error: "Pilot not found." }, 404);
    if (existing.stopped_at) return json({ error: "This pilot was stopped. Start a new one instead.", code: "STOPPED" }, 409);
    // The first filing day can't move once filing has begun.
    if (!fields.startsOn && existing.starts_on <= istDay() && startsOn !== existing.starts_on) fields.startsOn = "STARTED";
  } else if (!fields.startsOn && startsOn < istDay()) fields.startsOn = "PAST";
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);
  let id = existing ? existing.id : "pilot-" + crypto.randomUUID();
  if (existing) {
    await env.DB.prepare("UPDATE assisted_pilots SET name = ?, starts_on = ?, ends_on = ?, daily_cap = ?, updated_by = ?, updated_at = ? WHERE id = ?")
      .bind(name, startsOn, endsOn, cap, auth.email, now, id).run();
  } else {
    await env.DB.prepare("INSERT INTO assisted_pilots (id, name, starts_on, ends_on, daily_cap, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, name, startsOn, endsOn, cap, auth.email, now).run();
  }
  await logEvent(env, auth.email, existing ? "assisted_pilot_changed" : "assisted_pilot_started", id, { name, startsOn, endsOn, dailyCap: cap });
  return json({ ok: true, id });
}

async function pilotStop({ env, auth }, b) {
  const p = await env.DB.prepare("SELECT * FROM assisted_pilots WHERE id = ?").bind(String(b.id || "")).first();
  if (!p) return json({ error: "Pilot not found." }, 404);
  if (p.stopped_at) return json({ ok: true });
  await env.DB.prepare("UPDATE assisted_pilots SET stopped_at = ?, stopped_by = ? WHERE id = ?").bind(new Date().toISOString(), auth.email, p.id).run();
  await logEvent(env, auth.email, "assisted_pilot_stopped", p.id, { name: p.name });
  return json({ ok: true });
}

async function wardAdd({ env, auth }, b) {
  const p = await env.DB.prepare("SELECT * FROM assisted_pilots WHERE id = ?").bind(String(b.pilotId || "")).first();
  if (!p || p.stopped_at) return json({ error: "Pilot not found." }, 404);
  const ids = Array.isArray(b.unitIds) ? Array.from(new Set(b.unitIds.map(String))).slice(0, 50) : [];
  if (!ids.length) return json({ error: "Choose at least one ward or village.", fields: { unitIds: "REQUIRED" } }, 400);
  const added = [], refused = [];
  for (const uid of ids) {
    let u;
    try { u = await env.DB.prepare("SELECT id, name, rep_email, seat_status, seat_count FROM local_units WHERE id = ?").bind(uid).first(); }
    catch (e) { u = await env.DB.prepare("SELECT id, name, rep_email FROM local_units WHERE id = ?").bind(uid).first(); }
    const inPilot = u && await env.DB.prepare("SELECT id FROM assisted_wards WHERE unit_id = ? AND removed_at IS NULL").bind(uid).first();
    const why = !u ? "NOT_FOUND" : joined(u) ? "JOINED" : u.seat_status === "VACANT" ? "VACANT" : Number(u.seat_count) > 1 ? "MULTI" : inPilot ? "IN_PILOT" : null;
    if (why) { refused.push({ id: uid, name: u ? u.name : null, why }); continue; }
    await env.DB.prepare("INSERT INTO assisted_wards (id, pilot_id, unit_id, added_by, added_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), p.id, uid, auth.email, new Date().toISOString()).run();
    added.push({ id: uid, name: u.name });
  }
  if (added.length) await logEvent(env, auth.email, "assisted_wards_added", p.id, { wards: added.map((x) => x.id) });
  return json({ ok: true, added, refused });
}

async function wardEmail({ env, auth }, b) {
  const w = await env.DB.prepare("SELECT * FROM assisted_wards WHERE id = ? AND removed_at IS NULL").bind(String(b.wardRow || "")).first();
  if (!w) return json({ error: "Ward not found." }, 404);
  const email = String(b.officeEmail || "").trim().toLowerCase();
  const source = clean(b.emailSource, 200);
  const fields = {};
  if (email && (!EMAIL_RE.test(email) || email.length > 120)) fields.officeEmail = "EMAIL";
  if (email && source.length < 5) fields.emailSource = "REQUIRED";
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);
  await env.DB.prepare("UPDATE assisted_wards SET office_email = ?, email_source = ? WHERE id = ?").bind(email || null, email ? source : null, w.id).run();
  await logEvent(env, auth.email, "assisted_office_email_set", w.unit_id, { pilot: w.pilot_id, email: email || null, source: email ? source : null });
  return json({ ok: true });
}

async function wardRemove({ env, auth }, b) {
  const w = await env.DB.prepare("SELECT * FROM assisted_wards WHERE id = ? AND removed_at IS NULL").bind(String(b.wardRow || "")).first();
  if (!w) return json({ error: "Ward not found." }, 404);
  // Open cases stay with staff; only new filing stops.
  await env.DB.prepare("UPDATE assisted_wards SET removed_at = ?, removed_by = ? WHERE id = ?").bind(new Date().toISOString(), auth.email, w.id).run();
  await logEvent(env, auth.email, "assisted_ward_removed", w.unit_id, { pilot: w.pilot_id });
  return json({ ok: true });
}

// ---- Work on a case (staff) -------------------------------------------------
async function loadCase(env, id) {
  const g = await env.DB.prepare(
    "SELECT g.*, c.name AS cat_name, lu.name AS ward_name, lu.rep_email AS ward_rep_email, lu.area_id AS ward_area FROM grievances g JOIN grievance_categories c ON c.id = g.category_id JOIN local_units lu ON lu.id = g.local_unit_id WHERE g.id = ?"
  ).bind(String(id || "")).first();
  if (!g || !g.assisted_pilot) return { error: json({ error: "Case not found." }, 404) };
  if (!isAssisted(g)) return { error: json({ error: "This case has been handed over to the ward's office.", code: "HANDED" }, 409) };
  if (!OPEN.includes(g.status)) return { error: json({ error: "This case is closed or waiting for the citizen.", code: "CLOSED" }, 409) };
  return { g };
}

// An email from GrievIQ to an office's official address with a private
// reply link. Never the citizen's name, phone or email; no complaint text
// (that is behind the link, which expires).
async function sendLink(ctx, g, target, targetName, to) {
  const { env, auth, origin } = ctx;
  const token = newToken();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO assisted_links (id, grievance_id, token_hash, target, target_name, sent_to, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), g.id, await tokenHash(token), target, targetName, to, auth.email, new Date(now).toISOString(), new Date(now + LINK_DAYS * DAY).toISOString()).run();
  const link = origin + "/office-reply?t=" + encodeURIComponent(token);
  const until = new Date(now + LINK_DAYS * DAY).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const html =
    `<p>Dear Sir/Madam,</p>` +
    `<p>A citizen of <b>${esc(g.ward_name)}</b> has filed a complaint on GrievIQ about <b>${esc(g.cat_name)}</b> (reference <b>${esc(g.tracking_ref)}</b>). GrievIQ is sending it to <b>${esc(targetName)}</b> for your kind attention.</p>` +
    `<p>Please open this private link to read the complaint, see the place and photos, and reply. Your reply is shown to the citizen. The link works until ${esc(until)}.</p>` +
    `<p><a href="${esc(link)}">${esc(link)}</a></p>` +
    `<p>GrievIQ is an independent service that helps citizens track their complaints. This is not an order. The citizen's name, phone number and email are not shared; GrievIQ passes on your reply.</p><hr>` +
    `<p>महोदय/महोदया,</p>` +
    `<p><b>${esc(g.ward_name)}</b> के एक नागरिक ने GrievIQ पर <b>${esc(g.cat_name)}</b> के बारे में शिकायत दर्ज की है (संदर्भ <b>${esc(g.tracking_ref)}</b>)। GrievIQ इसे आपके ध्यानार्थ <b>${esc(targetName)}</b> को भेज रहा है।</p>` +
    `<p>शिकायत पढ़ने, स्थान और फ़ोटो देखने और उत्तर देने के लिए यह निजी लिंक खोलें। आपका उत्तर नागरिक को दिखाया जाता है। लिंक ${esc(until)} तक चलेगा।</p>` +
    `<p>GrievIQ एक स्वतंत्र सेवा है जो नागरिकों को उनकी शिकायतों पर नज़र रखने में मदद करती है। यह कोई आदेश नहीं है। नागरिक का नाम, फ़ोन नंबर और ईमेल साझा नहीं किए जाते; आपका उत्तर GrievIQ नागरिक तक पहुँचाता है।</p>`;
  await queueEmail(env, to, "ASSISTED_LINK", "ASL:" + g.id + ":" + target + ":" + now, `GrievIQ complaint ${g.tracking_ref}: ${g.cat_name}, ${g.ward_name} · शिकायत`, html, null);
  await flushOutbox(env, 5);
}

async function forward(ctx, b) {
  const { env, auth, origin } = ctx;
  const { g, error } = await loadCase(env, b.id);
  if (error) return error;
  const fields = {};
  const minutes = minutesOf(b.minutes, fields);
  const office = b.office && b.office.channel ? String(b.office.channel).toUpperCase() : null;
  const dept = b.dept && b.dept.department ? b.dept : null;
  if (!office && !dept) return json({ error: "Choose the councillor's office, a department, or both.", fields: { target: "REQUIRED" } }, 400);
  let officeTo = null;
  if (office) {
    if (office !== "EMAIL" && !RECORD_CHANNELS.includes(office)) fields.officeChannel = "CHANNEL";
    if (office === "EMAIL") {
      const w = await env.DB.prepare("SELECT office_email FROM assisted_wards WHERE unit_id = ? AND pilot_id = ? AND removed_at IS NULL").bind(g.local_unit_id, g.assisted_pilot).first();
      officeTo = w && w.office_email;
      if (!officeTo) fields.officeChannel = "NO_EMAIL";
    }
  }
  let deptOffice = null, deptChannel = null, deptKey = null;
  if (dept) {
    deptKey = String(dept.department || "");
    if (!(await activeDeptKeys(env)).includes(deptKey)) fields.department = "UNKNOWN";
    deptChannel = String(dept.channel || "").toUpperCase();
    if (!["DASHBOARD", "EMAIL"].concat(RECORD_CHANNELS).includes(deptChannel)) fields.deptChannel = "CHANNEL";
    if (dept.officeId) {
      const o = await env.DB.prepare("SELECT id, name_en, departments, wards, area_id, office_email, retired_at FROM dept_offices WHERE id = ?").bind(String(dept.officeId)).first();
      let ds = [], ws = null;
      try { if (o) { ds = JSON.parse(o.departments) || []; ws = o.wards ? JSON.parse(o.wards) : null; } } catch (e) { ds = []; }
      if (!o || o.retired_at || o.area_id !== (g.ward_area || "lucknow") || (!fields.department && !ds.includes(deptKey)) || (ws && !ws.includes(g.local_unit_id))) fields.deptOffice = "NOT_FOUND";
      else deptOffice = { id: o.id, name: o.name_en, email: o.office_email && EMAIL_RE.test(o.office_email) ? o.office_email : null };
    }
    if (!fields.deptChannel && (deptChannel === "DASHBOARD" || deptChannel === "EMAIL") && !deptOffice) fields.deptOffice = "REQUIRED";
    if (!fields.deptChannel && !fields.deptOffice && deptChannel === "DASHBOARD" && !(await dashboardOffices(env, [deptOffice.id])).has(String(deptOffice.id))) fields.deptChannel = "NO_DASHBOARD";
    if (!fields.deptChannel && !fields.deptOffice && deptChannel === "EMAIL" && !deptOffice.email) fields.deptChannel = "NO_EMAIL";
  }
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);

  const names = namesOf(await deptTypes(env));
  const now = new Date().toISOString();
  const sentTo = [];
  if (office) {
    const name = "Councillor's office, " + g.ward_name;
    await addStep(env, { grievanceId: g.id, kind: "FORWARD", target: "OFFICE", targetName: name, channel: office, minutes: dept ? Math.ceil(minutes / 2) : minutes, byEmail: auth.email, at: now });
    if (office === "EMAIL") await sendLink(ctx, g, "OFFICE", name, officeTo);
    sentTo.push(name);
  }
  if (dept) {
    const dName = deptOffice ? deptOffice.name : ((names[deptKey] && names[deptKey].en) || deptKey);
    let deptStepId = null;
    if (await stepsReady(env)) {
      await env.DB.prepare("INSERT INTO grievance_events (id, grievance_id, event_type, actor, reason, note, created_at) VALUES (?, ?, 'FOLLOW_UP', ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), g.id, auth.email, deptKey, "Sent by GrievIQ (assisted ward)", now).run();
      deptStepId = await addDeptStep(env, { grievance_id: g.id, kind: STEP.FORWARDED, department: deptKey, office_id: deptOffice ? deptOffice.id : null,
        office_name: deptOffice ? deptOffice.name : null, channel: DEPT_CHANNEL[deptChannel], note: "Sent by GrievIQ (assisted ward)", actor: auth.email, actor_role: "GRIEVIQ_STAFF", created_at: now });
    }
    await addStep(env, { grievanceId: g.id, kind: "FORWARD", target: "DEPT", targetName: dName, channel: deptChannel, minutes: office ? Math.floor(minutes / 2) : minutes,
      deptStepId, byEmail: auth.email, at: now });
    if (deptChannel === "DASHBOARD" && deptStepId) await notifyDeptForwarded(env, origin, deptOffice.id, deptStepId, g).catch(() => {});
    if (deptChannel === "EMAIL") await sendLink(ctx, g, "DEPT", dName, deptOffice.email);
    sentTo.push(dName);
  }
  for (const k of ["ASSISTED_NEW", "ASSISTED_DANGER"]) await markDone(env, k, g.id, "FORWARDED");     // grieviq-89
  await emailCaseUpdate(env, origin, g, "ASSISTED_FORWARDED", { wardName: g.ward_name, category: { id: g.category_id, name: g.cat_name }, toName: sentTo.join(" · "), stamp: now });
  await logEvent(env, auth.email, "assisted_forwarded", g.id, { trackingRef: g.tracking_ref, office: office || null, dept: dept ? { department: deptKey, office: deptOffice ? deptOffice.id : null, channel: deptChannel } : null, minutes });
  return json({ ok: true, sentTo });
}

async function followup({ env, auth }, b) {
  const { g, error } = await loadCase(env, b.id);
  if (error) return error;
  const fields = {};
  const minutes = minutesOf(b.minutes, fields);
  const target = String(b.target || "").toUpperCase();
  if (!["OFFICE", "DEPT"].includes(target)) fields.target = "REQUIRED";
  const channel = String(b.channel || "").toUpperCase();
  if (!["EMAIL"].concat(RECORD_CHANNELS).includes(channel)) fields.channel = "CHANNEL";
  const text = clean(b.text, 500);
  if (text.length > 500) fields.text = "LENGTH";
  const steps = (await loadSteps(env, [g.id])).get(g.id) || [];
  if (!steps.some((s) => s.kind === "FORWARD")) return json({ error: "Forward the complaint first.", code: "NOT_FORWARDED" }, 409);
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);
  const fw = steps.filter((s) => s.kind === "FORWARD" && s.target === target);
  const name = fw.length ? fw[fw.length - 1].target_name : (target === "OFFICE" ? "Councillor's office, " + g.ward_name : "Department");
  await addStep(env, { grievanceId: g.id, kind: "FOLLOWUP", target, targetName: name, channel, text: text || null, minutes, byEmail: auth.email });
  await logEvent(env, auth.email, "assisted_followed_up", g.id, { trackingRef: g.tracking_ref, target, channel, minutes });
  return json({ ok: true });
}

async function reply({ env, auth, origin }, b) {
  const { g, error } = await loadCase(env, b.id);
  if (error) return error;
  const fields = {};
  const minutes = minutesOf(b.minutes, fields);
  const target = String(b.target || "").toUpperCase();
  if (!["OFFICE", "DEPT"].includes(target)) fields.target = "REQUIRED";
  const kind = String(b.replyKind || "").toUpperCase();
  if (!REPLY_KINDS.includes(kind)) fields.replyKind = "REQUIRED";
  const text = clean(b.text, TEXT_MAX);
  if (text.length < TEXT_MIN || text.length > TEXT_MAX) fields.text = "LENGTH";
  const exp = b.expectedBy ? String(b.expectedBy) : null;
  if (exp && (!validDay(exp) || exp < istDay() || daysBetween(istDay(), exp) > 365)) fields.expectedBy = "DATE";
  const channel = String(b.channel || "CALL").toUpperCase();
  if (!["EMAIL"].concat(RECORD_CHANNELS).includes(channel)) fields.channel = "CHANNEL";
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);
  const steps = (await loadSteps(env, [g.id])).get(g.id) || [];
  const fw = steps.filter((s) => s.kind === "FORWARD" && s.target === target);
  const name = clean(b.targetName, 120) || (fw.length ? fw[fw.length - 1].target_name : (target === "OFFICE" ? "Councillor's office, " + g.ward_name : "Department"));
  await addStep(env, { grievanceId: g.id, kind: "REPLY", target, targetName: name, channel, replyKind: kind, expectedBy: exp, text, minutes, byEmail: auth.email });
  await emailCaseUpdate(env, origin, g, "ASSISTED_REPLY", { wardName: g.ward_name, category: { id: g.category_id, name: g.cat_name }, toName: name, text: maskPersonal(text),
    expectedMs: exp ? Date.parse(exp + "T12:00:00+05:30") : null, stamp: new Date().toISOString() });
  await logEvent(env, auth.email, "assisted_reply_recorded", g.id, { trackingRef: g.tracking_ref, target, replyKind: kind, minutes });
  return json({ ok: true });
}

async function note({ env, auth }, b) {
  const { g, error } = await loadCase(env, b.id);
  if (error) return error;
  const fields = {};
  const minutes = minutesOf(b.minutes, fields);
  const text = clean(b.text, 500);
  if (text.length < 3 || text.length > 500) fields.text = "LENGTH";
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);
  await addStep(env, { grievanceId: g.id, kind: "NOTE", text, minutes, byEmail: auth.email });
  await logEvent(env, auth.email, "assisted_note", g.id, { trackingRef: g.tracking_ref, minutes });
  return json({ ok: true });
}

// The office or department says the work is done: the case waits for the
// citizen to confirm (or for a GrievIQ staff check if they gave no email),
// exactly as when an office marks a case fixed.
async function askConfirm({ env, auth, request }, b) {
  const { g, error } = await loadCase(env, b.id);
  if (error) return error;
  const fields = {};
  const minutes = minutesOf(b.minutes, fields);
  const text = clean(b.text, TEXT_MAX);
  if (text.length < TEXT_MIN || text.length > TEXT_MAX) fields.text = "LENGTH";
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);
  const steps = (await loadSteps(env, [g.id])).get(g.id) || [];
  if (!steps.some((s) => s.kind === "FORWARD")) return json({ error: "Forward the complaint first.", code: "NOT_FORWARDED" }, 409);
  const at = new Date().toISOString();
  await env.DB.prepare("INSERT INTO resolution_reports (id, grievance_id, note, no_photo_reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), g.id, text, "Recorded by GrievIQ staff from the office's reply (GrievIQ-assisted ward).", auth.email, at).run();
  await addStep(env, { grievanceId: g.id, kind: "NOTE", text: "Asked the citizen to confirm the fix.", minutes, byEmail: auth.email, at });
  const r = await finalizeResolution(env, request, g, "LOCAL", text, auth.email, { assisted: true });
  await logEvent(env, auth.email, "assisted_marked_fixed", g.id, { trackingRef: g.tracking_ref, minutes });
  return json({ ok: true, status: r.status, warning: r.warning || null });
}

// The ward's office has joined: its open assisted cases move to its console,
// with fresh time limits; the citizen is told.
async function handover({ env, auth, origin }, b) {
  const unitId = String(b.unitId || "");
  const u = await env.DB.prepare("SELECT id, name, rep_email FROM local_units WHERE id = ?").bind(unitId).first();
  if (!u) return json({ error: "Ward not found." }, 404);
  if (!joined(u)) return json({ error: "This ward's office hasn't joined GrievIQ yet.", code: "NOT_JOINED" }, 409);
  const { results } = await env.DB.prepare(
    "SELECT g.*, c.name AS cat_name FROM grievances g JOIN grievance_categories c ON c.id = g.category_id WHERE g.local_unit_id = ? AND g.assisted_pilot IS NOT NULL AND g.assisted_handed_at IS NULL AND g.status IN ('OPEN', 'ACKNOWLEDGED')"
  ).bind(unitId).all();
  const at = new Date().toISOString();
  let n = 0;
  for (const g0 of results || []) {
    await env.DB.prepare("UPDATE grievances SET assisted_handed_at = ?, status = 'OPEN', acknowledged_at = NULL, updated_at = ? WHERE id = ? AND assisted_handed_at IS NULL").bind(at, at, g0.id).run();
    await addStep(env, { grievanceId: g0.id, kind: "HANDOVER", target: "OFFICE", targetName: "Councillor's office, " + u.name, byEmail: auth.email, at });
    const g = Object.assign({}, g0, { assisted_handed_at: at, status: "OPEN", acknowledged_at: null });
    await emailCaseUpdate(env, origin, g, "ASSISTED_HANDOVER", { wardName: u.name, category: { id: g.category_id, name: g.cat_name }, stamp: at });
    await notifyNewCase(env, origin, g);
    n++;
  }
  // Reply links for this ward's cases stop working: the office now uses its console.
  await env.DB.prepare("UPDATE assisted_links SET revoked_at = ? WHERE revoked_at IS NULL AND target = 'OFFICE' AND grievance_id IN (SELECT id FROM grievances WHERE local_unit_id = ?)").bind(at, unitId).run();
  // The ward leaves its pilot (it is a normal ward now).
  await env.DB.prepare("UPDATE assisted_wards SET removed_at = ?, removed_by = ? WHERE unit_id = ? AND removed_at IS NULL").bind(at, auth.email, unitId).run();
  await logEvent(env, auth.email, "assisted_handed_over", unitId, { cases: n });
  return json({ ok: true, handedOver: n });
}

async function reportLink({ env, auth, origin }, b) {
  const unitId = String(b.unitId || "");
  const w = await env.DB.prepare(
    "SELECT w.*, lu.name FROM assisted_wards w JOIN local_units lu ON lu.id = w.unit_id WHERE w.unit_id = ? ORDER BY w.removed_at IS NULL DESC, w.added_at DESC LIMIT 1"
  ).bind(unitId).first();
  if (!w) return json({ error: "This ward isn't in a pilot." }, 404);
  const send = b.send === true;
  if (send && !w.office_email) return json({ error: "Add the office's official email first.", code: "NO_EMAIL" }, 409);
  const token = newToken();
  const now = Date.now();
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO assisted_reports (id, unit_id, pilot_id, token_hash, sent_to, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, unitId, w.pilot_id, await tokenHash(token), send ? w.office_email : null, auth.email, new Date(now).toISOString(), new Date(now + REPORT_DAYS * DAY).toISOString()).run();
  const link = origin + "/area-report?t=" + encodeURIComponent(token);
  if (send) {
    const until = new Date(now + REPORT_DAYS * DAY).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
    await queueEmail(env, w.office_email, "ASSISTED_REPORT", "ASR:" + id, `GrievIQ: complaints from ${w.name} · शिकायतों की रिपोर्ट`,
      `<p>Dear Sir/Madam,</p><p>Here is a free report of the complaints citizens of <b>${esc(w.name)}</b> filed on GrievIQ during the pilot: how many, of what type, and how many are still open. It has no names or contact details of citizens. The link works until ${esc(until)} and is only for your office.</p><p><a href="${esc(link)}">${esc(link)}</a></p><hr>` +
      `<p>महोदय/महोदया,</p><p>यह <b>${esc(w.name)}</b> के नागरिकों द्वारा पायलट के दौरान GrievIQ पर दर्ज शिकायतों की निःशुल्क रिपोर्ट है: कितनी, किस प्रकार की, और कितनी अभी खुली हैं। इसमें नागरिकों के नाम या संपर्क नहीं हैं। लिंक ${esc(until)} तक चलेगा और केवल आपके कार्यालय के लिए है।</p>`, null);
    await flushOutbox(env, 5);
  }
  await logEvent(env, auth.email, "assisted_report_link", unitId, { id, sent: send });
  return json({ ok: true, id, link, expiresAt: new Date(now + REPORT_DAYS * DAY).toISOString(), sentTo: send ? w.office_email : null });
}

async function reportRevoke({ env, auth }, b) {
  const r = await env.DB.prepare("SELECT id, unit_id FROM assisted_reports WHERE id = ?").bind(String(b.reportId || "")).first();
  if (!r) return json({ error: "Not found." }, 404);
  await env.DB.prepare("UPDATE assisted_reports SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?").bind(new Date().toISOString(), r.id).run();
  await logEvent(env, auth.email, "assisted_report_revoked", r.unit_id, { id: r.id });
  return json({ ok: true });
}
