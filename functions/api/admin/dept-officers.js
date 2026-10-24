/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/admin/dept-officers   Department dashboard (grieviq-32): who from a
// department office may sign in, the office's agreement with GrievIQ, and
// what officers did.
//
// GET  ?office=<id>   the office's agreement, officers and last 50 activity
//      records. Super admin, operations admin; the auditor reads.
// POST { action, ... }   super admin and operations admin only. Giving
//      someone access to citizens' complaints is a senior decision, so data
//      entry operators can't request it (least privilege, NIST AC-6). Logged.
//   agreement_save { officeId, signedOn, signedBy, documentRef, notes? }
//   agreement_end  { officeId, reason }            all officers lose access
//   officer_add    { officeId, name, designation, email }   needs an agreement
//   officer_remove { officerId, reason }           signed out at once
//   officer_leave  { officerId, kind: TRANSFER | LEFT, ... }   (grieviq-54)
//     TRANSFER { toOfficeId, designation?, email?, orderRef, reason? }
//              to another department office on GrievIQ (agreement in
//              force): the old record closes, a new one opens there, linked
//     LEFT     { reason }   transferred out, retired or left
//     The last officer of an office with an agreement needs either
//     successor { name, designation, email } or leaveEmpty: true
//     (fields.succ = REQUIRED otherwise). officer_remove is LEFT.

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import { officersReady, endOfficerSessions, EMAIL_RE, officerWelcomeEmail, sendEmailNow } from "../../_shared/dept-auth.js";
import { RULES_VERSION } from "../../_shared/dept-rules.js";
import { transfersReady, transferTargets, openCasesWithOffice, officerMovedEmail } from "../../_shared/transfers.js";

const json = (b, s) => Response.json(b, { status: s || 200, headers: { "Cache-Control": "no-store" } });
const NOT_SET_UP = { error: "The department dashboard isn't set up yet. Run the database update part25-department-officers.sql.", code: "NOT_SET_UP" };
function canManage(auth) { return (auth.roles || [auth.role]).some((r) => (PERMISSIONS.manage_dept_officers || []).includes(r)); }
const clean = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
function istToday() { return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); }
async function logAdmin(env, actor, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, target, JSON.stringify(detail || {})).run();
}
function shapeAgreement(a) {
  return a ? { signedOn: a.signed_on, signedBy: a.signed_by, documentRef: a.document_ref, notes: a.notes || "", recordedBy: a.recorded_by, recordedAt: a.recorded_at,
    updatedAt: a.updated_at, endedAt: a.ended_at || null, endedBy: a.ended_by || null, endReason: a.end_reason || null,
    // grieviq-37: the signed copy (its storage key is never sent).
    copy: a.copy_key ? { type: a.copy_type, size: a.copy_size, uploadedAt: a.copy_uploaded_at, uploadedBy: a.copy_uploaded_by } : null } : null;
}
function shapeOfficer(o, offices) {
  const on = (id) => { const x = id && offices ? offices[id] : null; return x ? { id: x.id, officeId: x.office_id, office: x.name_en, officeHi: x.name_hi || null } : null; };
  return { movedTo: on(o.moved_to), movedFrom: on(o.moved_from), orderRef: o.order_ref || null, id: o.id, name: o.name, designation: o.designation, email: o.email, status: o.status, addedBy: o.added_by, addedAt: o.added_at,
    removedBy: o.removed_by || null, removedAt: o.removed_at || null, removeReason: o.remove_reason || null, lastSignedIn: o.last_signed_in || null,
    rulesVersion: o.rules_version || null, rulesAcceptedAt: o.rules_accepted_at || null };
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_dept_officers");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await officersReady(env))) return json(Object.assign({ ready: false }, NOT_SET_UP), 503);
  const officeId = String(new URL(request.url).searchParams.get("office") || "");
  const office = await env.DB.prepare("SELECT d.id, d.name_en, d.name_hi, d.retired_at, d.address, d.area_id, ar.name AS area_name, ar.state AS area_state FROM dept_offices d LEFT JOIN areas ar ON ar.id = d.area_id WHERE d.id = ?").bind(officeId).first();
  if (!office) return json({ error: "NOT_FOUND" }, 404);
  const [a, os, log] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM dept_agreements WHERE office_id = ?").bind(officeId),
    env.DB.prepare("SELECT * FROM dept_officers WHERE office_id = ? ORDER BY status, name").bind(officeId),
    env.DB.prepare(`SELECT l.*, g.tracking_ref FROM dept_access_log l LEFT JOIN grievances g ON g.id = l.grievance_id
                    WHERE l.office_id = ? ORDER BY l.created_at DESC LIMIT 50`).bind(officeId),
  ]);
  const ready54 = await transfersReady(env);
  // grieviq-54: where a transferred officer went, or came from.
  const links = ready54 ? [].concat(...(os.results || []).map((o) => [o.moved_to, o.moved_from])).filter(Boolean) : [];
  const linked = {};
  if (links.length) {
    const { results } = await env.DB.prepare("SELECT o.id, o.office_id, d.name_en, d.name_hi FROM dept_officers o JOIN dept_offices d ON d.id = o.office_id WHERE o.id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(links)).all();
    for (const r of results || []) linked[r.id] = r;
  }
  const officers = (os.results || []).map((o) => shapeOfficer(o, linked));
  const nameOf = Object.fromEntries((os.results || []).map((o) => [o.id, o.name]));
  return json({
    ready: true, canManage: canManage(auth),
    office: { id: office.id, nameEn: office.name_en, nameHi: office.name_hi || null, retired: !!office.retired_at,
      address: office.address || null, areaId: office.area_id || null, areaName: office.area_name || null, state: office.area_state || null },
    rulesVersion: RULES_VERSION,
    agreement: shapeAgreement((a.results || [])[0]),
    officers,
    activity: (log.results || []).map((l) => {
      let d = null; try { d = l.detail ? JSON.parse(l.detail) : null; } catch (e) { d = null; }
      return { at: l.created_at, action: l.action, officer: nameOf[l.officer_id] || l.email || null, trackingRef: l.tracking_ref || null, kind: d && d.kind ? d.kind : null };
    }),
    today: istToday(),
    transfersReady: ready54,
    targets: ready54 && canManage(auth) ? await transferTargets(env, office.id) : [],
    waiting: await openCasesWithOffice(env, office.id),
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "manage_dept_officers");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await officersReady(env))) return json(NOT_SET_UP, 503);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const now = new Date().toISOString();
  const action = String(b.action || "");

  if (action === "agreement_save" || action === "agreement_end" || action === "officer_add") {
    const office = await env.DB.prepare("SELECT id, name_en, retired_at FROM dept_offices WHERE id = ?").bind(String(b.officeId || "")).first();
    if (!office) return json({ error: "NOT_FOUND" }, 404);
    const agr = await env.DB.prepare("SELECT * FROM dept_agreements WHERE office_id = ?").bind(office.id).first();
    const fields = {};

    if (action === "agreement_save") {
      if (office.retired_at) return json({ error: "This office is retired.", code: "RETIRED" }, 409);
      const signedOn = clean(b.signedOn), signedBy = clean(b.signedBy), documentRef = clean(b.documentRef), notes = clean(b.notes);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(signedOn) || isNaN(Date.parse(signedOn))) fields.signedOn = "FORMAT";
      else if (signedOn > istToday()) fields.signedOn = "FUTURE";
      if (signedBy.length < 3 || signedBy.length > 120) fields.signedBy = "LENGTH";
      if (documentRef.length < 3 || documentRef.length > 200) fields.documentRef = "LENGTH";
      if (notes.length > 500) fields.notes = "LENGTH";
      if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);
      if (agr) {
        await env.DB.prepare("UPDATE dept_agreements SET signed_on = ?, signed_by = ?, document_ref = ?, notes = ?, updated_at = ?, ended_at = NULL, ended_by = NULL, end_reason = NULL WHERE office_id = ?")
          .bind(signedOn, signedBy, documentRef, notes || null, now, office.id).run();
      } else {
        await env.DB.prepare("INSERT INTO dept_agreements (office_id, signed_on, signed_by, document_ref, notes, recorded_by, recorded_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(office.id, signedOn, signedBy, documentRef, notes || null, auth.email, now, now).run();
      }
      await logAdmin(env, auth.email, agr ? "dept_agreement_updated" : "dept_agreement_recorded", office.id, { office: office.name_en, signedOn, signedBy, documentRef, renewed: !!(agr && agr.ended_at) });
      return json({ ok: true });
    }

    if (action === "agreement_end") {
      if (!agr || agr.ended_at) return json({ error: "There is no agreement to end.", code: "NO_AGREEMENT" }, 409);
      const reason = clean(b.reason);
      if (reason.length < 10 || reason.length > 500) return json({ error: "Please give a reason.", fields: { reason: "SHORT" } }, 400);
      await env.DB.prepare("UPDATE dept_agreements SET ended_at = ?, ended_by = ?, end_reason = ?, updated_at = ? WHERE office_id = ?").bind(now, auth.email, reason, now, office.id).run();
      const ids = ((await env.DB.prepare("SELECT id FROM dept_officers WHERE office_id = ? AND status = 'ACTIVE'").bind(office.id).all()).results || []).map((r) => r.id);
      await endOfficerSessions(env, ids, "AGREEMENT_ENDED");
      await logAdmin(env, auth.email, "dept_agreement_ended", office.id, { office: office.name_en, reason, officers: ids.length });
      return json({ ok: true });
    }

    // officer_add
    if (office.retired_at) return json({ error: "This office is retired.", code: "RETIRED" }, 409);
    if (!agr || agr.ended_at) return json({ error: "Record the office's agreement first.", code: "NO_AGREEMENT" }, 409);
    const name = clean(b.name), designation = clean(b.designation), email = clean(b.email).toLowerCase();
    if (name.length < 2 || name.length > 80) fields.name = "LENGTH";
    if (designation.length < 2 || designation.length > 80) fields.designation = "LENGTH";
    if (!EMAIL_RE.test(email) || email.length > 200) fields.email = "FORMAT";
    if (!fields.email) {
      const other = await env.DB.prepare("SELECT o.office_id, d.name_en FROM dept_officers o JOIN dept_offices d ON d.id = o.office_id WHERE LOWER(o.email) = ? AND o.status = 'ACTIVE'").bind(email).first();
      if (other) fields.email = other.office_id === office.id ? "ALREADY_HERE" : "OTHER_OFFICE";
    }
    if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO dept_officers (id, office_id, email, name, designation, status, added_by, added_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)")
      .bind(id, office.id, email, name, designation, auth.email, now).run();
    await logAdmin(env, auth.email, "dept_officer_added", id, { office: office.name_en, name, designation, email });
    // grieviq-38: a welcome email with where to sign in.
    const w = officerWelcomeEmail(name, office.name_en, new URL(request.url).origin);
    const sent = await sendEmailNow(env, email, w.subject, w.html);
    return json({ ok: true, id, welcomed: sent });
  }

  if (action === "officer_remove" || action === "officer_leave") {
    const o = await env.DB.prepare("SELECT o.*, d.name_en, d.retired_at FROM dept_officers o JOIN dept_offices d ON d.id = o.office_id WHERE o.id = ?").bind(String(b.officerId || "")).first();
    if (!o) return json({ error: "NOT_FOUND" }, 404);
    if (o.status !== "ACTIVE") return json({ error: "Already removed.", code: "ALREADY" }, 409);
    const kind = action === "officer_remove" ? "LEFT" : String(b.kind || "");
    const fields = {};
    const ready54 = await transfersReady(env);
    let target = null, newEmail = o.email, newDesig = o.designation, orderRef = "", reason = clean(b.reason);
    if (kind === "TRANSFER") {
      if (!ready54) return json({ error: "Run the database update part37-transfers.sql first.", code: "NOT_SET_UP" }, 503);
      const to = String(b.toOfficeId || "");
      target = to ? await env.DB.prepare("SELECT d.id, d.name_en, d.retired_at, a.ended_at, a.office_id AS agr FROM dept_offices d LEFT JOIN dept_agreements a ON a.office_id = d.id WHERE d.id = ?").bind(to).first() : null;
      if (!target) fields.toOfficeId = "REQUIRED";
      else if (target.id === o.office_id) fields.toOfficeId = "SAME";
      else if (target.retired_at) fields.toOfficeId = "RETIRED";
      else if (!target.agr || target.ended_at) fields.toOfficeId = "NO_AGREEMENT";
      newDesig = clean(b.designation) || o.designation;
      if (newDesig.length < 2 || newDesig.length > 80) fields.designation = "LENGTH";
      newEmail = (clean(b.email) || o.email).toLowerCase();
      if (!EMAIL_RE.test(newEmail) || newEmail.length > 200) fields.email = "FORMAT";
      else {
        const other = await env.DB.prepare("SELECT id FROM dept_officers WHERE LOWER(email) = ? AND status = 'ACTIVE' AND id <> ?").bind(newEmail, o.id).first();
        if (other) fields.email = "OTHER_OFFICE";
      }
      orderRef = clean(b.orderRef);
      if (orderRef.length < 3 || orderRef.length > 120) fields.orderRef = "LENGTH";
      if (reason.length > 500) fields.reason = "LONG";
    } else if (kind === "LEFT") {
      if (reason.length < 10 || reason.length > 500) fields.reason = "SHORT";
    } else fields.kind = "REQUIRED";
    // The guard: never leave an office with an agreement with nobody by accident.
    const agr = await env.DB.prepare("SELECT ended_at FROM dept_agreements WHERE office_id = ?").bind(o.office_id).first();
    const others = await env.DB.prepare("SELECT COUNT(*) AS n FROM dept_officers WHERE office_id = ? AND status = 'ACTIVE' AND id <> ?").bind(o.office_id, o.id).first();
    const last = !o.retired_at && agr && !agr.ended_at && Number(others.n) === 0;
    let succ = null, leftEmpty = false;
    const sb = b.successor && typeof b.successor === "object" ? b.successor : null;
    if (last) {
      if (sb) {
        succ = { name: clean(sb.name), designation: clean(sb.designation), email: clean(sb.email).toLowerCase() };
        if (succ.name.length < 2 || succ.name.length > 80) fields.sName = "LENGTH";
        if (succ.designation.length < 2 || succ.designation.length > 80) fields.sDesignation = "LENGTH";
        if (!EMAIL_RE.test(succ.email) || succ.email.length > 200) fields.sEmail = "FORMAT";
        else if (succ.email === String(o.email).toLowerCase() || (kind === "TRANSFER" && succ.email === newEmail)) fields.sEmail = "SAME";
        else {
          const other = await env.DB.prepare("SELECT office_id FROM dept_officers WHERE LOWER(email) = ? AND status = 'ACTIVE'").bind(succ.email).first();
          if (other) fields.sEmail = other.office_id === o.office_id ? "ALREADY_HERE" : "OTHER_OFFICE";
        }
      } else if (b.leaveEmpty === true) leftEmpty = true;
      else fields.succ = "REQUIRED";
    }
    if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields, last, waiting: last ? await openCasesWithOffice(env, o.office_id) : 0 }, 400);

    const origin = new URL(request.url).origin;
    let newId = null;
    if (kind === "TRANSFER") {
      newId = crypto.randomUUID();
      const why = reason || "Transferred to " + target.name_en + " (order " + orderRef + ")";
      await env.DB.batch([
        env.DB.prepare("INSERT INTO dept_officers (id, office_id, email, name, designation, status, added_by, added_at, moved_from, rules_version, rules_accepted_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)")
          .bind(newId, target.id, newEmail, o.name, newDesig, auth.email, now, o.id, o.rules_version || null, o.rules_accepted_at || null),
        env.DB.prepare("UPDATE dept_officers SET status = 'REMOVED', removed_by = ?, removed_at = ?, remove_reason = ?, moved_to = ?, order_ref = ? WHERE id = ? AND status = 'ACTIVE'")
          .bind(auth.email, now, why, newId, orderRef, o.id),
      ]);
      await endOfficerSessions(env, [o.id], "TRANSFERRED");
      await logAdmin(env, auth.email, "dept_officer_transferred", o.id, { name: o.name, from: o.name_en, to: target.name_en, newId, orderRef, emailChanged: newEmail !== String(o.email).toLowerCase(), designation: newDesig });
      const m = officerMovedEmail(o.name, o.name_en, target.name_en, origin);
      await sendEmailNow(env, newEmail, m.subject, m.html);
    } else {
      await env.DB.prepare("UPDATE dept_officers SET status = 'REMOVED', removed_by = ?, removed_at = ?, remove_reason = ? WHERE id = ?").bind(auth.email, now, reason, o.id).run();
      await endOfficerSessions(env, [o.id], "REMOVED");
      await logAdmin(env, auth.email, "dept_officer_removed", o.id, { office: o.name_en, name: o.name, reason });
    }
    let successorId = null;
    if (succ) {
      successorId = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO dept_officers (id, office_id, email, name, designation, status, added_by, added_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)")
        .bind(successorId, o.office_id, succ.email, succ.name, succ.designation, auth.email, now).run();
      await logAdmin(env, auth.email, "dept_officer_added", successorId, { office: o.name_en, name: succ.name, designation: succ.designation, email: succ.email, successorOf: o.id });
      const w = officerWelcomeEmail(succ.name, o.name_en, origin);
      await sendEmailNow(env, succ.email, w.subject, w.html);
    }
    if (leftEmpty) await logAdmin(env, auth.email, "dept_office_left_empty", o.office_id, { office: o.name_en, lastOfficer: o.id, waiting: await openCasesWithOffice(env, o.office_id) });
    return json({ ok: true, id: newId, successorId, leftEmpty });
  }
  return json({ error: "Unknown action." }, 400);
}
