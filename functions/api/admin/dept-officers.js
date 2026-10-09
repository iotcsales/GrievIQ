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

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import { officersReady, endOfficerSessions, EMAIL_RE } from "../../_shared/dept-auth.js";

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
    updatedAt: a.updated_at, endedAt: a.ended_at || null, endedBy: a.ended_by || null, endReason: a.end_reason || null } : null;
}
function shapeOfficer(o) {
  return { id: o.id, name: o.name, designation: o.designation, email: o.email, status: o.status, addedBy: o.added_by, addedAt: o.added_at,
    removedBy: o.removed_by || null, removedAt: o.removed_at || null, removeReason: o.remove_reason || null, lastSignedIn: o.last_signed_in || null };
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_dept_officers");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await officersReady(env))) return json(Object.assign({ ready: false }, NOT_SET_UP), 503);
  const officeId = String(new URL(request.url).searchParams.get("office") || "");
  const office = await env.DB.prepare("SELECT id, name_en, name_hi, retired_at FROM dept_offices WHERE id = ?").bind(officeId).first();
  if (!office) return json({ error: "NOT_FOUND" }, 404);
  const [a, os, log] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM dept_agreements WHERE office_id = ?").bind(officeId),
    env.DB.prepare("SELECT * FROM dept_officers WHERE office_id = ? ORDER BY status, name").bind(officeId),
    env.DB.prepare(`SELECT l.*, g.tracking_ref FROM dept_access_log l LEFT JOIN grievances g ON g.id = l.grievance_id
                    WHERE l.office_id = ? ORDER BY l.created_at DESC LIMIT 50`).bind(officeId),
  ]);
  const officers = (os.results || []).map(shapeOfficer);
  const nameOf = Object.fromEntries((os.results || []).map((o) => [o.id, o.name]));
  return json({
    ready: true, canManage: canManage(auth),
    office: { id: office.id, nameEn: office.name_en, nameHi: office.name_hi || null, retired: !!office.retired_at },
    agreement: shapeAgreement((a.results || [])[0]),
    officers,
    activity: (log.results || []).map((l) => {
      let d = null; try { d = l.detail ? JSON.parse(l.detail) : null; } catch (e) { d = null; }
      return { at: l.created_at, action: l.action, officer: nameOf[l.officer_id] || l.email || null, trackingRef: l.tracking_ref || null, kind: d && d.kind ? d.kind : null };
    }),
    today: istToday(),
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
    return json({ ok: true, id });
  }

  if (action === "officer_remove") {
    const o = await env.DB.prepare("SELECT o.*, d.name_en FROM dept_officers o JOIN dept_offices d ON d.id = o.office_id WHERE o.id = ?").bind(String(b.officerId || "")).first();
    if (!o) return json({ error: "NOT_FOUND" }, 404);
    if (o.status !== "ACTIVE") return json({ error: "Already removed.", code: "ALREADY" }, 409);
    const reason = clean(b.reason);
    if (reason.length < 10 || reason.length > 500) return json({ error: "Please give a reason.", fields: { reason: "SHORT" } }, 400);
    await env.DB.prepare("UPDATE dept_officers SET status = 'REMOVED', removed_by = ?, removed_at = ?, remove_reason = ? WHERE id = ?").bind(auth.email, now, reason, o.id).run();
    await endOfficerSessions(env, [o.id], "REMOVED");
    await logAdmin(env, auth.email, "dept_officer_removed", o.id, { office: o.name_en, name: o.name, reason });
    return json({ ok: true });
  }
  return json({ error: "Unknown action." }, 400);
}
