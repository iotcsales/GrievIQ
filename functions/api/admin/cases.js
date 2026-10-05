// functions/api/admin/cases.js
//
// Read-only case access for admins. Gated behind view_cases
// (super_admin, operations_admin, auditor).
//
// GET /api/admin/cases           -> list of every case (no citizen contact)
// GET /api/admin/cases?id=<id>   -> one case in full, with the citizen's
//                                   phone and email MASKED for every role,
//                                   and the opening logged to admin_events
//                                   as case_viewed (DPDP Rules 2025, Rule
//                                   6(c): visibility on access to personal
//                                   data through logs).
//
// Nothing here changes a case. Nudging stays on the Exceptions page.
// "Needs attention" comes from _shared/exception-cases.js, the same rules
// as the Exceptions page and the dashboard.

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import { resolveChain } from "../../_shared/jurisdiction.js";
import { computeEscalation } from "../../_shared/escalation.js";
import { findExceptionCases } from "../../_shared/exception-cases.js";
import { settleOverdueConfirmations, resolutionKind, confirmDeadline, awaitingStaffCheck } from "../../_shared/confirmation.js";
import { loadResolution, shapeResolution, parseWard } from "../../_shared/resolution-evidence.js";
// Sept 2026: "Show full number" (reveal_citizen_phone: Super admin and
// Operations admin). Numbers stay partly hidden by default; a reveal needs a
// reason, shows the number for that one case, and is logged
// (admin_events "citizen_phone_revealed", source "cases").
import { photoMedia, complaintPhotoList, loadComplaintPhotos } from "../../_shared/photo-store.js";
import { reopenStatus, readReopenInput, reopenCase, loadReopen, shapeReopen, STAFF_REASON_MIN } from "../../_shared/reopen.js";

function toMs(s) {
  if (!s) return NaN;
  const str = String(s);
  return str.indexOf("T") !== -1 ? new Date(str).getTime() : new Date(str.replace(" ", "T") + "Z").getTime();
}

function daysBetween(fromStr, toStr) {
  const a = toMs(fromStr);
  const b = toStr ? toMs(toStr) : Date.now();
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round(((b - a) / 86400000) * 10) / 10;
}

function maskPhone(p) {
  const digits = String(p || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 4) return "****";
  return "******" + digits.slice(-4);
}

function maskEmail(e) {
  const s = String(e || "").trim();
  if (!s) return null;
  const at = s.indexOf("@");
  if (at < 1) return "***";
  return s[0] + "***" + s.slice(at);
}


async function logEvent(env, actorEmail, action, target, detail) {
  await env.DB.prepare(
    `INSERT INTO admin_events (id, actor_email, action, target, detail)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    actorEmail,
    action,
    target,
    detail == null ? null : JSON.stringify(detail)
  ).run();
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_cases");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // Close any case whose confirmation time has run out (item 7a).
  await settleOverdueConfirmations(env);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  return id ? caseDetail(env, auth, id) : caseList(env, auth);
}

async function caseList(env, auth) {
  const [casesRes, exceptionCases] = await Promise.all([
    env.DB.prepare(
      `SELECT g.id, g.tracking_ref, g.status, g.current_tier, g.created_at, g.resolved_at,
              g.citizen_confirmed, g.closure_kind, g.reopen_count,
              CASE WHEN COALESCE(TRIM(g.citizen_email), '') = '' THEN 0 ELSE 1 END AS has_email,
              g.local_unit_id, lu.name AS ward_name, lu.unit_type,
              c.name AS category_name
       FROM grievances g
       LEFT JOIN local_units lu ON lu.id = g.local_unit_id
       LEFT JOIN grievance_categories c ON c.id = g.category_id
       ORDER BY g.created_at DESC`
    ).all(),
    findExceptionCases(env),
  ]);

  const attention = new Map();
  for (const e of exceptionCases) {
    attention.set(e.id, { flags: e.flags, currentTierLabel: e.currentTierLabel, currentTierIndex: e.currentTierIndex, tierCount: e.tierCount });
  }

  const cases = casesRes.results.map((g) => {
    const a = attention.get(g.id);
    const finished = g.status === "RESOLVED" || g.status === "CLOSED";
    return {
      id: g.id,
      trackingRef: g.tracking_ref,
      status: g.status,
      // CONFIRMED / NOT_CONFIRMED / NO_EMAIL once resolved (item 7a). The
      // list never carries the email itself, only whether there was one.
      resolutionKind: resolutionKind({ status: g.status, citizen_confirmed: g.citizen_confirmed, closure_kind: g.closure_kind, citizen_email: g.has_email ? "yes" : null }),
      awaitingCheck: g.status === "PENDING_CONFIRMATION" && !g.has_email,
      confirmBy: g.status === "PENDING_CONFIRMATION" ? confirmDeadline(g.resolved_at) : null,
      ward: { id: g.local_unit_id, name: g.ward_name || "Unknown ward", type: g.unit_type },
      category: g.category_name || "",
      createdAt: g.created_at,
      daysOpen: daysBetween(g.created_at, finished ? g.resolved_at : null),
      flags: a ? a.flags : [],
      currentLevel: a ? a.currentTierLabel : null,
      storedTier: g.current_tier || null,
      // Item 7d: reopened after it closed.
      reopened: Number(g.reopen_count || 0) > 0,
    };
  });

  return Response.json({ role: auth.role, cases, generatedAt: new Date().toISOString() });
}

async function caseDetail(env, auth, id) {
  const g = await env.DB.prepare("SELECT * FROM grievances WHERE id = ?").bind(id).first();
  if (!g) {
    return Response.json({ error: "Case not found." }, { status: 404 });
  }

  const [chain, category, eventsRes, exceptionCases] = await Promise.all([
    resolveChain(env, g.local_unit_id),
    env.DB.prepare("SELECT * FROM grievance_categories WHERE id = ?").bind(g.category_id).first(),
    env.DB.prepare(
      `SELECT event_type, actor, reason, note, created_at
       FROM grievance_events WHERE grievance_id = ?
       ORDER BY created_at ASC, rowid ASC`
    ).bind(g.id).all(),
    findExceptionCases(env),
  ]);

  let level = null;
  if (chain && category) {
    const r = computeEscalation(g, category, chain.tiers);
    const reached = chain.tiers.slice(0, r.currentTierIndex + 1);
    level = {
      currentLabel: r.currentTier ? r.currentTier.label : null,
      index: r.currentTierIndex,
      count: chain.tiers.length,
      tiers: chain.tiers.map((t, i) => ({
        label: t.label,
        name: t.name || null,
        reached: i < reached.length,
      })),
    };
  }

  // Resolution report with every warning, including which other case a
  // reused photo came from (item 7b).
  const loaded = await loadResolution(env, g.id);
  // Every resolution report (a case can be marked resolved more than once),
  // so the history shows what the rep said each time.
  const { results: allReports } = await env.DB.prepare(
    "SELECT * FROM resolution_reports WHERE grievance_id = ? ORDER BY created_at ASC, rowid ASC"
  ).bind(g.id).all();
  const { results: allPhotos } = await env.DB.prepare(
    "SELECT * FROM resolution_photos WHERE grievance_id = ? AND report_id IS NOT NULL ORDER BY created_at ASC, rowid ASC"
  ).bind(g.id).all();
  const refs = new Map();
  for (const p of loaded.photos) {
    if (p.dup_grievance_id && !refs.has(p.dup_grievance_id)) {
      const o = await env.DB.prepare("SELECT tracking_ref FROM grievances WHERE id = ?").bind(p.dup_grievance_id).first();
      refs.set(p.dup_grievance_id, o ? o.tracking_ref : null);
    }
  }
  const resolution = loaded.report
    ? await shapeResolution(g, loaded.report, loaded.photos, "staff", (p) => photoMedia(env, p, "r"), (id) => refs.get(id), chain ? parseWard(chain.localUnit.ward_boundary_geojson) : null)
    : null;

  const wardGeom = chain ? parseWard(chain.localUnit.ward_boundary_geojson) : null;
  const reports = [];
  for (const rep of allReports || []) {
    reports.push(await shapeResolution(g, rep, (allPhotos || []).filter((p) => p.report_id === rep.id), "staff",
      (p) => photoMedia(env, p, "r"), (id) => refs.get(id), wardGeom));
  }

  const ex = exceptionCases.find((e) => e.id === g.id);
  const finished = g.status === "RESOLVED" || g.status === "CLOSED";

  // Access log -- written before the data is returned.
  await logEvent(env, auth.email, "case_viewed", g.id, { trackingRef: g.tracking_ref, role: auth.role });

  return Response.json({
    case: {
      id: g.id,
      trackingRef: g.tracking_ref,
      status: g.status,
      ward: chain ? { id: chain.localUnit.id, name: chain.localUnit.name, type: chain.localUnit.unit_type } : { id: g.local_unit_id, name: "Unknown ward", type: null },
      category: category ? category.name : "",
      description: g.description || "",
      locationDetail: g.location_detail || "",
      // Item 9d: when the citizen's details were removed under the retention policy.
      retentionRemovedAt: g.retention_removed_at || null,
      onHold: (g.photo_hold || 0) === 1,
      photos: await complaintPhotoList(env, g, await loadComplaintPhotos(env, g.id), true),
      createdAt: g.created_at,
      acknowledgedAt: g.acknowledged_at || null,
      resolvedAt: g.resolved_at || null,
      citizenConfirmedAt: g.citizen_confirmed_at || null,
      resolutionKind: resolutionKind(g),
      confirmBy: g.status === "PENDING_CONFIRMATION" ? confirmDeadline(g.resolved_at) : null,
      resolution,
      reports,
      awaitingCheck: awaitingStaffCheck(g),
      staffChecks: ((await env.DB.prepare(
        "SELECT method, outcome, note, checked_by, checked_at FROM resolution_checks WHERE grievance_id = ? ORDER BY checked_at ASC"
      ).bind(g.id).all()).results || []).map((k) => ({ method: k.method, outcome: k.outcome, note: k.note || null, by: k.checked_by, at: k.checked_at })),
      daysOpen: daysBetween(g.created_at, finished ? g.resolved_at : null),
      flags: ex ? ex.flags : [],
      level,
      citizen: {
        phone: maskPhone(g.citizen_phone),
        email: maskEmail(g.citizen_email),
      },
      events: eventsRes.results.map((e) => ({
        type: e.event_type,
        // Citizen events may record the citizen's own phone or email as the
        // actor, so they are always shown simply as "Citizen".
        actor: String(e.event_type || "").startsWith("CITIZEN_") ? "Citizen" : (e.actor || null),
        reason: e.reason || null,
        note: e.note || null,
        at: e.created_at,
      })),
    },
    role: auth.role,
    canReveal: (auth.roles || [auth.role]).some((r) => (PERMISSIONS.reveal_citizen_phone || []).includes(r)),
    // Item 7d: the reopening (if any), and whether staff may reopen for a
    // citizen with no email (once, within 30 days of closing).
    reopen: shapeReopen(await loadReopen(env, g.id), "staff"),
    // Item 8b: assignments made by the representative's team for this case.
    teamActivity: ((await env.DB.prepare("SELECT actor_email, actor_role, on_behalf_of, action, detail, created_at FROM team_activity WHERE grievance_id = ? AND action IN ('ASSIGNED', 'UNASSIGNED') ORDER BY created_at ASC").bind(g.id).all().catch(() => ({ results: [] }))).results || []).map((t) => {
      let detail = null;
      try { detail = t.detail ? JSON.parse(t.detail) : null; } catch (e) { detail = null; }
      return { at: t.created_at, by: t.actor_email, role: t.actor_role, onBehalfOf: t.on_behalf_of, action: t.action, detail };
    }),
    reopens: ((await env.DB.prepare("SELECT * FROM grievance_reopens WHERE grievance_id = ? ORDER BY reopened_at ASC, rowid ASC").bind(g.id).all()).results || []).map((r) => shapeReopen(r, "staff")),
    reopenStatus: (({ can, code, until }) => ({ can, code, until }))(reopenStatus(g)),
    canStaffReopen: (auth.roles || [auth.role]).some((r) => (PERMISSIONS.reopen_cases || []).includes(r)) && !String(g.citizen_email || "").trim() && reopenStatus(g).can,
    viewedBy: auth.email,
    viewedAt: new Date().toISOString(),
  });
}

// POST { action: "reveal_phone", id, reason } -- Super admin / Operations
// admin only. Any case. Reason (10+ characters) required; logged.
// POST { action: "reopen", id, reason, note, staffReason } -- item 7d.
// Super admin / Operations admin, for a citizen who gave no email only;
// same rules as the citizen's own reopening; logged.
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const action = String(body.action || "");
  if (action === "reopen") return staffReopen(request, env, body);
  const auth = await getVerifiedAdmin(request, env, "reveal_citizen_phone");
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }
  if (action !== "reveal_phone") {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }
  const reason = String(body.reason || "").trim().slice(0, 300);
  if (reason.length < 10) {
    return Response.json({ error: "Give a reason of at least 10 characters.", fields: { reason: "REASON_LENGTH" } }, { status: 400 });
  }
  const g = await env.DB.prepare("SELECT id, tracking_ref, citizen_phone FROM grievances WHERE id = ?").bind(String(body.id || "")).first();
  if (!g) return Response.json({ error: "Case not found." }, { status: 404 });
  await logEvent(env, auth.email, "citizen_phone_revealed", g.id, { trackingRef: g.tracking_ref, reason, role: auth.role, source: "cases" });
  return new Response(JSON.stringify({ phone: String(g.citizen_phone || "") }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function staffReopen(request, env, body) {
  const auth = await getVerifiedAdmin(request, env, "reopen_cases");
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  await settleOverdueConfirmations(env);

  const input = readReopenInput(body.reason, body.note);
  const staffReason = String(body.staffReason || "").trim().slice(0, 300);
  const fields = Object.assign({}, input.fields || {});
  if (staffReason.length < STAFF_REASON_MIN) fields.staffReason = "REASON_LENGTH";
  if (Object.keys(fields).length) return Response.json({ error: "Please correct the highlighted fields.", fields }, { status: 400 });

  const g = await env.DB.prepare("SELECT * FROM grievances WHERE id = ?").bind(String(body.id || "")).first();
  if (!g) return Response.json({ error: "Case not found." }, { status: 404 });
  if (String(g.citizen_email || "").trim()) {
    return Response.json({ error: "This citizen gave an email, so they can reopen the case themselves from the status page.", code: "HAS_EMAIL" }, { status: 409 });
  }
  const st = reopenStatus(g);
  if (!st.can) {
    const msg = st.code === "ALREADY_REOPENED" ? "This case has already been reopened once."
      : st.code === "TOO_LATE" ? "The 30 days to reopen this case have passed." : "This case isn't closed.";
    return Response.json({ error: msg, code: st.code }, { status: 409 });
  }
  const chain = await resolveChain(env, g.local_unit_id);
  if (!chain) return Response.json({ error: "Could not find who handles this area." }, { status: 500 });
  const done = await reopenCase(env, g, chain, input, { actor: "staff", staffEmail: auth.email, staffReason });
  if (!done.ok) return Response.json({ error: "This case can't be reopened now. Refresh the page.", code: done.code }, { status: 409 });
  await logEvent(env, auth.email, "case_reopened_for_citizen", g.id, { trackingRef: g.tracking_ref, reason: input.reason, staffReason, fromTier: done.fromTier, toTier: done.toTier, role: auth.role });
  return Response.json({ ok: true, toTier: done.toTier, toLabel: done.toLabel, atTop: done.atTop });
}
