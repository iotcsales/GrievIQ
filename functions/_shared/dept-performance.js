// functions/_shared/dept-performance.js
//
// Department performance (grieviq-33, approved 9 Oct 2026). Worked out live
// from the department steps (case_dept_steps) and citizen ratings; nothing
// is stored, so nothing goes stale.
//
// Modelled on:
//   - DARPG's Grievance Redressal Assessment and Index (GRAI): efficiency
//     (resolved within the time limit, resolution time, pendency), feedback
//     (appeals, "Satisfied" share), organisational commitment (active
//     officers). GrievIQ's field check plays the part of GRAI's appeals.
//   - The Scottish Public Services Ombudsman's complaint indicators: volume,
//     time, share within the time limit, outcomes, satisfaction.
//   - NYC 311 service level agreements (a time commitment per agency and type).
// Owner decisions: no single score or ranking during the pilot; officers see
// their own office only.
//
// Definitions (also printed on every page that shows them):
//   An ASSIGNMENT is one forwarding of a case to an office, until the case is
//   forwarded again. Each forwarding counts against the office it went to.
//   forwarded       assignments that began in the period
//   withNow         current assignments the office still has to act on
//   overdueNow      ...of those, past the target time
//   firstReply      median days from forwarding to the first reply (any of
//                   scheduled / started / done / not ours / can't do)
//   onTime          of assignments where the work was reported done or the
//                   target has passed, the share reported done by the target
//                   (target: the department type's days, or a later date the
//                   department gave)
//   toFixed         median days from forwarding to a passed field check
//   fixedFirst      of first field checks after "work done", the share that
//                   found it fixed
//   reopened        of assignments whose case closed, the share a citizen reopened
//   rating          citizens' rating of the department (case's last office)
//   ownReplies      replies the department made itself on its dashboard,
//                   out of all its replies
//   notOurs, cantDo counts, shown for information
// A share or median is shown only from MIN_CASES cases; below that, the count.

import { STEP, REPLY_KINDS, loadSteps, deptState, targetDaysByType, DEFAULT_TARGET_DAYS } from "./dept-steps.js";
import { toUtcMs } from "./time-limits.js";
import { summarise as summariseRatings } from "./ratings.js";

export const MIN_CASES = 5;
const DAY = 86400000;
const CHECKS = [STEP.CHECK_FIXED, STEP.CHECK_PARTLY, STEP.CHECK_NOT_FIXED];
function endOfIstDay(d) { return Date.parse(d + "T23:59:59+05:30"); }
function median(list) {
  if (!list.length) return null;
  const s = list.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10;
}

// Splits each case's steps into assignments.
// cases: [{ g, steps }] ; returns [{ ...assignment }]
export function assignmentsOf(cases, targets, ratingsBy, nowMs) {
  const now = nowMs || Date.now();
  const out = [];
  for (const { g, steps } of cases) {
    const idx = [];
    steps.forEach((s, i) => { if (s.kind === STEP.FORWARDED) idx.push(i); });
    idx.forEach((start, k) => {
      const end = k + 1 < idx.length ? idx[k + 1] : steps.length;
      const fwd = steps[start], seg = steps.slice(start + 1, end);
      const current = k === idx.length - 1;
      const fwdMs = toUtcMs(fwd.created_at);
      const days = (targets && targets[fwd.department]) || DEFAULT_TARGET_DAYS;
      const firstReply = seg.find((s) => REPLY_KINDS.includes(s.kind));
      const doneI = seg.findIndex((s) => s.kind === STEP.DONE_CLAIMED);
      const done = doneI >= 0 ? seg[doneI] : null;
      // Target: the type's days, moved to a later date the department gave before saying done.
      let due = fwdMs + days * DAY;
      for (const s of done ? seg.slice(0, doneI) : seg) if (s.kind === STEP.SCHEDULED && s.expected_date) due = Math.max(due, endOfIstDay(s.expected_date));
      const doneMs = done ? toUtcMs(done.created_at) : NaN;
      const firstCheck = done ? seg.slice(doneI + 1).find((s) => CHECKS.includes(s.kind)) : null;
      const fixed = seg.find((s) => s.kind === STEP.CHECK_FIXED);
      const replies = seg.filter((s) => REPLY_KINDS.includes(s.kind));
      const caseOpen = g.status === "OPEN" || g.status === "ACKNOWLEDGED";
      const caseClosed = g.status === "RESOLVED" || g.status === "CLOSED";
      let st = null;
      if (current && caseOpen) st = deptState(steps, targets, now);
      const rating = current && ratingsBy ? ratingsBy.get(g.id) : null;
      out.push({
        grievanceId: g.id, trackingRef: g.tracking_ref, localUnitId: g.local_unit_id, areaId: g.area_id || null,
        officeId: fwd.office_id || null, officeName: fwd.office_name || null, department: fwd.department,
        byOfficeTier: fwd.by_office_tier || null, byOfficeId: fwd.by_office_id != null ? String(fwd.by_office_id) : null,
        forwardedMs: fwdMs, current,
        firstReplyDays: firstReply ? (toUtcMs(firstReply.created_at) - fwdMs) / DAY : null,
        // on time: decided when done, or once the target has passed
        // "Not ours" is not counted against the office (it mostly reflects routing).
        onTimeDecided: !seg.some((s) => s.kind === STEP.NOT_OURS) && (!!done || now > due), onTime: !!done && doneMs <= due,
        toFixedDays: fixed ? (toUtcMs(fixed.created_at) - fwdMs) / DAY : null,
        firstCheckFixed: firstCheck ? firstCheck.kind === STEP.CHECK_FIXED : null,
        reopenDecided: current && (caseClosed || Number(g.reopen_count || 0) > 0), reopened: current && Number(g.reopen_count || 0) > 0 && toUtcMs(g.reopened_at) > fwdMs,
        withNow: !!(st && st.phase === "WITH_DEPT"), overdueNow: !!(st && st.phase === "WITH_DEPT" && st.overdue),
        overdueDays: st && st.overdue ? st.overdueDays : 0,
        notOurs: seg.some((s) => s.kind === STEP.NOT_OURS), cantDo: seg.some((s) => s.kind === STEP.CANT_DO),
        replies: replies.length, ownReplies: replies.filter((s) => s.actor_role === "DEPARTMENT").length,
        ratingScore: rating && rating.dept_score != null && rating.department === fwd.department ? Number(rating.dept_score) : null,
      });
    });
  }
  return out;
}

function share(n, d) { return { n, d, pct: d >= MIN_CASES ? Math.round((n / d) * 1000) / 10 : null }; }
function med(list) { return { n: list.length, median: list.length >= MIN_CASES ? median(list) : null }; }

// One group's measures. inPeriod(a) says whether an assignment began in the period.
export function measures(list, fromMs, toMs) {
  const p = list.filter((a) => a.forwardedMs >= fromMs && a.forwardedMs <= toMs);
  const onTimeD = p.filter((a) => a.onTimeDecided);
  const checked = p.filter((a) => a.firstCheckFixed !== null);
  const reopenD = p.filter((a) => a.reopenDecided);
  const replies = p.reduce((s, a) => s + a.replies, 0), own = p.reduce((s, a) => s + a.ownReplies, 0);
  return {
    forwarded: p.length,
    withNow: list.filter((a) => a.withNow).length,
    overdueNow: list.filter((a) => a.overdueNow).length,
    firstReply: med(p.filter((a) => a.firstReplyDays != null).map((a) => a.firstReplyDays)),
    onTime: share(onTimeD.filter((a) => a.onTime).length, onTimeD.length),
    toFixed: med(p.filter((a) => a.toFixedDays != null).map((a) => a.toFixedDays)),
    fixedFirst: share(checked.filter((a) => a.firstCheckFixed).length, checked.length),
    reopened: share(reopenD.filter((a) => a.reopened).length, reopenD.length),
    rating: summariseRatings(p.map((a) => a.ratingScore).filter((x) => x != null)),
    ownReplies: share(own, replies),
    notOurs: p.filter((a) => a.notOurs).length,
    cantDo: p.filter((a) => a.cantDo).length,
  };
}

// Loads every case with department steps (optionally only some), with the
// facts needed above. filter: { areaId?, grievanceIds? }
export async function loadAssignments(env, filter, nowMs) {
  const f = filter || {};
  let sql = `SELECT DISTINCT g.id, g.tracking_ref, g.status, g.local_unit_id, g.reopen_count, g.reopened_at, lu.area_id
             FROM case_dept_steps s JOIN grievances g ON g.id = s.grievance_id JOIN local_units lu ON lu.id = g.local_unit_id`;
  const where = [], binds = [];
  if (f.areaId) { where.push("lu.area_id = ?"); binds.push(f.areaId); }
  if (f.officeId) { where.push("g.id IN (SELECT grievance_id FROM case_dept_steps WHERE kind = 'FORWARDED' AND office_id = ?)"); binds.push(String(f.officeId)); }
  if (f.byOffice) { where.push("g.id IN (SELECT grievance_id FROM case_dept_steps WHERE kind = 'FORWARDED' AND by_office_tier = ? AND by_office_id = ?)"); binds.push(f.byOffice.tier, String(f.byOffice.id)); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  let rows = [];
  try { rows = (await env.DB.prepare(sql).bind(...binds).all()).results || []; }
  catch (e) { if (/no such table/i.test(String(e && e.message))) return []; throw e; }
  if (!rows.length) return [];
  const stepsBy = await loadSteps(env, rows.map((g) => g.id));
  const targets = await targetDaysByType(env);
  const ratingsBy = new Map();
  try {
    const { results } = await env.DB.prepare("SELECT grievance_id, dept_score, department FROM case_ratings WHERE grievance_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(rows.map((g) => g.id))).all();
    for (const r of results || []) ratingsBy.set(r.grievance_id, r);
  } catch (e) { /* before part24 */ }
  return assignmentsOf(rows.map((g) => ({ g, steps: stepsBy.get(g.id) || [] })), targets, ratingsBy, nowMs);
}

// The key an assignment is grouped under.
export function officeKey(a) { return a.officeId ? "id:" + a.officeId : "name:" + String(a.officeName || "").trim().toLowerCase(); }

// 12 months: forwarded and fixed (passed field check) per month, IST.
export function monthlyDept(list, todayDay) {
  const [y, m] = todayDay.split("-").map(Number);
  const months = [];
  for (let i = 11; i >= 0; i--) months.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  const start = (mo) => Date.parse(mo + "-01T00:00:00+05:30");
  return months.map((mo, i) => {
    const from = start(mo), to = i + 1 < months.length ? start(months[i + 1]) - 1 : Date.parse(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10) + "T00:00:00+05:30") - 1;
    return {
      month: mo,
      received: list.filter((a) => a.forwardedMs >= from && a.forwardedMs <= to).length,
      resolved: list.filter((a) => a.toFixedDays != null && a.forwardedMs + a.toFixedDays * DAY >= from && a.forwardedMs + a.toFixedDays * DAY <= to).length,
    };
  });
}
