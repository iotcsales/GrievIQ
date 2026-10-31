/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/admin/misuse (grieviq-82): the Misuse page.
//
// GET  (view_misuse: super admin, operations admin, data moderator, auditor)
//      reports      complaints reported by offices or departments, or flagged by GrievIQ's text
//                   check, waiting for a decision (the complaint as the citizen wrote it, with
//                   each report); recent decisions
//      appeals      "not genuine" closures the citizen has appealed
//      restrictions phone numbers and emails stopped from filing (pending, active, ended)
//      month        the monthly misuse figures for the auditor
//      sms          the "SMS code before filing" switch and whether a provider is set up
// POST (manage_misuse: super admin, operations admin, data moderator) unless said otherwise
//      decide        { grievanceId, decision: GENUINE | NOT_GENUINE, note }
//                    GENUINE: reports dismissed, the case carries on. NOT_GENUINE: the case is
//                    closed as "not genuine" with the note as the reason; the citizen is told and
//                    may appeal once within 30 days.
//      appeal        { grievanceId, decision: REOPEN | KEEP_CLOSED, note }  (not the person who closed it)
//      restrict      { grievanceId, kind: PHONE | EMAIL, days: 30 | 90 | 365, reason }  proposes it
//      approve / refuse { id, note? }  (super admin or operations admin; never the proposer)
//      lift          { id, reason }  (super admin or operations admin)
//      sms_test      { phone }  (super admin) sends a test SMS through the provider
//      sms_switch    { on, reason }  (super admin) only once a provider is set up and a test has gone through
// Every action is recorded in admin_events; the switch also in switch_events (unchangeable).
import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { resolveChain } from "../../_shared/jurisdiction.js";
import { queueEmail } from "../../_shared/notify.js";
import { RESTRICT_DAYS, NOTE_MAX, restrictionKey, endsAt, getSwitch, smsConfigured, sendSms, phone10 } from "../../_shared/misuse.js";

const json = (b, s) => Response.json(b, { status: s || 200, headers: { "Cache-Control": "no-store" } });
const DAY = 86400000;
const APPEAL_DAYS = 30;

async function logEvent(env, actor, action, target, detail) {
  try {
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actor, action, target || null, detail == null ? null : JSON.stringify(detail)).run();
  } catch (e) { /* the log is never a reason to fail */ }
}

async function caseInfo(env, g) {
  const unit = await env.DB.prepare("SELECT lu.name, lu.area_id, a.name AS area FROM local_units lu LEFT JOIN areas a ON a.id = lu.area_id WHERE lu.id = ?").bind(g.local_unit_id).first().catch(() => null);
  const cat = await env.DB.prepare("SELECT name FROM grievance_categories WHERE id = ?").bind(g.category_id).first();
  const since = new Date(Date.now() - 90 * DAY).toISOString();
  // How often this number filed lately, and how many of its complaints were closed as not genuine
  // (counts only: staff never need the number itself here).
  const same = await env.DB.prepare("SELECT COUNT(*) n, SUM(CASE WHEN closure_kind = 'NOT_GENUINE' THEN 1 ELSE 0 END) ng FROM grievances WHERE citizen_phone = ? AND created_at >= ?").bind(g.citizen_phone, since).first();
  return {
    id: g.id, trackingRef: g.tracking_ref, status: g.status, closureKind: g.closure_kind || null,
    category: cat ? cat.name : g.category_id, ward: unit ? unit.name : "", area: unit ? unit.area || "" : "",
    description: g.retention_removed_at ? "" : g.description, location: g.location_detail || "",
    createdAt: g.created_at, textFlags: g.text_flags ? String(g.text_flags).split(",") : [], contactVerified: g.contact_verified || null,
    hasEmail: !!(g.citizen_email && String(g.citizen_email).includes("@")), helper: !!g.helper_id,
    sameNumber90: same ? Number(same.n || 0) : 0, notGenuine90: same ? Number(same.ng || 0) : 0,
    notGenuineReason: g.not_genuine_reason || null, notGenuineAt: g.not_genuine_at || null, notGenuineBy: g.not_genuine_by || null,
    appealNote: g.appeal_note || null, appealAt: g.appeal_at || null, appealDecision: g.appeal_decision || null,
  };
}

// "LOCAL:<ward id>", "MLA:<id>", "MP:<id>", "DEPT:<office id>" -> { kind, name } (names only, for staff).
async function officeName(env, key, cache) {
  if (cache.has(key)) return cache.get(key);
  const [tier, id] = String(key || "").split(/:(.*)/s);
  const q = { LOCAL: "SELECT name FROM local_units WHERE id = ?", MLA: "SELECT name FROM mla_constituencies WHERE id = ?", MP: "SELECT name FROM mp_constituencies WHERE id = ?", DEPT: "SELECT name_en AS name FROM dept_offices WHERE id = ?" }[tier];
  let name = null;
  if (q) { try { const r = await env.DB.prepare(q).bind(id).first(); name = r ? r.name : null; } catch (e) { /* older database */ } }
  const out = { kind: tier || "", name: name || id || key };
  cache.set(key, out);
  return out;
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_misuse");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  try {
    const open = (await env.DB.prepare("SELECT * FROM complaint_reports WHERE status = 'OPEN' ORDER BY created_at").all()).results || [];
    const names = new Map();
    const byCase = new Map();
    for (const r of open) { if (!byCase.has(r.grievance_id)) byCase.set(r.grievance_id, []); byCase.get(r.grievance_id).push(r); }
    const reports = [];
    for (const [gid, list] of byCase) {
      const g = await env.DB.prepare("SELECT * FROM grievances WHERE id = ?").bind(gid).first();
      if (!g) continue;
      const shaped = [];
      for (const r of list) shaped.push({ id: r.id, byKind: r.by_kind, office: r.office_key ? await officeName(env, r.office_key, names) : null, reason: r.reason, note: r.note, at: r.created_at });
      reports.push({ case: await caseInfo(env, g), reports: shaped });
    }
    const appealRows = (await env.DB.prepare("SELECT * FROM grievances WHERE appeal_at IS NOT NULL AND appeal_decision IS NULL ORDER BY appeal_at").all()).results || [];
    const appeals = []; for (const g of appealRows) appeals.push(await caseInfo(env, g));
    const since30 = new Date(Date.now() - 30 * DAY).toISOString();
    const decided = (await env.DB.prepare("SELECT r.grievance_id, r.status, r.decided_by, r.decided_at, r.decision_note, g.tracking_ref FROM complaint_reports r JOIN grievances g ON g.id = r.grievance_id WHERE r.status != 'OPEN' AND r.decided_at >= ? GROUP BY r.grievance_id ORDER BY r.decided_at DESC LIMIT 50").bind(since30).all()).results || [];
    const now = new Date().toISOString();
    const rs = (await env.DB.prepare("SELECT * FROM filing_restrictions WHERE status IN ('PENDING', 'ACTIVE') OR proposed_at >= ? ORDER BY proposed_at DESC LIMIT 100").bind(since30).all()).results || [];
    const restrictions = [];
    for (const r of rs) {
      const g = r.grievance_id ? await env.DB.prepare("SELECT tracking_ref FROM grievances WHERE id = ?").bind(r.grievance_id).first() : null;
      restrictions.push({ id: r.id, kind: r.kind, hint: r.hint, trackingRef: g ? g.tracking_ref : null, reason: r.reason, days: r.days,
        status: r.status === "ACTIVE" && r.ends_at <= now ? "ENDED" : r.status, proposedBy: r.proposed_by, proposedAt: r.proposed_at,
        decidedBy: r.decided_by, decidedAt: r.decided_at, startsAt: r.starts_at, endsAt: r.ends_at, liftedBy: r.lifted_by, liftReason: r.lift_reason,
        canDecide: r.status === "PENDING" && allows(auth, "approve_restriction") && r.proposed_by !== auth.email });
    }
    // The month so far (India time), for the auditor.
    const ist = new Date(Date.now() + 5.5 * 3600000).toISOString();
    const monthStart = new Date(Date.parse(ist.slice(0, 7) + "-01T00:00:00Z") - 5.5 * 3600000).toISOString();
    const cnt = async (sql, ...a) => { const r = await env.DB.prepare(sql).bind(...a).first(); return r ? Number(r.n || 0) : 0; };
    const month = {
      from: ist.slice(0, 7) + "-01",
      reportedByOffices: await cnt("SELECT COUNT(*) n FROM complaint_reports WHERE by_kind = 'REP' AND created_at >= ?", monthStart),
      reportedByDepartments: await cnt("SELECT COUNT(*) n FROM complaint_reports WHERE by_kind = 'DEPT' AND created_at >= ?", monthStart),
      flaggedByTextCheck: await cnt("SELECT COUNT(DISTINCT grievance_id) n FROM complaint_reports WHERE by_kind = 'AUTO' AND created_at >= ?", monthStart),
      closedNotGenuine: await cnt("SELECT COUNT(*) n FROM grievances WHERE closure_kind = 'NOT_GENUINE' AND not_genuine_at >= ?", monthStart),
      keptAsGenuine: await cnt("SELECT COUNT(DISTINCT grievance_id) n FROM complaint_reports WHERE status = 'DISMISSED' AND decided_at >= ?", monthStart),
      appeals: await cnt("SELECT COUNT(*) n FROM grievances WHERE appeal_at >= ?", monthStart),
      appealsReopened: await cnt("SELECT COUNT(*) n FROM grievances WHERE appeal_decision = 'REOPEN' AND appeal_decided_at >= ?", monthStart),
      restrictionsStarted: await cnt("SELECT COUNT(*) n FROM filing_restrictions WHERE status IN ('ACTIVE', 'LIFTED') AND starts_at >= ?", monthStart),
      restrictionsActive: await cnt("SELECT COUNT(*) n FROM filing_restrictions WHERE status = 'ACTIVE' AND ends_at > ?", now),
      waiting: reports.length,
      // Offices that report many complaints, so the auditor can check reporting isn't used to avoid work.
      topReporters: [],
    };
    for (const r of ((await env.DB.prepare("SELECT office_key, COUNT(*) n, SUM(CASE WHEN status = 'DISMISSED' THEN 1 ELSE 0 END) dismissed FROM complaint_reports WHERE by_kind != 'AUTO' AND created_at >= ? GROUP BY office_key ORDER BY n DESC LIMIT 10").bind(monthStart).all()).results || []))
      month.topReporters.push({ office: await officeName(env, r.office_key, names), reports: Number(r.n), dismissed: Number(r.dismissed || 0) });
    const sw = await getSwitch(env, "SMS_FILING");
    const test = await getSwitch(env, "SMS_TEST_OK");
    const sms = { configured: smsConfigured(env), on: !!(sw && sw.value === "ON"), changedBy: sw ? sw.changed_by : null, changedAt: sw ? sw.changed_at : null,
      tested: !!(test && test.value === "OK"), testedAt: test ? test.changed_at : null, canSwitch: allows(auth, "manage_switches"),
      history: ((await env.DB.prepare("SELECT value, reason, actor, created_at FROM switch_events WHERE key = 'SMS_FILING' ORDER BY created_at DESC LIMIT 10").all()).results || []).map((h) => ({ on: h.value === "ON", reason: h.reason, by: h.actor, at: h.created_at })) };
    return json({ me: auth.email, canManage: allows(auth, "manage_misuse"), canApprove: allows(auth, "approve_restriction"), reports, appeals, decided, restrictions, month, sms });
  } catch (e) {
    if (/no such (table|column)/i.test(String(e && e.message))) return json({ ready: false, error: "Run part53-misuse.sql first." }, 503);
    throw e;
  }
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Invalid request." }, 400); }
  const action = String(b.action || "");
  const perm = ["approve", "refuse", "lift"].includes(action) ? "approve_restriction" : ["sms_test", "sms_switch"].includes(action) ? "manage_switches" : "manage_misuse";
  const auth = await getVerifiedAdmin(request, env, perm);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const now = new Date().toISOString();
  const note = String(b.note || b.reason || "").replace(/\s+/g, " ").trim();
  const needNote = (min) => note.length < min || note.length > NOTE_MAX;

  if (action === "decide") {
    const g = await env.DB.prepare("SELECT * FROM grievances WHERE id = ?").bind(String(b.grievanceId || "")).first();
    if (!g) return json({ error: "Case not found." }, 404);
    const decision = String(b.decision || "");
    if (!["GENUINE", "NOT_GENUINE"].includes(decision) || needNote(10)) return json({ error: "Choose a decision and write the reason (10 to 500 characters).", fields: { decision: ["GENUINE", "NOT_GENUINE"].includes(decision) ? undefined : "REQUIRED", note: needNote(10) ? "SHORT" : undefined } }, 400);
    const open = await env.DB.prepare("SELECT COUNT(*) n FROM complaint_reports WHERE grievance_id = ? AND status = 'OPEN'").bind(g.id).first();
    if (!open || !open.n) return json({ error: "This complaint has no open reports. Refresh the page.", code: "NOTHING_OPEN" }, 409);
    if (decision === "NOT_GENUINE" && !["OPEN", "ACKNOWLEDGED"].includes(g.status)) return json({ error: "Only an open case can be closed as not genuine.", code: "NOT_OPEN" }, 409);
    await env.DB.prepare("UPDATE complaint_reports SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE grievance_id = ? AND status = 'OPEN'")
      .bind(decision === "GENUINE" ? "DISMISSED" : "UPHELD", auth.email, now, note, g.id).run();
    if (decision === "NOT_GENUINE") {
      const r = await env.DB.prepare("UPDATE grievances SET status = 'CLOSED', closure_kind = 'NOT_GENUINE', closed_at = ?, updated_at = ?, not_genuine_reason = ?, not_genuine_at = ?, not_genuine_by = ? WHERE id = ? AND status IN ('OPEN', 'ACKNOWLEDGED')")
        .bind(now, now, note, now, auth.email, g.id).run();
      if (!r.meta || !r.meta.changes) return json({ error: "The case changed just now. Refresh the page.", code: "CHANGED" }, 409);
      const origin = env.SITE_ORIGIN || new URL(request.url).origin;
      await tellCitizen(env, origin, g, "CLOSED", note);
    }
    await logEvent(env, auth.email, decision === "GENUINE" ? "misuse_kept" : "misuse_closed", g.id, { note });
    return json({ ok: true });
  }

  if (action === "appeal") {
    const g = await env.DB.prepare("SELECT * FROM grievances WHERE id = ?").bind(String(b.grievanceId || "")).first();
    if (!g || !g.appeal_at || g.appeal_decision) return json({ error: "No appeal is waiting on this case. Refresh the page.", code: "NO_APPEAL" }, 409);
    if (g.not_genuine_by === auth.email) return json({ error: "Someone other than the person who closed this case must decide the appeal.", code: "SAME_PERSON" }, 403);
    const decision = String(b.decision || "");
    if (!["REOPEN", "KEEP_CLOSED"].includes(decision) || needNote(10)) return json({ error: "Choose a decision and write the reason (10 to 500 characters).", fields: { decision: ["REOPEN", "KEEP_CLOSED"].includes(decision) ? undefined : "REQUIRED", note: needNote(10) ? "SHORT" : undefined } }, 400);
    if (decision === "REOPEN") {
      // Back to the level where it was closed, with a fresh clock (the same way a reopened case starts again).
      const chain = await resolveChain(env, g.local_unit_id);
      const tier = (g.current_tier && chain && chain.tiers.some((t) => t.tier === g.current_tier)) ? g.current_tier : "LOCAL";
      await env.DB.prepare("UPDATE grievances SET status = 'OPEN', closure_kind = NULL, closed_at = NULL, acknowledged_at = NULL, reopened_at = ?, reopen_start_tier = ?, updated_at = ?, appeal_decision = 'REOPEN', appeal_decided_by = ?, appeal_decided_at = ? WHERE id = ?")
        .bind(now, tier, now, auth.email, now, g.id).run();
    } else {
      await env.DB.prepare("UPDATE grievances SET appeal_decision = 'KEEP_CLOSED', appeal_decided_by = ?, appeal_decided_at = ?, updated_at = ? WHERE id = ?").bind(auth.email, now, now, g.id).run();
    }
    const origin = env.SITE_ORIGIN || new URL(request.url).origin;
    await tellCitizen(env, origin, g, decision === "REOPEN" ? "APPEAL_REOPENED" : "APPEAL_KEPT", note);
    await logEvent(env, auth.email, "misuse_appeal_" + decision.toLowerCase(), g.id, { note });
    return json({ ok: true });
  }

  if (action === "restrict") {
    // By case id, or by the tracking number typed on the page.
    const g = await env.DB.prepare("SELECT id, citizen_phone, citizen_email, closure_kind FROM grievances WHERE id = ? OR tracking_ref = ?").bind(String(b.grievanceId || ""), String(b.trackingRef || "").trim().toUpperCase()).first();
    if (!g) return json({ error: "No complaint has that tracking number.", code: "NOT_FOUND", fields: { trackingRef: "NOT_FOUND" } }, 404);
    const kind = String(b.kind || ""), days = Number(b.days);
    const fields = {};
    if (!["PHONE", "EMAIL"].includes(kind)) fields.kind = "REQUIRED";
    if (!RESTRICT_DAYS.includes(days)) fields.days = "REQUIRED";
    if (needNote(20)) fields.reason = "SHORT";
    if (Object.keys(fields).length) return json({ error: "Choose what to restrict and for how long, and write the reason (20 to 500 characters).", fields }, 400);
    if (g.closure_kind !== "NOT_GENUINE") return json({ error: "Only the sender of a complaint closed as not genuine can be restricted.", code: "NOT_CLOSED" }, 409);
    const key = await restrictionKey(kind, kind === "PHONE" ? g.citizen_phone : g.citizen_email);
    if (!key) return json({ error: kind === "EMAIL" ? "This complaint has no email." : "This complaint has no usable phone number.", code: "NO_VALUE" }, 409);
    const dup = await env.DB.prepare("SELECT id FROM filing_restrictions WHERE value_hash = ? AND (status = 'PENDING' OR (status = 'ACTIVE' AND ends_at > ?))").bind(key.hash, now).first();
    if (dup) return json({ error: "This " + (kind === "PHONE" ? "number" : "email") + " already has a restriction waiting or in force.", code: "ALREADY" }, 409);
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO filing_restrictions (id, kind, value_hash, hint, grievance_id, reason, days, status, proposed_by, proposed_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)")
      .bind(id, kind, key.hash, key.hint, g.id, note, days, auth.email, now).run();
    await logEvent(env, auth.email, "restriction_proposed", id, { kind, days, grievanceId: g.id });
    return json({ ok: true, id });
  }

  if (action === "approve" || action === "refuse") {
    const r = await env.DB.prepare("SELECT * FROM filing_restrictions WHERE id = ?").bind(String(b.id || "")).first();
    if (!r || r.status !== "PENDING") return json({ error: "This restriction isn't waiting for a decision. Refresh the page.", code: "NOT_PENDING" }, 409);
    if (r.proposed_by === auth.email) return json({ error: "A second person must approve a restriction you proposed.", code: "SAME_PERSON" }, 403);
    if (action === "refuse" && needNote(10)) return json({ error: "Say why you are refusing it (10 to 500 characters).", fields: { note: "SHORT" } }, 400);
    if (action === "approve") {
      await env.DB.prepare("UPDATE filing_restrictions SET status = 'ACTIVE', decided_by = ?, decided_at = ?, starts_at = ?, ends_at = ? WHERE id = ? AND status = 'PENDING'").bind(auth.email, now, now, endsAt(now, r.days), r.id).run();
    } else {
      await env.DB.prepare("UPDATE filing_restrictions SET status = 'REFUSED', decided_by = ?, decided_at = ?, lift_reason = ? WHERE id = ? AND status = 'PENDING'").bind(auth.email, now, note, r.id).run();
    }
    await logEvent(env, auth.email, "restriction_" + action + "d", r.id, action === "refuse" ? { note } : { days: r.days });
    return json({ ok: true });
  }

  if (action === "lift") {
    const r = await env.DB.prepare("SELECT * FROM filing_restrictions WHERE id = ?").bind(String(b.id || "")).first();
    if (!r || r.status !== "ACTIVE" || r.ends_at <= now) return json({ error: "This restriction isn't in force. Refresh the page.", code: "NOT_ACTIVE" }, 409);
    if (needNote(10)) return json({ error: "Say why you are lifting it (10 to 500 characters).", fields: { reason: "SHORT" } }, 400);
    await env.DB.prepare("UPDATE filing_restrictions SET status = 'LIFTED', lifted_by = ?, lifted_at = ?, lift_reason = ? WHERE id = ?").bind(auth.email, now, note, r.id).run();
    await logEvent(env, auth.email, "restriction_lifted", r.id, { note });
    return json({ ok: true });
  }

  if (action === "sms_test") {
    if (!smsConfigured(env)) return json({ error: "No SMS provider is set up yet. Add SMS_AUTH_KEY and SMS_TEMPLATE_ID in Cloudflare first.", code: "NOT_CONFIGURED" }, 409);
    const ph = phone10(b.phone);
    if (!/^[6-9]\d{9}$/.test(ph)) return json({ error: "Enter a 10-digit mobile number to send the test to.", fields: { phone: "FORMAT" } }, 400);
    const sent = await sendSms(env, ph, "123456");
    await logEvent(env, auth.email, "sms_test", null, { ok: sent.ok, error: sent.error || undefined, detail: sent.detail || undefined });
    if (!sent.ok) return json({ error: "The provider didn't accept the SMS" + (sent.detail ? ": " + sent.detail : "") + ". Check the key, the DLT template and the sender ID.", code: "SEND_FAILED" }, 502);
    await env.DB.prepare("INSERT INTO app_switches (key, value, changed_by, changed_at) VALUES ('SMS_TEST_OK', 'OK', ?, ?) ON CONFLICT(key) DO UPDATE SET value = 'OK', changed_by = excluded.changed_by, changed_at = excluded.changed_at").bind(auth.email, now).run();
    return json({ ok: true });
  }

  if (action === "sms_switch") {
    const on = b.on === true;
    // The reason is optional (one click), but recorded when given.
    if (note.length > NOTE_MAX) return json({ error: "Keep the reason under 500 characters.", fields: { reason: "LONG" } }, 400);
    const why = note || (on ? "Switched on from the Misuse page" : "Switched off from the Misuse page");
    if (on) {
      if (!smsConfigured(env)) return json({ error: "No SMS provider is set up yet.", code: "NOT_CONFIGURED" }, 409);
      const t = await getSwitch(env, "SMS_TEST_OK");
      if (!t || t.value !== "OK") return json({ error: "Send a test SMS first, and check it arrived.", code: "NOT_TESTED" }, 409);
    }
    const value = on ? "ON" : "OFF";
    await env.DB.prepare("INSERT INTO app_switches (key, value, changed_by, changed_at, detail) VALUES ('SMS_FILING', ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, changed_by = excluded.changed_by, changed_at = excluded.changed_at, detail = excluded.detail").bind(value, auth.email, now, why).run();
    await env.DB.prepare("INSERT INTO switch_events (id, key, value, reason, actor, created_at) VALUES (?, 'SMS_FILING', ?, ?, ?, ?)").bind(crypto.randomUUID(), value, why, auth.email, now).run();
    await logEvent(env, auth.email, "sms_switch_" + value.toLowerCase(), null, { note: why });
    return json({ ok: true, on });
  }
  return json({ error: "Unknown action." }, 400);
}

// The citizen hears about a "not genuine" closure and an appeal decision (if they gave an email).
async function tellCitizen(env, origin, g, kind, note) {
  const to = String(g.citizen_email || "").trim().toLowerCase();
  if (!to.includes("@")) return;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const url = origin + "/status?ref=" + encodeURIComponent(g.tracking_ref);
  const hi = g.lang === "hi";
  let subject, html;
  if (kind === "CLOSED") {
    subject = hi ? `आपकी शिकायत ${g.tracking_ref} बंद की गई` : `Your complaint ${g.tracking_ref} was closed`;
    html = hi
      ? `<p>GrievIQ ने आपकी शिकायत <strong>${esc(g.tracking_ref)}</strong> की जाँच की और इसे वास्तविक शिकायत नहीं माना, इसलिए यह बंद कर दी गई है।</p><p>कारण: ${esc(note)}</p><p>यदि आपको लगता है कि यह ग़लत है, तो आप ${APPEAL_DAYS} दिनों में एक बार अपील कर सकते हैं: <a href="${esc(url)}">${esc(url)}</a></p>`
      : `<p>GrievIQ looked into your complaint <strong>${esc(g.tracking_ref)}</strong> and found it was not a genuine complaint, so it has been closed.</p><p>Reason: ${esc(note)}</p><p>If you think this is wrong, you can appeal once within ${APPEAL_DAYS} days: <a href="${esc(url)}">${esc(url)}</a></p>`;
  } else if (kind === "APPEAL_REOPENED") {
    subject = hi ? `आपकी अपील स्वीकार: शिकायत ${g.tracking_ref} फिर खोली गई` : `Appeal accepted: complaint ${g.tracking_ref} is open again`;
    html = hi ? `<p>आपकी अपील स्वीकार की गई। शिकायत <strong>${esc(g.tracking_ref)}</strong> फिर से खोली गई है और नई समय-सीमा के साथ आगे बढ़ेगी।</p><p><a href="${esc(url)}">${esc(url)}</a></p>`
      : `<p>Your appeal was accepted. Complaint <strong>${esc(g.tracking_ref)}</strong> is open again, with a fresh time limit.</p><p><a href="${esc(url)}">${esc(url)}</a></p>`;
  } else {
    subject = hi ? `आपकी अपील पर निर्णय: शिकायत ${g.tracking_ref}` : `Decision on your appeal: complaint ${g.tracking_ref}`;
    html = hi ? `<p>आपकी अपील पर किसी दूसरे व्यक्ति ने फिर से विचार किया। शिकायत <strong>${esc(g.tracking_ref)}</strong> बंद ही रहेगी।</p><p>कारण: ${esc(note)}</p><p>आप शिकायत अधिकारी को grievance@grieviq.in पर लिख सकते हैं।</p>`
      : `<p>Your appeal was looked at again by a different person. Complaint <strong>${esc(g.tracking_ref)}</strong> stays closed.</p><p>Reason: ${esc(note)}</p><p>You can write to the Grievance Officer at grievance@grieviq.in.</p>`;
  }
  await queueEmail(env, to, "CITIZEN_MISUSE_" + kind, "MISUSE:" + kind + ":" + g.id, subject, html, null);
}
