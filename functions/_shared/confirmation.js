// functions/_shared/confirmation.js
//
// Waiting for the citizen to confirm a fix (item 7a, Sept 2026).
//
// When a representative marks a case resolved and the citizen gave an
// email, the case waits (PENDING_CONFIRMATION) for the citizen to say
// "fixed" or "still a problem". While it waits, escalation is paused
// (escalation.js) and no level turns red (time-limits.js).
//
// If the citizen doesn't reply within CONFIRM_DAYS, the case closes as
// "Resolved (not confirmed by citizen)". There is no scheduled job:
// settleOverdueConfirmations() is called at the start of every page or API
// that shows cases, and closes any that have run out of time with one
// UPDATE. Anti-gaming: a dispute reopens the case and all time since
// filing counts (dispute-resolution.js), so the pause only helps a
// representative when the fix is real.
//
// Item 7b-2: a citizen with no email can't be asked, so GrievIQ staff check
// the fix instead (admin Checks page: photos or a phone call). The case
// waits the same way (PENDING_CONFIRMATION, escalation paused, 7 days).
//
// How a closed case was resolved:
//   CONFIRMED           citizen_confirmed = 1
//   VERIFIED_BY_GRIEVIQ closure_kind = 'STAFF_VERIFIED' (staff checked it)
//   NOT_VERIFIED        closure_kind = 'STAFF_NOT_CHECKED' (no email, nobody
//                       checked within CONFIRM_DAYS)
//   NOT_CONFIRMED       citizen gave an email but never replied (auto-closed)
//   NO_EMAIL            no email, closed before staff checks existed

export const CONFIRM_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(value) {
  const s = String(value || "");
  if (!s) return NaN;
  return s.indexOf("T") !== -1 ? new Date(s).getTime() : new Date(s.replace(" ", "T") + "Z").getTime();
}

// When a case waiting for the citizen closes by itself (ISO), or null.
export function confirmDeadline(resolvedAt) {
  const ms = toMs(resolvedAt);
  return isNaN(ms) ? null : new Date(ms + CONFIRM_DAYS * DAY_MS).toISOString();
}

// CONFIRMED / NOT_CONFIRMED / NO_EMAIL for a resolved or closed case;
// null while it is open or waiting.
export function resolutionKind(g) {
  if (!g || (g.status !== "RESOLVED" && g.status !== "CLOSED")) return null;
  if (Number(g.citizen_confirmed) === 1) return "CONFIRMED";
  if (g.closure_kind === "STAFF_VERIFIED") return "VERIFIED_BY_GRIEVIQ";
  if (g.closure_kind === "STAFF_NOT_CHECKED") return "NOT_VERIFIED";
  const hasEmail = g.citizen_email != null && String(g.citizen_email).trim() !== "";
  return hasEmail ? "NOT_CONFIRMED" : "NO_EMAIL";
}

// Closes every case whose confirmation time has run out. resolved_at may be
// ISO ("...T...Z") or legacy ("YYYY-MM-DD HH:MM:SS"); both are compared in
// the legacy shape. Never throws: a failure here must not break the page.
// Waiting for a GrievIQ staff check rather than the citizen (no email).
export function awaitingStaffCheck(g) {
  return !!g && g.status === "PENDING_CONFIRMATION" && (g.citizen_email == null || String(g.citizen_email).trim() === "");
}

export async function settleOverdueConfirmations(env) {
  try {
    await env.DB.prepare(
      `UPDATE grievances
       SET status = 'RESOLVED', updated_at = ?,
           closure_kind = CASE WHEN COALESCE(TRIM(citizen_email), '') = '' THEN 'STAFF_NOT_CHECKED' ELSE closure_kind END
       WHERE status = 'PENDING_CONFIRMATION'
         AND resolved_at IS NOT NULL
         AND REPLACE(REPLACE(resolved_at, 'T', ' '), 'Z', '') < datetime('now', ?)`
    ).bind(new Date().toISOString(), "-" + CONFIRM_DAYS + " days").run();
  } catch (e) {
    // Ignore: the case simply closes the next time a page is opened.
  }
}
