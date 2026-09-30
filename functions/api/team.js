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
// Everything is recorded in team_activity.

import { getVerifiedRep } from "../_shared/get-verified-rep.js";
import { ROLE, TEAM_ROLES, TEAM_LIMIT, parseOfficeKey, officeInfo, logTeam } from "../_shared/team.js";

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
  const roleEn = role === ROLE.OM ? "office manager" : "field worker";
  const roleHi = role === ROLE.OM ? "कार्यालय प्रबंधक" : "फ़ील्ड कर्मी";
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
  const [membersRes, activityRes] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM office_team WHERE office_tier = ? AND office_id = ? AND status = 'ACTIVE' ORDER BY role, member_name").bind(m.tier, m.id),
    env.DB.prepare(
      `SELECT ta.*, g.tracking_ref FROM team_activity ta LEFT JOIN grievances g ON g.id = ta.grievance_id
       WHERE ta.office_tier = ? AND ta.office_id = ? ORDER BY ta.created_at DESC LIMIT 100`
    ).bind(m.tier, m.id),
  ]);
  const repEmail = office ? office.repEmail : null;
  return new Response(JSON.stringify({
    office: { key: m.tier + ":" + m.id, name: m.name, label: m.label, repEmail },
    myRole: m.role,
    canManage: m.role === ROLE.REP,
    limit: TEAM_LIMIT,
    members: (membersRes.results || []).map((r) => ({
      id: r.id, email: r.member_email, name: r.member_name, role: r.role, addedBy: r.added_by, addedAt: r.added_at,
      paused: String(r.confirmed_by_rep_email || "").toLowerCase() !== String(repEmail || "").toLowerCase(),
    })),
    activity: (activityRes.results || []).map((a) => {
      let detail = null;
      try { detail = a.detail ? JSON.parse(a.detail) : null; } catch (e) { detail = null; }
      return { at: a.created_at, actor: a.actor_email, role: a.actor_role, onBehalfOf: a.on_behalf_of, action: a.action, trackingRef: a.tracking_ref || null, detail };
    }),
  }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch (e) { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const m = myOffice(auth, body.office);
  if (!m || m.role !== ROLE.REP) {
    return Response.json({ error: "Only the representative can manage the team.", code: "ROLE" }, { status: 403 });
  }
  const office = await officeInfo(env, m.tier, m.id);
  const now = new Date().toISOString();
  const log = (action, detail) => logTeam(env, { officeTier: m.tier, officeId: m.id, actor: auth.email, actorRole: ROLE.REP, onBehalf: auth.email, action, detail });
  const action = String(body.action || "");

  if (action === "add") {
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim().slice(0, 80);
    const role = String(body.role || "").toUpperCase();
    const fields = {};
    if (!EMAIL_RE.test(email) || email.length > 120) fields.email = "EMAIL";
    else if (email === auth.email) fields.email = "SELF";
    if (name.length < 2) fields.name = "NAME";
    if (!TEAM_ROLES.includes(role)) fields.role = "ROLE";
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
      `INSERT INTO office_team (id, office_tier, office_id, member_email, member_name, role, status, confirmed_by_rep_email, added_by, added_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`
    ).bind(id, m.tier, m.id, email, name, role, auth.email, auth.email, now, now).run();
    const emailed = await sendInvite(env, request, email, name, office || m, role, auth.email);
    await log("MEMBER_ADDED", { email, name, role, emailed });
    return Response.json({ ok: true, id, emailed });
  }

  const memberId = String(body.memberId || "");
  const member = await env.DB.prepare(
    "SELECT * FROM office_team WHERE id = ? AND office_tier = ? AND office_id = ? AND status = 'ACTIVE'"
  ).bind(memberId, m.tier, m.id).first();
  if (!member) return Response.json({ error: "This person isn't on the team any more. Refresh the page." }, { status: 404 });

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
    await env.DB.prepare("UPDATE office_team SET role = ?, updated_at = ? WHERE id = ?").bind(role, now, member.id).run();
    await log("ROLE_CHANGED", { email: member.member_email, name: member.member_name, from: member.role, to: role });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Unknown action." }, { status: 400 });
}
