// functions/_shared/audit-reports.js
//
// Audit engagements and reports (item 9b, approved Sept 2026).
//
// Standards followed:
//   - IIA Global Internal Audit Standards (2024): engagement objectives,
//     scope and criteria are recorded (13.1-13.6); each finding is reported
//     with criteria, condition, cause, effect, rating and recommendation
//     (14.3, 14.4); an overall conclusion is given (14.5); results are
//     communicated (15.1) and followed up until the actions are confirmed
//     (15.2).
//   - CAG Auditing Standards (2017): the audited party's reply is included in
//     the report; findings are followed up; reports are complete, objective
//     and timely.
//   - NIST SP 800-53 AU-9 / AU-10: an issued report is frozen (the database
//     refuses changes) and carries a SHA-256 fingerprint of its exact
//     content, so any later tampering would show. A correction is issued as
//     a new version that supersedes the earlier one; both stay on record.
//
// Reports are built from live data, previewed by the auditor, then issued:
//   PERIOD      one engagement: objectives, scope, criteria, conclusion,
//               ratings summary and every observation in full
//   FOLLOW_UP   every issued observation (of one engagement, or all) and
//               where it stands: verified closed, in progress, overdue,
//               waiting for verification, risk accepted
//   REGISTER    a frozen snapshot of the observation register
//   ANALYTICS   one period, by ward and by level: complaints filed and
//               resolved, share resolved within the time limit, average days;
//               escalations, disputes, reopenings; fake-fix warnings, staff
//               check outcomes, "not verified" closures; phone-number
//               unmaskings and case views per staff member; refused sign-ins

import { shapeObservation, todayIst, OPEN_STATUSES } from "./audit.js";
import { addOwnerLabels } from "./audit-office.js";
import { computeEscalation } from "./escalation.js";
import { toUtcMs } from "./time-limits.js";
import { resolveChain } from "./jurisdiction.js";
import { photoWarnings, parseWard } from "./resolution-evidence.js";

export const KINDS = ["PERIOD", "FOLLOW_UP", "REGISTER", "ANALYTICS"];
export const CONCLUSIONS = ["SATISFACTORY", "NEEDS_IMPROVEMENT", "UNSATISFACTORY"];
const DAY = 86400000;
const enc = new TextEncoder();

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
export function dayStartMs(d) { return Date.parse(d + "T00:00:00.000+05:30"); }
export function dayEndMs(d) { return Date.parse(d + "T23:59:59.999+05:30"); }
export function isDay(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) && !isNaN(dayStartMs(d)); }

// Every observation (not drafts or withdrawn), shaped, optionally for one engagement.
async function issuedObservations(env, engagementId) {
  const where = ["status NOT IN ('DRAFT', 'WITHDRAWN')"];
  const binds = [];
  if (engagementId) { where.push("engagement_id = ?"); binds.push(engagementId); }
  const { results } = await env.DB.prepare(`SELECT * FROM observations WHERE ${where.join(" AND ")} ORDER BY ref ASC`).bind(...binds).all();
  const rows = results || [];
  const ids = rows.map((r) => r.id);
  const amendBy = new Map();
  if (ids.length) {
    const { results: am } = await env.DB.prepare("SELECT * FROM observation_amendments WHERE observation_id IN (SELECT value FROM json_each(?)) ORDER BY amended_at ASC").bind(JSON.stringify(ids)).all();
    for (const a of am || []) { if (!amendBy.has(a.observation_id)) amendBy.set(a.observation_id, []); amendBy.get(a.observation_id).push(a); }
  }
  const today = todayIst();
  return addOwnerLabels(env, rows.map((r) => shapeObservation(r, amendBy.get(r.id) || [], today)));
}

function ratingSummary(list) {
  const out = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const o of list) out[o.rating] = (out[o.rating] || 0) + 1;
  return out;
}
// Where a finding stands, in the follow-up report's words.
export function followUpState(o) {
  if (o.status === "CLOSED") return "VERIFIED_CLOSED";
  if (o.status === "RISK_ACCEPTED") return "RISK_ACCEPTED";
  if (o.status === "DONE_REPORTED") return "WAITING_VERIFICATION";
  if (o.overdue) return "OVERDUE";
  return "IN_PROGRESS";
}
function obsForReport(o) {
  return {
    ref: o.ref, title: o.title, rating: o.rating, status: o.status, state: followUpState(o),
    subjectType: o.subjectType, subjectCases: o.subjectCases, subjectOffice: o.subjectOffice, subjectProcess: o.subjectProcess,
    criteria: o.criteria, condition: o.condition, cause: o.cause, effect: o.effect, recommendation: o.recommendation,
    owner: o.ownerLabel || o.ownerEmail, dueDate: o.dueDate, issuedAt: o.issuedAt, closedAt: o.closedAt,
    response: o.response, doneEvidence: o.doneEvidence, riskReason: o.riskReason, riskReviewDate: o.riskReviewDate,
    amendments: o.amendments.map((a) => ({ field: a.field, from: a.oldValue, to: a.newValue, reason: a.reason, at: a.at })),
  };
}

export async function buildPeriod(env, eng, opts) {
  const list = await issuedObservations(env, eng.id);
  return {
    kind: "PERIOD",
    engagement: { ref: eng.ref, title: eng.title, objectives: eng.objectives, scope: eng.scope, criteria: eng.criteria, periodFrom: eng.period_from, periodTo: eng.period_to },
    conclusion: opts.conclusion, summary: opts.summary,
    ratings: ratingSummary(list),
    observations: list.map(obsForReport),
  };
}

export async function buildFollowUp(env, eng) {
  const list = await issuedObservations(env, eng ? eng.id : null);
  const counts = { VERIFIED_CLOSED: 0, IN_PROGRESS: 0, OVERDUE: 0, WAITING_VERIFICATION: 0, RISK_ACCEPTED: 0 };
  for (const o of list) counts[followUpState(o)]++;
  return {
    kind: "FOLLOW_UP",
    engagement: eng ? { ref: eng.ref, title: eng.title, periodFrom: eng.period_from, periodTo: eng.period_to } : null,
    asOf: todayIst(), counts, ratings: ratingSummary(list),
    observations: list.map((o) => ({ ref: o.ref, title: o.title, rating: o.rating, state: followUpState(o), owner: o.ownerLabel || o.ownerEmail, dueDate: o.dueDate,
      issuedAt: o.issuedAt, closedAt: o.closedAt, actionPlan: o.response && o.response.actionPlan, targetDate: o.response && o.response.targetDate, riskReason: o.riskReason })),
  };
}

export async function buildRegister(env) {
  const list = await issuedObservations(env, null);
  return { kind: "REGISTER", asOf: todayIst(), ratings: ratingSummary(list), observations: list.map(obsForReport) };
}

// Analytics for one period (India dates), by ward and by level.
export async function buildAnalytics(env, from, to) {
  const fromMs = dayStartMs(from), toMs = dayEndMs(to);
  const inP = (ms) => !isNaN(ms) && ms >= fromMs && ms <= toMs;
  const [casesRes, catRes, disputeRes, reopenRes, checkRes, staffRes, refusedRes, photoRes] = await env.DB.batch([
    env.DB.prepare(`SELECT g.*, lu.name AS ward_name, lu.ward_boundary_geojson AS ward_geo FROM grievances g LEFT JOIN local_units lu ON lu.id = g.local_unit_id`),
    env.DB.prepare("SELECT * FROM grievance_categories"),
    env.DB.prepare("SELECT grievance_id, created_at FROM grievance_events WHERE event_type = 'CITIZEN_DISPUTED'"),
    env.DB.prepare("SELECT grievance_id, reopened_at FROM grievance_reopens"),
    env.DB.prepare("SELECT outcome, checked_at FROM resolution_checks"),
    env.DB.prepare("SELECT actor_email, action, created_at FROM admin_events WHERE action IN ('case_viewed', 'citizen_phone_revealed', 'reveal_phone')"),
    env.DB.prepare("SELECT detail, created_at FROM rep_auth_events WHERE event = 'SIGN_IN_REFUSED'"),
    env.DB.prepare(`SELECT rp.*, rr.review_status FROM resolution_photos rp JOIN resolution_reports rr ON rr.id = rp.report_id
                    WHERE rr.review_status IS NULL OR rr.review_status = 'APPROVED'`),
  ]);
  const cats = new Map((catRes.results || []).map((c) => [c.id, c]));
  const photosBy = new Map();
  for (const p of photoRes.results || []) { if (!photosBy.has(p.grievance_id)) photosBy.set(p.grievance_id, []); photosBy.get(p.grievance_id).push(p); }
  const byId = new Map((casesRes.results || []).map((g) => [g.id, g]));

  const blank = () => ({ filed: 0, resolved: 0, withinLimit: 0, limitCounted: 0, days: 0, escalated: 0, disputed: 0, reopened: 0, fixesWithWarnings: 0 });
  const total = blank();
  const wards = new Map();
  const levels = new Map(); // tier -> { resolved, days, openNow }
  const warnCodes = {};
  const chains = new Map();
  const tierOf = async (g) => {
    if (!chains.has(g.local_unit_id)) chains.set(g.local_unit_id, await resolveChain(env, g.local_unit_id));
    return chains.get(g.local_unit_id);
  };
  const add = (w, fn) => { fn(total); fn(w); };

  for (const g of byId.values()) {
    const created = toUtcMs(g.created_at);
    const resolvedMs = g.resolved_at && ["RESOLVED", "CLOSED", "PENDING_CONFIRMATION"].includes(g.status) ? toUtcMs(g.resolved_at) : NaN;
    const filedIn = inP(created), resolvedIn = inP(resolvedMs);
    if (!filedIn && !resolvedIn) continue;
    const key = g.local_unit_id || "?";
    if (!wards.has(key)) wards.set(key, Object.assign({ id: key, name: g.ward_name || key }, blank()));
    const w = wards.get(key);
    const cat = cats.get(g.category_id);
    const chain = cat ? await tierOf(g) : null;
    const esc = cat && chain ? computeEscalation(g, cat, chain.tiers) : null;
    const tier = esc ? esc.currentTier.tier : (g.current_tier || "LOCAL");
    if (filedIn) {
      add(w, (a) => { a.filed++; if (esc && esc.currentTierIndex > 0) a.escalated++; if (Number(g.reopen_count || 0) > 0) a.reopened++; });
    }
    if (resolvedIn) {
      const days = (resolvedMs - created) / DAY;
      const sla = cat && cat.resolution_sla_hours ? cat.resolution_sla_hours * 3600000 : null;
      add(w, (a) => {
        a.resolved++; a.days += days;
        if (sla) { a.limitCounted++; if (esc && esc.currentTierIndex === 0 && resolvedMs - created <= sla) a.withinLimit++; }
      });
      const lv = levels.get(tier) || { tier, resolved: 0, days: 0, openNow: 0 };
      lv.resolved++; lv.days += days; levels.set(tier, lv);
      // Fake-fix warnings on the fix's "after" photos.
      const photos = photosBy.get(g.id) || [];
      if (photos.length) {
        const ward = parseWard(g.ward_geo);
        const codes = new Set();
        for (const p of photos) for (const x of photoWarnings(g, p, ward)) if (x.level === "warn") codes.add(x.code);
        if (codes.size) { add(w, (a) => { a.fixesWithWarnings++; }); for (const c of codes) warnCodes[c] = (warnCodes[c] || 0) + 1; }
      }
    }
  }
  // Open complaints now, by level.
  for (const g of byId.values()) {
    if (["RESOLVED", "CLOSED", "PENDING_CONFIRMATION"].includes(g.status)) continue;
    const cat = cats.get(g.category_id); if (!cat) continue;
    const chain = await tierOf(g); if (!chain) continue;
    const tier = computeEscalation(g, cat, chain.tiers).currentTier.tier;
    const lv = levels.get(tier) || { tier, resolved: 0, days: 0, openNow: 0 };
    lv.openNow++; levels.set(tier, lv);
  }
  for (const d of disputeRes.results || []) {
    if (!inP(toUtcMs(d.created_at))) continue;
    const g = byId.get(d.grievance_id); const w = g && wards.get(g.local_unit_id);
    total.disputed++; if (w) w.disputed++;
  }
  const reopenedInPeriod = (reopenRes.results || []).filter((r) => inP(toUtcMs(r.reopened_at))).length;
  const checks = { VERIFIED: 0, NOT_FIXED: 0, CANT_TELL: 0, NO_ANSWER: 0 };
  for (const c of checkRes.results || []) if (inP(toUtcMs(c.checked_at))) checks[c.outcome] = (checks[c.outcome] || 0) + 1;
  let notVerified = 0;
  for (const g of byId.values()) if (g.closure_kind === "STAFF_NOT_CHECKED" && inP(toUtcMs(g.closed_at || g.updated_at))) notVerified++;
  const staff = new Map();
  for (const e of staffRes.results || []) {
    if (!inP(toUtcMs(e.created_at))) continue;
    const s = staff.get(e.actor_email) || { email: e.actor_email, caseViews: 0, phoneUnmasked: 0 };
    if (e.action === "case_viewed") s.caseViews++; else s.phoneUnmasked++;
    staff.set(e.actor_email, s);
  }
  const refused = { total: 0, byReason: {} };
  for (const r of refusedRes.results || []) {
    if (!inP(toUtcMs(r.created_at))) continue;
    refused.total++;
    let reason = "OTHER"; try { reason = (JSON.parse(r.detail || "{}").reason) || "OTHER"; } catch (e) { /* keep OTHER */ }
    refused.byReason[reason] = (refused.byReason[reason] || 0) + 1;
  }
  const finish = (a) => Object.assign({}, a, {
    avgDays: a.resolved ? Math.round((a.days / a.resolved) * 10) / 10 : null,
    withinLimitPct: a.limitCounted ? Math.round((a.withinLimit / a.limitCounted) * 1000) / 10 : null,
    days: undefined,
  });
  const ORDER = ["LOCAL", "MAYOR", "MLA", "MP"];
  return {
    kind: "ANALYTICS", periodFrom: from, periodTo: to,
    total: finish(total), reopenedInPeriod,
    wards: Array.from(wards.values()).map(finish).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    levels: Array.from(levels.values()).sort((a, b) => ORDER.indexOf(a.tier) - ORDER.indexOf(b.tier))
      .map((l) => ({ tier: l.tier, resolved: l.resolved, avgDays: l.resolved ? Math.round((l.days / l.resolved) * 10) / 10 : null, openNow: l.openNow })),
    fixEvidence: { warningsByType: warnCodes, checks, notVerifiedClosures: notVerified },
    staff: Array.from(staff.values()).sort((a, b) => (b.phoneUnmasked - a.phoneUnmasked) || (b.caseViews - a.caseViews)),
    refusedSignIns: refused,
  };
}

// The next report reference for the year: RPT-2026-001.
export async function nextReportRef(env) {
  const year = todayIst().slice(0, 4);
  const row = await env.DB.prepare("SELECT ref FROM audit_reports WHERE ref LIKE ? ORDER BY ref DESC LIMIT 1").bind("RPT-" + year + "-%").first();
  const n = row ? Number(String(row.ref).split("-")[2]) + 1 : 1;
  return "RPT-" + year + "-" + String(n).padStart(3, "0");
}
export async function nextEngagementRef(env) {
  const year = todayIst().slice(0, 4);
  const row = await env.DB.prepare("SELECT ref FROM audit_engagements WHERE ref LIKE ? ORDER BY ref DESC LIMIT 1").bind("ENG-" + year + "-%").first();
  const n = row ? Number(String(row.ref).split("-")[2]) + 1 : 1;
  return "ENG-" + year + "-" + String(n).padStart(2, "0");
}
export { OPEN_STATUSES };
