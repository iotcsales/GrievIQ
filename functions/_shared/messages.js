// functions/_shared/messages.js
//
// Messages from GrievIQ to representatives' offices ("announcements"),
// with replies (approved Oct 2026).
//
// - GrievIQ (super admin or operations admin) writes one message to a
//   chosen group of offices: ward, mayor, MLA and/or MP offices, in all
//   live areas or one area.
// - Each office gets it under the bell (and on the phone / by backup email).
// - Each office's replies form a private conversation between that office
//   and GrievIQ: offices never see each other's replies.
// - Case work stays on the case (so its history stays complete); messages
//   are for general matters (training, new wards, changes to GrievIQ).

import { liveJoin, areasReady } from "./areas.js";
import { officeInfo, ROLE } from "./team.js";
import { officeRecipients, createNotices, KIND } from "./notify.js";

export const TIERS = ["LOCAL", "MAYOR", "MLA", "MP"];
export const TITLE_MAX = 120;
export const BODY_MAX = 2000;
export const REPLY_MAX = 2000;

// The offices a message goes to: every office (with a representative's
// email on file) at the chosen levels, above wards in live areas.
export async function audienceOffices(env, audience) {
  const tiers = (audience.tiers || []).filter((t) => TIERS.includes(t));
  const ready = await areasReady(env);
  const join = await liveJoin(env);
  const area = audience.area && ready ? String(audience.area) : null;
  const { results: units } = await env.DB.prepare(
    `SELECT lu.id, lu.name, lu.rep_email, lu.mla_constituency_id, lu.municipal_body_id FROM local_units lu ${join}${area ? " WHERE lu.area_id = ?" : ""}`
  ).bind(...(area ? [area] : [])).all();
  const offices = [];
  const list = units || [];
  if (tiers.includes("LOCAL")) {
    for (const u of list) if (String(u.rep_email || "").trim()) offices.push({ tier: "LOCAL", id: String(u.id), name: u.name, email: u.rep_email });
  }
  const ids = (k) => JSON.stringify(Array.from(new Set(list.map((u) => u[k]).filter(Boolean).map(String))));
  if (tiers.includes("MAYOR")) {
    const { results } = await env.DB.prepare("SELECT id, name, mayor_email AS email FROM municipal_bodies WHERE has_mayor = 1 AND COALESCE(TRIM(mayor_email), '') <> '' AND id IN (SELECT value FROM json_each(?))").bind(ids("municipal_body_id")).all();
    for (const r of results || []) offices.push({ tier: "MAYOR", id: String(r.id), name: r.name, email: r.email });
  }
  let mlaRows = [];
  if (tiers.includes("MLA") || tiers.includes("MP")) {
    mlaRows = (await env.DB.prepare("SELECT id, name, mla_email AS email, mp_constituency_id FROM mla_constituencies WHERE id IN (SELECT value FROM json_each(?))").bind(ids("mla_constituency_id")).all()).results || [];
  }
  if (tiers.includes("MLA")) {
    for (const r of mlaRows) if (String(r.email || "").trim()) offices.push({ tier: "MLA", id: String(r.id), name: r.name, email: r.email });
  }
  if (tiers.includes("MP")) {
    const mpIds = JSON.stringify(Array.from(new Set(mlaRows.map((r) => r.mp_constituency_id).filter(Boolean).map(String))));
    const { results } = await env.DB.prepare("SELECT id, name, mp_email AS email FROM mp_constituencies WHERE COALESCE(TRIM(mp_email), '') <> '' AND id IN (SELECT value FROM json_each(?))").bind(mpIds).all();
    for (const r of results || []) offices.push({ tier: "MP", id: String(r.id), name: r.name, email: r.email });
  }
  return offices;
}

// Sends a message: saves it and creates a notice for everyone in each office.
export async function sendAnnouncement(env, origin, actor, title, body, audience) {
  const offices = await audienceOffices(env, audience);
  if (!offices.length) return { ok: false, code: "NO_OFFICES" };
  const aid = crypto.randomUUID();
  const now = new Date().toISOString();
  let people = 0;
  const perOffice = [];
  for (const o of offices) {
    const r = await officeRecipients(env, o.tier, o.id, null, o.email);
    perOffice.push({ o, r });
    people += r.length;
  }
  await env.DB.prepare(
    "INSERT INTO announcements (id, title, body, audience, recipients, offices, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(aid, title, body, JSON.stringify({ tiers: audience.tiers, area: audience.area || null }), people, offices.length, actor, now).run();
  for (const { o, r } of perOffice) {
    await createNotices(env, origin, r, { kind: KIND.ANNOUNCEMENT, key: "ANN:" + aid + ":" + o.tier + ":" + o.id, officeTier: o.tier, officeId: o.id, data: { aid, title } });
  }
  return { ok: true, id: aid, offices: offices.length, people };
}

// The offices through which this person received a message, limited to
// offices where they still are the representative or office manager.
export async function myMessageOffices(env, auth, aid) {
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT office_tier, office_id FROM notifications WHERE recipient = ? AND kind IN ('ANNOUNCEMENT','REPLY') AND json_extract(data, '$.aid') = ?"
  ).bind(auth.email, String(aid)).all();
  const out = [];
  for (const r of results || []) {
    const m = (auth.mandates || []).find((x) => x.tier === r.office_tier && String(x.id) === String(r.office_id));
    if (!m) continue;
    const role = m.role || ROLE.REP;
    if (role !== ROLE.REP && role !== ROLE.OM && role !== ROLE.OA) continue;
    out.push({ tier: m.tier, id: String(m.id), name: m.name, label: m.label, canReply: role === ROLE.REP || role === ROLE.OM });
  }
  return out;
}

export async function threadReplies(env, aid, tier, id) {
  const { results } = await env.DB.prepare(
    "SELECT id, author_email, side, body, created_at, read_by_giq_at FROM announcement_replies WHERE announcement_id = ? AND office_tier = ? AND office_id = ? ORDER BY created_at ASC"
  ).bind(String(aid), tier, String(id)).all();
  return results || [];
}

// Everyone in an office who should hear about GrievIQ's reply.
export async function notifyReply(env, origin, aid, title, tier, id, replyId) {
  const info = await officeInfo(env, tier, id);
  const people = await officeRecipients(env, tier, id, null, info && info.repEmail);
  await createNotices(env, origin, people, { kind: KIND.REPLY, key: "RPL:" + replyId, officeTier: tier, officeId: id, data: { aid, title } });
}
