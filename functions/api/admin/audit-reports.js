// /api/admin/audit-reports   (item 9b: frozen audit reports)
//
// GET                         every issued report (all staff may read them)
// GET ?id=<id>                one report: its frozen content, whether its
//                             SHA-256 fingerprint still matches, and its
//                             other versions
// GET ?preview=1&kind=...     what a report would contain now (auditor only):
//     kind=PERIOD&engagement=<id>&conclusion=&summary=
//     kind=FOLLOW_UP[&engagement=<id>]    kind=REGISTER
//     kind=ANALYTICS&from=YYYY-MM-DD&to=YYYY-MM-DD
// POST { action: "issue", kind, engagement?, from?, to?, conclusion?, summary? }
// POST { action: "correct", id, reason, conclusion?, summary? }
//     a new version built from today's data, superseding the latest one
// Issued reports can't be changed or deleted (part9b-reports.sql).

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import {
  KINDS, CONCLUSIONS, sha256Hex, isDay, buildPeriod, buildFollowUp, buildRegister, buildAnalytics, nextReportRef,
} from "../../_shared/audit-reports.js";
import { todayIst } from "../../_shared/audit.js";

const can = (role, perm) => [].concat(role).some((r) => (PERMISSIONS[perm] || []).includes(r));
const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const MAX_DAYS = 3 * 366;

// Checks the parameters and builds the content. Returns { content, title,
// engagement, from, to } or { fields } / { error, status }.
async function build(env, p) {
  const kind = String(p.kind || "").toUpperCase();
  if (!KINDS.includes(kind)) return { fields: { kind: "KIND" } };
  let eng = null;
  if (p.engagement) {
    eng = await env.DB.prepare("SELECT * FROM audit_engagements WHERE id = ?").bind(String(p.engagement)).first();
    if (!eng) return { fields: { engagement: "NOT_FOUND" } };
  }
  const today = todayIst();
  if (kind === "PERIOD") {
    const f = {};
    if (!eng) f.engagement = "REQUIRED";
    else {
      if (!eng.objectives || !eng.scope) f.engagement = "INCOMPLETE";
    }
    const conclusion = String(p.conclusion || "").toUpperCase();
    const summary = String(p.summary || "").trim();
    if (!CONCLUSIONS.includes(conclusion)) f.conclusion = "REQUIRED";
    if (summary.length < 20 || summary.length > 4000) f.summary = "LENGTH";
    if (Object.keys(f).length) return { fields: f };
    return { content: await buildPeriod(env, eng, { conclusion, summary }), title: "Audit report — " + eng.title, engagement: eng, from: eng.period_from, to: eng.period_to };
  }
  if (kind === "FOLLOW_UP") {
    return { content: await buildFollowUp(env, eng), title: "Follow-up report — " + (eng ? eng.title : "all observations") + " (as of " + today + ")", engagement: eng, from: null, to: today };
  }
  if (kind === "REGISTER") {
    return { content: await buildRegister(env), title: "Observation register (as of " + today + ")", engagement: null, from: null, to: today };
  }
  const from = String(p.from || ""), to = String(p.to || "");
  const f = {};
  if (!isDay(from)) f.from = "DATE";
  if (!isDay(to)) f.to = "DATE";
  if (!f.from && !f.to) {
    if (from > to) f.to = "BEFORE_FROM";
    else if (from > today) f.from = "FUTURE";
    else if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_DAYS) f.to = "TOO_LONG";
  }
  if (Object.keys(f).length) return { fields: f };
  return { content: await buildAnalytics(env, from, to), title: "Complaint handling analytics — " + from + " to " + to, engagement: null, from, to };
}

async function notifySuperAdmins(env, request, subject, line, id) {
  if (!env.RESEND_API_KEY) return;
  const { results } = await env.DB.prepare("SELECT email FROM admin_users WHERE role = 'super_admin'").all();
  const url = new URL(request.url).origin + "/admin-audit.html#report=" + encodeURIComponent(id);
  for (const r of results || []) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.OTP_FROM_EMAIL || "onboarding@resend.dev", to: [r.email], subject: "GrievIQ audit: " + subject,
          html: `<p>${String(line).replace(/</g, "&lt;")}</p><p><a href="${url}">${url}</a></p>` }),
      });
    } catch (e) { /* email never blocks issuing */ }
  }
}

function shapeRow(r, supersededBy) {
  return { id: r.id, ref: r.ref, version: r.version, kind: r.kind, title: r.title, engagementId: r.engagement_id, periodFrom: r.period_from, periodTo: r.period_to,
    issuedBy: r.issued_by, issuedAt: r.issued_at, correctionReason: r.correction_reason, supersedesId: r.supersedes_id, supersededBy: supersededBy || null, fingerprint: r.content_sha256 };
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const u = new URL(request.url);
  const auditor = can(auth.roles || auth.role, "audit_observations");

  if (u.searchParams.get("preview") === "1") {
    if (!auditor) return json({ error: "INSUFFICIENT_ROLE" }, 403);
    const b = await build(env, Object.fromEntries(u.searchParams.entries()));
    if (b.fields) return json({ error: "Please check the choices.", fields: b.fields }, 400);
    return json({ preview: true, title: b.title, content: b.content });
  }

  const id = u.searchParams.get("id");
  if (id) {
    const r = await env.DB.prepare("SELECT * FROM audit_reports WHERE id = ?").bind(id).first();
    if (!r) return json({ error: "Report not found." }, 404);
    const { results: family } = await env.DB.prepare("SELECT id, version, issued_at, supersedes_id, correction_reason FROM audit_reports WHERE ref = ? ORDER BY version ASC").bind(r.ref).all();
    const next = (family || []).find((x) => x.supersedes_id === r.id);
    const matches = (await sha256Hex(r.content)) === r.content_sha256;
    const latest = (family || []).slice(-1)[0];
    return json({
      role: auth.role, report: shapeRow(r, next ? next.id : null), content: JSON.parse(r.content), fingerprintMatches: matches,
      versions: (family || []).map((x) => ({ id: x.id, version: x.version, issuedAt: x.issued_at, correctionReason: x.correction_reason })),
      canCorrect: auditor && latest && latest.id === r.id,
    });
  }

  const { results } = await env.DB.prepare("SELECT * FROM audit_reports ORDER BY issued_at DESC").all();
  const rows = results || [];
  const nextOf = new Map(rows.filter((x) => x.supersedes_id).map((x) => [x.supersedes_id, x.id]));
  const { results: engs } = await env.DB.prepare("SELECT id, ref, title FROM audit_engagements ORDER BY period_from DESC").all();
  return json({ role: auth.role, canIssue: auditor, reports: rows.map((r) => shapeRow(r, nextOf.get(r.id))), engagements: auditor ? (engs || []) : [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "audit_observations");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid request body." }, 400); }
  const action = String(body.action || "");
  const now = new Date().toISOString();

  let params, prev = null, reason = null;
  if (action === "issue") {
    params = { kind: body.kind, engagement: body.engagement || null, from: body.from, to: body.to, conclusion: body.conclusion, summary: body.summary };
    if (String(body.kind || "").toUpperCase() === "PERIOD" && body.engagement) {
      const existing = await env.DB.prepare("SELECT 1 AS x FROM audit_reports WHERE engagement_id = ? AND kind = 'PERIOD' LIMIT 1").bind(String(body.engagement)).first();
      if (existing) return json({ error: "This engagement already has a report. To change it, issue a corrected version from that report.", code: "EXISTS" }, 409);
    }
  } else if (action === "correct") {
    prev = await env.DB.prepare("SELECT * FROM audit_reports WHERE id = ?").bind(String(body.id || "")).first();
    if (!prev) return json({ error: "Report not found." }, 404);
    const later = await env.DB.prepare("SELECT 1 AS x FROM audit_reports WHERE supersedes_id = ?").bind(prev.id).first();
    if (later) return json({ error: "A newer version already exists. Correct the latest version.", code: "NOT_LATEST" }, 409);
    reason = String(body.reason || "").trim();
    if (reason.length < 10 || reason.length > 1000) return json({ error: "Say what is being corrected and why (at least 10 characters).", fields: { reason: "LENGTH" } }, 400);
    const old = JSON.parse(prev.params || "{}");
    params = Object.assign({}, old, prev.kind === "PERIOD" ? { conclusion: body.conclusion || old.conclusion, summary: body.summary || old.summary } : {});
  } else {
    return json({ error: "Unknown action." }, 400);
  }

  const b = await build(env, params);
  if (b.fields) return json({ error: "Please check the choices.", fields: b.fields }, 400);
  const id = crypto.randomUUID();
  const ref = prev ? prev.ref : await nextReportRef(env);
  const version = prev ? prev.version + 1 : 1;
  const content = Object.assign({
    meta: { ref, version, title: b.title, kind: b.content.kind, issuedBy: auth.email, issuedAt: now, supersedes: prev ? { ref: prev.ref, version: prev.version } : null, correctionReason: reason },
  }, b.content);
  const text = JSON.stringify(content);
  const hash = await sha256Hex(text);
  await env.DB.prepare(
    `INSERT INTO audit_reports (id, ref, version, supersedes_id, kind, title, engagement_id, period_from, period_to, params, content, content_sha256, correction_reason, issued_by, issued_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, ref, version, prev ? prev.id : null, b.content.kind, b.title, b.engagement ? b.engagement.id : null, b.from, b.to,
    JSON.stringify(params), text, hash, reason, auth.email, now).run();
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), auth.email, prev ? "audit_report_corrected" : "audit_report_issued", id, JSON.stringify({ ref, version, kind: b.content.kind, fingerprint: hash, role: auth.role, reason })).run();
  await notifySuperAdmins(env, request, `${ref} v${version} — ${b.title}`, `${auth.email} has ${prev ? "issued a corrected version of" : "issued"} the audit report ${ref} (version ${version}): ${b.title}.`, id);
  return json({ ok: true, id, ref, version, fingerprint: hash });
}
