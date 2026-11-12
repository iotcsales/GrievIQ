/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// /api/office-reply   (grieviq-88) -- the private reply link GrievIQ emails
// to an office that hasn't joined (GrievIQ-assisted wards).
//
// GET  ?t=<token>     the complaint: reference, type, ward, what the citizen
//                     wrote and where (any phone number or email in it is
//                     hidden), photos (15-minute links), earlier replies.
//                     Never the citizen's name, phone or email.
// POST { t, replyKind, text, expectedBy?, repliedBy }
//                     the office's reply, shown to the citizen and to
//                     GrievIQ staff. Up to 10 replies per link.
// The token is the only permission: 32 random bytes, only its SHA-256 hash
// is stored, 30 days, revoked when the office joins GrievIQ.

import { linkFor, loadSteps, addStep, REPLY_KINDS, TEXT_MIN, TEXT_MAX, LINK_MAX_REPLIES, istDay, validDay, daysBetween, isAssisted } from "../_shared/assisted.js";
import { complaintPhotoList, loadComplaintPhotos } from "../_shared/photo-store.js";
import { maskPersonal } from "../_shared/misuse.js";
import { emailCaseUpdate, queueEmail, flushOutbox } from "../_shared/notify.js";
import { checkDailyLimits } from "../_shared/daily-limit.js";

const HEAD = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" };
const json = (body, status) => Response.json(body, { status: status || 200, headers: HEAD });
const OPEN = ["OPEN", "ACKNOWLEDGED"];
const WHY = {
  NOT_FOUND: "This link isn't valid. Please check that the whole link was copied.",
  EXPIRED: "This link has expired. If you still want to reply, write to grievance@grieviq.in with the reference number.",
  REVOKED: "This link no longer works because your office now uses GrievIQ directly. Please sign in to your office's console.",
};

async function load(env, token) {
  const l = await linkFor(env, token, Date.now());
  if (!l.ok) return { error: json({ error: WHY[l.code] || WHY.NOT_FOUND, code: l.code }, l.code === "NOT_FOUND" ? 404 : 410) };
  const g = await env.DB.prepare(
    "SELECT g.*, c.name AS cat_name, lu.name AS ward_name FROM grievances g JOIN grievance_categories c ON c.id = g.category_id JOIN local_units lu ON lu.id = g.local_unit_id WHERE g.id = ?"
  ).bind(l.row.grievance_id).first();
  if (!g) return { error: json({ error: WHY.NOT_FOUND, code: "NOT_FOUND" }, 404) };
  return { link: l.row, g };
}

export async function onRequestGet({ request, env }) {
  const t = new URL(request.url).searchParams.get("t") || "";
  const { link, g, error } = await load(env, t);
  if (error) return error;
  const steps = (await loadSteps(env, [g.id])).get(g.id) || [];
  return json({
    to: link.target_name, target: link.target, expiresAt: link.expires_at, repliesLeft: Math.max(0, LINK_MAX_REPLIES - Number(link.replies || 0)),
    case: {
      ref: g.tracking_ref, category: g.cat_name, categoryId: g.category_id, ward: g.ward_name, createdAt: g.created_at,
      description: maskPersonal(g.description), locationDetail: g.location_detail ? maskPersonal(g.location_detail) : null,
      pin: g.pin_lat != null ? { lat: g.pin_lat, lng: g.pin_lng } : null,
      priority: !!(g.priority && !g.priority_off_at),
      open: OPEN.includes(g.status) && isAssisted(g), status: g.status,
      photos: (await complaintPhotoList(env, g, await loadComplaintPhotos(env, g.id))).filter((p) => p && p.url && !p.removed).map((p) => ({ url: p.url, thumbUrl: p.thumbUrl || p.url })),
    },
    // Replies from this office and what GrievIQ asked, no staff names.
    history: steps.filter((s) => s.target === link.target && ["FORWARD", "FOLLOWUP", "REPLY"].includes(s.kind)).map((s) => ({
      kind: s.kind, replyKind: s.reply_kind || null, text: s.kind === "REPLY" ? s.text : null, expectedBy: s.expected_by || null, at: s.created_at,
    })),
  });
}

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "Invalid request." }, 400); }
  const { link, g, error } = await load(env, String(b.t || ""));
  if (error) return error;
  if (!OPEN.includes(g.status) || !isAssisted(g)) return json({ error: "This complaint is closed, so replies can no longer be added here.", code: "CLOSED" }, 409);
  if (Number(link.replies || 0) >= LINK_MAX_REPLIES) return json({ error: "This link has taken its 10 replies. Please write to grievance@grieviq.in with the reference number.", code: "LIMIT" }, 429);
  const fields = {};
  const kind = String(b.replyKind || "").toUpperCase();
  if (!REPLY_KINDS.includes(kind)) fields.replyKind = "REQUIRED";
  const text = String(b.text || "").replace(/\s+/g, " ").trim();
  if (text.length < TEXT_MIN || text.length > TEXT_MAX) fields.text = "LENGTH";
  const who = String(b.repliedBy || "").replace(/\s+/g, " ").trim();
  if (who.length < 3 || who.length > 120) fields.repliedBy = "LENGTH";
  const exp = b.expectedBy ? String(b.expectedBy) : null;
  if (exp && (!validDay(exp) || exp < istDay() || daysBetween(istDay(), exp) > 365)) fields.expectedBy = "DATE";
  if (kind === "PLANNED" && !exp) fields.expectedBy = "REQUIRED";
  if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);
  // A link is for one office; still, at most 20 replies a day per link.
  try {
    const lim = await checkDailyLimits(env, [{ name: "office-reply", parts: ["office-reply", link.id], max: 20 }]);
    if (lim && lim.ok === false) return json({ error: "Too many replies today. Please try again tomorrow.", code: "LIMIT" }, 429);
  } catch (e) { /* limits are a guard, never a reason to lose a reply */ }
  const at = new Date().toISOString();
  await addStep(env, { grievanceId: g.id, kind: "REPLY", target: link.target, targetName: link.target_name, channel: "LINK", replyKind: kind, expectedBy: exp, text, repliedBy: who, at });
  await env.DB.prepare("UPDATE assisted_links SET replies = replies + 1 WHERE id = ?").bind(link.id).run();
  const origin = new URL(request.url).origin;
  await emailCaseUpdate(env, origin, g, "ASSISTED_REPLY", { wardName: g.ward_name, category: { id: g.category_id, name: g.cat_name }, toName: link.target_name,
    text: maskPersonal(text), expectedMs: exp ? Date.parse(exp + "T12:00:00+05:30") : null, stamp: at });
  // GrievIQ staff hear that a reply came (no details in the email).
  try {
    const roles = ["super_admin", "operations_admin", "support_executive"];
    const { results } = await env.DB.prepare(`SELECT LOWER(email) AS email FROM admin_users WHERE role IN (${roles.map(() => "?").join(",")}) AND COALESCE(status, 'PRESENT') <> 'LEFT'`).bind(...roles).all();
    for (const r of results || []) {
      await queueEmail(env, r.email, "ASSISTED_REPLY_IN", "ARI:" + link.id + ":" + at + ":" + r.email, "An office replied on an assisted case",
        `<p>An office has replied through its GrievIQ link on an assisted case.</p><p>Open Assisted cases in the admin panel to read it: <a href="${origin}/admin-assisted.html">${origin}/admin-assisted.html</a></p><p>This email has no details of the complaint.</p>`, null);
    }
    await flushOutbox(env, 10);
  } catch (e) { /* ignore */ }
  return json({ ok: true });
}
