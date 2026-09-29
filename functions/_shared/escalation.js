// functions/_shared/escalation.js
//
// Computes which tier of the escalation chain should currently see a
// grievance, purely from elapsed time — no scheduled job required. A
// case's "current tier" is a live calculation, not a stored fact that a
// cron job flips once a day; this means a test case with a backdated
// created_at shows correctly escalated the instant it's queried, and
// there's no scheduled job that can silently fail to run.
//
// Escalation rule: a case escalates one tier for every full multiple of
// its category's resolution SLA that has elapsed since creation. E.g. a
// 10-day-SLA case in a 4-tier chain (Corporator -> Mayor -> MLA -> MP)
// moves to Mayor past 10 days, MLA past 20 days, MP past 30 days.
// Categories with no resolution SLA (e.g. land disputes) never
// auto-escalate on this clock — see needsLegalReview below instead.

//
// Reopened cases (item 7d): once a citizen reopens a resolved case, it
// moves up one level from where it was resolved (reopen_start_tier) and a
// fresh clock starts at reopened_at. From there it escalates one level per
// resolution limit as usual, and the acknowledgement clock also starts
// again (acknowledged_at is cleared on reopening). elapsedHours stays the
// total age of the case since filing; clockHours is the time on the clock
// that drives escalation.

import { toUtcMs } from "./time-limits.js";

// Where the escalation clock starts: filing at the first level, or (for a
// reopened case) the reopening at the level it was sent to.
export function clockStart(grievance, chainTiers) {
  if (grievance.reopened_at && grievance.reopen_start_tier) {
    const ms = toUtcMs(grievance.reopened_at);
    const index = chainTiers.findIndex((t) => t.tier === grievance.reopen_start_tier);
    if (!isNaN(ms)) return { ms, index: Math.max(0, index), reopened: true };
  }
  return { ms: toUtcMs(grievance.created_at), index: 0, reopened: false };
}

export function computeEscalation(grievance, category, chainTiers) {
  const createdAtMs = toUtcMs(grievance.created_at);
  const nowMs = Date.now();
  const elapsedHours = (nowMs - createdAtMs) / (1000 * 60 * 60);
  const start = clockStart(grievance, chainTiers);
  const clockHours = (nowMs - start.ms) / (1000 * 60 * 60);
  const base = { elapsedHours, clockHours, clockStartMs: start.ms, startIndex: start.index, reopened: start.reopened };

  // Clock A: acknowledgment overdue check — independent of tier escalation.
  const ackOverdue =
    !grievance.acknowledged_at && clockHours >= category.ack_sla_hours;

  // Categories with no resolution SLA (e.g. land disputes) don't
  // auto-escalate — they're flagged for manual/legal review instead of
  // being pushed up the chain on a clock that doesn't fairly apply.
  if (!category.resolution_sla_hours) {
    return {
      ...base,
      currentTierIndex: start.index,
      currentTier: chainTiers[start.index],
      ackOverdue,
      needsLegalReview: true,
    };
  }

  // A resolved/closed case freezes wherever it last was — it doesn't keep
  // climbing the chain after the fact. So does a case waiting for the
  // citizen to confirm the fix (PENDING_CONFIRMATION, item 7a): it stays
  // at the level where it was marked resolved (current_tier, stored by
  // mark-resolved.js). If the citizen disputes, the case reopens and this
  // clock counts all time since filing again, waiting time included.
  if (grievance.status === "RESOLVED" || grievance.status === "CLOSED" ||
      grievance.status === "PENDING_CONFIRMATION") {
    const frozenIndex = Math.max(
      0,
      chainTiers.findIndex((t) => t.tier === grievance.current_tier)
    );
    return {
      ...base,
      currentTierIndex: frozenIndex,
      currentTier: chainTiers[frozenIndex],
      ackOverdue: false,
      needsLegalReview: false,
    };
  }

  // One level up per full resolution limit on the clock, from its start level.
  let tierIndex = start.index;
  for (let i = start.index + 1; i < chainTiers.length; i++) {
    if (clockHours >= category.resolution_sla_hours * (i - start.index)) {
      tierIndex = i;
    }
  }

  return {
    ...base,
    currentTierIndex: tierIndex,
    currentTier: chainTiers[tierIndex],
    ackOverdue,
    needsLegalReview: false,
  };
}

// Every tier from LOCAL up to (and including) the currently escalated
// tier should retain visibility and its own red indicator — escalation is
// additive, not a handoff. This returns that full visible slice.
export function visibleTiers(chainTiers, currentTierIndex) {
  return chainTiers.slice(0, currentTierIndex + 1);
}
