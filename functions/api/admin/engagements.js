// /api/admin/engagements   (item 9b: audit engagements)
//
// An engagement is an audit of a period, e.g. "Q3 2026 complaint
// handling", with its objectives, scope and criteria (IIA Standards
// 13.1-13.6). Observations belong to it; its period report gives the
// overall conclusion (_shared/audit-reports.js).
//
// GET                 the list (auditor and super admin)
// GET ?id=<id>        one engagement, its observations, its reports, and the
//                     observations that aren't in any engagement yet
// POST { action }     auditor only
//   create / update   { title, objectives, scope, criteria, periodFrom, periodTo }
//                     (no changes once its period report has been issued)
//   link / unlink     { id, observationId }

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import { shapeObservation, todayIst } from "../../_shared/audit.js";
import { isDay, nextEngagementRef } from "../../_shared/audit-reports.js";

const can = (role, perm) => (PERMISSIONS[perm] || []).includes(role);
const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function shapeEng(e, reported) {
  return { id: e.id, ref: e.ref, title: e.title, objectives: e.objectives, scope: e.scope, criteria: e.criteria,
    periodFrom: e.period_from, periodTo: e.period_to, createdBy: e.created_by, createdAt: e.created_at, updatedAt: e.updated_at, reported: !!reported };
}
async function isReported(env, id) {
  return !!(await env.DB.prepare("SELECT 1 AS x FROM audit_reports WHERE engagement_id = ? AND kind = 'PERIOD' LIMIT 1").bind(id).first());
}
function readEng(body) {
  const s = (k) => String(body[k] == null ? "" : body[k]).trim();
  const v = { title: s("title"), objectives: s("objectives"), scope: s("scope"), criteria: s("criteria"), period_from: s("periodFrom"), period_to: s("periodTo") };
  const f = {};
  if (v.title.length < 5 || v.title.length > 160) f.title = "LENGTH";
  for (const k of ["objectives", "scope", "criteria"]) if (v[k].length > 4000) f[k] = "LENGTH";
  if (!isDay(v.period_from)) f.periodFrom = "DATE";
  if (!isDay(v.period_to)) f.periodTo = "DATE";
  if (!f.periodFrom && !f.periodTo && v.period_from > v.period_to) f.periodTo = "BEFORE_FROM";
  return Object.keys(f).length ? { fields: f } : { value: v };
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_all_observations");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const id = new URL(request.url).searchParams.get("id");
  const auditor = can(auth.role, "audit_observations");
  if (!id) {
    const { results } = await env.DB.prepare(
      `SELECT e.*, (SELECT COUNT(*) FROM observations o WHERE o.engagement_id = e.id AND o.status NOT IN ('WITHDRAWN')) AS n_obs,
              (SELECT COUNT(*) FROM audit_reports r WHERE r.engagement_id = e.id AND r.kind = 'PERIOD') AS n_period
       FROM audit_engagements e ORDER BY e.period_from DESC, e.created_at DESC`).all();
    return json({ role: auth.role, canEdit: auditor, engagements: (results || []).map((e) => Object.assign(shapeEng(e, e.n_period > 0), { observations: e.n_obs })) });
  }
  const e = await env.DB.prepare("SELECT * FROM audit_engagements WHERE id = ?").bind(id).first();
  if (!e) return json({ error: "Engagement not found." }, 404);
  const [obsRes, freeRes, repRes] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM observations WHERE engagement_id = ? ${auditor ? "" : "AND status NOT IN ('DRAFT', 'WITHDRAWN')"} ORDER BY ref`).bind(id),
    env.DB.prepare(`SELECT * FROM observations WHERE engagement_id IS NULL AND status <> 'WITHDRAWN' ORDER BY ref`),
    env.DB.prepare("SELECT id, ref, version, kind, title, issued_at, issued_by, supersedes_id FROM audit_reports WHERE engagement_id = ? ORDER BY issued_at DESC").bind(id),
  ]);
  const today = todayIst();
  const reported = (repRes.results || []).some((r) => r.kind === "PERIOD");
  return json({
    role: auth.role, canEdit: auditor && !reported, canLink: auditor && !reported, canReport: auditor,
    engagement: shapeEng(e, reported),
    observations: (obsRes.results || []).map((o) => shapeObservation(o, [], today)),
    unlinked: auditor && !reported ? (freeRes.results || []).map((o) => ({ id: o.id, ref: o.ref, title: o.title, status: o.status, rating: o.rating })) : [],
    reports: (repRes.results || []).map((r) => ({ id: r.id, ref: r.ref, version: r.version, kind: r.kind, title: r.title, issuedAt: r.issued_at, issuedBy: r.issued_by })),
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "audit_observations");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const action = String(body.action || "");
  const now = new Date().toISOString();
  const logAdmin = (act, target, detail) => env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), auth.email, act, target, JSON.stringify(Object.assign({ role: auth.role }, detail || {}))).run();

  if (action === "create") {
    const d = readEng(body);
    if (d.fields) return json({ error: "Please correct the highlighted fields.", fields: d.fields }, 400);
    const id = crypto.randomUUID(), ref = await nextEngagementRef(env), v = d.value;
    await env.DB.prepare(
      `INSERT INTO audit_engagements (id, ref, title, objectives, scope, criteria, period_from, period_to, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, ref, v.title, v.objectives || null, v.scope || null, v.criteria || null, v.period_from, v.period_to, auth.email, now, now).run();
    await logAdmin("audit_engagement_created", id, { ref, title: v.title });
    return json({ ok: true, id, ref });
  }

  const id = String(body.id || "");
  const e = await env.DB.prepare("SELECT * FROM audit_engagements WHERE id = ?").bind(id).first();
  if (!e) return json({ error: "Engagement not found." }, 404);
  if (await isReported(env, id)) return json({ error: "This engagement's report has been issued, so it can't be changed. Issue a corrected report instead.", code: "REPORTED" }, 409);

  if (action === "update") {
    const d = readEng(body);
    if (d.fields) return json({ error: "Please correct the highlighted fields.", fields: d.fields }, 400);
    const v = d.value;
    await env.DB.prepare("UPDATE audit_engagements SET title = ?, objectives = ?, scope = ?, criteria = ?, period_from = ?, period_to = ?, updated_at = ? WHERE id = ?")
      .bind(v.title, v.objectives || null, v.scope || null, v.criteria || null, v.period_from, v.period_to, now, id).run();
    await logAdmin("audit_engagement_updated", id, { ref: e.ref });
    return json({ ok: true });
  }
  if (action === "link" || action === "unlink") {
    const o = await env.DB.prepare("SELECT id, ref, engagement_id, status FROM observations WHERE id = ?").bind(String(body.observationId || "")).first();
    if (!o || o.status === "WITHDRAWN") return json({ error: "Observation not found." }, 404);
    if (action === "link" && o.engagement_id && o.engagement_id !== id) return json({ error: "That observation already belongs to another engagement.", code: "OTHER" }, 409);
    if (action === "unlink" && o.engagement_id !== id) return json({ error: "That observation isn't in this engagement." }, 409);
    await env.DB.prepare("UPDATE observations SET engagement_id = ?, updated_at = ? WHERE id = ?").bind(action === "link" ? id : null, now, o.id).run();
    await env.DB.prepare("INSERT INTO observation_events (id, observation_id, kind, actor_email, actor_role, text, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), o.id, action === "link" ? "ENGAGEMENT_LINKED" : "ENGAGEMENT_UNLINKED", auth.email, auth.role, null, JSON.stringify({ engagement: e.ref, title: e.title }), now).run();
    return json({ ok: true });
  }
  return json({ error: "Unknown action." }, 400);
}
