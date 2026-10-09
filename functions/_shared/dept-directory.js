// functions/_shared/dept-directory.js
//
// Departments, stage 1 (approved Oct 2026): the department directory.
//
// For each area (city or district), the offices that handle each kind of
// problem, with their OFFICIAL public contacts, where each contact came from
// and when it was last checked. Used by:
//   - functions/api/admin/departments.js   (the admin Departments page)
//   - functions/api/admin/change-requests.js (data entry operators' requests,
//     checked again with these same rules when approved)
//   - stage 2: the contact card on each case (matchOffices)
//
// International pattern followed:
//   - FixMyStreet (mySociety): one contact per body and category; a contact
//     is "confirmed" or not; contacts are retired ("deleted" state kept),
//     never removed, so old reports keep their meaning.
//   - Open311 GeoReport v2: services listed per jurisdiction, so an Open311
//     endpoint can be added to an office later without a new table.
//   - DPDP Act 2023 (data minimisation, s.6 consent): official office
//     contacts only. A named officer's own mobile is stored only with a
//     record of their agreement (who, when, how).
//   - OWASP ASVS V5: every field checked on the server for type, format and
//     length; errors are returned per field so the page shows them next to it.

import { deptTypes, activeDeptKeys, OTHER } from "./departments.js";
import { validateContact, EMAIL_RE } from "./contact-validation.js";

export const STALE_DAYS = 365;            // "Check again" after a year
export const IMPORT_MAX_ROWS = 300;
export const CSV_COLUMNS = [
  "office_name_en", "office_name_hi", "handles", "wards", "helpline", "office_phone", "office_email",
  "whatsapp", "website", "address", "hours", "source", "last_checked", "notes",
];

const LIMITS = { name_en: 120, name_hi: 120, address: 300, hours: 120, website: 300, source: 300, notes: 500,
  officer_name: 120, officer_consent_how: 200, retire_reason: 300 };


export function isMissingDeptTable(e) {
  return /no such table:?\s*dept_offices/i.test(String(e && e.message));
}

function text(v, max) {
  if (v == null) return null;
  const s = String(v).normalize("NFC").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;             // length is checked by the caller, so it can say "too long"
}
function istToday() { return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); }
function validDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const x = new Date(d + "T00:00:00Z");
  return !isNaN(x) && x.toISOString().slice(0, 10) === d;
}
// "07-10-2026" or "7/10/2026" (Indian order) -> "2026-10-07"; ISO passes through.
export function normaliseDate(v) {
  const s = String(v == null ? "" : v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  return s;
}

// A helpline: a short code (1533, 1912, 1076), a toll-free number
// (1800 410 1912), or any valid Indian phone number.
function helplineOk(v) {
  if (!/^[+\d\s\-()]+$/.test(v) || v.length > 40) return false;
  const d = v.replace(/\D/g, "");
  if (/^\d{3,6}$/.test(d) && /^1/.test(d)) return true;                 // short code
  if (/^1800\d{6,7}$/.test(d) || /^1860\d{7}$/.test(d)) return true;     // toll-free / shared cost
  return validateContact({ phone: v }).ok;
}
function phoneOk(v) {
  const d = String(v).replace(/\D/g, "");
  if (/^1800\d{6,7}$/.test(d)) return /^[+\d\s\-()]+$/.test(v);
  return validateContact({ phone: v }).ok;
}
// WhatsApp needs a mobile: 10 digits starting 6-9, optionally with +91 / 0.
function mobileOk(v) {
  if (!/^[+\d\s\-()]+$/.test(v)) return false;
  let d = v.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d[0] === "0") d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d);
}
function urlOk(v) {
  if (!/^https?:\/\//i.test(v) || /\s/.test(v)) return false;
  try { const u = new URL(v); return !!u.hostname && u.hostname.includes("."); } catch (e) { return false; }
}

function parseList(textValue) {
  if (textValue == null || textValue === "") return null;
  try { const v = JSON.parse(textValue); return Array.isArray(v) ? v.map(String) : null; } catch (e) { return null; }
}

// The area's wards and villages: [{ id, name, type }]
export async function areaUnits(env, areaId) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, unit_type FROM local_units WHERE area_id = ? ORDER BY unit_type DESC, name LIMIT 3000"
  ).bind(areaId).all();
  return (results || []).map((u) => ({ id: u.id, name: u.name, type: u.unit_type }));
}

// Check one office. input uses the API's field names (camelCase):
//   nameEn, nameHi, departments[], wards ("ALL" | [unit ids]), helpline,
//   officePhone, officeEmail, whatsapp, website, address, hours,
//   officerName, officerPhone, officerConsentDate, officerConsentHow,
//   source, lastChecked, notes
// opts: { units: areaUnits(...) result, excludeId }
// returns { ok: true, values } or { ok: false, fields: { field: CODE } }
export async function checkOffice(env, areaId, input, opts) {
  const b = input || {};
  const fields = {};
  const units = (opts && opts.units) || await areaUnits(env, areaId);
  const v = {};
  const put = (key, field, max) => {
    const s = text(b[key]);
    if (s && max && s.length > max) fields[field || key] = "LENGTH";
    v[key] = s;
    return s;
  };

  const nameEn = put("nameEn", "nameEn", LIMITS.name_en);
  if (!nameEn) fields.nameEn = "REQUIRED";
  else if (nameEn.length < 3 && !fields.nameEn) fields.nameEn = "SHORT";
  put("nameHi", "nameHi", LIMITS.name_hi);

  const depts = Array.isArray(b.departments) ? Array.from(new Set(b.departments.map((d) => String(d).trim()))) : [];
  if (!depts.length) fields.departments = "REQUIRED";
  const keys = (opts && opts.typeKeys) || await activeDeptKeys(env);
  if (depts.length && depts.some((d) => !keys.includes(d))) fields.departments = "FORMAT";
  v.departments = keys.filter((d) => depts.includes(d));   // stored in the list's order

  if (b.wards === "ALL") {
    v.wards = null;                       // the whole area
  } else if (Array.isArray(b.wards) && b.wards.length) {
    const known = new Set(units.map((u) => u.id));
    const ids = Array.from(new Set(b.wards.map(String)));
    if (ids.some((id) => !known.has(id))) fields.wards = "UNKNOWN";
    v.wards = units.filter((u) => ids.includes(u.id)).map((u) => u.id);
  } else {
    fields.wards = "REQUIRED";
  }

  const helpline = put("helpline");
  if (helpline && !helplineOk(helpline)) fields.helpline = "FORMAT";
  const officePhone = put("officePhone");
  if (officePhone && !phoneOk(officePhone)) fields.officePhone = "FORMAT";
  const officeEmail = put("officeEmail", "officeEmail", 200);
  if (officeEmail) {
    v.officeEmail = officeEmail.toLowerCase();
    if (!fields.officeEmail && !EMAIL_RE.test(officeEmail)) fields.officeEmail = "FORMAT";
  }
  const whatsapp = put("whatsapp");
  if (whatsapp && !mobileOk(whatsapp)) fields.whatsapp = "FORMAT";
  const website = put("website", "website", LIMITS.website);
  if (website && !fields.website && !urlOk(website)) fields.website = "FORMAT";
  put("address", "address", LIMITS.address);
  put("hours", "hours", LIMITS.hours);
  put("notes", "notes", LIMITS.notes);

  // A named officer's own mobile: only with their recorded agreement.
  const officerName = put("officerName", "officerName", LIMITS.officer_name);
  const officerPhone = put("officerPhone");
  const consentDate = text(b.officerConsentDate) ? normaliseDate(b.officerConsentDate) : null;
  const consentHow = put("officerConsentHow", "officerConsentHow", LIMITS.officer_consent_how);
  v.officerConsentDate = consentDate;
  if (officerPhone) {
    if (!mobileOk(officerPhone) && !phoneOk(officerPhone)) fields.officerPhone = "FORMAT";
    if (!officerName) fields.officerName = "REQUIRED";
    if (!consentDate) fields.officerConsentDate = "REQUIRED";
    else if (!validDate(consentDate)) fields.officerConsentDate = "FORMAT";
    else if (consentDate > istToday()) fields.officerConsentDate = "FUTURE";
    if (!consentHow) fields.officerConsentHow = "REQUIRED";
    else if (consentHow.length < 5 && !fields.officerConsentHow) fields.officerConsentHow = "SHORT";
  } else {
    // No personal number: nothing about an officer's consent is kept.
    v.officerName = officerName;
    v.officerConsentDate = null;
    v.officerConsentHow = null;
  }

  if (!helpline && !officePhone && !officeEmail && !whatsapp && !website) fields.contact = "NO_CONTACT";

  const source = put("source", "source", LIMITS.source);
  if (!source) fields.source = "REQUIRED";
  else if (source.length < 5 && !fields.source) fields.source = "SHORT";
  const lastChecked = text(b.lastChecked) ? normaliseDate(b.lastChecked) : null;
  v.lastChecked = lastChecked;
  if (!lastChecked) fields.lastChecked = "REQUIRED";
  else if (!validDate(lastChecked)) fields.lastChecked = "FORMAT";
  else if (lastChecked > istToday()) fields.lastChecked = "FUTURE";
  else if (lastChecked < "2000-01-01") fields.lastChecked = "FORMAT";

  if (nameEn && !fields.nameEn) {
    const clash = await env.DB.prepare(
      "SELECT id FROM dept_offices WHERE area_id = ? AND LOWER(name_en) = LOWER(?) AND retired_at IS NULL AND id IS NOT ?"
    ).bind(areaId, nameEn, (opts && opts.excludeId) || null).first();
    if (clash) fields.nameEn = "TAKEN";
  }

  if (Object.keys(fields).length) return { ok: false, fields };
  return { ok: true, values: v };
}

function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50);
}
async function freeId(env, base) {
  let id = base || "office";
  for (let n = 2; await env.DB.prepare("SELECT id FROM dept_offices WHERE id = ?").bind(id).first(); n++) id = base + "-" + n;
  return id;
}

function bindValues(v) {
  return [v.nameEn, v.nameHi || null, JSON.stringify(v.departments), v.wards ? JSON.stringify(v.wards) : null,
    v.helpline || null, v.officePhone || null, v.officeEmail || null, v.whatsapp || null, v.website || null,
    v.address || null, v.hours || null, v.officerName || null, v.officerPhone || null,
    v.officerConsentDate || null, v.officerConsentHow || null, v.source, v.lastChecked, v.notes || null];
}
const COLS = "name_en, name_hi, departments, wards, helpline, office_phone, office_email, whatsapp, website, address, hours, " +
  "officer_name, officer_phone, officer_consent_date, officer_consent_how, source, last_checked, notes";

// Statement that creates one office (so imports can save many in one batch).
export async function insertStatement(env, areaId, v, actor, takenIds) {
  let base = "dept-" + (slugify(areaId) || "area") + "-" + (slugify(v.nameEn) || "office");
  let id = await freeId(env, base);
  if (takenIds) { let n = 2; const b0 = id; while (takenIds.has(id)) id = b0 + "-" + n++; takenIds.add(id); }
  const now = new Date().toISOString();
  const stmt = env.DB.prepare(
    `INSERT INTO dept_offices (id, area_id, ${COLS}, created_at, created_by, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, areaId, ...bindValues(v), now, actor, now, actor);
  return { id, stmt, now };
}

export async function insertOffice(env, areaId, v, actor) {
  const { id, stmt } = await insertStatement(env, areaId, v, actor);
  await stmt.run();
  return id;
}

// Change an office only if it still has the version the person was looking
// at (expectedUpdatedAt), so two people can't overwrite each other.
export async function updateOffice(env, id, v, actor, expectedUpdatedAt) {
  const now = new Date().toISOString();
  const set = COLS.split(", ").map((c) => c + " = ?").join(", ");
  const res = await env.DB.prepare(
    `UPDATE dept_offices SET ${set}, updated_at = ?, updated_by = ? WHERE id = ? AND updated_at = ? AND retired_at IS NULL`
  ).bind(...bindValues(v), now, actor, id, expectedUpdatedAt || "").run();
  return !!(res.meta && res.meta.changes);
}

export async function retireOffice(env, id, actor, reason, expectedUpdatedAt) {
  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    "UPDATE dept_offices SET retired_at = ?, retired_by = ?, retire_reason = ?, updated_at = ?, updated_by = ? WHERE id = ? AND retired_at IS NULL AND updated_at = ?"
  ).bind(now, actor, reason, now, actor, id, expectedUpdatedAt || "").run();
  return !!(res.meta && res.meta.changes);
}

// Bringing an office back is checked like a new one (its name may now be
// used by another office).
export async function restoreOffice(env, id, actor, expectedUpdatedAt) {
  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    "UPDATE dept_offices SET retired_at = NULL, retired_by = NULL, retire_reason = NULL, updated_at = ?, updated_by = ? WHERE id = ? AND retired_at IS NOT NULL AND updated_at = ?"
  ).bind(now, actor, id, expectedUpdatedAt || "").run();
  return !!(res.meta && res.meta.changes);
}

export async function getOffice(env, id) {
  const r = await env.DB.prepare("SELECT * FROM dept_offices WHERE id = ?").bind(String(id || "")).first();
  return r ? shapeOffice(r) : null;
}

function daysSince(d) {
  if (!d) return null;
  const x = new Date(d + "T00:00:00+05:30");
  return isNaN(x) ? null : Math.floor((Date.now() - x.getTime()) / 86400000);
}

export function shapeOffice(r) {
  const wards = parseList(r.wards);
  return {
    id: r.id, areaId: r.area_id, nameEn: r.name_en, nameHi: r.name_hi || null,
    departments: parseList(r.departments) || [], wards: wards, wholeArea: !wards,
    helpline: r.helpline, officePhone: r.office_phone, officeEmail: r.office_email, whatsapp: r.whatsapp,
    website: r.website, address: r.address, hours: r.hours,
    officerName: r.officer_name, officerPhone: r.officer_phone,
    officerConsentDate: r.officer_consent_date, officerConsentHow: r.officer_consent_how,
    source: r.source, lastChecked: r.last_checked, notes: r.notes,
    needsCheck: (daysSince(r.last_checked) || 0) > STALE_DAYS,
    createdAt: r.created_at, createdBy: r.created_by, updatedAt: r.updated_at, updatedBy: r.updated_by,
    retired: !!r.retired_at, retiredAt: r.retired_at, retiredBy: r.retired_by, retireReason: r.retire_reason,
  };
}

export async function listOffices(env, areaId) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM dept_offices WHERE area_id = ? ORDER BY (retired_at IS NOT NULL), LOWER(name_en) LIMIT 1000"
  ).bind(areaId).all();
  return (results || []).map(shapeOffice);
}

// Which offices handle department `dept` in this ward: those covering just
// this ward first, then those covering the whole area. Retired offices
// never match.
export function officesFor(offices, unitId, dept) {
  const live = offices.filter((o) => !o.retired && o.departments.includes(dept));
  const exact = live.filter((o) => o.wards && o.wards.includes(unitId));
  const whole = live.filter((o) => !o.wards);
  return exact.concat(whole);
}

// Stage 2 will call this from the case page.
export async function matchOffices(env, unitId, dept) {
  const unit = await env.DB.prepare("SELECT id, area_id FROM local_units WHERE id = ?").bind(String(unitId || "")).first();
  if (!unit) return [];
  return officesFor(await listOffices(env, unit.area_id || "lucknow"), unit.id, dept);
}

// Coverage: every ward or village against every department type.
export function coverage(units, offices, typeKeys) {
  const depts = typeKeys.filter((d) => d !== OTHER);
  const cells = {};
  let gaps = 0;
  for (const u of units) {
    cells[u.id] = {};
    for (const d of depts) {
      const list = officesFor(offices, u.id, d).map((o) => o.id);
      cells[u.id][d] = list;
      if (!list.length) gaps++;
    }
  }
  return { departments: depts, cells, gaps };
}

// ---- CSV ----
// Same small parser as the jurisdiction import (quoted fields, "" escapes).
export function parseCsv(textIn) {
  const rows = []; let row = []; let field = ""; let q = false;
  const src = String(textIn || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

// Department types in a file may be written by their English or Hindi name, any case.
function deptFromText(s, types) {
  const k = String(s || "").trim().toLowerCase();
  if (!k) return null;
  const t = types.find((x) => !x.retired && [x.key, x.nameEn, x.nameHi].some((n) => n && String(n).toLowerCase() === k));
  return t ? t.key : null;
}

// The file's rows -> API inputs, with problems found while reading named
// per column (e.g. a ward name that isn't in this area).
// "area" column is accepted and ignored if it names the chosen area.
export function rowsFromCsv(csvText, units, areaName, types) {
  const all = parseCsv(csvText);
  if (!all.length) return { ok: false, error: "EMPTY" };
  const header = all[0].map((h) => String(h).trim().toLowerCase().replace(/\s+/g, "_"));
  const missing = ["office_name_en", "handles", "wards", "source", "last_checked"].filter((c) => !header.includes(c));
  if (missing.length) return { ok: false, error: "COLUMNS", missing };
  const data = all.slice(1);
  if (data.length > IMPORT_MAX_ROWS) return { ok: false, error: "TOO_MANY", max: IMPORT_MAX_ROWS };
  const byName = {};
  for (const u of units) byName[String(u.name).trim().toLowerCase()] = u.id;
  const out = data.map((cells, i) => {
    const get = (c) => { const j = header.indexOf(c); return j === -1 ? "" : String(cells[j] == null ? "" : cells[j]).trim(); };
    const pre = {};
    const area = get("area");
    if (area && areaName && area.toLowerCase() !== String(areaName).toLowerCase()) pre.area = "OTHER_AREA";
    const handles = get("handles").split("|").map((s) => s.trim()).filter(Boolean);
    const departments = handles.map((h) => deptFromText(h, types));
    if (departments.some((d) => !d)) pre.departments = "FORMAT";
    const wardsText = get("wards");
    let wards;
    if (!wardsText) wards = null;
    else if (/^(all|whole city|whole area|सभी)$/i.test(wardsText)) wards = "ALL";
    else {
      const names = wardsText.split("|").map((s) => s.trim()).filter(Boolean);
      const unknown = names.filter((n) => !byName[n.toLowerCase()]);
      if (unknown.length) pre.wards = "UNKNOWN";
      wards = names.map((n) => byName[n.toLowerCase()]).filter(Boolean);
      if (unknown.length) pre.unknownWards = unknown;
    }
    return {
      line: i + 2,
      pre,
      input: {
        nameEn: get("office_name_en"), nameHi: get("office_name_hi"), departments: departments.filter(Boolean),
        wards, helpline: get("helpline"), officePhone: get("office_phone"), officeEmail: get("office_email"),
        whatsapp: get("whatsapp"), website: get("website"), address: get("address"), hours: get("hours"),
        source: get("source"), lastChecked: get("last_checked"), notes: get("notes"),
      },
    };
  });
  return { ok: true, rows: out };
}

// Check every row of a file. Names repeated within the file count as taken.
export async function checkRows(env, areaId, rows, units) {
  const seen = new Set();
  const checked = [];
  for (const r of rows) {
    const c = await checkOffice(env, areaId, r.input, { units });
    const fields = Object.assign({}, c.ok ? {} : c.fields, r.pre);
    delete fields.unknownWards;
    const key = String(r.input.nameEn || "").toLowerCase();
    if (key && seen.has(key) && !fields.nameEn) fields.nameEn = "DUPLICATE";
    if (key) seen.add(key);
    const ok = !Object.keys(fields).length;
    checked.push({ line: r.line, nameEn: r.input.nameEn || "", ok, fields, unknownWards: r.pre.unknownWards || null, values: ok ? c.values : null });
  }
  return checked;
}

// The template people download (same columns, one example row).
export function csvTemplate(areaName) {
  return CSV_COLUMNS.join(",") + "\n" +
    ['"Nagar Nigam Control Room"', '"नगर निगम कंट्रोल रूम"', '"Sanitation / Garbage|Roads & Public Works"', "ALL", "1533", "", "office@example.gov.in",
      "", "https://example.gov.in/helpline", '"Main office address"', '"24 hours"', "https://example.gov.in/helpline", istToday(), '""'].join(",") + "\n";
}

// ---- Data entry operators' requests (maker-checker) ----
// Stored in change_requests with kind "dept_office" (one office: add, change,
// retire or bring back) or "dept_import" (a whole file). The approver's
// approval applies them here, after checking them again with today's rules
// and against the office as it is now (OWASP: no time-of-check/time-of-use
// gap): a request made against an older version becomes OUT_OF_DATE.
export function valuesToInput(v) {
  return Object.assign({}, v, { wards: v && v.wards ? v.wards : "ALL" });
}

// returns { result: "approved" | "out_of_date" | "invalid", error?, officeId?, ids? , log }
export async function applyDeptRequest(env, actor, r, newValues, oldValues) {
  const nv = newValues || {};
  if (r.kind === "dept_import") {
    const units = await areaUnits(env, nv.areaId);
    const rows = Array.isArray(nv.rows) ? nv.rows : [];
    if (!rows.length) return { result: "invalid", error: "The request has no offices in it." };
    const seen = new Set();
    for (const v of rows) {
      const c = await checkOffice(env, nv.areaId, valuesToInput(v), { units });
      const key = String(v.nameEn || "").toLowerCase();
      if (!c.ok || seen.has(key)) return { result: "out_of_date", error: "\"" + (v.nameEn || "?") + "\" can no longer be added as requested (" + Object.keys(c.ok ? { nameEn: 1 } : c.fields).join(", ") + ")." };
      seen.add(key);
    }
    const taken = new Set();
    const stmts = [], ids = [];
    for (const v of rows) { const s = await insertStatement(env, nv.areaId, v, actor, taken); stmts.push(s.stmt); ids.push(s.id); }
    await env.DB.batch(stmts);
    return { result: "approved", ids, log: { action: "dept_offices_imported", target: nv.areaId, detail: { count: ids.length, ids, names: rows.map((x) => x.nameEn) } } };
  }
  // dept_office
  const op = nv.op;
  if (op === "create") {
    const c = await checkOffice(env, nv.areaId, valuesToInput(nv.values));
    if (!c.ok) return { result: "out_of_date", error: "This office can no longer be added as requested (" + Object.keys(c.fields).join(", ") + ")." };
    const id = await insertOffice(env, nv.areaId, c.values, actor);
    return { result: "approved", officeId: id, log: { action: "dept_office_added", target: id, detail: { areaId: nv.areaId, after: c.values } } };
  }
  const cur = await getOffice(env, nv.officeId);
  if (!cur) return { result: "invalid", error: "The office no longer exists." };
  const expected = oldValues && oldValues.updatedAt;
  if (cur.updatedAt !== expected) return { result: "out_of_date", error: "The office was changed after this request was made." };
  if (op === "update") {
    const c = await checkOffice(env, cur.areaId, valuesToInput(nv.values), { excludeId: cur.id });
    if (!c.ok) return { result: "out_of_date", error: "The change no longer passes the checks (" + Object.keys(c.fields).join(", ") + ")." };
    if (!(await updateOffice(env, cur.id, c.values, actor, expected))) return { result: "out_of_date", error: "The office was changed after this request was made." };
    return { result: "approved", officeId: cur.id, log: { action: "dept_office_changed", target: cur.id, detail: { before: officeValues(cur), after: c.values } } };
  }
  if (op === "retire") {
    if (!(await retireOffice(env, cur.id, actor, nv.reason || null, expected))) return { result: "out_of_date", error: "The office was changed after this request was made." };
    return { result: "approved", officeId: cur.id, log: { action: "dept_office_retired", target: cur.id, detail: { name: cur.nameEn, reason: nv.reason || null } } };
  }
  if (op === "restore") {
    const c = await checkOffice(env, cur.areaId, valuesToInput(officeValues(cur)), { excludeId: cur.id });
    if (!c.ok && c.fields.nameEn === "TAKEN") return { result: "out_of_date", error: "Another office now has this name." };
    if (!(await restoreOffice(env, cur.id, actor, expected))) return { result: "out_of_date", error: "The office was changed after this request was made." };
    return { result: "approved", officeId: cur.id, log: { action: "dept_office_restored", target: cur.id, detail: { name: cur.nameEn } } };
  }
  return { result: "invalid", error: "Unknown request." };
}

// An office's saved details in the same shape checkOffice returns.
export function officeValues(o) {
  return {
    nameEn: o.nameEn, nameHi: o.nameHi, departments: o.departments, wards: o.wards,
    helpline: o.helpline, officePhone: o.officePhone, officeEmail: o.officeEmail, whatsapp: o.whatsapp,
    website: o.website, address: o.address, hours: o.hours, officerName: o.officerName, officerPhone: o.officerPhone,
    officerConsentDate: o.officerConsentDate, officerConsentHow: o.officerConsentHow,
    source: o.source, lastChecked: o.lastChecked, notes: o.notes,
  };
}
