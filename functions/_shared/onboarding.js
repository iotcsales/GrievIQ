/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/onboarding.js (grieviq-83): the onboarding form.
//
// Sales staff fill one form per lead when an office or a department office
// joins. The questions are the ones in the "GrievIQ Onboarding
// Questionnaire" doc. They are defined ONCE here: the server checks answers
// against this list and the page draws itself from it, so the two can never
// ask different questions.
//
// Rules kept here (not only in the page):
//   - Only the questions below are stored; anything else sent is dropped.
//   - There is no question for a political party, ID numbers, bank or card
//     details, salaries or any citizen's details, and a free-text answer
//     that looks like an Aadhaar, PAN, card or mobile number is refused
//     (official phone numbers go in their own boxes).
//   - Contacts are official ones: the office's own email and phone.
//   - The person who checks a form never edited it (maker-checker).
//   - Sending for setup changes nothing live: it makes change requests
//     (the office's official contacts and the localities of each ward) that
//     an admin approves on the Change requests page, and a setup checklist.

import { EMAIL_RE, validateContact } from "./contact-validation.js";
import { contactDef, readContact } from "./jurisdiction-writes.js";
import { isSeatOffice } from "./seats.js";
import { GST_STATES } from "./tax-docs.js";
import { LOST_REASONS, maskMobile, maskEmail } from "./sales.js";

export const STATUSES = ["DRAFT", "SUBMITTED", "RETURNED", "CHECKED", "SENT"];
export const OUTCOMES = ["SIGNED_PILOT", "SIGNED_PAID", "FOLLOW_UP", "NOT_NOW", "DECLINED"];
export const SIGNED = ["SIGNED_PILOT", "SIGNED_PAID"];
// The lead kinds that are elected offices (the rest use the department form).
export const OFFICE_KINDS = { PRADHAN: "ward", COUNCILLOR: "ward", MAYOR: "mayor", MLA: "mla", MP: "mp" };
export const formKindOf = (leadKind) => (OFFICE_KINDS[leadKind] ? "OFFICE" : "DEPARTMENT");

// Sections, in order. for: O = representative's office, D = department, B = both.
export const SECTIONS = [
  { id: "visit", for: "B" },
  { id: "office", for: "O" },
  { id: "doffice", for: "D" },
  { id: "localities", for: "B" },
  { id: "today", for: "O" },
  { id: "dtoday", for: "D" },
  { id: "team", for: "O" },
  { id: "officers", for: "D" },
  { id: "depts", for: "O" },
  { id: "dissues", for: "D" },
  { id: "plan", for: "O" },
  { id: "dplan", for: "D" },
  { id: "agree", for: "O" },
  { id: "dagree", for: "D" },
  { id: "training", for: "O" },
  { id: "outcome", for: "B" },
];

const PLANS_OFFICE = ["pradhan", "councillor", "mla", "mp_mayor"];
// Types: text (one line), area (several lines), int, date, email, phone,
// enum (one of opts), multi (any of opts), bool (a tick), gstin, state,
// office (a GrievIQ record picked from a list), rows (a small table).
// max = most characters; min/maxN for numbers; req: needed before submitting
// ("signed" = only when the office signed; "declined", "later" likewise).
export const FIELDS = [
  // ---- visit (both) ----
  { k: "v_date", s: "visit", t: "date", req: true },
  { k: "v_number", s: "visit", t: "int", min: 1, maxN: 50 },
  { k: "v_attended", s: "visit", t: "area", max: 300, req: true },
  { k: "v_source", s: "visit", t: "enum", opts: ["WALKIN", "PILOT_REQUEST", "PARTNER", "EVENT", "OUTREACH", "OTHER"] },
  { k: "v_demo", s: "visit", t: "multi", opts: ["REP", "DEPT", "CITIZEN", "NONE"] },
  { k: "v_lang", s: "visit", t: "enum", opts: ["EN", "HI"] },
  // ---- representative's office ----
  { k: "o_holder", s: "office", t: "text", max: 80, req: true },
  { k: "o_title_area", s: "office", t: "text", max: 160, req: true },
  { k: "o_record", s: "office", t: "office" },
  { k: "o_seat", s: "office", t: "enum", opts: ["A", "B", "C", "D", "E", "F"] },
  { k: "o_district", s: "office", t: "text", max: 80 },
  { k: "o_state", s: "office", t: "state", req: true },
  { k: "o_units_count", s: "office", t: "int", min: 0, maxN: 5000 },
  { k: "o_address", s: "office", t: "area", max: 300 },
  { k: "o_email", s: "office", t: "email" },
  { k: "o_phone", s: "office", t: "phone" },
  { k: "o_decider", s: "office", t: "enum", opts: ["HOLDER", "PA", "CHIEF_OF_STAFF", "OTHER"] },
  { k: "o_setup_name", s: "office", t: "text", max: 80 },
  { k: "o_setup_email", s: "office", t: "email" },
  // ---- department office ----
  { k: "d_name", s: "doffice", t: "text", max: 160, req: true },
  { k: "d_level", s: "doffice", t: "enum", opts: ["DIVISION", "ZONE", "SUBDIVISION", "DISTRICT", "CITY", "OTHER"] },
  { k: "d_district", s: "doffice", t: "text", max: 80 },
  { k: "d_state", s: "doffice", t: "state", req: true },
  { k: "d_address", s: "doffice", t: "area", max: 300 },
  { k: "d_email", s: "doffice", t: "email" },
  { k: "d_phone", s: "doffice", t: "phone" },
  { k: "d_nodal_name", s: "doffice", t: "text", max: 80, req: true },
  { k: "d_nodal_desig", s: "doffice", t: "text", max: 80 },
  { k: "d_nodal_email", s: "doffice", t: "email", req: true },
  { k: "d_signer_name", s: "doffice", t: "text", max: 80, req: "signed" },
  { k: "d_signer_desig", s: "doffice", t: "text", max: 80 },
  // ---- localities (both) ----
  { k: "loc_rows", s: "localities", t: "rows", maxRows: 80, req: "signed", cols: [
    { k: "unit", t: "office" }, { k: "name", t: "text", max: 120 }, { k: "localities", t: "area", max: 1000 },
    { k: "pins", t: "pins", max: 120 }, { k: "landmarks", t: "area", max: 300 }, { k: "block", t: "text", max: 80 }] },
  { k: "loc_segments", s: "localities", t: "area", max: 500, for: "O" },
  { k: "loc_other_office", s: "localities", t: "area", max: 500 },
  { k: "loc_changes", s: "localities", t: "area", max: 300 },
  { k: "loc_source", s: "localities", t: "enum", opts: ["OFFICE_LIST", "NOTIFICATION", "MAP", "OTHER"] },
  { k: "loc_copy", s: "localities", t: "bool" },
  // ---- how complaints are handled today (office) ----
  { k: "t_month_count", s: "today", t: "int", min: 0, maxN: 100000 },
  { k: "t_channels", s: "today", t: "multi", opts: ["VISIT", "PHONE", "WHATSAPP", "LETTER", "DARBAR", "SOCIAL", "OTHER"] },
  { k: "t_record", s: "today", t: "multi", opts: ["REGISTER", "SPREADSHEET", "WHATSAPP", "NOTHING", "OTHER"] },
  { k: "t_staff", s: "today", t: "int", min: 0, maxN: 500 },
  { k: "t_calls_day", s: "today", t: "int", min: 0, maxN: 5000 },
  { k: "t_depts", s: "today", t: "multi", opts: ["WATER", "POWER", "ROADS", "SANITATION", "STREETLIGHTS", "HEALTH", "REVENUE", "OTHER"] },
  { k: "t_followup", s: "today", t: "area", max: 300 },
  { k: "t_frustration", s: "today", t: "area", max: 500 },
  { k: "t_show_work", s: "today", t: "area", max: 300 },
  { k: "t_other_software", s: "today", t: "text", max: 160 },
  // ---- how complaints reach the department today ----
  { k: "dt_month_count", s: "dtoday", t: "int", min: 0, maxN: 100000 },
  { k: "dt_sources", s: "dtoday", t: "multi", opts: ["REP", "IGRS", "CPGRAMS", "WALKIN", "PHONE", "OTHER"] },
  { k: "dt_dupes", s: "dtoday", t: "enum", opts: ["OFTEN", "SOMETIMES", "RARELY"] },
  { k: "dt_no_location", s: "dtoday", t: "enum", opts: ["OFTEN", "SOMETIMES", "RARELY"] },
  { k: "dt_calls_week", s: "dtoday", t: "int", min: 0, maxN: 5000 },
  { k: "dt_record", s: "dtoday", t: "area", max: 300 },
  { k: "dt_reviews", s: "dtoday", t: "area", max: 300 },
  { k: "dt_frustration", s: "dtoday", t: "area", max: 500 },
  // ---- team (office) / officers (department) ----
  { k: "team_rows", s: "team", t: "rows", maxRows: 30, cols: [
    { k: "name", t: "text", max: 80 }, { k: "role", t: "enum", opts: ["OFFICE_MANAGER", "FIELD_WORKER", "OFFICE_ASSISTANT"] },
    { k: "areas", t: "text", max: 160 }, { k: "email", t: "email" }, { k: "phone_type", t: "enum", opts: ["ANDROID", "IPHONE", "OTHER"] }] },
  { k: "officer_rows", s: "officers", t: "rows", maxRows: 40, cols: [
    { k: "name", t: "text", max: 80 }, { k: "desig", t: "text", max: 80 }, { k: "areas", t: "text", max: 160 }, { k: "email", t: "email" }] },
  // ---- departments to connect (office) ----
  { k: "dept_rows", s: "depts", t: "rows", maxRows: 20, cols: [
    { k: "office", t: "text", max: 160 }, { k: "contact", t: "enum", opts: ["KNOWN", "NOT_KNOWN", "TO_FIND"] }, { k: "intro", t: "enum", opts: ["YES", "NO", "MAYBE"] }] },
  // ---- issues and targets (department) ----
  { k: "di_issues", s: "dissues", t: "area", max: 300 },
  { k: "di_not_issues", s: "dissues", t: "area", max: 300 },
  { k: "di_target_days", s: "dissues", t: "int", min: 7, maxN: 21 },
  { k: "di_shutdowns", s: "dissues", t: "area", max: 300 },
  // ---- plan and billing (office) ----
  { k: "p_plan", s: "plan", t: "enum", opts: PLANS_OFFICE, req: "signed" },
  { k: "p_start", s: "plan", t: "enum", opts: ["PILOT", "PAID"], req: "signed" },
  { k: "p_pilot_start", s: "plan", t: "date" },
  { k: "p_pilot_end", s: "plan", t: "date" },
  { k: "p_extra_seats", s: "plan", t: "int", min: 0, maxN: 200 },
  { k: "p_billing", s: "plan", t: "enum", opts: ["MONTHLY", "YEARLY"] },
  { k: "p_paid_from", s: "plan", t: "enum", opts: ["OFFICE", "OWN", "PANCHAYAT"] },
  { k: "p_invoice_name", s: "plan", t: "text", max: 160, req: "signed" },
  { k: "p_invoice_address", s: "plan", t: "area", max: 300 },
  { k: "p_gstin", s: "plan", t: "gstin" },
  { k: "p_pay_method", s: "plan", t: "enum", opts: ["UPI", "CARD", "BANK"] },
  // ---- agreement and billing (department) ----
  { k: "dp_pilot_start", s: "dplan", t: "date" },
  { k: "dp_pilot_end", s: "dplan", t: "date" },
  { k: "dp_plan", s: "dplan", t: "enum", opts: ["ONE_OFFICE", "CITY_WIDE"], req: "signed" },
  { k: "dp_route", s: "dplan", t: "enum", opts: ["DIRECT", "GEM", "TENDER"] },
  { k: "dp_invoice_name", s: "dplan", t: "text", max: 160, req: "signed" },
  { k: "dp_invoice_address", s: "dplan", t: "area", max: 300 },
  { k: "dp_gstin", s: "dplan", t: "gstin" },
  // ---- agreements and understanding ----
  { k: "a_dpa", s: "agree", t: "bool", req: "signed" },
  { k: "a_rules", s: "agree", t: "bool", req: "signed" },
  { k: "a_price", s: "agree", t: "bool", req: "signed" },
  { k: "a_neutral", s: "agree", t: "bool", req: "signed" },
  { k: "a_hidden", s: "agree", t: "bool", req: "signed" },
  { k: "a_moveup", s: "agree", t: "bool", req: "signed" },
  { k: "a_record", s: "agree", t: "bool", req: "signed" },
  { k: "da_agreement", s: "dagree", t: "bool", req: "signed" },
  { k: "da_rules", s: "dagree", t: "bool", req: "signed" },
  { k: "da_hidden", s: "dagree", t: "bool", req: "signed" },
  { k: "da_report", s: "dagree", t: "bool", req: "signed" },
  { k: "da_transfer", s: "dagree", t: "bool", req: "signed" },
  { k: "da_training", s: "dagree", t: "bool" },
  { k: "da_test", s: "dagree", t: "bool" },
  // ---- training and go-live (office) ----
  { k: "tr_date", s: "training", t: "date" },
  { k: "tr_signed_in", s: "training", t: "bool" },
  { k: "tr_alerts", s: "training", t: "bool" },
  { k: "tr_test", s: "training", t: "bool" },
  { k: "tr_page", s: "training", t: "bool" },
  { k: "tr_support", s: "training", t: "bool" },
  // ---- outcome (both) ----
  { k: "x_outcome", s: "outcome", t: "enum", opts: OUTCOMES, req: true },
  { k: "x_reason", s: "outcome", t: "enum", opts: LOST_REASONS, req: "declined" },
  { k: "x_reason_words", s: "outcome", t: "area", max: 300 },
  { k: "x_questions", s: "outcome", t: "area", max: 500 },
  { k: "x_liked", s: "outcome", t: "area", max: 300 },
  { k: "x_other_offices", s: "outcome", t: "area", max: 500 },
  { k: "x_next_step", s: "outcome", t: "text", max: 160, req: "later" },
  { k: "x_next_date", s: "outcome", t: "date", req: "later" },
  { k: "x_promised", s: "outcome", t: "area", max: 300 },
];
const BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.k, f]));
const SECTION_FOR = Object.fromEntries(SECTIONS.map((s) => [s.id, s.for]));
export function fieldsFor(formKind) {
  const want = formKind === "DEPARTMENT" ? "D" : "O";
  return FIELDS.filter((f) => { const sf = SECTION_FOR[f.s]; return (sf === "B" || sf === want) && (!f.for || f.for === want); });
}
export function sectionsFor(formKind) {
  const want = formKind === "DEPARTMENT" ? "D" : "O";
  return SECTIONS.filter((s) => s.for === "B" || s.for === want).map((s) => s.id);
}

// ---- personal data in free text ----
// A free-text answer may not hold an Aadhaar-like, card-like, PAN or mobile
// number (the official phone has its own box; staff phones are never asked).
const ID_LIKE = /(?<![\d])\d(?:[\s-]?\d){11,18}(?![\d])/;          // 12-19 digits: Aadhaar, cards, accounts
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/i;
const MOBILE = /(?<![\d])(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?![\d])/;
export function personalIn(text) {
  const s = String(text || "");
  if (ID_LIKE.test(s) || PAN.test(s)) return "ID";
  if (MOBILE.test(s)) return "MOBILE";
  return null;
}

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (s) => DATE_RE.test(s) && !isNaN(new Date(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const clip = (v, n) => String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);

// One value against its definition. Returns { v } (clean value, or null for
// empty) or { err } (FORMAT, LENGTH, RANGE, PERSONAL_ID, PERSONAL_MOBILE).
function checkValue(def, raw) {
  const t = def.t;
  if (raw == null || raw === "" || (Array.isArray(raw) && !raw.length) || raw === false) return { v: null };
  if (t === "text" || t === "area") {
    const lim = def.max || 300;
    const s = t === "text" ? clip(String(raw).replace(/\n/g, " "), lim + 1) : clip(raw, lim + 1);
    if (!s) return { v: null };
    if (s.length > lim) return { err: "LENGTH" };
    const p = personalIn(s);
    if (p) return { err: "PERSONAL_" + p };
    return { v: s };
  }
  if (t === "int") {
    const n = Number(String(raw).trim());
    if (!Number.isInteger(n)) return { err: "FORMAT" };
    if (n < (def.min || 0) || n > (def.maxN || 1e6)) return { err: "RANGE" };
    return { v: n };
  }
  if (t === "date") { const s = String(raw).trim(); return realDate(s) ? { v: s } : { err: "FORMAT" }; }
  if (t === "email") {
    const s = String(raw).trim().toLowerCase();
    return s.length <= 120 && EMAIL_RE.test(s) ? { v: s } : { err: "FORMAT" };
  }
  if (t === "phone") {
    const c = validateContact({ phone: String(raw) });
    return c.ok ? { v: c.values.phone } : { err: "FORMAT" };
  }
  if (t === "enum") { const s = String(raw); return def.opts.includes(s) ? { v: s } : { err: "FORMAT" }; }
  if (t === "multi") {
    const list = [...new Set([].concat(raw).map(String))];
    return list.every((x) => def.opts.includes(x)) ? { v: def.opts.filter((o) => list.includes(o)) } : { err: "FORMAT" };
  }
  if (t === "bool") return { v: raw === true || raw === "true" ? true : null };
  if (t === "gstin") { const s = String(raw).trim().toUpperCase(); return GSTIN_RE.test(s) ? { v: s } : { err: "FORMAT" }; }
  if (t === "state") { const s = String(raw); return GST_STATES[s] ? { v: s } : { err: "FORMAT" }; }
  if (t === "pins") {
    const list = [...new Set(String(raw).split(/[\s,;]+/).filter(Boolean))];
    if (!list.length) return { v: null };
    if (list.some((p) => !/^[1-9]\d{5}$/.test(p))) return { err: "FORMAT" };
    const s = list.join(", ");
    return s.length > (def.max || 120) ? { err: "LENGTH" } : { v: s };
  }
  if (t === "office") {
    if (typeof raw !== "object") return { err: "FORMAT" };
    const type = String(raw.type || ""), id = String(raw.id || "").slice(0, 80), label = clip(raw.label, 200);
    if (!["ward", "mla", "mp", "mayor"].includes(type) || !id) return { err: "FORMAT" };
    return { v: { type, id, label } };
  }
  return { err: "FORMAT" };
}

// Cleans a whole set of answers for one form. Returns { answers, fields }:
// fields names each answer that was refused, with why ("loc_rows.2.pins").
// A refused answer keeps its previous value (prev), so nothing typed before
// is lost and nothing personal is stored.
export function cleanAnswers(formKind, raw, prev) {
  const out = {}, fields = {};
  const old = prev || {};
  const src = raw && typeof raw === "object" ? raw : {};
  for (const def of fieldsFor(formKind)) {
    if (!(def.k in src)) { if (def.k in old) out[def.k] = old[def.k]; continue; }
    if (def.t === "rows") {
      const rows = Array.isArray(src[def.k]) ? src[def.k].slice(0, def.maxRows) : [];
      if (Array.isArray(src[def.k]) && src[def.k].length > def.maxRows) fields[def.k] = "TOO_MANY";
      const oldRows = Array.isArray(old[def.k]) ? old[def.k] : [];
      const kept = [];
      rows.forEach((row, i) => {
        const r = {}; let any = false;
        for (const c of def.cols) {
          const res = checkValue(c, row ? row[c.k] : null);
          if (res.err) { fields[def.k + "." + i + "." + c.k] = res.err; const o = oldRows[i] && oldRows[i][c.k]; if (o != null) { r[c.k] = o; any = true; } }
          else if (res.v != null) { r[c.k] = res.v; any = true; }
        }
        if (any) kept.push(r);
      });
      if (kept.length) out[def.k] = kept;
      continue;
    }
    const res = checkValue(def, src[def.k]);
    if (res.err) { fields[def.k] = res.err; if (def.k in old) out[def.k] = old[def.k]; }
    else if (res.v != null) out[def.k] = res.v;
  }
  return { answers: out, fields };
}

// What is still needed before the form can be submitted: [{ k, why }].
export function missing(formKind, a) {
  const out = [];
  const outcome = a.x_outcome || null;
  const signed = SIGNED.includes(outcome), declined = outcome === "DECLINED", later = outcome === "FOLLOW_UP" || outcome === "NOT_NOW";
  for (const def of fieldsFor(formKind)) {
    const need = def.req === true || (def.req === "signed" && signed) || (def.req === "declined" && declined) || (def.req === "later" && later);
    if (!need) continue;
    const v = a[def.k];
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) out.push({ k: def.k, why: "REQUIRED" });
  }
  if (formKind === "OFFICE" && !a.o_email && !a.o_phone) out.push({ k: "o_email", why: "CONTACT" });
  if (formKind === "OFFICE" && signed && a.p_start === "PILOT" && (!a.p_pilot_start || !a.p_pilot_end)) out.push({ k: "p_pilot_start", why: "PILOT_DATES" });
  if (formKind === "DEPARTMENT" && signed && (!a.dp_pilot_start || !a.dp_pilot_end)) out.push({ k: "dp_pilot_start", why: "PILOT_DATES" });
  const ps = a.p_pilot_start || a.dp_pilot_start, pe = a.p_pilot_end || a.dp_pilot_end;
  if (ps && pe && pe < ps) out.push({ k: formKind === "OFFICE" ? "p_pilot_end" : "dp_pilot_end", why: "BEFORE_START" });
  if (signed && formKind === "OFFICE" && !(a.team_rows || []).length) out.push({ k: "team_rows", why: "REQUIRED" });
  if (signed && formKind === "DEPARTMENT" && !(a.officer_rows || []).length) out.push({ k: "officer_rows", why: "REQUIRED" });
  for (const [i, r] of (a.team_rows || []).entries()) if (!r.name || !r.role || !r.email) out.push({ k: "team_rows." + i, why: "ROW" });
  for (const [i, r] of (a.officer_rows || []).entries()) if (!r.name || !r.desig || !r.email) out.push({ k: "officer_rows." + i, why: "ROW" });
  for (const [i, r] of (a.loc_rows || []).entries()) if (!(r.unit || r.name) || !r.localities) out.push({ k: "loc_rows." + i, why: "ROW" });
  if (a.x_next_date && (outcome === "FOLLOW_UP" || outcome === "NOT_NOW")) {
    const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
    if (a.x_next_date < today) out.push({ k: "x_next_date", why: "PAST" });
  }
  return out;
}

// ---- advice (grieviq-85): what a sales manager would usually send back ----
// Answers that pass every check above but break the selling rules. Shown in
// practice as a check report, and to a manager checking a real form as advice
// only (it never blocks). Returns { issues: [{ k, code, row? }], good: [code] }.
const PERSONAL_DOMAINS = /@(gmail|googlemail|yahoo|ymail|rediffmail|hotmail|outlook|live|icloud|aol|proton|protonmail)\./i;
const VAGUE = /\b(whole|entire|all)\s+(area|ward|zone|village|constituency|city)\b|\bas per (the )?records?\b|\bsee (the )?list\b|पूरा क्षेत्र|पूरा वार्ड|सम्पूर्ण|संपूर्ण|रिकॉर्ड के अनुसार|सूची देखें/i;
const PROMISE = /\bvotes?\b|\bvoters?\b|\belections?\b|\bguarantee|\bwithin \d+ (days?|hours?)\b|वोट|मतदाता|चुनाव|गारंटी/i;
// Hindi words are matched between spaces or punctuation (\b only knows English letters).
const PARTY = /\b(bjp|congress|samajwadi|bsp|aap|rld|apna dal|nishad|suheldev|ncp|tmc|dmk|shiv sena|rjd|jdu|cpi|cpm)\b|\bpolitical part(y|ies)\b|\bparty (office|worker|leader|member)s?\b|\bopposition\b|(^|[\s,.;:("'])(भाजपा|कांग्रेस|सपा|बसपा|पार्टी|विपक्ष)(?=$|[\s,.;:)"'।])/i;
const DISCOUNT = /\bdiscount|\bspecial (price|rate|offer)|\bconcession|\bcheaper\b|\bcommission\b|छूट|रियायत|विशेष (कीमत|दर|ऑफ़र)|कमीशन/i;
export function reviewAdvice(formKind, a, officeKind) {
  a = a || {};
  const issues = [], good = [];
  const rows = a.loc_rows || [];
  const add = (k, code, row) => { if (!issues.some((x) => x.k === k && x.code === code)) issues.push(row == null ? { k, code } : { k, code, row }); };
  // Localities
  let allListed = rows.length > 0, allLand = rows.length > 0;
  rows.forEach((r, i) => {
    const t = String(r.localities || "");
    if (!t) { allListed = false; return; }
    if (VAGUE.test(t)) { add("loc_rows." + i + ".localities", "VAGUE_LOCALITIES", i); allListed = false; }
    else if (normaliseLocalities(t).length < 2) { add("loc_rows." + i + ".localities", "FEW_LOCALITIES", i); allListed = false; }
    if (!String(r.landmarks || "").trim()) { add("loc_rows." + i + ".landmarks", "NO_LANDMARKS", i); allLand = false; }
  });
  if (allListed) good.push("LOCALITIES_LISTED");
  if (allLand) good.push("LANDMARKS");
  if (formKind === "OFFICE") {
    if (!a.o_record) add("o_record", "NO_RECORD"); else good.push("OFFICE_LISTED");
    const many = officeKind === "MLA" || officeKind === "MP" || officeKind === "MAYOR";
    if (many && Number(a.o_units_count) > 0 && rows.length < Number(a.o_units_count)) add("loc_rows", "FEWER_WARDS");
    if (a.o_email && PERSONAL_DOMAINS.test(a.o_email)) add("o_email", "PERSONAL_EMAIL"); else if (a.o_email) good.push("OFFICIAL_EMAIL");
  } else {
    if (a.d_nodal_email && PERSONAL_DOMAINS.test(a.d_nodal_email)) add("d_nodal_email", "PERSONAL_EMAIL"); else if (a.d_nodal_email) good.push("OFFICIAL_EMAIL");
  }
  // Every person their own email
  const people = formKind === "OFFICE" ? "team_rows" : "officer_rows";
  const seen = {};
  let dup = false;
  (a[people] || []).forEach((r, i) => { const e = String(r.email || "").toLowerCase(); if (!e) return; if (seen[e] != null) { add(people + "." + i + ".email", "SHARED_EMAIL", i); dup = true; } else seen[e] = i; });
  if ((a[people] || []).length && !dup) good.push("OWN_EMAILS");
  // Free text: promises, parties, discounts
  const texts = [];
  for (const def of fieldsFor(formKind)) {
    if ((def.t === "text" || def.t === "area") && a[def.k]) texts.push([def.k, String(a[def.k])]);
    if (def.t === "rows") (a[def.k] || []).forEach((r, i) => (def.cols || []).forEach((c) => { if ((c.t === "text" || c.t === "area") && r[c.k]) texts.push([def.k + "." + i + "." + c.k, String(r[c.k])]); }));
  }
  let clean = true;
  for (const [k, t] of texts) {
    if (PROMISE.test(t)) { add(k, "PROMISE"); clean = false; }
    if (PARTY.test(t)) { add(k, "PARTY"); clean = false; }
    if (DISCOUNT.test(t)) { add(k, "DISCOUNT"); clean = false; }
  }
  if (clean && texts.length) good.push("NEUTRAL");
  return { issues, good };
}
// The overall result of a practice: what a sales manager would do.
export function practiceResult(miss, fields, advice) {
  const refused = (miss || []).length + Object.keys(fields || {}).length;
  return refused ? "REFUSED" : (advice.issues || []).length ? "RETURN" : "APPROVE";
}

// What an auditor sees: emails and phones partly hidden.
export function maskAnswers(a) {
  const m = JSON.parse(JSON.stringify(a || {}));
  const mp = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 4 ? "XXXXXX" + d.slice(-2) : ""; };
  for (const k of ["o_email", "o_setup_email", "d_email", "d_nodal_email"]) if (m[k]) m[k] = maskEmail(m[k]);
  for (const k of ["o_phone", "d_phone"]) if (m[k]) m[k] = /^[6-9]\d{9}$/.test(String(m[k]).replace(/\D/g, "")) ? maskMobile(String(m[k]).replace(/\D/g, "")) : mp(m[k]);
  for (const k of ["team_rows", "officer_rows"]) for (const r of m[k] || []) if (r.email) r.email = maskEmail(r.email);
  return m;
}

// ---- localities ----
export function normaliseLocalities(text) {
  const list = [];
  for (const p of String(text || "").split(/[;\n,]+/)) { const s = p.replace(/\s+/g, " ").trim(); if (s && !list.some((x) => x.toLowerCase() === s.toLowerCase())) list.push(s); }
  const joined = list.join("; ");
  return joined.length > 1000 ? null : joined;
}

// The checklist made when a form is sent for setup.
export function checklistFor(formKind, a) {
  if (formKind === "DEPARTMENT") return ["DEPT_OFFICE", "AGREEMENT", "OFFICERS", "PILOT", "TRAINING", "TEST"].map((k) => ({ k, done: null }));
  return ["TEAM", a.p_start === "PAID" ? "PLAN" : "PILOT", "TRAINING", "TEST", "PUBLIC_PAGE"].map((k) => ({ k, done: null }));
}

// Makes the change requests for a form sent for setup: the office's
// official contacts (name, phone, email) and, for each ward or village
// listed, its localities. Each is a normal "contact" change request that an
// admin approves on the Change requests page. Returns { ids, notes }:
// notes say what could not be requested (to be done by hand).
export async function makeChangeRequests(env, by, form, lead, a) {
  const ids = [], notes = [];
  const reason = `Onboarding form for sales lead ${lead.ref} (${lead.office_name}), checked by ${by}.`;
  const source = "GrievIQ onboarding form " + lead.ref;
  async function request(type, targetId, wanted, what) {
    const def = contactDef(type, targetId);
    const cur = def ? await readContact(env, type, targetId) : null;
    if (!cur) { notes.push({ what, why: "NOT_FOUND" }); return; }
    const oldValues = {}, newValues = {};
    for (const [f, v] of Object.entries(wanted)) {
      if (v == null || v === "") continue;
      if (f === "localities" && !def.localitiesCol) continue;
      if ((cur.values[f] ?? null) !== v) { oldValues[f] = cur.values[f] ?? null; newValues[f] = v; }
    }
    if (!Object.keys(newValues).length) { notes.push({ what, why: "SAME" }); return; }
    const contactPart = {};
    for (const f of ["name", "phone", "email"]) if (f in newValues) contactPart[f] = newValues[f];
    const checked = validateContact(contactPart);
    if (!checked.ok) { notes.push({ what, why: "INVALID", field: checked.field }); return; }
    const waiting = await env.DB.prepare("SELECT id FROM change_requests WHERE status = 'PENDING' AND kind = 'contact' AND target_type = ? AND target_id = ?").bind(type, targetId).first();
    if (waiting) { notes.push({ what, why: "WAITING" }); return; }
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO change_requests (id, kind, target_type, target_id, target_label, old_values, new_values, reason, source, requested_by, requested_at)
       VALUES (?, 'contact', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, type, targetId, cur.label, JSON.stringify(oldValues), JSON.stringify(newValues), reason, source, by, new Date().toISOString()).run();
    await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), by, "change_request_submitted", targetId, JSON.stringify({ requestId: id, type, oldValues, newValues, reason, source })).run();
    ids.push(id);
  }
  if (form.form_kind === "OFFICE") {
    const rec = a.o_record;
    const recLabel = rec ? rec.label : (a.o_title_area || lead.office_name);
    if (rec) {
      let targetId = rec.id;
      if (rec.type === "ward" && a.o_seat && a.o_seat !== "A") targetId = rec.id + "~" + a.o_seat;
      // Several rows may name the office's own ward: its localities ride with the contacts.
      const own = rec.type === "ward" && !isSeatOffice(targetId) ? (a.loc_rows || []).find((r) => r.unit && r.unit.type === "ward" && r.unit.id === rec.id) : null;
      await request(rec.type, targetId, { name: a.o_holder, phone: a.o_phone, email: a.o_email, localities: own ? normaliseLocalities(own.localities) : null }, { kind: "CONTACT", label: recLabel });
    } else notes.push({ what: { kind: "CONTACT", label: recLabel }, why: "NO_RECORD" });
  }
  const ownId = form.form_kind === "OFFICE" && a.o_record && a.o_record.type === "ward" ? a.o_record.id : null;
  const seen = new Set();
  for (const r of a.loc_rows || []) {
    const label = r.unit ? r.unit.label : r.name;
    if (!r.unit || r.unit.type !== "ward") { notes.push({ what: { kind: "LOCALITIES", label }, why: "NO_RECORD" }); continue; }
    if (r.unit.id === ownId || seen.has(r.unit.id)) continue;
    seen.add(r.unit.id);
    const loc = normaliseLocalities(r.localities);
    if (!loc) { notes.push({ what: { kind: "LOCALITIES", label }, why: "INVALID" }); continue; }
    await request("ward", r.unit.id, { localities: loc }, { kind: "LOCALITIES", label });
  }
  return { ids, notes };
}

export async function onboardingReady(env) {
  try { await env.DB.prepare("SELECT id FROM onboarding_forms LIMIT 1").first(); return true; } catch (e) { return false; }
}
export async function logForm(env, formId, by, kind, note) {
  await env.DB.prepare("INSERT INTO onboarding_events (id, form_id, at, by_email, kind, note) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), formId, new Date().toISOString(), by, kind, note || null).run();
}
// With the lead's contact details (2 years after it closes): the answers go.
export async function eraseForm(env, leadId) {
  try {
    const f = await env.DB.prepare("SELECT id FROM onboarding_forms WHERE lead_id = ? AND erased_at IS NULL").bind(leadId).first();
    if (!f) return;
    await env.DB.prepare("UPDATE onboarding_forms SET answers = '{}', return_note = NULL, setup_notes = '[]', erased_at = ? WHERE id = ?").bind(new Date().toISOString(), f.id).run();
    await env.DB.prepare("UPDATE onboarding_events SET note = NULL WHERE form_id = ?").bind(f.id).run();
    await logForm(env, f.id, "system", "ERASED");
  } catch (e) { if (!/no such table/i.test(String(e && e.message))) throw e; }
}
