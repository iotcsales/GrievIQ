// functions/_shared/dept-rules.js
//
// "Rules for officers" (grieviq-37, approved 10 Oct 2026). Every department
// officer accepts the current version once, at sign-in, before seeing any
// case (NIST SP 800-53 PL-4 "rules of behavior" and AC-8 "system use
// notification"). The wording is in i18n.js (dd.rules_*); raise
// RULES_VERSION whenever the rules change, and every officer is asked again.
export const RULES_VERSION = "1";

// True when this officer still has to accept the current rules. Before
// part26 (no rules_version column) nobody is asked.
export function rulesPending(officer) {
  return !!officer && Object.prototype.hasOwnProperty.call(officer, "rules_version") && officer.rules_version !== RULES_VERSION;
}
