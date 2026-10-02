// functions/_shared/retention.js
//
// Item 9d: data retention (approved Oct 2026).
//
// A complaint is kept for 3 years from filing or 1 year after it finally
// closed, whichever is later (privacy policy; DPDP Act 2023 s.8(7)). When
// that time ends the case is ANONYMISED, not deleted: the citizen's details
// and every free-text note are removed, and what remains (tracking number,
// ward, issue type, dates, status, levels, who acted and when) holds no
// personal data, so figures, analytics and issued audit reports stay right
// (ISO/IEC 20889 de-identification; ISO 27001 A.8.10 information deletion).
//
//  - Never while the case is open, waiting, reopened, on hold (super admin,
//    with a reason) or the subject of an open audit observation.
//  - Citizens who gave an email are told 7 days before (DPDP Rules 2025
//    r.8(2) asks for 48 hours from large platforms; we follow it as good
//    practice, with more notice).
//  - Sign-in records keep the event; the IP address and browser are removed
//    after 1 year (DPDP Rules 2025 r.8(3): logs kept at least 1 year).
//  - One-time codes are deleted a day after they expire (privacy policy).
//  - The protected logs (item 9a) allow exactly these changes and nothing
//    else; each run writes a grant per case in the same transaction and a
//    row in the retention register (retention_runs), which can't be changed.

import { norm, CLOSED_AT, HOLD_FREE } from "./photo-store.js";

export const RECORD_KEEP_YEARS = 3;
export const AFTER_CLOSE_DAYS = 365;
export const NOTICE_DAYS = 7;
export const SIGNIN_KEEP_DAYS = 365;
export const CODES_KEEP_HOURS = 24;
export const RUN_BATCH = 20;          // cases per automatic run
export const MANUAL_BATCH = 200;      // cases per "Run now"

// When the case's retention ends ("YYYY-MM-DD HH:MM:SS").
export const DUE_AT = `MAX(datetime(${norm("g.created_at")}, '+${RECORD_KEEP_YEARS} years'), datetime(${CLOSED_AT}, '+${AFTER_CLOSE_DAYS} days'))`;
const CLOSED = `g.status IN ('RESOLVED', 'CLOSED')`;
const NOT_DONE = `g.retention_removed_at IS NULL`;
const HAS_EMAIL = `COALESCE(TRIM(g.citizen_email), '') <> ''`;
const ELIGIBLE = `${CLOSED} AND ${NOT_DONE} AND ${HOLD_FREE}`;
// A notice counts only if it was sent after the case last closed (a case
// that was reopened and closed again gets a fresh notice).
const TOLD = `(g.retention_notice_at IS NOT NULL AND ${norm("g.retention_notice_at")} >= ${CLOSED_AT})`;
// Notice: due within NOTICE_DAYS and not yet told.
const NOTICE_DUE = `${ELIGIBLE} AND ${HAS_EMAIL} AND NOT ${TOLD} AND ${DUE_AT} <= datetime('now', '+${NOTICE_DAYS} days')`;
// Anonymise: due, and either no email or told at least NOTICE_DAYS ago.
const ANON_DUE = `${ELIGIBLE} AND ${DUE_AT} <= datetime('now') AND (NOT (${HAS_EMAIL}) OR (${TOLD} AND ${norm("g.retention_notice_at")} <= datetime('now', '-${NOTICE_DAYS} days')))`;

const CASE_COLS = `g.id, g.tracking_ref, g.status, g.created_at, g.closed_at, g.resolved_at, g.retention_notice_at, g.local_unit_id, g.category_id,
  ${DUE_AT} AS due_at, ${HAS_EMAIL} AS has_email`;

function escHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function dayText(sqlDate, lang) {
  const d = new Date(String(sqlDate).replace(" ", "T") + "Z");
  return isNaN(d) ? String(sqlDate).slice(0, 10) : d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}

// The notice email, in the citizen's language first, then the other.
async function sendNotice(env, request, g) {
  if (!env.RESEND_API_KEY) return false;
  const origin = request ? new URL(request.url).origin : "https://grieviq.in";
  const ref = escHtml(g.tracking_ref);
  const en = `<p>Hello,</p><p>Your complaint <strong>${ref}</strong> on GrievIQ is closed. Under our retention policy, its details
    (your phone number, email, the complaint text, location and photos) will be removed on or after <strong>${escHtml(dayText(g.remove_from, "en"))}</strong>.
    After that the complaint will no longer appear when you check your status, and it can't be recovered.
    The tracking number and the dates stay in our statistics, without any personal details.</p>
    <p>You don't need to do anything. If you want to keep a copy, open <a href="${origin}/status">${origin}/status</a> before that date.
    Questions: <a href="mailto:support@grieviq.in">support@grieviq.in</a>.</p>`;
  const hi = `<p>नमस्ते,</p><p>GrievIQ पर आपकी शिकायत <strong>${ref}</strong> बंद हो चुकी है। हमारी संग्रहण नीति के अनुसार इसका विवरण
    (आपका फ़ोन नंबर, ईमेल, शिकायत का विवरण, स्थान और फ़ोटो) <strong>${escHtml(dayText(g.remove_from, "hi"))}</strong> या उसके बाद हटा दिया जाएगा।
    इसके बाद स्थिति देखने पर यह शिकायत नहीं दिखेगी और इसे वापस नहीं लाया जा सकेगा। ट्रैकिंग नंबर और तिथियाँ बिना किसी व्यक्तिगत विवरण के हमारे आँकड़ों में रहेंगी।</p>
    <p>आपको कुछ करने की आवश्यकता नहीं है। यदि आप इसकी प्रति रखना चाहते हैं, तो उस तिथि से पहले <a href="${origin}/status">${origin}/status</a> खोलें।
    प्रश्न: <a href="mailto:support@grieviq.in">support@grieviq.in</a>।</p>`;
  const hiFirst = g.lang === "hi";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.OTP_FROM_EMAIL || "onboarding@resend.dev", to: [String(g.citizen_email).trim()],
        subject: hiFirst ? `आपकी शिकायत ${g.tracking_ref} का विवरण हटाया जाएगा / Details of complaint ${g.tracking_ref} will be removed`
          : `Details of complaint ${g.tracking_ref} will be removed / आपकी शिकायत ${g.tracking_ref} का विवरण हटाया जाएगा`,
        html: (hiFirst ? hi + "<hr>" + en : en + "<hr>" + hi),
      }),
    });
    return res.ok;
  } catch (e) { return false; }
}

// Removes a case's remaining photos (files first, then marks the rows).
async function removePhotos(env, gid, now) {
  const [c, r] = await env.DB.batch([
    env.DB.prepare("SELECT id, r2_key, thumb_key, full_deleted_at FROM complaint_photos WHERE grievance_id = ? AND deleted_at IS NULL").bind(gid),
    env.DB.prepare("SELECT id, r2_key, thumb_key, full_deleted_at FROM resolution_photos WHERE grievance_id = ? AND report_id IS NOT NULL AND deleted_at IS NULL").bind(gid),
  ]);
  const rows = (c.results || []).map((x) => ["complaint_photos", x]).concat((r.results || []).map((x) => ["resolution_photos", x]));
  if (!rows.length) return { ok: true, n: 0, stmts: [] };
  const keys = [];
  for (const [, x] of rows) { if (!x.full_deleted_at) keys.push(x.r2_key); if (x.thumb_key) keys.push(x.thumb_key); }
  if (keys.length) {
    if (!env.PRIVATE_PHOTOS) return { ok: false, n: 0, stmts: [] };   // can't remove files: try again later
    await env.PRIVATE_PHOTOS.delete(keys);
  }
  return { ok: true, n: rows.length, stmts: rows.map(([t, x]) => env.DB.prepare(`UPDATE ${t} SET deleted_at = ?, full_deleted_at = COALESCE(full_deleted_at, ?) WHERE id = ?`).bind(now, now, x.id)) };
}

// Text kept in a log's details that a citizen or staff member typed about
// the case; removed when it is anonymised.
const DETAIL_TEXT_KEYS = ["note", "reason", "staffReason"];

// The statements that anonymise one case, and how many fields they clear.
async function anonymiseStatements(env, g, runId, now) {
  const DB = env.DB;
  const [ev, ro, ae, rr, rc] = await DB.batch([
    DB.prepare("SELECT id FROM grievance_events WHERE grievance_id = ? AND (note IS NOT NULL OR (event_type LIKE 'CITIZEN_%' AND COALESCE(actor, '') <> 'citizen'))").bind(g.id),
    DB.prepare("SELECT id FROM grievance_reopens WHERE grievance_id = ? AND (note <> '' OR staff_reason IS NOT NULL)").bind(g.id),
    DB.prepare("SELECT id, detail FROM admin_events WHERE target = ? AND detail IS NOT NULL").bind(g.id),
    DB.prepare("SELECT id FROM resolution_reports WHERE grievance_id = ? AND (note <> '' OR no_photo_reason IS NOT NULL)").bind(g.id),
    DB.prepare("SELECT id FROM resolution_checks WHERE grievance_id = ? AND note IS NOT NULL").bind(g.id),
  ]);
  const stmts = [DB.prepare("INSERT INTO retention_grants (id, grievance_id, run_id, created_at) VALUES (?, ?, ?, datetime('now'))").bind(crypto.randomUUID(), g.id, runId)];
  let fields = 8;   // phone, email, complaint text, location detail, map pin (2), dispute note, old photo links
  stmts.push(DB.prepare(
    `UPDATE grievances SET citizen_phone = '', citizen_email = NULL, description = '', location_detail = NULL, citizen_dispute_note = NULL,
       photo_url = NULL, pin_lat = NULL, pin_lng = NULL, retention_removed_at = ? WHERE id = ? AND retention_removed_at IS NULL`
  ).bind(now, g.id));
  for (const x of ev.results || []) { stmts.push(DB.prepare("UPDATE grievance_events SET note = NULL, actor = CASE WHEN event_type LIKE 'CITIZEN_%' THEN 'citizen' ELSE actor END WHERE id = ?").bind(x.id)); fields++; }
  for (const x of ro.results || []) { stmts.push(DB.prepare("UPDATE grievance_reopens SET note = '', staff_reason = NULL WHERE id = ?").bind(x.id)); fields++; }
  for (const x of ae.results || []) {
    let d; try { d = JSON.parse(x.detail); } catch (e) { d = null; }
    if (!d || typeof d !== "object") continue;
    const had = DETAIL_TEXT_KEYS.filter((k) => d[k] != null && d[k] !== "");
    if (!had.length) continue;
    for (const k of had) d[k] = null;
    d.textRemoved = now;
    stmts.push(DB.prepare("UPDATE admin_events SET detail = ? WHERE id = ?").bind(JSON.stringify(d), x.id));
    fields += had.length;
  }
  for (const x of rr.results || []) { stmts.push(DB.prepare("UPDATE resolution_reports SET note = '', no_photo_reason = NULL WHERE id = ?").bind(x.id)); fields++; }
  for (const x of rc.results || []) { stmts.push(DB.prepare("UPDATE resolution_checks SET note = NULL WHERE id = ?").bind(x.id)); fields++; }
  return { stmts, fields };
}

// One run: notices, anonymising, sign-in records, old codes. Never throws;
// returns what it did. kind: "AUTO" (Dashboard) or "MANUAL" (Run now).
export async function runRetention(env, opts) {
  const o = opts || {};
  const limit = Math.max(1, Math.min(Number(o.limit) || RUN_BATCH, 1000));
  const done = { notices: 0, noticeRefs: [], anonymised: 0, refs: [], fields: 0, photos: 0, signins: 0, codes: 0, skipped: 0, errors: 0 };
  const DB = env.DB;
  const now = new Date().toISOString();
  const runId = crypto.randomUUID();
  try {
    // 1. Notices (7 days ahead) to citizens who gave an email.
    const { results: toTell } = await DB.prepare(
      `SELECT ${CASE_COLS}, g.citizen_email, g.lang, MAX(${DUE_AT}, datetime('now', '+${NOTICE_DAYS} days')) AS remove_from
       FROM grievances g WHERE ${NOTICE_DUE} ORDER BY due_at ASC LIMIT ${limit}`
    ).all();
    for (const g of toTell || []) {
      // Recorded even if the email fails: the 7 days start when we tried.
      const sent = await sendNotice(env, o.request, g);
      await DB.prepare("UPDATE grievances SET retention_notice_at = ? WHERE id = ?").bind(now, g.id).run();
      done.notices++; done.noticeRefs.push(g.tracking_ref + (sent ? "" : " (email failed)"));
    }

    // 2. Anonymise the cases whose time is up.
    const { results: due } = await DB.prepare(`SELECT ${CASE_COLS} FROM grievances g WHERE ${ANON_DUE} ORDER BY due_at ASC LIMIT ${limit}`).all();
    for (const g of due || []) {
      try {
        const ph = await removePhotos(env, g.id, now);
        if (!ph.ok) { done.skipped++; continue; }
        const a = await anonymiseStatements(env, g, runId, now);
        await DB.batch(ph.stmts.concat(a.stmts));   // one transaction per case
        done.anonymised++; done.refs.push(g.tracking_ref); done.fields += a.fields; done.photos += ph.n;
      } catch (e) { done.errors++; }
    }

    // 3. Sign-in records older than a year: remove the IP address and browser.
    const s = await DB.prepare(
      `UPDATE rep_auth_events SET ip = NULL, user_agent = NULL
       WHERE (ip IS NOT NULL OR user_agent IS NOT NULL) AND ${norm("created_at")} < datetime('now', '-${SIGNIN_KEEP_DAYS} days')`
    ).run();
    done.signins = (s && s.meta && s.meta.changes) || 0;

    // 4. One-time codes a day after they expire.
    const c = await DB.prepare(`DELETE FROM grievance_otp WHERE ${norm("expires_at")} < datetime('now', '-${CODES_KEEP_HOURS} hours')`).run();
    done.codes = (c && c.meta && c.meta.changes) || 0;

    if (done.notices || done.anonymised || done.signins || done.codes) {
      await DB.prepare(
        `INSERT INTO retention_runs (id, ran_at, ran_by, kind, cases_anonymised, refs, fields_removed, notices_sent, notice_refs, signins_cleared, codes_deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(runId, now, o.actor || "system", o.kind === "MANUAL" ? "MANUAL" : "AUTO", done.anonymised, JSON.stringify(done.refs), done.fields,
        done.notices, JSON.stringify(done.noticeRefs), done.signins, done.codes).run();
    }
  } catch (e) {
    done.errors++;   // tables not created yet, or a passing failure: the next run picks it up
  }
  return done;
}

// What a run would do now, and what is coming (for the Data retention page).
export async function retentionOverview(env) {
  const DB = env.DB;
  const listCols = `${CASE_COLS}, (SELECT name FROM local_units WHERE id = g.local_unit_id) AS ward_name`;
  const [dueNow, notice, soon, held, waiting, runs, counts] = await DB.batch([
    DB.prepare(`SELECT ${listCols} FROM grievances g WHERE ${ANON_DUE} ORDER BY due_at ASC LIMIT 200`),
    DB.prepare(`SELECT ${listCols} FROM grievances g WHERE ${NOTICE_DUE} ORDER BY due_at ASC LIMIT 200`),
    DB.prepare(`SELECT ${listCols} FROM grievances g WHERE ${ELIGIBLE} AND ${DUE_AT} > datetime('now') AND ${DUE_AT} <= datetime('now', '+30 days') ORDER BY due_at ASC LIMIT 200`),
    DB.prepare(
      `SELECT g.id, g.tracking_ref, g.status, ${DUE_AT} AS due_at, (SELECT name FROM local_units WHERE id = g.local_unit_id) AS ward_name,
         COALESCE(g.photo_hold, 0) AS manual,
         (SELECT reason FROM retention_holds h WHERE h.grievance_id = g.id AND h.action = 'HOLD' ORDER BY h.at DESC LIMIT 1) AS reason,
         (SELECT by_email FROM retention_holds h WHERE h.grievance_id = g.id AND h.action = 'HOLD' ORDER BY h.at DESC LIMIT 1) AS by_email,
         (SELECT at FROM retention_holds h WHERE h.grievance_id = g.id AND h.action = 'HOLD' ORDER BY h.at DESC LIMIT 1) AS held_at,
         (SELECT group_concat(o.ref, ', ') FROM observations o WHERE o.status IN ('DRAFT', 'ISSUED', 'RESPONDED', 'DONE_REPORTED') AND o.subject_cases LIKE '%"' || g.tracking_ref || '"%') AS obs_refs
       FROM grievances g
       WHERE g.retention_removed_at IS NULL AND NOT (${HOLD_FREE})
       ORDER BY g.created_at ASC LIMIT 200`),
    DB.prepare(`SELECT ${listCols}, g.retention_notice_at FROM grievances g WHERE ${ELIGIBLE} AND ${TOLD} AND NOT (${ANON_DUE}) ORDER BY due_at ASC LIMIT 200`),
    DB.prepare("SELECT * FROM retention_runs ORDER BY ran_at DESC LIMIT 30"),
    DB.prepare(
      `SELECT (SELECT COUNT(*) FROM grievances WHERE retention_removed_at IS NOT NULL) AS anonymised,
              (SELECT COUNT(*) FROM rep_auth_events WHERE (ip IS NOT NULL OR user_agent IS NOT NULL) AND ${norm("created_at")} < datetime('now', '-${SIGNIN_KEEP_DAYS} days')) AS signins_due,
              (SELECT COUNT(*) FROM grievance_otp WHERE ${norm("expires_at")} < datetime('now', '-${CODES_KEEP_HOURS} hours')) AS codes_due`),
  ]);
  const shape = (r) => ({ id: r.id, ref: r.tracking_ref, ward: r.ward_name || null, status: r.status, createdAt: r.created_at, closedAt: r.closed_at || r.resolved_at || null,
    dueAt: r.due_at, hasEmail: r.has_email === 1, noticeAt: r.retention_notice_at || null });
  const c = (counts.results && counts.results[0]) || {};
  return {
    policy: { recordKeepYears: RECORD_KEEP_YEARS, afterCloseDays: AFTER_CLOSE_DAYS, noticeDays: NOTICE_DAYS, signinKeepDays: SIGNIN_KEEP_DAYS },
    dueNow: (dueNow.results || []).map(shape),
    noticeDue: (notice.results || []).map(shape),
    waitingAfterNotice: (waiting.results || []).map(shape),
    next30: (soon.results || []).map(shape),
    held: (held.results || []).map((r) => ({ id: r.id, ref: r.tracking_ref, ward: r.ward_name || null, status: r.status, dueAt: r.due_at,
      manual: r.manual === 1, reason: r.reason || null, by: r.by_email || null, at: r.held_at || null, observations: r.obs_refs || null })),
    runs: (runs.results || []).map((r) => ({ id: r.id, at: r.ran_at, by: r.ran_by, kind: r.kind, anonymised: r.cases_anonymised, refs: safeList(r.refs),
      fields: r.fields_removed, notices: r.notices_sent, noticeRefs: safeList(r.notice_refs), signins: r.signins_cleared, codes: r.codes_deleted })),
    totals: { anonymised: c.anonymised || 0, signinsDue: c.signins_due || 0, codesDue: c.codes_due || 0 },
  };
}
function safeList(t) { try { const v = JSON.parse(t || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }

// Holds (super admin). Returns { ok } or { error, status, fields }.
export async function setHold(env, actor, ref, hold, reason) {
  const r = String(reason || "").trim();
  const t = String(ref || "").trim().toUpperCase();
  if (!t) return { error: "Enter the tracking number.", status: 400, fields: { ref: "REQUIRED" } };
  if (r.length < 10 || r.length > 500) return { error: "Give the reason (at least 10 characters).", status: 400, fields: { reason: "LENGTH" } };
  const g = await env.DB.prepare("SELECT id, tracking_ref, photo_hold, retention_removed_at FROM grievances WHERE tracking_ref = ?").bind(t).first();
  if (!g) return { error: "No case has that tracking number.", status: 404, fields: { ref: "NOT_FOUND" } };
  if (g.retention_removed_at) return { error: "This case's details have already been removed.", status: 409, fields: { ref: "REMOVED" } };
  const on = (g.photo_hold || 0) === 1;
  if (hold && on) return { error: "This case is already on hold.", status: 409, fields: { ref: "ALREADY" } };
  if (!hold && !on) return { error: "This case isn't on hold.", status: 409, fields: { ref: "NOT_HELD" } };
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE grievances SET photo_hold = ? WHERE id = ?").bind(hold ? 1 : 0, g.id),
    env.DB.prepare("INSERT INTO retention_holds (id, grievance_id, action, reason, by_email, at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), g.id, hold ? "HOLD" : "RELEASE", r, actor, now),
    env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actor, hold ? "retention_hold_placed" : "retention_hold_released", g.id, JSON.stringify({ trackingRef: g.tracking_ref, holdReason: r })),
  ]);
  return { ok: true, ref: g.tracking_ref };
}
