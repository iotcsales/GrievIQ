// functions/_shared/departments.js
//
// The ONE list of departments a case can be forwarded to. Used by:
//   - functions/api/grievances/[id]/add-followup.js (what the server accepts)
//   - functions/api/admin/issue-types.js (what admins can pick as the
//     suggested department for an issue type)
// so the two can never drift apart. The rep console (public/rep.html) and
// the Hindi names in public/i18n.js list the same seven.
//
// Past follow-ups store these names as text, so a department must never be
// renamed or removed here without a plan for old records (see the pending
// "manage departments" item: retire, don't delete).

export const DEPARTMENTS = [
  "Water Supply",
  "Electricity",
  "Sanitation / Garbage",
  "Roads & Public Works",
  "Health",
  "Legal / Land Records",
  "Other",
];
