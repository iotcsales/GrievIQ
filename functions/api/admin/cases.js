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

import { getVerifiedAdmin } from "../../_shared/get-verified-admin.js";
import { resolveChain } from "../../_shared/jurisdiction.js";
import { computeEscalation } from "../../_shared/escalation.js";
import { findExceptionCases } from "../../_shared/exception-cases.js";

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

function parsePhotos(v) {
  if (!v) return [];
  try {
    const arr = JSON.parse(v);
    if (Array.isArray(arr)) return arr.filter((u) => typeof u === "string" && /^https:\/\//.test(u));
  } catch (e) { /* not JSON -- treat as a single URL */ }
  return /^https:\/\//.test(String(v)) ? [String(v)] : [];
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

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  return id ? caseDetail(env, auth, id) : caseList(env, auth);
}

async function caseList(env, auth) {
  const [casesRes, exceptionCases] = await Promise.all([
    env.DB.prepare(
      `SELECT g.id, g.tracking_ref, g.status, g.current_tier, g.created_at, g.resolved_at,
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
      ward: { id: g.local_unit_id, name: g.ward_name || "Unknown ward", type: g.unit_type },
      category: g.category_name || "",
      createdAt: g.created_at,
      daysOpen: daysBetween(g.created_at, finished ? g.resolved_at : null),
      flags: a ? a.flags : [],
      currentLevel: a ? a.currentTierLabel : null,
      storedTier: g.current_tier || null,
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
      photos: parsePhotos(g.photo_url),
      createdAt: g.created_at,
      acknowledgedAt: g.acknowledged_at || null,
      resolvedAt: g.resolved_at || null,
      citizenConfirmedAt: g.citizen_confirmed_at || null,
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
    viewedBy: auth.email,
    viewedAt: new Date().toISOString(),
  });
}
