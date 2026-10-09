// functions/_shared/dept-types.js
//
// Managing the list of department types (grieviq-25, approved Oct 2026).
// See departments.js for how the list is read. Here: the checks and the
// changes, used by the admin Departments API and by Change requests (data
// entry operators' requests are checked again with these same rules when
// approved).
//
//   add      a new type: English + Hindi name (both required, so Hindi pages
//            never fall back to English), optional one-line description.
//            Its key is its English name at the time it is added, and never
//            changes after that.
//   rename   correct the names or description (the key stays).
//   retire   hide it from new choices; refused while an office in use or an
//            issue type's suggestion still uses it; "Other" is never retired.
//   restore  bring a retired type back.
// Names must be unique (English: against every type's key and English name;
// Hindi: against every Hindi name), ignoring case.

import { deptTypes, OTHER } from "./departments.js";

const EN_RE = /^[A-Za-z0-9][A-Za-z0-9 .,'()&\/\-]{1,59}$/;
const HI_MAX = 60, DESC_MAX = 150;

function clean(v) {
  if (v == null) return null;
  const s = String(v).normalize("NFC").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

// returns { ok: true, values: { nameEn, nameHi, description } } or { ok: false, fields }
export function checkTypeNames(input, types, ownKey) {
  const fields = {};
  const nameEn = clean(input && input.nameEn), nameHi = clean(input && input.nameHi), description = clean(input && input.description);
  if (!nameEn) fields.typeNameEn = "REQUIRED";
  else if (nameEn.length > 60) fields.typeNameEn = "LENGTH";
  else if (!EN_RE.test(nameEn)) fields.typeNameEn = "FORMAT";
  if (!nameHi) fields.typeNameHi = "REQUIRED";
  else if (nameHi.length > HI_MAX) fields.typeNameHi = "LENGTH";
  else if (!/[ऀ-ॿ]/.test(nameHi)) fields.typeNameHi = "NOT_HINDI";
  if (description && description.length > DESC_MAX) fields.typeDescription = "LENGTH";
  // Departments stage 3: the department's target time in days (1-21, default 7).
  let targetDays = null;
  if (input && input.targetDays != null && String(input.targetDays).trim() !== "") {
    targetDays = Number(input.targetDays);
    if (!Number.isInteger(targetDays) || targetDays < 1 || targetDays > 21) fields.typeTargetDays = "RANGE";
  }
  const others = types.filter((t) => t.key !== ownKey);
  if (nameEn && !fields.typeNameEn && others.some((t) => [t.key, t.nameEn].some((n) => n && n.toLowerCase() === nameEn.toLowerCase()))) fields.typeNameEn = "TAKEN";
  if (nameHi && !fields.typeNameHi && others.some((t) => t.nameHi && t.nameHi.toLowerCase() === nameHi.toLowerCase())) fields.typeNameHi = "TAKEN";
  if (Object.keys(fields).length) return { ok: false, fields };
  return { ok: true, values: { nameEn, nameHi, description, targetDays } };
}

// What still uses a type: offices in use (any area) and issue types.
export async function typeUsage(env, key) {
  const { results: offices } = await env.DB.prepare(
    `SELECT o.id, o.name_en, o.area_id FROM dept_offices o
      WHERE o.retired_at IS NULL AND EXISTS (SELECT 1 FROM json_each(o.departments) j WHERE j.value = ?) ORDER BY o.name_en LIMIT 50`
  ).bind(key).all();
  const { results: issues } = await env.DB.prepare(
    "SELECT id, name FROM grievance_categories WHERE suggested_department = ? ORDER BY name LIMIT 50"
  ).bind(key).all();
  return { offices: (offices || []).map((o) => ({ id: o.id, name: o.name_en, areaId: o.area_id })), issueTypes: (issues || []).map((i) => ({ id: i.id, name: i.name })) };
}

export async function typesReady(env) {
  try { await env.DB.prepare("SELECT key FROM dept_types LIMIT 1").first(); return true; }
  catch (e) { if (/no such table/i.test(String(e && e.message))) return false; throw e; }
}

export async function getType(env, key) {
  return (await deptTypes(env)).find((t) => t.key === String(key || "")) || null;
}

// Sets the target days if that column exists yet (database update part23).
async function setTargetDays(env, key, days) {
  try { await env.DB.prepare("UPDATE dept_types SET target_days = ? WHERE key = ?").bind(days == null ? null : days, key).run(); }
  catch (e) { if (!/no such column/i.test(String(e && e.message))) throw e; }
}

export async function addType(env, v, actor) {
  const now = new Date().toISOString();
  const max = await env.DB.prepare("SELECT MAX(sort_order) AS m FROM dept_types WHERE key <> ?").bind(OTHER).first();
  const sort = Math.max(6, Number(max && max.m) || 0) + 1;
  await env.DB.prepare(
    `INSERT INTO dept_types (key, name_en, name_hi, description, sort_order, built_in, created_at, created_by, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
  ).bind(v.nameEn, v.nameEn, v.nameHi, v.description || null, sort, now, actor, now, actor).run();
  if (v.targetDays != null) await setTargetDays(env, v.nameEn, v.targetDays);
  return v.nameEn;
}

// Each change happens only if the type is still as the person saw it.
export async function renameType(env, key, v, actor, expectedUpdatedAt) {
  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    "UPDATE dept_types SET name_en = ?, name_hi = ?, description = ?, updated_at = ?, updated_by = ? WHERE key = ? AND updated_at = ?"
  ).bind(v.nameEn, v.nameHi, v.description || null, now, actor, key, expectedUpdatedAt || "").run();
  const ok = !!(r.meta && r.meta.changes);
  if (ok) await setTargetDays(env, key, v.targetDays);
  return ok;
}
export async function retireType(env, key, actor, reason, expectedUpdatedAt) {
  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    "UPDATE dept_types SET retired_at = ?, retired_by = ?, retire_reason = ?, updated_at = ?, updated_by = ? WHERE key = ? AND retired_at IS NULL AND updated_at = ?"
  ).bind(now, actor, reason, now, actor, key, expectedUpdatedAt || "").run();
  return !!(r.meta && r.meta.changes);
}
export async function restoreType(env, key, actor, expectedUpdatedAt) {
  const now = new Date().toISOString();
  const r = await env.DB.prepare(
    "UPDATE dept_types SET retired_at = NULL, retired_by = NULL, retire_reason = NULL, updated_at = ?, updated_by = ? WHERE key = ? AND retired_at IS NOT NULL AND updated_at = ?"
  ).bind(now, actor, key, expectedUpdatedAt || "").run();
  return !!(r.meta && r.meta.changes);
}

// Can this type be retired now? { ok } or { ok: false, code, usage }
export async function canRetire(env, t) {
  if (t.key === OTHER) return { ok: false, code: "OTHER" };
  const usage = await typeUsage(env, t.key);
  if (usage.offices.length || usage.issueTypes.length) return { ok: false, code: "IN_USE", usage };
  return { ok: true };
}

// Approving a data entry operator's request (change_requests kind "dept_type").
// new_values: { op: add|rename|retire|restore, key?, values?, reason? }
// old_values: { updatedAt } for changes to an existing type.
export async function applyTypeRequest(env, actor, nv, ov) {
  const types = await deptTypes(env);
  if (nv.op === "add") {
    const c = checkTypeNames(nv.values, types, null);
    if (!c.ok) return { result: "out_of_date", error: "This type can no longer be added as requested (" + Object.keys(c.fields).join(", ") + ")." };
    const key = await addType(env, c.values, actor);
    return { result: "approved", key, log: { action: "dept_type_added", target: key, detail: c.values } };
  }
  const t = types.find((x) => x.key === nv.key);
  if (!t) return { result: "invalid", error: "The type no longer exists." };
  if (t.updatedAt !== (ov && ov.updatedAt)) return { result: "out_of_date", error: "The type was changed after this request was made." };
  if (nv.op === "rename") {
    const c = checkTypeNames(nv.values, types, t.key);
    if (!c.ok) return { result: "out_of_date", error: "The new names no longer pass the checks (" + Object.keys(c.fields).join(", ") + ")." };
    if (!(await renameType(env, t.key, c.values, actor, t.updatedAt))) return { result: "out_of_date", error: "The type was changed after this request was made." };
    return { result: "approved", key: t.key, log: { action: "dept_type_renamed", target: t.key, detail: { before: { nameEn: t.nameEn, nameHi: t.nameHi, description: t.description }, after: c.values } } };
  }
  if (nv.op === "retire") {
    const can = await canRetire(env, t);
    if (!can.ok) return { result: "out_of_date", error: can.code === "OTHER" ? "\"Other\" can't be retired." : "The type is now used by an office or issue type." };
    if (!(await retireType(env, t.key, actor, nv.reason || null, t.updatedAt))) return { result: "out_of_date", error: "The type was changed after this request was made." };
    return { result: "approved", key: t.key, log: { action: "dept_type_retired", target: t.key, detail: { name: t.nameEn, reason: nv.reason || null } } };
  }
  if (nv.op === "restore") {
    if (!(await restoreType(env, t.key, actor, t.updatedAt))) return { result: "out_of_date", error: "The type was changed after this request was made." };
    return { result: "approved", key: t.key, log: { action: "dept_type_restored", target: t.key, detail: { name: t.nameEn } } };
  }
  return { result: "invalid", error: "Unknown request." };
}
