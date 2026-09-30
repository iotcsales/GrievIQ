// /api/team   (rep console, item 8b)
//
// The representative's team for one office. The office comes from our ward
// data: only its representative manages the team (NIST AC-2 account
// management); its office managers can see it.
//
// GET  ?office=<TIER:ID>  -> members (active; "paused" when confirmed by a
//                            previous representative), recent team activity,
//                            and what the caller may do.
// POST { action, office, ... }   (representative only)
//   add          { email, name, role }  up to TEAM_LIMIT; the new member is
//                                        emailed how to sign in
//   remove       { memberId }            takes effect on their next request;
//                                        their open assignments here end
//   confirm      { memberId }            confirms a paused member (after a
//                                        change of representative)
//   change_role  { memberId, role }
//   review       {}                      "the team is still correct" (item
//                                        8c-1, every TEAM_REVIEW_DAYS)
// POST (representative; office manager for field workers and assistants)
//   profile      { memberId, designation, designationOther, duties, wards,
//                  issueTypes, available }   item 8c-1 job profile. Narrowing
//                  the wards ends the member's assignments outside them.
// Everything is recorded in team_activity.

import { getVerifiedRep } from "../_shared/get-verified-rep.js";
import { officeUnitIds } from "../_shared/jurisdiction.js";
import {
  ROLE, TEAM_ROLES, TEAM_LIMIT, TEAM_REVIEW_DAYS, WORKLOAD_WARN, DESIGNATIONS, DUTIES_MAX, DESIGNATION_OTHER_MAX,
  parseOfficeKey, officeInfo, logTeam, jobProfile,
} from "../_shared/team.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function myOffice(auth, key) {
  const o = parseOfficeKey(key);
  if (!o) return null;
  return auth.mandates.find((m) => m.tier === o.tier && m.id === o.id) || null;
}

function escHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sendInvite(env, request, to, name, office, role, inviter) {
  if (!env.RESEND_API_KEY) return false;
  const url = new URL(request.url).origin + "/rep";
  const roleEn = role === ROLE.OM ? "office manager" : role === ROLE.OA ? "office assistant (view only)" : "field worker";
  const roleHi = role === ROLE.OM ? "कार्यालय प्रबंधक" : role === ROLE.OA ? "कार्यालय सहायक (केवल देखें)" : "फ़ील्ड कर्मी";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.OTP_FROM_EMAIL || "onboarding@resend.dev",
        to: [to],
        subject: `GrievIQ: you've been added to the team of ${office.label}, ${office.name}`,
        html: `<p>Hello ${escHtml(name)},</p>
          <p>${escHtml(inviter)} has added you as <strong>${roleEn}</strong> for <strong>${escHtml(office.label)}, ${escHtml(office.name)}</strong> on GrievIQ.</p>
          <p>To start, open <a href="${url}">${url}</a> and choose <strong>Sign in with Google</strong> with the Google account for this email address (${escHtml(to)}).</p>
          <hr><p>नमस्ते ${escHtml(name)},</p>
          <p>${escHtml(inviter)} ने आपको GrievIQ पर <strong>${escHtml(office.name)}</strong> के कार्यालय में <strong>${roleHi}</strong> के रूप में जोड़ा है।</p>
          <p>शुरू करने के लिए <a href="${url}">${url}</a> खोलें और इस ईमेल पते (${escHtml(to)}) वाले Google खाते से <strong>Google से साइन इन करें</strong> चुनें।</p>`,
      }),
    });
    return res.ok;
  } catch (e) { return false; }
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const m = myOffice(auth, new URL(request.url).searchParams.get("office"));
  if (!m || (m.role !== ROLE.REP && m.role !== ROLE.OM)) {
    return Response.json({ error: "You can't see this team.", code: "ROLE" }, { status: 403 });
  }
  const office = await officeInfo(env, m.tier, m.id);
  const [membersRes, activityRes, openRes, reviewRes, catRes] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM office_team WHERE office_tier = ? AND office_id = ? AND status = 'ACTIVE' ORDER BY role, member_name").bind(m.tier, m.id),
    env.DB.prepare(
      `SELECT ta.*, g.tracking_ref FROM team_activity ta LEFT JOIN grievances g ON g.id = ta.grievance_id
       WHERE ta.office_tier = ? AND ta.office_id = ? ORDER BY ta.created_at DESC LIMIT 100`
    ).bind(m.tier, m.id),
    // Item 8c-1: open jobs per member (assigned, case not yet fixed).
    env.DB.prepare(
      `SELECT ca.assignee_email AS email, COUNT(*) AS n FROM case_assignments ca JOIN grievances g ON g.id = ca.grievance_id
       WHERE ca.office_tier = ? AND ca.office_id = ? AND ca.ended_at IS NULL
         AND g.status NOT IN ('RESOLVED', 'CLOSED', 'PENDING_CONFIRMATION')
       GROUP BY ca.assignee_email`
    ).bind(m.tier, m.id),
    env.DB.prepare(
      "SELECT created_at, actor_email FROM team_activity WHERE office_tier = ? AND office_id = ? AND action = 'TEAM_REVIEWED' ORDER BY created_at DESC LIMIT 1"
    ).bind(m.tier, m.id),
    env.DB.prepare("SELECT id, name FROM grievance_categories ORDER BY name"),
  ]);
  const repEmail = office ? office.repEmail : null;
  const members = membersRes.results || [];
  const openBy = new Map((openRes.results || []).map((r) => [String(r.email).toLowerCase(), Number(r.n)]));
  const wards = await officeWards(env, m);

  // Team review (NIST AC-6(7)): due TEAM_REVIEW_DAYS after the last review,
  // or after the first member was added if never reviewed.
  const last = (reviewRes.results || [])[0] || null;
  const firstAdded = members.map((r) => r.added_at).sort()[0] || null;
  const base = last ? last.created_at : firstAdded;
  const dueAt = base ? new Date(new Date(base).getTime() + TEAM_REVIEW_DAYS * 86400000).toISOString() : null;

  return new Response(JSON.stringify({
    office: { key: m.tier + ":" + m.id, name: m.name, label: m.label, tier: m.tier, repEmail },
    myRole: m.role,
    myEmail: auth.email,
    canManage: m.role === ROLE.REP,
    // The representative edits every profile; an office manager those of
    // field workers and assistants (not other managers, not their own).
    canEditProfiles: m.role === ROLE.REP || m.role === ROLE.OM,
    limit: TEAM_LIMIT,
    workloadWarn: WORKLOAD_WARN,
    designations: DESIGNATIONS,
    dutiesMax: DUTIES_MAX,
    wards,
    issueTypes: (catRes.results || []).map((c) => ({ id: c.id, name: c.name })),
    review: {
      days: TEAM_REVIEW_DAYS,
      lastAt: last ? last.created_at : null,
      lastBy: last ? last.actor_email : null,
      dueAt,
      due: Boolean(members.length && dueAt && Date.now() >= new Date(dueAt).getTime()),
    },
    members: members.map((r) => ({
      id: r.id, email: r.member_email, name: r.member_name, role: r.role, addedBy: r.added_by, addedAt: r.added_at,
      paused: String(r.confirmed_by_rep_email || "").toLowerCase() !== String(repEmail || "").toLowerCase(),
      job: jobProfile(r),
      open: openBy.get(String(r.member_email).toLowerCase()) || 0,
      canEdit: m.role === ROLE.REP || (m.role === ROLE.OM && r.role !== ROLE.OM && String(r.member_email).toLowerCase() !== auth.email),
    })),
    activity: (activityRes.results || []).map((a) => {
      let detail = null;
      try { detail = a.detail ? JSON.parse(a.detail) : null; } catch (e) { detail = null; }
      return { at: a.created_at, actor: a.actor_email, role: a.actor_role, onBehalfOf: a.on_behalf_of, action: a.action, trackingRef: a.tracking_ref || null, detail };
    }),
  }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

// The office's wards, for choosing a member's wards: [{ id, name, group }]
// (group = the MLA constituency, for Mayor and MP offices).
async function officeWards(env, m) {
  const ids = await officeUnitIds(env, m);
  if (!ids.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT lu.id, lu.name, mla.name AS mla_name FROM local_units lu
     LEFT JOIN mla_constituencies mla ON mla.id = lu.mla_constituency_id
     WHERE lu.id IN (SELECT value FROM json_each(?)) ORDER BY mla.name, lu.name`
  ).bind(JSON.stringify(ids.map(String))).all();
  const grouped = m.tier === "MP" || m.tier === "MAYOR";
  return (results || []).map((r) => ({ id: String(r.id), name: r.name, group: grouped ? r.mla_name || null : null }));
}

// Checks a job profile. Returns { value } or { fields }.
async function readProfile(env, m, body) {
  const fields = {};
  const designation = body.designation ? String(body.designation).toUpperCase() : null;
  const designationOther = String(body.designationOther || "").trim();
  const duties = String(body.duties || "").trim();
  if (designation && !DESIGNATIONS.includes(designation)) fields.designation = "DESIGNATION";
  if (designation === "OTHER" && (designationOther.length < 2 || designationOther.length > DESIGNATION_OTHER_MAX)) fields.designationOther = "DESIGNATION_OTHER";
  if (duties.length > DUTIES_MAX) fields.duties = "DUTIES_LENGTH";

  let wards = null;
  if (body.wards != null) {
    if (!Array.isArray(body.wards)) fields.wards = "WARDS";
    else {
      const all = (await officeUnitIds(env, m)).map(String);
      wards = Array.from(new Set(body.wards.map(String)));
      if (!wards.length) fields.wards = "WARDS_NONE";
      else if (wards.some((w) => !all.includes(w))) fields.wards = "WARDS";
      else if (wards.length === all.length) wards = null; // every ward = all
    }
  }
  let issueTypes = [];
  if (body.issueTypes != null) {
    if (!Array.isArray(body.issueTypes)) fields.issueTypes = "ISSUE_TYPES";
    else {
      issueTypes = Array.from(new Set(body.issueTypes.map(String)));
      if (issueTypes.length) {
        const { results } = await env.DB.prepare("SELECT id FROM grievance_categories").all();
        const known = (results || []).map((r) => String(r.id));
        if (issueTypes.some((t) => !known.includes(t))) fields.issueTypes = "ISSUE_TYPES";
      }
    }
  }
  if (Object.keys(fields).length) return { fields };
  return { value: {
    designation, designationOther: designation === "OTHER" ? designationOther : null,
    duties: duties || null, wards, issueTypes, available: body.available === false ? 0 : 1,
  } };
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch (e) { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const m = myOffice(auth, body.office);
  const action = String(body.action || "");
  const profileByManager = action === "profile" && m && m.role === ROLE.OM;
  if (!m || (m.role !== ROLE.REP && !profileByManager)) {
    return Response.json({ error: "Only the representative can manage the team.", code: "ROLE" }, { status: 403 });
  }
  const office = await officeInfo(env, m.tier, m.id);
  const now = new Date().toISOString();
  const log = (action, detail) => logTeam(env, { officeTier: m.tier, officeId: m.id, actor: auth.email, actorRole: m.role,
    onBehalf: m.officeRepEmail || auth.email, action, detail });

  if (action === "review") {
    await log("TEAM_REVIEWED", null);
    return Response.json({ ok: true });
  }

  if (action === "add") {
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim().slice(0, 80);
    const role = String(body.role || "").toUpperCase();
    const fields = {};
    if (!EMAIL_RE.test(email) || email.length > 120) fields.email = "EMAIL";
    else if (email === auth.email) fields.email = "SELF";
    if (name.length < 2) fields.name = "NAME";
    if (!TEAM_ROLES.includes(role)) fields.role = "ROLE";
    const prof = await readProfile(env, m, { designation: body.designation, designationOther: body.designationOther });
    if (prof.fields) Object.assign(fields, prof.fields);
    if (Object.keys(fields).length) return Response.json({ error: "Please correct the highlighted fields.", fields }, { status: 400 });
    const { results } = await env.DB.prepare(
      "SELECT member_email FROM office_team WHERE office_tier = ? AND office_id = ? AND status = 'ACTIVE'"
    ).bind(m.tier, m.id).all();
    if ((results || []).some((r) => String(r.member_email).toLowerCase() === email)) {
      return Response.json({ error: "This person is already on the team.", fields: { email: "DUPLICATE" } }, { status: 409 });
    }
    if ((results || []).length >= TEAM_LIMIT) {
      return Response.json({ error: `A team can have up to ${TEAM_LIMIT} people.`, code: "LIMIT" }, { status: 409 });
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO office_team (id, office_tier, office_id, member_email, member_name, role, status, confirmed_by_rep_email, added_by, added_at, updated_at, designation, designation_other)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?)`
    ).bind(id, m.tier, m.id, email, name, role, auth.email, auth.email, now, now, prof.value.designation, prof.value.designationOther).run();
    const emailed = await sendInvite(env, request, email, name, office || m, role, auth.email);
    await log("MEMBER_ADDED", { email, name, role, emailed, designation: prof.value.designation, designationOther: prof.value.designationOther });
    return Response.json({ ok: true, id, emailed });
  }

  const memberId = String(body.memberId || "");
  const member = await env.DB.prepare(
    "SELECT * FROM office_team WHERE id = ? AND office_tier = ? AND office_id = ? AND status = 'ACTIVE'"
  ).bind(memberId, m.tier, m.id).first();
  if (!member) return Response.json({ error: "This person isn't on the team any more. Refresh the page." }, { status: 404 });

  if (action === "profile") {
    if (profileByManager && (member.role === ROLE.OM || String(member.member_email).toLowerCase() === auth.email)) {
      return Response.json({ error: "An office manager can change the job profile of field workers and assistants only.", code: "ROLE" }, { status: 403 });
    }
    const prof = await readProfile(env, m, body);
    if (prof.fields) return Response.json({ error: "Please correct the highlighted fields.", fields: prof.fields }, { status: 400 });
    const v = prof.value;
    const before = jobProfile(member);
    const stmts = [env.DB.prepare(
      `UPDATE office_team SET designation = ?, designation_other = ?, duties = ?, wards = ?, issue_types = ?, available = ?, updated_at = ? WHERE id = ?`
    ).bind(v.designation, v.designationOther, v.duties, v.wards ? JSON.stringify(v.wards) : null,
      v.issueTypes.length ? JSON.stringify(v.issueTypes) : null, v.available, now, member.id)];
    // Narrowed wards: the member's open jobs outside them go back to the office.
    let ended = [];
    if (v.wards) {
      const { results } = await env.DB.prepare(
        `SELECT ca.id, g.id AS gid, g.local_unit_id FROM case_assignments ca JOIN grievances g ON g.id = ca.grievance_id
         WHERE ca.assignee_email = ? AND ca.office_tier = ? AND ca.office_id = ? AND ca.ended_at IS NULL`
      ).bind(member.member_email, m.tier, m.id).all();
      ended = (results || []).filter((r) => !v.wards.includes(String(r.local_unit_id)));
      for (const r of ended) {
        stmts.push(env.DB.prepare("UPDATE case_assignments SET ended_at = ?, ended_by = ?, end_reason = 'OUT_OF_AREA' WHERE id = ? AND ended_at IS NULL").bind(now, auth.email, r.id));
      }
    }
    await env.DB.batch(stmts);
    const after = { designation: v.designation, designationOther: v.designationOther, duties: v.duties, wards: v.wards, issueTypes: v.issueTypes, available: v.available === 1 };
    await log("PROFILE_CHANGED", { email: member.member_email, name: member.member_name, before, after, endedAssignments: ended.length });
    for (const r of ended) {
      await logTeam(env, { officeTier: m.tier, officeId: m.id, actor: auth.email, actorRole: m.role, onBehalf: m.officeRepEmail || auth.email,
        action: "UNASSIGNED", grievanceId: r.gid, detail: { from: member.member_email, reason: "OUT_OF_AREA" } });
    }
    return Response.json({ ok: true, endedAssignments: ended.length });
  }

  if (action === "remove") {
    await env.DB.batch([
      env.DB.prepare("UPDATE office_team SET status = 'REMOVED', removed_by = ?, removed_at = ?, updated_at = ? WHERE id = ?").bind(auth.email, now, now, member.id),
      env.DB.prepare(
        `UPDATE case_assignments SET ended_at = ?, ended_by = ?, end_reason = 'MEMBER_REMOVED'
         WHERE assignee_email = ? AND office_tier = ? AND office_id = ? AND ended_at IS NULL`
      ).bind(now, auth.email, member.member_email, m.tier, m.id),
    ]);
    await log("MEMBER_REMOVED", { email: member.member_email, name: member.member_name, role: member.role });
    return Response.json({ ok: true });
  }
  if (action === "confirm") {
    await env.DB.prepare("UPDATE office_team SET confirmed_by_rep_email = ?, updated_at = ? WHERE id = ?").bind(auth.email, now, member.id).run();
    await log("MEMBER_CONFIRMED", { email: member.member_email, name: member.member_name, role: member.role });
    return Response.json({ ok: true });
  }
  if (action === "change_role") {
    const role = String(body.role || "").toUpperCase();
    if (!TEAM_ROLES.includes(role)) return Response.json({ error: "Choose a role.", fields: { role: "ROLE" } }, { status: 400 });
    const stmts = [env.DB.prepare("UPDATE office_team SET role = ?, updated_at = ? WHERE id = ?").bind(role, now, member.id)];
    // Item 8c-1: a view-only assistant can't hold jobs; theirs go back to the office.
    if (role === ROLE.OA) {
      stmts.push(env.DB.prepare(
        `UPDATE case_assignments SET ended_at = ?, ended_by = ?, end_reason = 'ROLE_CHANGED'
         WHERE assignee_email = ? AND office_tier = ? AND office_id = ? AND ended_at IS NULL`
      ).bind(now, auth.email, member.member_email, m.tier, m.id));
    }
    await env.DB.batch(stmts);
    await log("ROLE_CHANGED", { email: member.member_email, name: member.member_name, from: member.role, to: role });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unknown action." }, { status: 400 });
}
