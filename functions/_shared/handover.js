/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/handover.js   (grieviq-53, owner approved 18 Oct 2026)
//
// Change of representative: a seat (ward or village, mayor, MLA, MP) passes
// to a new representative, to an administrator, or becomes vacant.
//
// The office belongs to the seat, not the person. Its case records stay
// with the office, so citizens' complaints carry on (the purpose of the
// processing continues; DPDP Act 2023). What changes:
//   - the seat's name, phone, email and status
//   - the outgoing person's sign-in sessions and phone alerts end, unless
//     they still hold another office
//   - cases assigned to the old team go back to the office's open list (the
//     old team is already paused until the new representative confirms them)
//   - "share my office's figures with the state" is switched off: it was
//     the outgoing representative's choice, not the new one's
//   - the new holder sees a handover summary on first sign-in and is asked
//     to continue the office's plan
//   - both people get a short email with no case details
// Approval follows the rules for other seat changes: a data entry operator
// asks and a super or operations admin approves (never their own request);
// a super or operations admin may also apply a change directly. Every step
// is written to admin_events.

import { validateContact, emailDomainCanReceive } from "./contact-validation.js";
import { CONTACT_TABLES, contactDef } from "./jurisdiction-writes.js";
import { returnCasesOf, seatsReady } from "./seats.js";
import { lookupMandates } from "./get-verified-rep.js";
import { endAllSessions } from "./rep-session.js";
import { queueEmail, flushOutbox } from "./notify.js";

export const SEAT_TYPES = ["ward", "mayor", "mla", "mp"];
export const TIER_OF = { ward: "LOCAL", mayor: "MAYOR", mla: "MLA", mp: "MP" };
export const KINDS = ["NEW_REP", "ADMINISTRATOR", "VACANT"];
export const REASONS = ["ELECTION", "BY_ELECTION", "RESIGNATION", "DEATH", "DISQUALIFICATION", "ADMINISTRATOR", "TERM_ENDED", "OTHER"];
const STATUS_OF_KIND = { NEW_REP: "ELECTED", ADMINISTRATOR: "ADMINISTRATOR", VACANT: "VACANT" };

export async function handoverReady(env) {
  try { await env.DB.prepare("SELECT seat_status FROM local_units LIMIT 1").first(); await env.DB.prepare("SELECT id FROM seat_handovers LIMIT 1").first(); return true; }
  catch (e) { return false; }
}

// "ELECTED" | "ADMINISTRATOR" | "VACANT" from the stored value.
export function seatStatus(v) { return v === "ADMINISTRATOR" || v === "VACANT" ? v : "ELECTED"; }

const low = (s) => String(s || "").trim().toLowerCase();
const clip = (v, n) => { const s = v == null ? "" : String(v).trim(); return s.slice(0, n); };
function istToday() { return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); }

// One seat, as it is now: { type, id, tier, place, name, phone, email, status } or null.
export async function readSeat(env, type, id) {
  const def = contactDef(type, id);
  if (!def || !id) return null;
  // grieviq-57: seats B-F of a ward with several members.
  const row = def.seat
    ? await env.DB.prepare("SELECT s.id, lu.name || ' · Seat ' || s.seat_label AS place, s.rep_name AS name, s.rep_phone AS phone, s.rep_email AS email, s.seat_status FROM ward_seats s JOIN local_units lu ON lu.id = s.local_unit_id WHERE s.id = ?").bind(String(id)).first()
    : await env.DB.prepare(
      `SELECT id, name AS place, ${def.nameCol} AS name, ${def.phoneCol} AS phone, ${def.emailCol} AS email, seat_status FROM ${def.table} WHERE id = ?`
    ).bind(String(id)).first();
  if (!row) return null;
  return { type, id: row.id, tier: TIER_OF[type], place: row.place, label: def.label + " — " + row.place,
    name: row.name || null, phone: row.phone || null, email: row.email ? low(row.email) : null, status: seatStatus(row.seat_status) };
}

// Every seat of every kind, for the admin page.
export async function listSeats(env) {
  const out = {};
  const q = {
    ward: "SELECT lu.id, lu.name AS place, lu.unit_type, lu.rep_name AS name, lu.rep_email AS email, lu.seat_status, ar.name AS area FROM local_units lu LEFT JOIN areas ar ON ar.id = lu.area_id ORDER BY ar.name, lu.name",
    mayor: "SELECT id, name AS place, mayor_name AS name, mayor_email AS email, seat_status FROM municipal_bodies WHERE has_mayor = 1 ORDER BY name",
    mla: "SELECT id, name AS place, mla_name AS name, mla_email AS email, seat_status FROM mla_constituencies ORDER BY name",
    mp: "SELECT id, name AS place, mp_name AS name, mp_email AS email, seat_status FROM mp_constituencies ORDER BY name",
  };
  for (const t of SEAT_TYPES) {
    let rows = [];
    try { rows = (await env.DB.prepare(q[t]).all()).results || []; }
    catch (e) { rows = t === "ward" ? ((await env.DB.prepare("SELECT id, name AS place, unit_type, rep_name AS name, rep_email AS email, seat_status FROM local_units ORDER BY name").all()).results || []) : []; }
    out[t] = rows.map((r) => ({ id: r.id, place: r.place, area: r.area || null, rural: r.unit_type === "RURAL",
      name: r.name || null, email: r.email ? low(r.email) : null, status: seatStatus(r.seat_status) }));
  }
  // grieviq-57: in a ward with several members each seat is listed apart.
  if (await seatsReady(env)) {
    try {
      const { results } = await env.DB.prepare(
        "SELECT o.id, o.name AS place, o.seat_label, o.unit_id, o.unit_type, o.rep_name AS name, o.rep_email AS email, o.seat_status, ar.name AS area FROM local_offices o LEFT JOIN areas ar ON ar.id = o.area_id WHERE o.seat_count > 1"
      ).all();
      const multi = new Map((results || []).map((r) => [r.id, r]));
      const rest = out.ward.filter((w) => !multi.has(w.id));
      const seats = Array.from(multi.values()).map((r) => ({ id: r.id, place: r.place, area: r.area || null, rural: r.unit_type === "RURAL",
        name: r.name || null, email: r.email ? low(r.email) : null, status: seatStatus(r.seat_status), seat: r.seat_label }));
      out.ward = rest.concat(seats).sort((a, b) => String(a.area || "").localeCompare(String(b.area || "")) || String(a.place).localeCompare(String(b.place)));
    } catch (e) { /* view not there */ }
  }
  return out;
}

// Checks a proposed change. Returns { ok: true, seat, values } or { ok: false, status, fields }.
export async function checkProposal(env, b) {
  const fields = {};
  const type = String(b.seatType || "");
  const kind = String(b.kind || "");
  const reason = String(b.reason || "");
  if (!SEAT_TYPES.includes(type)) fields.seat = "REQUIRED";
  const seat = SEAT_TYPES.includes(type) ? await readSeat(env, type, b.seatId) : null;
  if (!fields.seat && !seat) fields.seat = "REQUIRED";
  if (!KINDS.includes(kind)) fields.kind = "REQUIRED";
  if (!REASONS.includes(reason)) fields.reason = "REQUIRED";
  const reasonNote = clip(b.reasonNote, 300);
  if (reason === "OTHER" && reasonNote.length < 5) fields.reasonNote = "REQUIRED";
  const evidence = clip(b.evidence, 300);
  if (evidence.length < 5) fields.evidence = "REQUIRED";
  const eff = String(b.effectiveDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eff) || isNaN(Date.parse(eff + "T00:00:00Z"))) fields.effectiveDate = "REQUIRED";
  else if (eff > istToday()) fields.effectiveDate = "FUTURE";
  let values = { name: null, phone: null, email: null };
  if (kind === "NEW_REP" || kind === "ADMINISTRATOR") {
    const c = validateContact({ name: b.newName == null ? "" : b.newName, phone: b.newPhone == null ? "" : b.newPhone, email: b.newEmail == null ? "" : b.newEmail });
    if (!c.ok) fields[c.field === "name" ? "newName" : c.field === "phone" ? "newPhone" : "newEmail"] = "FORMAT";
    else {
      values = { name: c.values.name || null, phone: c.values.phone || null, email: c.values.email ? low(c.values.email) : null };
      if (!values.name || values.name.length < 2) fields.newName = "REQUIRED";
      if (!values.email) fields.newEmail = "REQUIRED";
      else if (seat && seat.email && values.email === seat.email) fields.newEmail = "SAME";
      else {
        const d = await emailDomainCanReceive(values.email);
        if (!d.ok) fields.newEmail = "DOMAIN";
      }
    }
  }
  if (seat && kind === "VACANT" && seat.status === "VACANT") fields.kind = "ALREADY_VACANT";
  if (Object.keys(fields).length) return { ok: false, status: 400, fields };
  const pending = await env.DB.prepare("SELECT id FROM seat_handovers WHERE seat_type = ? AND seat_id = ? AND status = 'PENDING' LIMIT 1").bind(type, seat.id).first();
  if (pending) return { ok: false, status: 409, fields: { seat: "PENDING" } };
  return { ok: true, seat, kind, reason, reasonNote: reasonNote || null, evidence, effectiveDate: eff, values };
}

export async function logEvent(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, target, detail == null ? null : JSON.stringify(detail)).run();
}

// Stores a checked proposal. Returns the row id.
export async function storeProposal(env, p, actor) {
  const id = "ho-" + crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO seat_handovers (id, seat_type, seat_id, seat_label, kind, reason, reason_note, evidence, effective_date,
       old_name, old_phone, old_email, old_status, new_name, new_phone, new_email, status, requested_by, requested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`
  ).bind(id, p.seat.type, p.seat.id, p.seat.label, p.kind, p.reason, p.reasonNote, p.evidence, p.effectiveDate,
    p.seat.name, p.seat.phone, p.seat.email, p.seat.status, p.values.name, p.values.phone, p.values.email, actor, new Date().toISOString()).run();
  await logEvent(env, actor, "seat_handover_requested", p.seat.type + ":" + p.seat.id, { id, kind: p.kind, reason: p.reason, newEmail: p.values.email });
  return id;
}

function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
const KIND_HI = { NEW_REP: "जनप्रतिनिधि", ADMINISTRATOR: "प्रशासक" };
function outgoingEmail(h, origin) {
  return {
    subject: "GrievIQ: your access to the office has ended · कार्यालय तक आपकी पहुँच समाप्त",
    html: `<p>Your access to the GrievIQ office for <b>${esc(h.seat_label)}</b> ended on ${esc(h.effective_date)}, because the seat has passed to someone else.</p>` +
      `<p>The office's complaints and records stay with the office, so citizens' complaints carry on. Please do not keep any copies of citizens' details you may have downloaded.</p>` +
      `<p>If you think this is a mistake, write to support@grieviq.in.</p><hr>` +
      `<p><b>${esc(h.seat_label)}</b> के GrievIQ कार्यालय तक आपकी पहुँच ${esc(h.effective_date)} को समाप्त हो गई, क्योंकि यह पद किसी और को मिल गया है।</p>` +
      `<p>कार्यालय की शिकायतें और रिकॉर्ड कार्यालय के पास रहते हैं, ताकि नागरिकों की शिकायतें जारी रहें। कृपया नागरिकों के विवरण की कोई प्रति अपने पास न रखें।</p>` +
      `<p>यदि यह ग़लती लगे तो support@grieviq.in पर लिखें।</p>`,
  };
}
function incomingEmail(h, origin) {
  const url = String(origin || "https://grieviq.in") + "/rep";
  const host = url.replace(/^https?:\/\//, "");
  const as = h.kind === "ADMINISTRATOR" ? "administrator" : "representative";
  return {
    subject: "GrievIQ: welcome to your office · आपके कार्यालय में स्वागत है",
    html: `<p>You are now recorded as the ${as} for <b>${esc(h.seat_label)}</b> on GrievIQ, from ${esc(h.effective_date)}.</p>` +
      `<p>Sign in at <a href="${esc(url)}">${esc(host)}</a> with your Google account for this email. You will see a short handover summary: the office's open complaints, the team to confirm, and the office's plan.</p>` +
      `<p>For security, GrievIQ emails never contain complaint details, and GrievIQ never asks for your password or a code by phone.</p><hr>` +
      `<p>GrievIQ पर आप ${esc(h.effective_date)} से <b>${esc(h.seat_label)}</b> के ${KIND_HI[h.kind] || "जनप्रतिनिधि"} के रूप में दर्ज हैं।</p>` +
      `<p>इस ईमेल वाले Google खाते से <a href="${esc(url)}">${esc(host)}</a> पर साइन इन करें। आपको हस्तांतरण का छोटा सारांश दिखेगा: कार्यालय की खुली शिकायतें, पुष्टि के लिए टीम, और कार्यालय की योजना।</p>` +
      `<p>सुरक्षा के लिए GrievIQ के ईमेल में कभी शिकायत का विवरण नहीं होता, और GrievIQ कभी फ़ोन पर आपका पासवर्ड या कोड नहीं माँगता।</p>`,
  };
}

// Applies a stored proposal (row h) now. Returns { ok, summary } or
// { ok: false, error: "OUT_OF_DATE" } when the seat changed since it was asked.
export async function applyHandover(env, h, actor, origin) {
  const seat = await readSeat(env, h.seat_type, h.seat_id);
  const now = new Date().toISOString();
  if (!seat || low(seat.email) !== low(h.old_email) || seat.status !== seatStatus(h.old_status)) {
    await env.DB.prepare("UPDATE seat_handovers SET status = 'OUT_OF_DATE', decided_by = ?, decided_at = ? WHERE id = ? AND status = 'PENDING'").bind(actor, now, h.id).run();
    await logEvent(env, actor, "seat_handover_out_of_date", h.seat_type + ":" + h.seat_id, { id: h.id });
    return { ok: false, error: "OUT_OF_DATE" };
  }
  const def = contactDef(h.seat_type, h.seat_id);
  const tier = TIER_OF[h.seat_type];
  const newStatus = STATUS_OF_KIND[h.kind];
  const keep = h.kind === "VACANT" ? { name: null, phone: null, email: null } : { name: h.new_name, phone: h.new_phone, email: h.new_email };
  const summary = { assignmentsReturned: 0, shareSwitchedOff: false, outgoingSignedOut: false, emails: [] };

  // 1. The seat itself, only if it still holds what the request was made against.
  const upd = await env.DB.prepare(
    `UPDATE ${def.table} SET ${def.nameCol} = ?, ${def.phoneCol} = ?, ${def.emailCol} = ?, seat_status = ?
      WHERE id = ? AND COALESCE(LOWER(${def.emailCol}), '') = ? AND COALESCE(seat_status, 'ELECTED') = ?`
  ).bind(keep.name, keep.phone, keep.email, newStatus === "ELECTED" ? null : newStatus, h.seat_id, low(h.old_email), seatStatus(h.old_status)).run();
  if (!upd.meta || !upd.meta.changes) return { ok: false, error: "OUT_OF_DATE" };

  // 2. Cases assigned to the old team go back to the office's open list.
  try {
    const r = await env.DB.prepare(
      "UPDATE case_assignments SET ended_at = ?, ended_by = ?, end_reason = 'HANDOVER' WHERE office_tier = ? AND office_id = ? AND ended_at IS NULL AND LOWER(assignee_email) <> ?"
    ).bind(now, actor, tier, h.seat_id, low(keep.email)).run();
    summary.assignmentsReturned = (r.meta && r.meta.changes) || 0;
  } catch (e) { /* no assignments table yet */ }

  // 2b. grieviq-57: a seat of a ward with several members that becomes vacant
  // gives its open cases back to the ward, so the other members can take them.
  summary.casesReturnedToWard = 0;
  if (tier === "LOCAL" && h.kind === "VACANT") {
    try { summary.casesReturnedToWard = (await returnCasesOf(env, [{ id: h.seat_id, why: "VACANT" }], "handover:" + h.id)).length; } catch (e) { /* before part40 */ }
  }

  // 3. Sharing figures with the state was the outgoing person's choice.
  try {
    const g = await env.DB.prepare("UPDATE office_gov_share SET share = 0, changed_at = ?, changed_by = ? WHERE office_tier = ? AND office_id = ? AND share = 1")
      .bind(now, "handover:" + h.id, tier, h.seat_id).run();
    summary.shareSwitchedOff = !!(g.meta && g.meta.changes);
  } catch (e) { /* no sharing table yet */ }

  // 4. The outgoing person: sessions and phone alerts end, unless they still hold an office.
  const old = low(h.old_email);
  if (old && old !== low(keep.email)) {
    const still = await lookupMandates(env, old);
    if (!still.length) {
      await endAllSessions(env, old, "HANDOVER");
      try { await env.DB.prepare("DELETE FROM push_subscriptions WHERE LOWER(email) = ?").bind(old).run(); } catch (e) { /* ignore */ }
      summary.outgoingSignedOut = true;
    }
  }

  // 5. Short emails, no case details.
  const row = Object.assign({}, h, { effective_date: h.effective_date });
  if (old && old !== low(keep.email)) {
    const m = outgoingEmail(row, origin);
    await queueEmail(env, old, "HANDOVER_OUT", "HANDOVER_OUT:" + h.id, m.subject, m.html, null);
    summary.emails.push("outgoing");
  }
  if (keep.email) {
    const m = incomingEmail(row, origin);
    await queueEmail(env, keep.email, "HANDOVER_IN", "HANDOVER_IN:" + h.id, m.subject, m.html, null);
    summary.emails.push("incoming");
  }

  await env.DB.prepare("UPDATE seat_handovers SET status = 'APPLIED', decided_by = ?, decided_at = ?, applied_summary = ? WHERE id = ?")
    .bind(actor, now, JSON.stringify(summary), h.id).run();
  await logEvent(env, actor, "seat_handover_applied", h.seat_type + ":" + h.seat_id,
    { id: h.id, kind: h.kind, reason: h.reason, effectiveDate: h.effective_date, from: h.old_email, to: keep.email, summary });
  try { await flushOutbox(env, 5); } catch (e) { /* the hourly job sends them */ }
  return { ok: true, summary };
}

// Shapes a stored row for the admin page.
export function shapeRow(r) {
  let summary = null; try { summary = r.applied_summary ? JSON.parse(r.applied_summary) : null; } catch (e) { summary = null; }
  return { id: r.id, seatType: r.seat_type, seatId: r.seat_id, seatLabel: r.seat_label, kind: r.kind, reason: r.reason, reasonNote: r.reason_note,
    evidence: r.evidence, effectiveDate: r.effective_date, old: { name: r.old_name, phone: r.old_phone, email: r.old_email, status: seatStatus(r.old_status) },
    next: { name: r.new_name, phone: r.new_phone, email: r.new_email }, status: r.status, requestedBy: r.requested_by, requestedAt: r.requested_at,
    decidedBy: r.decided_by, decidedAt: r.decided_at, decisionNote: r.decision_note, summary, welcomeSeenAt: r.welcome_seen_at, planAcceptedAt: r.plan_accepted_at };
}

// Handovers the signed-in person has taken over and not yet read, for
// their console (one per office): [{ id, tier, officeId, office, kind, effectiveDate, from, teamPaused, planAccepted }].
export async function welcomesFor(env, email) {
  if (!(await handoverReady(env))) return [];
  const e = low(email);
  if (!e) return [];
  const { results } = await env.DB.prepare(
    "SELECT * FROM seat_handovers WHERE LOWER(new_email) = ? AND status = 'APPLIED' AND welcome_seen_at IS NULL ORDER BY decided_at DESC LIMIT 10"
  ).bind(e).all();
  const out = [];
  for (const r of results || []) {
    const seat = await readSeat(env, r.seat_type, r.seat_id);
    if (!seat || seat.email !== e) continue;     // the seat has moved on again
    const tier = TIER_OF[r.seat_type];
    let teamPaused = 0;
    try {
      const t = await env.DB.prepare("SELECT COUNT(*) AS n FROM office_team WHERE office_tier = ? AND office_id = ? AND status = 'ACTIVE' AND COALESCE(LOWER(confirmed_by_rep_email), '') <> ?").bind(tier, r.seat_id, e).first();
      teamPaused = (t && t.n) || 0;
    } catch (x) { teamPaused = 0; }
    out.push({ id: r.id, tier, officeId: r.seat_id, office: seat.place, kind: r.kind, effectiveDate: r.effective_date,
      from: r.old_name || null, teamPaused, planAccepted: !!r.plan_accepted_at });
  }
  return out;
}
