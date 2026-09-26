// functions/_shared/time-limits.js
//
// ONE place that decides whether each level of a case is "past its time
// limit", and when each deadline falls. Used by:
//   - functions/api/otp/verify.js  (citizen "Track my reports" ladder)
//   - functions/api/grievances.js  (rep console dots, dates and ladder)
// so the citizen page and the rep console can never disagree.
//
// Rules (moved here unchanged from verify.js):
//  - a level is past its time limit when the case is unresolved AND
//      * the case has already escalated past that level (escalation only
//        happens once the time limit has run out), or
//      * it is the current level and the case still hasn't been
//        acknowledged within the acknowledgement time limit, or
//      * it is the TOP level and its own time has run out
//        (resolution limit x number of levels).
//  - deadlines, from the category's own time limits (TATs):
//      * acknowledgement: filed + ack_sla_hours (only while unacknowledged)
//      * response at level i: filed + resolution_sla_hours x (i + 1),
//        shown for the current level only.
//  - categories with no resolution limit (e.g. land disputes) go to legal
//    review and have no response deadline.
//
// `result` is the output of computeEscalation() for the same case.

const HOUR = 3600000;

// Timestamps come in two shapes: legacy "YYYY-MM-DD HH:MM:SS" (UTC, no Z)
// and ISO with T/Z. Only the legacy shape gets "Z" appended.
export function toUtcMs(value) {
  const s = String(value || "");
  if (!s) return NaN;
  return s.indexOf("T") !== -1
    ? new Date(s).getTime()
    : new Date(s.replace(" ", "T") + "Z").getTime();
}

export function timeLimitStatus(grievance, category, chainTiers, result) {
  const isUnresolved = grievance.status !== "RESOLVED" && grievance.status !== "CLOSED";
  const createdMs = toUtcMs(grievance.created_at);
  const slaHours = category.resolution_sla_hours || null;
  const lastIndex = chainTiers.length - 1;

  const ackDueAt = !grievance.acknowledged_at && category.ack_sla_hours && !isNaN(createdMs)
    ? new Date(createdMs + category.ack_sla_hours * HOUR).toISOString()
    : null;

  // The top level has nowhere to escalate to, so it turns red once its
  // own time has run out (resolution limit x number of levels).
  const lastLevelOverdue = Boolean(isUnresolved && slaHours &&
    result.currentTierIndex === lastIndex &&
    result.elapsedHours >= slaHours * chainTiers.length);

  const tiers = chainTiers.map((t, i) => {
    const isCurrent = i === result.currentTierIndex;
    return {
      current: isCurrent && isUnresolved,
      slaBreached: isUnresolved && (
        i < result.currentTierIndex ||
        (isCurrent && result.ackOverdue) ||
        (isCurrent && lastLevelOverdue)
      ),
      dueAt: isCurrent && isUnresolved && slaHours && !isNaN(createdMs)
        ? new Date(createdMs + slaHours * (i + 1) * HOUR).toISOString()
        : null,
    };
  });

  return { isUnresolved, ackDueAt, tiers };
}
