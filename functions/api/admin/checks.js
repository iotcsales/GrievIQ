// functions/api/admin/checks.js
//
// GrievIQ staff check a fix when the citizen gave no email (item 7b-2).
// A case marked resolved by a representative, whose citizen can't be asked
// by email, waits here (PENDING_CONFIRMATION, escalation paused) for up to
// CONFIRM_DAYS. If nobody checks in time it closes as "not verified".
//
// GET  (view_checks)        -> cases waiting, oldest first, with the rep's
//                              note, before/after photos and all warnings;
//                              plus the latest decisions.
// POST (check_resolutions)  -> { action, grievanceId, method, note }
//   action "verify"     fixed, by PHOTO or PHONE -> closes as
//                        "Resolved - checked by GrievIQ"
//   action "not_fixed"  note required -> reopens the case; all time since
//                        filing counts (same as a citizen dispute); the rep
//                        sees the note
//   action "cant_tell"  photos don't show it -> stays waiting (call instead)
//   action "no_answer"  phone call not answered -> stays waiting
// POST (reveal_citizen_phone) -> { action: "reveal_phone", grievanceId, reason }
//   Returns the citizen's full number for this one case, only while it is
//   waiting for a check. The reason is required and every reveal is logged
//   (admin_events "citizen_phone_revealed"), NIST AC-6 / AU-2.
//
// Separation of duties: nobody checks a case in a ward where they are one of
// the representatives, or a case they marked resolved themselves.

import { getVerifiedAdmin, PERMISSIONS } from "../../_shared/get-verified-admin.js";
import { resolveChain } from "../../_shared/jurisdiction.js";
import { settleOverdueConfirmations, confirmDeadline } from "../../_shared/confirmation.js";
import { loadResolution, shapeResolution, parseWard } from "../../_shared/resolution-evidence.js";
import { photoLink } from "../../_shared/photo-links.js";

const NOTE_MAX = 500;
const REASON_MIN = 10;

function can(role, permission) { return (PERMISSIONS[permission] || []).includes(role); }

function beforePhotos(v) {
  if (!v) return [];
  try { const a = JSON.parse(v); if (Array.isArray(a)) return a.filter((u) => typeof u === "string" && /^https:\/\//.test(u)).slice(0, 3); } catch (e) { /* single URL */ }
  return /^https:\/\//.test(String(v)) ? [String(v)] : [];
}

function maskPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (!d) return null;
  return d.length <= 4 ? "****" : "******" + d.slice(-4);
}

async function logEvent(env, actorEmail, action, target, detail) {
  await env.DB.prepare(
    `INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), actorEmail, action, target, detail == null ? null : JSON.stringify(detail)).run();
}

const WAITING_SQL = `status = 'PENDING_CONFIRMATION' AND COALESCE(TRIM(citizen_email), '') = ''`;

// Is this staff member one of the case's own representatives, or the one
// who marked it resolved? Then they may not check it.
async function conflictOfInterest(env, email, g, chain, report) {
  const me = String(email || "").toLowerCase();
  if (report && String(report.created_by || "").toLowerCase() === me) return true;
  return (chain ? chain.tiers : []).some((t) => t.email && String(t.email).trim().toLowerCase() === me);
}

export async function onRequestGet({ request, env }) {
  const auth = await getVerifiedAdmin(request, env, "view_checks");
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  await settleOverdueConfirmations(env);

  const [waitingRes, recentRes] = await env.DB.batch([
    env.DB.prepare(
      `SELECT g.*, lu.name AS ward_name, c.name AS category_name
       FROM grievances g
       LEFT JOIN local_units lu ON lu.id = g.local_unit_id
       LEFT JOIN grievance_categories c ON c.id = g.category_id
       WHERE g.status = 'PENDING_CONFIRMATION' AND COALESCE(TRIM(g.citizen_email), '') = ''
       ORDER BY g.resolved_at ASC LIMIT 200`
    ),
    env.DB.prepare(
      `SELECT rc.grievance_id, rc.method, rc.outcome, rc.note, rc.checked_by, rc.checked_at, g.tracking_ref
       FROM resolution_checks rc JOIN grievances g ON g.id = rc.grievance_id
       ORDER BY rc.checked_at DESC LIMIT 30`
    ),
  ]);

  const rows = waitingRes.results || [];
  const chains = await Promise.all(rows.map((g) => resolveChain(env, g.local_unit_id)));
  const cases = [];
  for (let i = 0; i < rows.length; i++) {
    const g = rows[i], chain = chains[i];
    const loaded = await loadResolution(env, g.id);
    const { results: history } = await env.DB.prepare(
      `SELECT method, outcome, note, checked_by, checked_at FROM resolution_checks
       WHERE grievance_id = ? ORDER BY checked_at ASC`
    ).bind(g.id).all();
    const resolution = loaded.report
      ? await shapeResolution(g, loaded.report, loaded.photos, "staff", (pid) => photoLink(env, pid), () => null,
          chain ? parseWard(chain.localUnit.ward_boundary_geojson) : null)
      : null;
    cases.push({
      id: g.id,
      trackingRef: g.tracking_ref,
      ward: g.ward_name || "Unknown ward",
      category: g.category_name || "",
      description: g.description || "",
      locationDetail: g.location_detail || "",
      pin: g.pin_lat != null && g.pin_lng != null ? { lat: Number(g.pin_lat), lng: Number(g.pin_lng) } : null,
      beforePhotos: beforePhotos(g.photo_url),
      createdAt: g.created_at,
      markedResolvedAt: g.resolved_at,
      closesAt: confirmDeadline(g.resolved_at),
      phoneMasked: maskPhone(g.citizen_phone),
      resolution,
      history: history || [],
      conflict: await conflictOfInterest(env, auth.email, g, chain, loaded.report),
    });
  }

  return Response.json({
    role: auth.role,
    canCheck: can(auth.role, "check_resolutions"),
    canReveal: can(auth.role, "reveal_citizen_phone"),
    cases,
    recent: (recentRes.results || []).map((r) => ({
      trackingRef: r.tracking_ref, grievanceId: r.grievance_id, method: r.method, outcome: r.outcome,
      note: r.note, by: r.checked_by, at: r.checked_at,
    })),
    generatedAt: new Date().toISOString(),
  });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const action = String(body.action || "");
  const needed = action === "reveal_phone" ? "reveal_citizen_phone" : "check_resolutions";
  const auth = await getVerifiedAdmin(request, env, needed);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  await settleOverdueConfirmations(env);

  const g = await env.DB.prepare(
    `SELECT * FROM grievances WHERE id = ? AND ${WAITING_SQL}`
  ).bind(String(body.grievanceId || "")).first();
  if (!g) {
    return Response.json({ error: "This case is no longer waiting for a check. Refresh the page.", code: "NOT_WAITING" }, { status: 409 });
  }
  const chain = await resolveChain(env, g.local_unit_id);
  const loaded = await loadResolution(env, g.id);
  if (await conflictOfInterest(env, auth.email, g, chain, loaded.report)) {
    return Response.json({ error: "You can't check a case in a ward where you are a representative, or one you marked resolved.", code: "CONFLICT" }, { status: 403 });
  }

  const now = new Date().toISOString();

  if (action === "reveal_phone") {
    const reason = String(body.reason || "").trim().slice(0, 300);
    if (reason.length < REASON_MIN) {
      return Response.json({ error: "Give a reason of at least 10 characters.", fields: { reason: "REASON_LENGTH" } }, { status: 400 });
    }
    await logEvent(env, auth.email, "citizen_phone_revealed", g.id, { trackingRef: g.tracking_ref, reason, role: auth.role });
    return new Response(JSON.stringify({ phone: String(g.citizen_phone || "") }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const method = String(body.method || "").toUpperCase();
  const note = String(body.note || "").trim().slice(0, NOTE_MAX);
  const OUTCOMES = { verify: "VERIFIED", not_fixed: "NOT_FIXED", cant_tell: "CANT_TELL", no_answer: "NO_ANSWER" };
  const outcome = OUTCOMES[action];
  if (!outcome) return Response.json({ error: "Unknown action." }, { status: 400 });
  if (method !== "PHOTO" && method !== "PHONE") return Response.json({ error: "Say how you checked: photos or a phone call.", fields: { method: "METHOD" } }, { status: 400 });
  if (action === "no_answer" && method !== "PHONE") return Response.json({ error: "\"No answer\" is only for phone calls.", fields: { method: "METHOD" } }, { status: 400 });
  if (action === "cant_tell" && method !== "PHOTO") return Response.json({ error: "\"Can't tell\" is only for photo checks.", fields: { method: "METHOD" } }, { status: 400 });
  if (action === "not_fixed" && note.length < 10) {
    return Response.json({ error: "Tell the representative what is still wrong (at least 10 characters).", fields: { note: "NOTE_LENGTH" } }, { status: 400 });
  }

  const stmts = [
    env.DB.prepare(
      `INSERT INTO resolution_checks (id, grievance_id, report_id, method, outcome, note, checked_by, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), g.id, loaded.report ? loaded.report.id : null, method, outcome, note || null, auth.email, now),
  ];
  if (outcome === "VERIFIED") {
    stmts.push(env.DB.prepare(
      `UPDATE grievances SET status = 'RESOLVED', closure_kind = 'STAFF_VERIFIED', updated_at = ?
       WHERE id = ? AND status = 'PENDING_CONFIRMATION'`
    ).bind(now, g.id));
  } else if (outcome === "NOT_FIXED") {
    // Reopened like a citizen dispute: escalation counts all time since filing.
    stmts.push(env.DB.prepare(
      `UPDATE grievances SET status = 'OPEN', resolved_at = NULL, closure_kind = NULL, updated_at = ?
       WHERE id = ? AND status = 'PENDING_CONFIRMATION'`
    ).bind(now, g.id));
  }
  await env.DB.batch(stmts);
  await logEvent(env, auth.email, "resolution_checked", g.id, { trackingRef: g.tracking_ref, method, outcome, note: note || null });

  return Response.json({ ok: true, outcome, status: outcome === "VERIFIED" ? "RESOLVED" : outcome === "NOT_FIXED" ? "OPEN" : "PENDING_CONFIRMATION" });
}
