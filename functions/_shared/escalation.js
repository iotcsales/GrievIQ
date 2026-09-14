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

export function computeEscalation(grievance, category, chainTiers) {
  const createdAtMs = new Date(grievance.created_at.replace(" ", "T") + "Z").getTime();
  const nowMs = Date.now();
  const elapsedHours = (nowMs - createdAtMs) / (1000 * 60 * 60);

  // Clock A: acknowledgment overdue check — independent of tier escalation.
  const ackOverdue =
    !grievance.acknowledged_at && elapsedHours >= category.ack_sla_hours;

  // Categories with no resolution SLA (e.g. land disputes) don't
  // auto-escalate — they're flagged for manual/legal review instead of
  // being pushed up the chain on a clock that doesn't fairly apply.
  if (!category.resolution_sla_hours) {
    return {
      currentTierIndex: 0,
      currentTier: chainTiers[0],
      ackOverdue,
      needsLegalReview: true,
      elapsedHours,
    };
  }

  // A resolved/closed case freezes wherever it last was — it doesn't keep
  // climbing the chain after the fact.
  if (grievance.status === "RESOLVED" || grievance.status === "CLOSED") {
    const frozenIndex = Math.max(
      0,
      chainTiers.findIndex((t) => t.tier === grievance.current_tier)
    );
    return {
      currentTierIndex: frozenIndex,
      currentTier: chainTiers[frozenIndex],
      ackOverdue: false,
      needsLegalReview: false,
      elapsedHours,
    };
  }

  let tierIndex = 0;
  for (let i = 1; i < chainTiers.length; i++) {
    if (elapsedHours >= category.resolution_sla_hours * i) {
      tierIndex = i;
    }
  }

  return {
    currentTierIndex: tierIndex,
    currentTier: chainTiers[tierIndex],
    ackOverdue,
    needsLegalReview: false,
    elapsedHours,
  };
}

// Every tier from LOCAL up to (and including) the currently escalated
// tier should retain visibility and its own red indicator — escalation is
// additive, not a handoff. This returns that full visible slice.
export function visibleTiers(chainTiers, currentTierIndex) {
  return chainTiers.slice(0, currentTierIndex + 1);
}
