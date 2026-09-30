// functions/_shared/overview.js
//
// The Overview tab (item 8c-2, approved Sept 2026): how an office's area is
// doing, as counts only.
//
// Modelled on the Government of India's CPGRAMS monthly reports (DARPG:
// received, disposed, pending, and pending by how long it has waited) and
// on the Grievance Redressal Assessment and Index (GRAI: efficiency and
// feedback measures), with definitions published next to the numbers as
// ISO 10002 asks for complaint-handling monitoring.
//
// Everything is worked out on the spot from the same rules as the rest of
// GrievIQ (escalation.js, time-limits.js, confirmation.js); nothing is
// stored, so nothing goes stale. No case details leave this file: only
// counts per group.
//
// Definitions (shown on the page too):
//   received        filed in the period
//   resolved        marked fixed in the period (resolved_at), whether or not
//                   the citizen has confirmed yet
//   pending         not yet marked fixed, as of now (DARPG "pending")
//   age buckets     pending cases by days since filing: 0-7, 8-30, 31-90, 90+
//   overdue         pending cases that have missed a time limit: not
//                   acknowledged in time, or not fixed in time at a level
//   median days     filing to marked fixed, for cases resolved in the period
//   ack on time     of cases received in the period whose acknowledgement
//                   was due by now, the share acknowledged within the limit
//   escalated       of cases received in the period, the share that moved
//                   above the ward level
//   confirmed       of cases resolved in the period and now closed, where
//                   the citizen could be asked (gave an email), the share
//                   the citizen confirmed as fixed
//   reopened        of cases received in the period, the share reopened

import { computeEscalation } from "./escalation.js";
import { timeLimitStatus, toUtcMs } from "./time-limits.js";
import { resolutionKind } from "./confirmation.js";

const DAY = 86400000;
const HOUR = 3600000;
export const AGE_BUCKETS = [[0, 7], [8, 30], [31, 90], [91, Infinity]];
export const IST_OFFSET = "+05:30";

// "YYYY-MM-DD" -> start / end of that day in India, as ms.
export function dayStartMs(d) { return Date.parse(d + "T00:00:00.000" + IST_OFFSET); }
export function dayEndMs(d) { return Date.parse(d + "T23:59:59.999" + IST_OFFSET); }
export function isDay(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) && !isNaN(dayStartMs(d)); }

// Today's date in India, "YYYY-MM-DD".
export function todayIst(nowMs) {
  return new Date((nowMs || Date.now()) + 5.5 * HOUR).toISOString().slice(0, 10);
}

function median(list) {
  if (!list.length) return null;
  const s = list.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const v = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(v * 10) / 10;
}

function blank() {
  return {
    received: 0, resolved: 0, pending: 0, ages: [0, 0, 0, 0], overdue: 0,
    resolveDays: [], ackOnTime: { n: 0, d: 0 }, escalated: { n: 0, d: 0 },
    confirmed: { n: 0, d: 0 }, reopened: { n: 0, d: 0 },
  };
}
function finish(a) {
  const out = Object.assign({}, a, { medianDays: median(a.resolveDays) });
  delete out.resolveDays;
  return out;
}

// One case's facts, worked out once. chain = resolveChain() result.
export function caseFacts(g, category, chain, nowMs) {
  const now = nowMs || Date.now();
  const created = toUtcMs(g.created_at);
  const result = computeEscalation(g, category, chain.tiers);
  const limits = timeLimitStatus(g, category, chain.tiers, result);
  const fixedStatuses = ["RESOLVED", "CLOSED", "PENDING_CONFIRMATION"];
  const resolvedMs = g.resolved_at && fixedStatuses.includes(g.status) ? toUtcMs(g.resolved_at) : NaN;
  const pending = !fixedStatuses.includes(g.status);
  const ageDays = Math.floor((now - created) / DAY);
  const ackDueMs = category.ack_sla_hours ? created + category.ack_sla_hours * HOUR : NaN;
  const ackMs = g.acknowledged_at ? toUtcMs(g.acknowledged_at) : NaN;
  const kind = resolutionKind(g);
  return {
    created, resolvedMs, pending, ageDays,
    overdue: pending && limits.tiers.some((t) => t.slaBreached),
    // Acknowledgement: counted once it was due (or given).
    ackCounted: !isNaN(ackMs) || (!isNaN(ackDueMs) && now >= ackDueMs),
    ackOnTime: !isNaN(ackMs) && !isNaN(ackDueMs) && ackMs <= ackDueMs,
    escalated: result.currentTierIndex > 0,
    confirmCounted: kind === "CONFIRMED" || kind === "NOT_CONFIRMED",
    confirmed: kind === "CONFIRMED",
    reopened: Number(g.reopen_count || 0) > 0,
  };
}

// Adds one case to an accumulator for the period [fromMs, toMs].
function add(a, f, fromMs, toMs) {
  const inPeriod = f.created >= fromMs && f.created <= toMs;
  if (inPeriod) {
    a.received++;
    if (f.ackCounted) { a.ackOnTime.d++; if (f.ackOnTime) a.ackOnTime.n++; }
    a.escalated.d++; if (f.escalated) a.escalated.n++;
    a.reopened.d++; if (f.reopened) a.reopened.n++;
  }
  if (!isNaN(f.resolvedMs) && f.resolvedMs >= fromMs && f.resolvedMs <= toMs) {
    a.resolved++;
    a.resolveDays.push((f.resolvedMs - f.created) / DAY);
    if (f.confirmCounted) { a.confirmed.d++; if (f.confirmed) a.confirmed.n++; }
  }
  if (f.pending) {
    a.pending++;
    const i = AGE_BUCKETS.findIndex(([lo, hi]) => f.ageDays >= lo && f.ageDays <= hi);
    a.ages[i === -1 ? 0 : i]++;
    if (f.overdue) a.overdue++;
  }
}

// items: [{ key, facts }]; groups: [{ key, name, ... }] in display order
// (every group listed, even with no cases). Returns { rows, total }.
export function summarise(items, groups, fromMs, toMs) {
  const acc = new Map(groups.map((gr) => [gr.key, blank()]));
  const total = blank();
  for (const it of items) {
    if (!acc.has(it.key)) acc.set(it.key, blank());
    add(acc.get(it.key), it.facts, fromMs, toMs);
    add(total, it.facts, fromMs, toMs);
  }
  const rows = groups.map((gr) => Object.assign({}, gr, finish(acc.get(gr.key))));
  return { rows, total: finish(total) };
}

// Received and resolved per month for the 12 months up to and including
// the month of `todayDay` (India time). [{ month: "YYYY-MM", received, resolved }]
export function monthlyTrend(facts, todayDay) {
  const [y, m] = todayDay.split("-").map(Number);
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  const bounds = months.map((mo) => {
    const [yy, mm] = mo.split("-").map(Number);
    const next = new Date(Date.UTC(yy, mm, 1)).toISOString().slice(0, 10);
    return { month: mo, from: dayStartMs(mo + "-01"), to: dayStartMs(next) - 1, received: 0, resolved: 0 };
  });
  for (const f of facts) {
    for (const b of bounds) {
      if (f.created >= b.from && f.created <= b.to) b.received++;
      if (!isNaN(f.resolvedMs) && f.resolvedMs >= b.from && f.resolvedMs <= b.to) b.resolved++;
    }
  }
  return bounds.map(({ month, received, resolved }) => ({ month, received, resolved }));
}

export function pct(r) { return r && r.d ? Math.round((r.n / r.d) * 1000) / 10 : null; }
