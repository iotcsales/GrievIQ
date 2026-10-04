// functions/api/admin/messages.js
//
// Messages page (admin): send a message to representatives' offices and
// answer each office's replies. Super admin and operations admin send and
// reply; the auditor reads (independent oversight). Every message and
// reply is recorded in the audit log (admin_events).
//
// GET                -> { messages: [...], canSend, areas }
// GET ?id=<id>       -> { message, threads: [{ office, name, label, replies, unread }] }
// POST { action: "preview", tiers, area }       -> { offices, people }
// POST { action: "send", title, body, tiers, area }
// POST { action: "reply", id, office, body }
// POST { action: "read", id, office }

import { getVerifiedAdmin, allows } from "../../_shared/get-verified-admin.js";
import { audienceOffices, sendAnnouncement, threadReplies, notifyReply, TIERS, TITLE_MAX, BODY_MAX, REPLY_MAX } from "../../_shared/messages.js";
import { officeRecipients, deliveryHealth } from "../../_shared/notify.js";
import { officeInfo } from "../../_shared/team.js";
import { areasReady } from "../../_shared/areas.js";

function json(body, status) { return Response.json(body, { status: status || 200, headers: { "Cache-Control": "no-store" } }); }

async function logEvent(env, actor, action, target, detail) {
  try {
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), actor, action, target, detail == null ? null : JSON.stringify(detail)).run();
  } catch (e) { /* the audit log is required; a failure here is surfaced by the caller's tests */ }
}

async function liveAreas(env) {
  if (!(await areasReady(env))) return [];
  return (await env.DB.prepare("SELECT id, name FROM areas WHERE live = 1 ORDER BY name").all()).results || [];
}

function readAudience(body) {
  const tiers = (Array.isArray(body.tiers) ? body.tiers : []).map(String).filter((t) => TIERS.includes(t));
  return { tiers: Array.from(new Set(tiers)), area: body.area ? String(body.area).slice(0, 80) : null };
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_messages");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const id = new URL(request.url).searchParams.get("id");
  try {
    if (id) {
      const msg = await env.DB.prepare("SELECT * FROM announcements WHERE id = ?").bind(String(id)).first();
      if (!msg) return json({ error: "Message not found." }, 404);
      const { results } = await env.DB.prepare(
        "SELECT office_tier, office_id, MAX(created_at) AS last_at, SUM(CASE WHEN side = 'OFFICE' AND read_by_giq_at IS NULL THEN 1 ELSE 0 END) AS unread FROM announcement_replies WHERE announcement_id = ? GROUP BY office_tier, office_id ORDER BY last_at DESC"
      ).bind(msg.id).all();
      const threads = [];
      for (const t of results || []) {
        const info = await officeInfo(env, t.office_tier, t.office_id);
        const replies = await threadReplies(env, msg.id, t.office_tier, t.office_id);
        threads.push({ office: t.office_tier + ":" + t.office_id, name: info ? info.name : t.office_id, label: info ? info.label : t.office_tier, unread: t.unread || 0,
          replies: replies.map((r) => ({ side: r.side, author: r.author_email, body: r.body, at: r.created_at })) });
      }
      let audience = {};
      try { audience = JSON.parse(msg.audience || "{}"); } catch (e) { audience = {}; }
      return json({ message: { id: msg.id, title: msg.title, body: msg.body, audience, recipients: msg.recipients, offices: msg.offices, by: msg.created_by, at: msg.created_at },
        threads, canSend: allows(auth, "send_messages") });
    }
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.title, a.audience, a.recipients, a.offices, a.created_by, a.created_at,
              (SELECT COUNT(*) FROM announcement_replies r WHERE r.announcement_id = a.id AND r.side = 'OFFICE') AS replies,
              (SELECT COUNT(*) FROM announcement_replies r WHERE r.announcement_id = a.id AND r.side = 'OFFICE' AND r.read_by_giq_at IS NULL) AS unread
       FROM announcements a ORDER BY a.created_at DESC LIMIT 100`
    ).all();
    return json({
      messages: (results || []).map((m) => { let au = {}; try { au = JSON.parse(m.audience || "{}"); } catch (e) { au = {}; } return { id: m.id, title: m.title, audience: au, recipients: m.recipients, offices: m.offices, by: m.created_by, at: m.created_at, replies: m.replies || 0, unread: m.unread || 0 }; }),
      canSend: allows(auth, "send_messages"),
      areas: await liveAreas(env),
      limits: { title: TITLE_MAX, body: BODY_MAX, reply: REPLY_MAX },
      delivery: await deliveryHealth(env),
    });
  } catch (e) {
    return json({ messages: [], canSend: false, areas: [], notReady: true });
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.clone().json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const auth = await getVerifiedAdmin(request, env, body.action === "read" ? "view_messages" : "send_messages");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const origin = env.SITE_ORIGIN || new URL(request.url).origin;

  if (body.action === "preview" || body.action === "send") {
    const audience = readAudience(body);
    const fields = {};
    if (!audience.tiers.length) fields.tiers = "REQUIRED";
    if (audience.area) {
      const areas = await liveAreas(env);
      if (!areas.some((a) => a.id === audience.area)) fields.area = "NOT_LIVE";
    }
    if (body.action === "preview") {
      if (Object.keys(fields).length) return json({ error: "Choose who to send it to.", fields }, 400);
      const offices = await audienceOffices(env, audience);
      let people = 0;
      for (const o of offices) people += (await officeRecipients(env, o.tier, o.id, null, o.email)).length;
      return json({ offices: offices.length, people });
    }
    const title = String(body.title || "").trim();
    const text = String(body.body || "").trim();
    if (title.length < 3) fields.title = "REQUIRED"; else if (title.length > TITLE_MAX) fields.title = "TOO_LONG";
    if (text.length < 3) fields.body = "REQUIRED"; else if (text.length > BODY_MAX) fields.body = "TOO_LONG";
    if (Object.keys(fields).length) return json({ error: "Please fix the marked fields.", fields }, 400);
    const r = await sendAnnouncement(env, origin, auth.email, title, text, audience);
    if (!r.ok) return json({ error: "No office matches this choice yet (offices need a representative's email on file).", code: r.code, fields: { tiers: "NO_OFFICES" } }, 400);
    await logEvent(env, auth.email, "message_sent", r.id, { title, tiers: audience.tiers, area: audience.area, offices: r.offices, people: r.people });
    return json({ ok: true, id: r.id, offices: r.offices, people: r.people });
  }

  const msg = await env.DB.prepare("SELECT id, title FROM announcements WHERE id = ?").bind(String(body.id || "")).first();
  if (!msg) return json({ error: "Message not found." }, 404);
  const office = String(body.office || "");
  const i = office.indexOf(":");
  const tier = office.slice(0, i), oid = office.slice(i + 1);
  if (i < 1 || !TIERS.includes(tier) || !oid) return json({ error: "Choose an office." }, 400);
  const started = await env.DB.prepare("SELECT 1 AS x FROM announcement_replies WHERE announcement_id = ? AND office_tier = ? AND office_id = ? LIMIT 1").bind(msg.id, tier, oid).first();
  if (!started) return json({ error: "This office hasn't replied to this message." }, 404);
  const now = new Date().toISOString();

  if (body.action === "read") {
    if (!(allows(auth, "send_messages"))) return json({ ok: true });     // the auditor's reading doesn't mark replies as handled
    await env.DB.prepare("UPDATE announcement_replies SET read_by_giq_at = ? WHERE announcement_id = ? AND office_tier = ? AND office_id = ? AND side = 'OFFICE' AND read_by_giq_at IS NULL").bind(now, msg.id, tier, oid).run();
    return json({ ok: true });
  }

  if (body.action === "reply") {
    const text = String(body.body || "").trim();
    if (text.length < 2) return json({ error: "Write a reply first.", fields: { body: "REQUIRED" } }, 400);
    if (text.length > REPLY_MAX) return json({ error: "Keep the reply under " + REPLY_MAX + " characters.", fields: { body: "TOO_LONG" } }, 400);
    const replyId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO announcement_replies (id, announcement_id, office_tier, office_id, author_email, side, body, created_at, read_by_giq_at) VALUES (?, ?, ?, ?, ?, 'GRIEVIQ', ?, ?, ?)")
        .bind(replyId, msg.id, tier, oid, auth.email, text, now, now),
      env.DB.prepare("UPDATE announcement_replies SET read_by_giq_at = ? WHERE announcement_id = ? AND office_tier = ? AND office_id = ? AND side = 'OFFICE' AND read_by_giq_at IS NULL").bind(now, msg.id, tier, oid),
    ]);
    await notifyReply(env, origin, msg.id, msg.title, tier, oid, replyId);
    await logEvent(env, auth.email, "message_reply", msg.id, { office, length: text.length });
    return json({ ok: true });
  }
  return json({ error: "Unknown action." }, 400);
}
