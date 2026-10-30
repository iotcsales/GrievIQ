/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/api/admin/sales.js (grieviq-77): the sales pipeline.
// GET  (view_sales)            leads the person may see, follow-ups due, totals
//      ?id=<lead>              one lead with its history and quotations
// POST (work_sales; sales staff accept the sales code of conduct first)
//   create    { officeKind, officeName, place?, state, contactName?, designation?, mobile?, email?, nextDate?, nextStep?, owner? }
//   log       { id, kind: CALL|MEETING|EMAIL|DEMO|NOTE, note, nextDate? }
//   stage     { id, stage, lostReason?, note? }
//   next      { id, nextDate, nextStep? }
//   details   { id, officeName, place, state, contactName, designation, mobile, email }
//   take      { id }                    a lead nobody has, in your states
//   assign    { id, owner }             manage_sales ("" = nobody)
//   territory { email, states: [...] }  manage_sales
// Party, caste and religion are never recorded (no field; the page says so).

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { needsSalesCode } from "../../_shared/sales-code.js";
import { sendEmailNow } from "../../_shared/dept-auth.js";
import { EMAIL_RE } from "../../_shared/contact-validation.js";
import { GST_STATES } from "../../_shared/tax-docs.js";
import {
  STAGES, OPEN_STAGES, LOST_REASONS, OFFICE_KINDS, ACTIVITY, KEEP_DAYS, salesReady, logLead, insertLead, importPilotRequests, eraseOldContacts,
  statesOf, leadAccess, salesPeople, leadOut, salesTotals, indianMobile, istToday, addDays,
} from "../../_shared/sales.js";

const json = (b, status) => Response.json(b, { status: status || 200, headers: { "Cache-Control": "no-store" } });
const clean = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max + 1);
const escH = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const realDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
async function adminLog(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, target, detail == null ? null : JSON.stringify(detail)).run();
}
const STAGE_ORDER = { NEW: 0, CONTACTED: 1, DEMO: 2, QUOTED: 3 };

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_sales");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await salesReady(env))) return json({ ready: false });
  const today = istToday();
  const canManage = allows(auth, "manage_sales"), canWork = allows(auth, "work_sales");
  const auditor = !canWork && auth.role === "auditor";
  const totalsOnly = !canWork && !auditor;
  try { await importPilotRequests(env); await eraseOldContacts(env); } catch (e) { /* the hourly job does it too */ }
  const url = new URL(request.url);
  const myStates = canWork ? await statesOf(env, auth.email) : [];

  const id = url.searchParams.get("id");
  if (id) {
    if (totalsOnly) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const l = await env.DB.prepare("SELECT * FROM sales_leads WHERE id = ?").bind(id).first();
    const access = l ? leadAccess(auth, l, myStates) : null;
    if (!l || !access.see) return json({ error: "NOT_FOUND" }, 404);
    const { results: ev } = await env.DB.prepare("SELECT * FROM sales_lead_events WHERE lead_id = ? ORDER BY at DESC LIMIT 200").bind(id).all();
    let quotes = [];
    try {
      const { results: q } = await env.DB.prepare("SELECT id, ref, status, approval, total, valid_until, made_at FROM quotations WHERE lead_id = ? ORDER BY made_at DESC").bind(id).all();
      quotes = (q || []).map((x) => ({ id: x.id, ref: x.ref, status: x.status === "OPEN" && x.valid_until < today ? "EXPIRED" : x.status, approval: x.approval || null, total: x.total, madeAt: x.made_at }));
    } catch (e) { quotes = []; }
    return json({ lead: leadOut(l, { mask: auditor, today, access }), events: (ev || []).map((e) => ({ at: e.at, by: e.by_email, kind: e.kind, from: e.stage_from, to: e.stage_to, note: e.note || "" })), quotations: quotes });
  }

  const base = { ready: true, today, me: auth.email, role: auth.role, canWork, canManage, totalsOnly, auditor, keepDays: KEEP_DAYS,
    stages: STAGES, lostReasons: LOST_REASONS, officeKinds: OFFICE_KINDS, activity: ACTIVITY, states: Object.keys(GST_STATES).map((c) => ({ code: c, name: GST_STATES[c] })).sort((a, b) => a.name.localeCompare(b.name)), myStates };
  if (totalsOnly) return json(Object.assign(base, { totals: await salesTotals(env, today) }));

  const { results } = await env.DB.prepare("SELECT * FROM sales_leads ORDER BY (closed_at IS NOT NULL), COALESCE(next_date, '9999'), updated_at DESC LIMIT 1000").all();
  const leads = [];
  for (const l of results || []) {
    const access = leadAccess(auth, l, myStates);
    if (access.see) leads.push(leadOut(l, { mask: auditor, today, access }));
  }
  const mine = leads.filter((l) => l.owner === auth.email && OPEN_STAGES.includes(l.stage));
  const out = Object.assign(base, {
    leads,
    followups: { due: mine.filter((l) => l.due && !l.overdue).length, overdue: mine.filter((l) => l.overdue).length, open: mine.length, free: leads.filter((l) => !l.owner && OPEN_STAGES.includes(l.stage)).length },
  });
  if (canManage || auditor) {
    out.totals = await salesTotals(env, today);
    const people = await salesPeople(env);
    const { results: tr } = await env.DB.prepare("SELECT email, state_code FROM sales_territories ORDER BY state_code").all();
    for (const p of people) p.states = (tr || []).filter((t) => t.email === p.email).map((t) => t.state_code);
    out.people = people;
  }
  return json(out);
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "work_sales");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await salesReady(env))) return json({ error: "NOT_READY" }, 409);
  if (await needsSalesCode(env, auth)) return json({ error: "CODE_NOT_ACCEPTED" }, 403);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const canManage = allows(auth, "manage_sales");
  const today = istToday(), now = new Date().toISOString();
  const origin = new URL(request.url).origin;
  const myStates = await statesOf(env, auth.email);

  // Shared checks for the lead's details.
  function checkDetails(v, f, isNew) {
    const out = {};
    if (isNew || v.officeKind !== undefined) {
      out.kind = String(v.officeKind || "").toUpperCase();
      if (!OFFICE_KINDS.includes(out.kind)) f.officeKind = "REQUIRED";
    }
    out.officeName = clean(v.officeName, 160);
    if (out.officeName.length < 3) f.officeName = "REQUIRED"; else if (out.officeName.length > 160) f.officeName = "LENGTH";
    out.place = clean(v.place, 160); if (out.place.length > 160) f.place = "LENGTH";
    out.state = String(v.state || "");
    const kind = out.kind || v.currentKind;
    if (out.state && !GST_STATES[out.state]) f.state = "REQUIRED";
    else if (!out.state && kind !== "NATIONAL") f.state = "REQUIRED";
    else if (out.state && !canManage && myStates.length && !myStates.includes(out.state)) f.state = "NOT_YOURS";
    if (!canManage && kind === "NATIONAL") f.officeKind = "MANAGER";
    out.contactName = clean(v.contactName, 80); if (out.contactName.length > 80) f.contactName = "LENGTH";
    out.designation = clean(v.designation, 80); if (out.designation.length > 80) f.designation = "LENGTH";
    out.mobile = null;
    if (String(v.mobile || "").trim()) { out.mobile = indianMobile(v.mobile); if (!out.mobile) f.mobile = "FORMAT"; }
    out.email = clean(v.email, 120).toLowerCase();
    if (out.email && (out.email.length > 120 || !EMAIL_RE.test(out.email))) f.email = "FORMAT";
    if (!out.mobile && !out.email && !f.mobile && !f.email) f.mobile = "CONTACT";
    return out;
  }
  function checkNext(v, f) {
    const nd = String(v.nextDate || "");
    if (nd && (!realDate(nd) || nd < today || nd > addDays(today, 365))) f.nextDate = "RANGE";
    const ns = clean(v.nextStep, 160); if (ns.length > 160) f.nextStep = "LENGTH";
    return { nextDate: nd || null, nextStep: ns || null };
  }

  if (b.action === "create") {
    const f = {};
    const d = checkDetails(b, f, true);
    const n = checkNext(b, f);
    let owner = auth.email;
    if (canManage && b.owner !== undefined) {
      owner = String(b.owner || "").toLowerCase() || null;
      if (owner && !(await salesPeople(env)).some((p) => p.email === owner) && owner !== auth.email) f.owner = "REQUIRED";
    }
    if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
    if (d.mobile) {
      const dup = await env.DB.prepare("SELECT ref FROM sales_leads WHERE mobile = ? AND closed_at IS NULL").bind(d.mobile).first();
      if (dup && !b.sameOk) return json({ error: "CHECK_FIELDS", fields: { mobile: "DUPLICATE" }, ref: dup.ref }, 400);
    }
    const made = await insertLead(env, { source: "MANUAL", kind: d.kind, officeName: d.officeName, place: d.place, state: d.state || null, contactName: d.contactName, designation: d.designation,
      mobile: d.mobile, email: d.email || null, owner, nextDate: n.nextDate, nextStep: n.nextStep, by: auth.email });
    if (!made) return json({ error: "CONFLICT" }, 409);
    if (owner && owner !== auth.email) await tellOwner(env, origin, owner);
    return json({ ok: true, id: made.id, ref: made.ref });
  }

  if (b.action === "territory") {
    if (!canManage) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const email = String(b.email || "").toLowerCase();
    if (!(await salesPeople(env)).some((p) => p.email === email)) return json({ error: "CHECK_FIELDS", fields: { email: "REQUIRED" } }, 400);
    const states = [...new Set([].concat(b.states || []).map(String))];
    if (states.some((s) => !GST_STATES[s])) return json({ error: "CHECK_FIELDS", fields: { states: "REQUIRED" } }, 400);
    const before = await statesOf(env, email);
    await env.DB.prepare("DELETE FROM sales_territories WHERE email = ?").bind(email).run();
    for (const s of states) await env.DB.prepare("INSERT INTO sales_territories (id, email, state_code, given_by, given_at) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), email, s, auth.email, now).run();
    await adminLog(env, auth.email, "sales_territory_set", email, { before, after: states.sort() });
    return json({ ok: true, states: states.sort() });
  }

  const l = await env.DB.prepare("SELECT * FROM sales_leads WHERE id = ?").bind(String(b.id || "")).first();
  const access = l ? leadAccess(auth, l, myStates) : null;
  if (!l || !access.see) return json({ error: "NOT_FOUND" }, 404);
  if (l.erased_at) return json({ error: "ERASED" }, 409);

  if (b.action === "take") {
    if (!access.take) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const r = await env.DB.prepare("UPDATE sales_leads SET owner_email = ?, updated_at = ? WHERE id = ? AND owner_email IS NULL").bind(auth.email, now, l.id).run();
    if (!r.meta || r.meta.changes !== 1) return json({ error: "TAKEN" }, 409);
    await logLead(env, l.id, auth.email, "OWNER", { note: auth.email });
    return json({ ok: true });
  }

  if (b.action === "assign") {
    if (!canManage) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const owner = String(b.owner || "").toLowerCase() || null;
    if (owner && !(await salesPeople(env)).some((p) => p.email === owner)) return json({ error: "CHECK_FIELDS", fields: { owner: "REQUIRED" } }, 400);
    if ((owner || null) === (l.owner_email || null)) return json({ ok: true, same: true });
    await env.DB.prepare("UPDATE sales_leads SET owner_email = ?, updated_at = ? WHERE id = ?").bind(owner, now, l.id).run();
    await logLead(env, l.id, auth.email, "OWNER", { note: owner || "" });
    await adminLog(env, auth.email, "sales_lead_given", l.ref, { before: l.owner_email || null, after: owner });
    if (owner && owner !== auth.email) await tellOwner(env, origin, owner);
    return json({ ok: true });
  }

  if (!access.edit) return json({ error: "INSUFFICIENT_ROLE" }, 403);
  const closed = !OPEN_STAGES.includes(l.stage);

  if (b.action === "log") {
    const kind = String(b.kind || "").toUpperCase();
    const note = clean(b.note, 500);
    const f = {};
    if (!ACTIVITY.includes(kind)) f.kind = "REQUIRED";
    if (note.length < 2) f.note = "REQUIRED"; else if (note.length > 500) f.note = "LENGTH";
    const n = b.nextDate !== undefined ? checkNext(b, f) : null;
    if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
    await logLead(env, l.id, auth.email, kind, { note });
    let stage = l.stage;
    // A call, meeting or email moves a new lead to "Contacted"; a demo to "Demo done".
    if (!closed) {
      const to = kind === "DEMO" ? "DEMO" : ["CALL", "MEETING", "EMAIL"].includes(kind) ? "CONTACTED" : null;
      if (to && STAGE_ORDER[to] > STAGE_ORDER[l.stage]) { stage = to; await logLead(env, l.id, auth.email, "STAGE", { from: l.stage, to }); }
    }
    let sets = "stage = ?, updated_at = ?", binds = [stage, now];
    if (n && !closed) {
      sets += ", next_date = ?, next_step = ?"; binds.push(n.nextDate, n.nextStep);
      if ((n.nextDate || null) !== (l.next_date || null)) await logLead(env, l.id, auth.email, "NEXT", { note: [n.nextDate, n.nextStep].filter(Boolean).join(" · ") });
    }
    await env.DB.prepare("UPDATE sales_leads SET " + sets + " WHERE id = ?").bind(...binds, l.id).run();
    return json({ ok: true, stage });
  }

  if (b.action === "stage") {
    const stage = String(b.stage || "").toUpperCase();
    const note = clean(b.note, 500);
    const f = {};
    if (!STAGES.includes(stage)) f.stage = "REQUIRED";
    let reason = null;
    if (stage === "LOST") {
      reason = String(b.lostReason || "").toUpperCase();
      if (!LOST_REASONS.includes(reason)) f.lostReason = "REQUIRED";
      else if (reason === "OTHER" && note.length < 5) f.note = "REQUIRED";
    }
    if (stage === "WON" && note.length < 5) f.note = "REQUIRED";
    if (note.length > 500) f.note = "LENGTH";
    if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
    if (stage === l.stage && (stage !== "LOST" || reason === l.lost_reason)) return json({ ok: true, same: true });
    const nowClosed = stage === "WON" || stage === "LOST";
    await env.DB.prepare("UPDATE sales_leads SET stage = ?, lost_reason = ?, closed_at = ?, next_date = CASE WHEN ? THEN NULL ELSE next_date END, updated_at = ? WHERE id = ?")
      .bind(stage, reason, nowClosed ? (closed ? l.closed_at : now) : null, nowClosed ? 1 : 0, now, l.id).run();
    await logLead(env, l.id, auth.email, "STAGE", { from: l.stage, to: stage, note: [reason, note].filter(Boolean).join(" · ") || null });
    return json({ ok: true, stage });
  }

  if (b.action === "next") {
    if (closed) return json({ error: "CLOSED" }, 409);
    const f = {};
    const n = checkNext(b, f);
    if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
    await env.DB.prepare("UPDATE sales_leads SET next_date = ?, next_step = ?, updated_at = ? WHERE id = ?").bind(n.nextDate, n.nextStep, now, l.id).run();
    await logLead(env, l.id, auth.email, "NEXT", { note: [n.nextDate, n.nextStep].filter(Boolean).join(" · ") || null });
    return json({ ok: true });
  }

  if (b.action === "details") {
    const f = {};
    const d = checkDetails(Object.assign({}, b, { currentKind: l.office_kind }), f, false);
    if (Object.keys(f).length) return json({ error: "CHECK_FIELDS", fields: f }, 400);
    const kind = d.kind || l.office_kind;
    const changed = [];
    const pairs = [["office_kind", kind], ["office_name", d.officeName], ["place", d.place || null], ["state_code", d.state || null], ["contact_name", d.contactName || null], ["designation", d.designation || null], ["mobile", d.mobile], ["email", d.email || null]];
    for (const [k, v] of pairs) if ((l[k] || null) !== (v || null)) changed.push(k);
    if (!changed.length) return json({ ok: true, same: true });
    await env.DB.prepare("UPDATE sales_leads SET office_kind = ?, office_name = ?, place = ?, state_code = ?, contact_name = ?, designation = ?, mobile = ?, email = ?, updated_at = ? WHERE id = ?")
      .bind(...pairs.map((p) => p[1] || null), now, l.id).run();
    await logLead(env, l.id, auth.email, "DETAILS", { note: changed.join(", ") });
    return json({ ok: true, changed });
  }

  return json({ error: "Unknown action." }, 400);
}

// Content-free note to a sales person that a lead was given to them.
async function tellOwner(env, origin, email) {
  try {
    await sendEmailNow(env, email, "GrievIQ: a sales lead has been given to you",
      `<p>A sales lead has been given to you on GrievIQ. Sign in to see it:</p><p><a href="${escH(origin)}/admin-sales.html">${escH(origin)}/admin-sales.html</a></p><p>For security, the details are shown only after you sign in.</p>`);
  } catch (e) { /* shown on the page either way */ }
}
