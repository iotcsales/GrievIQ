// functions/_shared/departments.js
//
// The departments (department TYPES) a case can be forwarded to.
//
// Until Oct 2026 this was a fixed list of seven. Since grieviq-25 the list
// is managed by admins on the Departments page (table dept_types, database
// update part22-department-types.sql), following FixMyStreet's per-body
// category lists and Open311's per-city service list:
//   - each type has a KEY that never changes: it is what past records store
//     (follow-ups, offices, issue-type suggestions). For the original seven
//     the key is their English name, so every old record keeps its meaning.
//   - its English and Hindi names can be corrected; pages show the names.
//   - a type is retired, never deleted, so old records can still be read.
//
// Used by: add-followup.js (what the server accepts), issue-types.js,
// the department directory (dept-directory.js, admin departments API), the
// rep console and the citizen Track page (names), via deptTypes() below.
// Before the database update, everything uses the original seven.

export const DEPARTMENTS = [
  "Water Supply",
  "Electricity",
  "Sanitation / Garbage",
  "Roads & Public Works",
  "Health",
  "Legal / Land Records",
  "Other",
];

// Hindi names of the original seven (same as dept.* in public/i18n.js).
export const DEPT_HI = {
  "Water Supply": "जलापूर्ति विभाग", "Electricity": "विद्युत विभाग", "Sanitation / Garbage": "सफ़ाई / कूड़ा संग्रहण विभाग",
  "Roads & Public Works": "सड़क एवं लोक निर्माण विभाग", "Health": "स्वास्थ्य विभाग", "Legal / Land Records": "विधिक / भू-अभिलेख विभाग", "Other": "अन्य",
};

export const OTHER = "Other";

function builtIn() {
  return DEPARTMENTS.map((k, i) => ({ key: k, nameEn: k, nameHi: DEPT_HI[k], description: null, sort: i, builtIn: true, retired: false,
    updatedAt: null, retiredAt: null, retireReason: null }));
}

export function isMissingTypesTable(e) {
  return /no such table:?\s*dept_types/i.test(String(e && e.message));
}

// Every type (retired ones too, marked), in display order: "Other" last.
// [{ key, nameEn, nameHi, description, builtIn, retired, ... }]
export async function deptTypes(env) {
  let rows;
  try {
    ({ results: rows } = await env.DB.prepare(
      "SELECT key, name_en, name_hi, description, sort_order, built_in, retired_at, retire_reason, updated_at FROM dept_types"
    ).all());
  } catch (e) {
    if (isMissingTypesTable(e)) return builtIn();
    throw e;
  }
  if (!rows || !rows.length) return builtIn();
  const list = rows.map((r) => ({
    key: r.key, nameEn: r.name_en, nameHi: r.name_hi, description: r.description || null, sort: Number(r.sort_order) || 0,
    builtIn: !!r.built_in, retired: !!r.retired_at, retiredAt: r.retired_at || null, retireReason: r.retire_reason || null, updatedAt: r.updated_at || null,
  }));
  list.sort((a, b) => ((a.key === OTHER) - (b.key === OTHER)) || (a.sort - b.sort) || a.nameEn.localeCompare(b.nameEn));
  return list;
}

// Keys that may be chosen now (not retired), "Other" last.
export async function activeDeptKeys(env) {
  return (await deptTypes(env)).filter((t) => !t.retired).map((t) => t.key);
}

// { key: { en, hi } } for every type, for pages to show names.
export function namesOf(types) {
  const out = {};
  for (const t of types) out[t.key] = { en: t.nameEn, hi: t.nameHi || t.nameEn };
  return out;
}
