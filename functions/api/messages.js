// functions/api/messages.js
//
// A message from GrievIQ, as seen by a representative's office, with the
// office's private conversation with GrievIQ about it.
//
// GET  ?id=<message id>  -> { message, offices: [{ office, name, label, canReply, replies }] }
// POST { id, office: "TIER:id", body } -> adds the office's reply
//
// Only people who received the message, and are still the office's
// representative or office manager (office assistants read only), can
// open or answer it.

import { getVerifiedRep } from "../_shared/get-verified-rep.js";
import { myMessageOffices, threadReplies, REPLY_MAX } from "../_shared/messages.js";

function json(body, status) { return Response.json(body, { status: status || 200, headers: { "Cache-Control": "no-store" } }); }

async function load(env, auth, aid) {
  const msg = await env.DB.prepare("SELECT id, title, body, created_at FROM announcements WHERE id = ?").bind(String(aid || "")).first();
  if (!msg) return null;
  const offices = await myMessageOffices(env, auth, msg.id);
  if (!offices.length) return null;
  const out = [];
  for (const o of offices) {
    const replies = await threadReplies(env, msg.id, o.tier, o.id);
    out.push({
      office: o.tier + ":" + o.id, name: o.name, label: o.label, canReply: o.canReply,
      replies: replies.map((r) => ({ side: r.side, mine: r.author_email === auth.email, author: r.side === "GRIEVIQ" ? null : r.author_email, body: r.body, at: r.created_at })),
    });
  }
  return { message: { id: msg.id, title: msg.title, body: msg.body, at: msg.created_at }, offices: out };
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  try {
    const d = await load(env, auth, new URL(request.url).searchParams.get("id"));
    if (!d) return json({ error: "This message isn't available.", code: "NOT_FOUND" }, 404);
    await env.DB.prepare("UPDATE notifications SET read_at = ? WHERE recipient = ? AND read_at IS NULL AND kind IN ('ANNOUNCEMENT','REPLY') AND json_extract(data, '$.aid') = ?")
      .bind(new Date().toISOString(), auth.email, d.message.id).run();
    return json(d);
  } catch (e) {
    return json({ error: "This message isn't available.", code: "NOT_FOUND" }, 404);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedRep(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const text = String(body.body || "").trim();
  if (text.length < 2) return json({ error: "Write a reply first.", fields: { body: "REQUIRED" } }, 400);
  if (text.length > REPLY_MAX) return json({ error: "Keep the reply under " + REPLY_MAX + " characters.", fields: { body: "TOO_LONG" } }, 400);
  const msg = await env.DB.prepare("SELECT id FROM announcements WHERE id = ?").bind(String(body.id || "")).first();
  if (!msg) return json({ error: "This message isn't available.", code: "NOT_FOUND" }, 404);
  const offices = await myMessageOffices(env, auth, msg.id);
  const o = offices.find((x) => x.tier + ":" + x.id === String(body.office || ""));
  if (!o) return json({ error: "This message isn't available.", code: "NOT_FOUND" }, 404);
  if (!o.canReply) return json({ error: "Office assistants can read messages but not reply.", code: "ROLE" }, 403);
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO announcement_replies (id, announcement_id, office_tier, office_id, author_email, side, body, created_at) VALUES (?, ?, ?, ?, ?, 'OFFICE', ?, ?)"
  ).bind(crypto.randomUUID(), msg.id, o.tier, o.id, auth.email, text, now).run();
  return json(await load(env, auth, msg.id));
}
