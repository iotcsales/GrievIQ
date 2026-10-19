/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/notices.js   (grieviq-55)
//
// Paid public notices: an office's short public-information notice shown to
// citizens of its own area, on the ward or village page.
//
// The rules (owner decision 18 Oct 2026; sources in the handover doc):
//   - A fixed text template: type, title and message (English and/or
//     Hindi), optional date, time and place. No photos, links, email
//     addresses, @handles, hashtags or emoji (refused automatically). Party
//     names, symbols and words asking for votes are highlighted for the
//     admin, who checks every notice against a fixed checklist: public
//     information only, no party, symbol, slogan or appeal for votes, no
//     praise of a person or of achievements (Common Cause v Union of India,
//     2015), nothing about any citizen or complaint, truthful.
//   - Every notice says "Paid notice" and who published and paid for it.
//   - Same price for every office of the same reach; no paid ranking: the
//     order rotates each day.
//   - Model Code of Conduct (notice_pauses): representatives' notices are
//     paused and none start; department notices about service interruptions
//     and public safety continue. Paused days are added back at the end.
//   - Approval makes a bill; the notice is shown only after the payment is
//     confirmed, for its full number of days from then (or the start date).

import { liveVersion, withGst, istToday, DEFAULTS } from "./site-settings.js";
import { nextRef, logBill, emailOffice, TIER_TABLE, tierTable } from "./billing.js";
import { sendEmailNow } from "./dept-auth.js";

export const CATEGORIES = ["CAMP", "SCHEME", "HEALTH", "SABHA", "OFFICE", "SERVICE", "SAFETY"];
// Department notices of these kinds continue during the Model Code of Conduct.
export const ESSENTIAL = ["SERVICE", "SAFETY"];
export const CHECKS = ["PUBLIC_INFO", "NO_PARTY", "NO_PRAISE", "NO_CITIZEN", "TRUTHFUL"];
// grieviq-56 (owner decision 18 Oct 2026): a notice that speaks for a
// government department needs the authority (sanction) letter from the
// competent authority: every department office's notice, and a
// representative's notice of these kinds. Optional for the others.
export const LETTER_CATEGORIES = ["SCHEME", "HEALTH", "SERVICE"];
export const LETTER_MAX_BYTES = 10 * 1024 * 1024;
const LETTER_EXT = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
export function needsLetter(type, category) { return type === "DEPT" || LETTER_CATEGORIES.includes(category); }
export async function lettersReady(env) {
  try { await env.DB.prepare("SELECT letter_key FROM notices LIMIT 1").all(); return true; } catch (e) { return false; }
}
function sniffLetter(buf) {
  if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d) return "application/pdf";   // %PDF-
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return "image/png";
  return null;
}
// Checks the letter's details and file. Returns { fields, value } where
// value = { no, date, by, bytes, type } (bytes null when no file was sent).
export async function checkLetter(b, file, required, today) {
  const f = {}, v = { no: "", date: "", by: "", bytes: null, type: null };
  const has = !!(file && typeof file !== "string" && file.size);
  const any = has || b.letterNo || b.letterDate || b.letterBy;
  if (!required && !any) return { fields: f, value: v, has: false };
  if (!has) f.letter = "REQUIRED";
  else if (file.size > LETTER_MAX_BYTES) f.letter = "TOO_BIG";
  else {
    let buf = new Uint8Array(await file.arrayBuffer());
    const type = sniffLetter(buf);
    if (!type) f.letter = "BAD_TYPE";
    else {
      if (type === "image/jpeg") { const { stripJpegMetadata } = await import("./photo-store.js"); buf = stripJpegMetadata(buf); }   // no location or camera details kept
      v.bytes = buf; v.type = type;
    }
  }
  v.no = clean(b.letterNo, 60).replace(/\n/g, " ");
  if (v.no.length < 3) f.letterNo = "REQUIRED"; else if (v.no.length > 60) f.letterNo = "LENGTH"; else if (textProblem(v.no)) f.letterNo = textProblem(v.no);
  v.date = clean(b.letterDate, 10);
  if (!v.date) f.letterDate = "REQUIRED"; else if (!realDate(v.date)) f.letterDate = "DATE"; else if (v.date > today) f.letterDate = "FUTURE"; else if (v.date < addDays(today, -730)) f.letterDate = "OLD";
  v.by = clean(b.letterBy, 120).replace(/\n/g, " ");
  if (v.by.length < 5) f.letterBy = "REQUIRED"; else if (v.by.length > 120) f.letterBy = "LENGTH"; else if (textProblem(v.by)) f.letterBy = textProblem(v.by);
  return { fields: f, value: v, has: true };
}
async function storeLetter(env, noticeId, v) {
  const key = "notice-letters/" + noticeId + "/" + crypto.randomUUID() + "." + LETTER_EXT[v.type];
  await env.PRIVATE_PHOTOS.put(key, v.bytes, { httpMetadata: { contentType: v.type } });
  return key;
}
export const MAX_START_DAYS = 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function noticesReady(env) {
  try { await env.DB.prepare("SELECT id FROM notices LIMIT 1").all(); return true; } catch (e) { return false; }
}
export function noticeSettings(s) {
  const n = (s && s.notices) || DEFAULTS.notices;
  return { enabled: n.enabled !== false, maxLivePerOffice: n.maxLivePerOffice || 2, maxShown: n.maxShown || 3, plans: Array.isArray(n.plans) ? n.plans : [] };
}
export function realDate(s) { if (!DATE_RE.test(s || "")) return false; const d = new Date(s + "T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }
export function addDays(s, n) { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function reachOf(type, tier) { return type === "REP" && tier !== "LOCAL" ? "WIDE" : "LOCAL"; }
export function priceFor(s, plan, reach) {
  const amount = reach === "WIDE" ? plan.priceWide : plan.priceLocal;
  if (!Number.isInteger(amount)) return null;
  const total = withGst(amount, s.gst.rate);
  return { amount, gstRate: Number(s.gst.rate), gst: total - amount, total };
}
// The plans an office can choose today, with its price.
export function plansFor(s, reach) {
  return noticeSettings(s).plans.filter((p) => p.shown && !p.retired).map((p) => Object.assign({ id: p.id, nameEn: p.nameEn, nameHi: p.nameHi, days: p.days }, priceFor(s, p, reach)));
}

// ---- the text checks ----
const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|org|net|co|io|app|ly|me|info|xyz|link|site|online|gov\.in|nic\.in)\b)/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const HANDLE_RE = /(^|[\s(])[@#][\p{L}\p{N}_]{2,}/u;
const EMOJI_RE = /\p{Extended_Pictographic}/u;
// Highlighted for the admin (not refused: "cycle", "hand" or "lotus" can be
// innocent). Party names and symbols, and words asking for votes.
const WATCH = [
  "vote", "votes", "voting", "voter", "elect", "election", "ballot", "candidate", "campaign", "party", "rally", "manifesto", "slogan", "symbol",
  "bjp", "congress", "samajwadi", "bsp", "aap", "rld", "nishad", "apna dal", "suheldev", "cpi", "cpm", "shiv sena", "ncp", "tmc", "jdu", "rjd",
  "lotus", "kamal", "cycle", "elephant", "hathi", "broom", "jhadu", "haath", "achievement", "achievements", "thanks to", "gift from", "inaugurated by",
  "वोट", "मतदान", "मतदाता", "चुनाव", "निर्वाचन", "प्रत्याशी", "उम्मीदवार", "पार्टी", "रैली", "घोषणापत्र", "नारा", "चुनाव चिह्न",
  "भाजपा", "कांग्रेस", "सपा", "समाजवादी", "बसपा", "रालोद", "कमल", "साइकिल", "हाथी", "झाड़ू", "पंजा", "उपलब्धि", "उपलब्धियाँ", "की देन", "के सौजन्य", "लोकार्पण",
];
function watchHits(text) {
  const t = " " + String(text || "").toLowerCase().replace(/[.,!?;:()"'।\-\n]/g, " ").replace(/\s+/g, " ") + " ";
  return WATCH.filter((w) => t.includes(" " + w + " "));
}
function clean(v, max) {
  return String(v == null ? "" : v).normalize("NFC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[ \t]+/g, " ").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max + 1);
}
function textProblem(v) {
  if (EMAIL_RE.test(v)) return "EMAIL";
  if (LINK_RE.test(v)) return "LINK";
  if (HANDLE_RE.test(v)) return "HANDLE";
  if (EMOJI_RE.test(v)) return "EMOJI";
  const letters = v.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 15 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.6) return "CAPS";
  return null;
}
// Checks what an office sends. Returns { ok, fields, value, flags }.
export function checkNotice(b, today) {
  const f = {}, v = {};
  v.category = CATEGORIES.includes(b.category) ? b.category : null;
  if (!v.category) f.category = "REQUIRED";
  for (const lang of ["En", "Hi"]) {
    v["title" + lang] = clean(b["title" + lang], 80);
    v["body" + lang] = clean(b["body" + lang], 400);
  }
  const has = (l) => v["title" + l] || v["body" + l];
  if (!has("En") && !has("Hi")) f.titleEn = "ONE_LANGUAGE";
  for (const l of ["En", "Hi"]) {
    if (!has(l)) continue;
    if (!v["title" + l]) f["title" + l] = "REQUIRED"; else if (v["title" + l].length > 80) f["title" + l] = "LENGTH"; else if (v["title" + l].length < 5) f["title" + l] = "SHORT";
    if (!v["body" + l]) f["body" + l] = "REQUIRED"; else if (v["body" + l].length > 400) f["body" + l] = "LENGTH"; else if (v["body" + l].length < 10) f["body" + l] = "SHORT";
    for (const k of ["title" + l, "body" + l]) if (!f[k]) { const p = textProblem(v[k]); if (p) f[k] = p; }
  }
  v.eventDate = clean(b.eventDate, 10);
  if (v.eventDate) { if (!realDate(v.eventDate)) f.eventDate = "DATE"; else if (v.eventDate < today) f.eventDate = "PAST"; }
  v.eventTime = clean(b.eventTime, 40).replace(/\n/g, " ");
  if (v.eventTime.length > 40) f.eventTime = "LENGTH"; else if (v.eventTime && textProblem(v.eventTime)) f.eventTime = textProblem(v.eventTime);
  v.place = clean(b.place, 120).replace(/\n/g, " ");
  if (v.place.length > 120) f.place = "LENGTH"; else if (v.place && textProblem(v.place)) f.place = textProblem(v.place);
  v.startOn = clean(b.startOn, 10);
  if (!v.startOn) f.startOn = "REQUIRED"; else if (!realDate(v.startOn)) f.startOn = "DATE";
  else if (v.startOn < today) f.startOn = "PAST"; else if (v.startOn > addDays(today, MAX_START_DAYS)) f.startOn = "TOO_FAR";
  v.planId = clean(b.planId, 30);
  const flags = Array.from(new Set(watchHits([v.titleEn, v.bodyEn, v.titleHi, v.bodyHi, v.place].join(" \n "))));
  return { ok: !Object.keys(f).length, fields: f, value: v, flags };
}

// ---- election pauses (Model Code of Conduct) ----
export async function activePauses(env) {
  try { return (await env.DB.prepare("SELECT * FROM notice_pauses WHERE removed_at IS NULL ORDER BY from_on").all()).results || []; } catch (e) { return []; }
}
function pauseHits(p, areaId, state) { return p.area_id ? p.area_id === areaId : String(p.state).toLowerCase() === String(state || "").toLowerCase(); }
export function pausedOn(pauses, areaId, state, day) {
  return pauses.find((p) => pauseHits(p, areaId, state) && p.from_on <= day && day <= p.to_on) || null;
}
export function pausable(n) { return n.office_type === "REP" || !ESSENTIAL.includes(n.category); }
// The last day a paid notice runs: its days counted from the start, skipping
// days it was paused (added back at the end).
export function runOf(n, pauses) {
  const start = n.starts_on || n.start_on;
  if (!pausable(n)) return { from: start, to: addDays(start, n.days - 1), paused: 0 };
  let day = start, left = n.days, paused = 0;
  for (let i = 0; i < 800 && left > 0; i++) {
    if (pausedOn(pauses, n.area_id, n.state, day)) paused++; else left--;
    if (left > 0) day = addDays(day, 1);
  }
  return { from: start, to: day, paused };
}
// LIVE | SCHEDULED | PAUSED | ENDED for paid notices; the stored status otherwise.
export function stateOf(n, pauses, today) {
  if (n.status !== "PAID") return n.status;
  const r = runOf(n, pauses);
  if (today < r.from) return "SCHEDULED";
  if (today > r.to) return "ENDED";
  if (pausable(n) && pausedOn(pauses, n.area_id, n.state, today)) return "PAUSED";
  return "LIVE";
}

// ---- offices ----
const LABELS = { LOCAL_URBAN: ["Ward Councillor's office", "वार्ड पार्षद कार्यालय"], LOCAL_RURAL: ["Gram Pradhan's office", "ग्राम प्रधान कार्यालय"], MAYOR: ["Mayor's office", "महापौर कार्यालय"], MLA: ["MLA's office", "विधायक कार्यालय"], MP: ["MP's office", "सांसद कार्यालय"], DEPT: ["Department office", "विभागीय कार्यालय"] };
export function labelKey(type, tier, unitType) { return type === "DEPT" ? "DEPT" : tier === "LOCAL" ? (unitType === "RURAL" ? "LOCAL_RURAL" : "LOCAL_URBAN") : tier; }
export function labelText(key) { return LABELS[key] || LABELS.DEPT; }
// A representative's office: its name, label key, home area and state.
export async function repOfficeInfo(env, tier, id) {
  const t = await tierTable(env, tier); if (!t) return null;
  const row = await env.DB.prepare(`SELECT * FROM ${t.table} WHERE id = ?`).bind(String(id || "")).first();
  if (!row) return null;
  let area = null;
  if (tier === "LOCAL" || tier === "MAYOR") area = row.area_id || null;
  else {
    const q = tier === "MLA" ? "SELECT area_id FROM local_units WHERE mla_constituency_id = ? AND area_id IS NOT NULL LIMIT 1"
      : "SELECT lu.area_id FROM local_units lu JOIN mla_constituencies m ON m.id = lu.mla_constituency_id WHERE m.mp_constituency_id = ? AND lu.area_id IS NOT NULL LIMIT 1";
    const a = await env.DB.prepare(q).bind(row.id).first(); area = a ? a.area_id : null;
  }
  const ar = area ? await env.DB.prepare("SELECT state FROM areas WHERE id = ?").bind(area).first() : null;
  return { type: "REP", tier, id: row.id, name: row.name, label: labelKey("REP", tier, row.unit_type), areaId: area, state: ar ? ar.state : null, vacant: row.seat_status === "VACANT" };
}
export async function deptOfficeInfo(env, id) {
  const d = await env.DB.prepare("SELECT d.id, d.name_en, d.area_id, a.state FROM dept_offices d LEFT JOIN areas a ON a.id = d.area_id WHERE d.id = ? AND d.retired_at IS NULL").bind(String(id || "")).first();
  return d ? { type: "DEPT", tier: null, id: d.id, name: d.name_en, label: "DEPT", areaId: d.area_id, state: d.state || null } : null;
}

export async function logNotice(env, actor, action, n, detail) {
  await env.DB.prepare("INSERT INTO admin_events (id, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actor, action, n.ref || n.id, JSON.stringify(Object.assign({ notice: n.id, office: n.office_name }, detail || {}))).run();
}
async function nextNoticeRef(env) {
  const r = await env.DB.prepare("SELECT ref FROM notices ORDER BY ref DESC LIMIT 1").first();
  const n = r ? Number(String(r.ref).replace(/\D/g, "")) + 1 : 1;
  return "GIQ-NTC-" + String(n).padStart(6, "0");
}

// Notices that count against an office's limit: waiting, approved, or paid and not yet ended.
export async function openCount(env, office, pauses, today) {
  const { results } = await env.DB.prepare("SELECT * FROM notices WHERE office_type = ? AND office_id = ? AND COALESCE(office_tier, '') = ? AND status IN ('PENDING', 'APPROVED', 'PAID')")
    .bind(office.type, office.id, office.tier || "").all();
  return (results || []).filter((n) => n.status !== "PAID" || stateOf(n, pauses, today) !== "ENDED").length;
}

// An office asks for a notice. Returns { status, body }.
export async function requestNotice(env, office, b, actor, origin, file) {
  const live = await liveVersion(env);
  const s = live.data, ns = noticeSettings(s), today = istToday();
  if (!ns.enabled) return { status: 409, body: { error: "OFF" } };
  if (office.vacant) return { status: 409, body: { error: "VACANT" } };
  const c = checkNotice(b, today);
  const plan = ns.plans.find((p) => p.id === c.value.planId && p.shown && !p.retired);
  if (!plan) c.fields.planId = "REQUIRED";
  const pauses = await activePauses(env);
  const n0 = { office_type: office.type, category: c.value.category, area_id: office.areaId, state: office.state };
  if (!c.fields.startOn && c.value.category && pausable(n0) && pausedOn(pauses, office.areaId, office.state, c.value.startOn)) c.fields.startOn = "PAUSED";
  const withLetters = await lettersReady(env);
  const lt = withLetters ? await checkLetter(b, file, needsLetter(office.type, c.value.category), today) : { fields: {}, has: false };
  Object.assign(c.fields, lt.fields);
  if (Object.keys(c.fields).length) return { status: 400, body: { error: "CHECK_FIELDS", fields: c.fields, letterNeeded: withLetters && needsLetter(office.type, c.value.category) } };
  if (lt.has && !env.PRIVATE_PHOTOS) return { status: 503, body: { error: "STORAGE_NOT_SET" } };
  if ((await openCount(env, office, pauses, today)) >= ns.maxLivePerOffice) return { status: 409, body: { error: "LIMIT", limit: ns.maxLivePerOffice } };
  const reach = reachOf(office.type, office.tier);
  const pr = priceFor(s, plan, reach);
  if (!pr) return { status: 409, body: { error: "NO_PRICE" } };
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const v = c.value;
  let ref = null;
  for (let i = 0; i < 3 && !ref; i++) {
    const r = await nextNoticeRef(env);
    try {
      await env.DB.prepare(
        `INSERT INTO notices (id, ref, office_type, office_tier, office_id, office_name, office_label, area_id, state, category, title_en, title_hi, body_en, body_hi, event_date, event_time, place,
           plan_id, plan_name, days, reach, amount, gst_rate, gst, total, settings_version, start_on, flags, status, requested_by, requested_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`
      ).bind(id, r, office.type, office.tier, office.id, office.name, office.label, office.areaId, office.state, v.category, v.titleEn || null, v.titleHi || null, v.bodyEn || null, v.bodyHi || null,
        v.eventDate || null, v.eventTime || null, v.place || null, plan.id, plan.nameEn, plan.days, reach, pr.amount, pr.gstRate, pr.gst, pr.total, live.version, v.startOn,
        c.flags.length ? JSON.stringify(c.flags) : null, actor, now).run();
      ref = r;
    } catch (e) { if (!/UNIQUE/i.test(String(e && e.message))) throw e; }
  }
  if (!ref) return { status: 409, body: { error: "CONFLICT" } };
  const n = { id, ref, office_name: office.name };
  if (lt.has) {
    const key = await storeLetter(env, id, lt.value);
    await env.DB.prepare("UPDATE notices SET letter_key = ?, letter_type = ?, letter_size = ?, letter_no = ?, letter_date = ?, letter_by = ?, letter_uploaded_at = ? WHERE id = ?")
      .bind(key, lt.value.type, lt.value.bytes.length, lt.value.no, lt.value.date, lt.value.by, now, id).run();
  }
  await logNotice(env, actor, "notice_requested", n, { plan: plan.id, total: pr.total, startOn: v.startOn, flags: c.flags, letter: lt.has ? { no: lt.value.no, date: lt.value.date, by: lt.value.by, type: lt.value.type, size: lt.value.bytes.length } : null });
  try {
    await sendEmailNow(env, s.company.supportEmail, `GrievIQ: public notice ${ref} is waiting for approval`,
      `<p>${office.name} asked for a paid public notice (<b>${ref}</b>, ${plan.nameEn}, from ${v.startOn}). Check it in <a href="${origin}/admin-notices.html">Public notices</a>.</p>`);
  } catch (e) { /* recorded either way */ }
  return { status: 200, body: { ok: true, id, ref, total: pr.total } };
}

// The admin approves: a bill for the price quoted. Returns { status, body }.
export function checksFor(n) { return n.letter_key ? CHECKS.concat(["LETTER"]) : CHECKS; }
export async function approveNotice(env, n, actor, checks, origin, verifiedHow) {
  const withLetters = await lettersReady(env);
  if (withLetters && needsLetter(n.office_type, n.category) && !n.letter_key) return { status: 409, body: { error: "NO_LETTER" } };
  const f = {};
  const missing = checksFor(n).filter((k) => !(checks && checks[k] === true));
  if (missing.length) f.checks = "ALL";
  const how = clean(verifiedHow, 300).replace(/\n/g, " ");
  if (n.letter_key && how.length < 10) f.verifiedHow = "REQUIRED";
  if (Object.keys(f).length) return { status: 400, body: { error: "CHECK_FIELDS", fields: f, missing } };
  if (n.letter_key) { await env.DB.prepare("UPDATE notices SET letter_verified_how = ? WHERE id = ?").bind(how, n.id).run(); n.letter_verified_how = how; }
  const today = istToday();
  if (n.start_on < today) {
    // A request approved after its start date starts today instead.
    await env.DB.prepare("UPDATE notices SET start_on = ? WHERE id = ?").bind(today, n.id).run();
    n.start_on = today;
  }
  const live = await liveVersion(env);
  const billId = crypto.randomUUID(), now = new Date().toISOString();
  let bref = null;
  for (let i = 0; i < 3 && !bref; i++) {
    const r = await nextRef(env);
    try {
      await env.DB.prepare(
        `INSERT INTO bills (id, ref, office_type, office_tier, office_id, office_name, plan_id, plan_name, period, period_from, period_to, amount, gst_rate, gst, total, offer_id, settings_version, due_on, status, issued_by, issued_at, note, kind, notice_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MONTH', ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'DUE', ?, ?, ?, 'NOTICE', ?)`
      ).bind(billId, r, n.office_type, n.office_tier, n.office_id, n.office_name, "notice:" + n.plan_id, "Public notice " + n.ref + " (" + n.plan_name + ")", n.start_on, addDays(n.start_on, n.days - 1),
        n.amount, n.gst_rate, n.gst, n.total, n.settings_version || live.version, addDays(today, 7), actor, now, "Paid public notice " + n.ref, n.id).run();
      bref = r;
    } catch (e) { if (!/UNIQUE/i.test(String(e && e.message))) throw e; }
  }
  if (!bref) return { status: 409, body: { error: "CONFLICT" } };
  const res = await env.DB.prepare("UPDATE notices SET status = 'APPROVED', decided_by = ?, decided_at = ?, checks = ?, bill_id = ? WHERE id = ? AND status = 'PENDING'")
    .bind(actor, now, JSON.stringify(checksFor(n)), billId, n.id).run();
  if (!res.meta || res.meta.changes !== 1) {
    await env.DB.prepare("UPDATE bills SET status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?, cancel_reason = 'Notice already decided' WHERE id = ?").bind(now, actor, billId).run();
    return { status: 409, body: { error: "ALREADY_DECIDED" } };
  }
  await logBill(env, billId, actor, "ISSUED", { ref: bref, notice: n.ref, total: n.total });
  await logNotice(env, actor, "notice_approved", n, { bill: bref, total: n.total, letterVerifiedHow: n.letter_key ? n.letter_verified_how : null });
  const bill = await env.DB.prepare("SELECT * FROM bills WHERE id = ?").bind(billId).first();
  const emailed = await emailOffice(env, origin, bill, "ISSUED");
  return { status: 200, body: { ok: true, status: "APPROVED", bill: bref, emailed } };
}

// A notice's bill was paid: it runs for its full days from its start date,
// or from today if that has passed.
export async function noticePaid(env, bill, actor) {
  if (!bill || bill.kind !== "NOTICE" || !bill.notice_id) return;
  const n = await env.DB.prepare("SELECT * FROM notices WHERE id = ?").bind(bill.notice_id).first();
  if (!n || n.status !== "APPROVED") return;
  const today = istToday(), now = new Date().toISOString();
  const starts = n.start_on > today ? n.start_on : today;
  await env.DB.prepare("UPDATE notices SET status = 'PAID', paid_at = ?, starts_on = ? WHERE id = ? AND status = 'APPROVED'").bind(now, starts, n.id).run();
  n.status = "PAID"; n.starts_on = starts;
  const run = runOf(n, await activePauses(env));
  await logNotice(env, actor, "notice_paid", n, { bill: bill.ref, from: run.from, to: run.to });
}
// A notice's bill was cancelled by staff: the notice can't run.
export async function noticeBillCancelled(env, bill, actor, reason) {
  if (!bill || bill.kind !== "NOTICE" || !bill.notice_id) return;
  const n = await env.DB.prepare("SELECT * FROM notices WHERE id = ?").bind(bill.notice_id).first();
  if (!n || n.status !== "APPROVED") return;
  await env.DB.prepare("UPDATE notices SET status = 'CANCELLED', ended_by = ?, ended_at = ?, end_reason = ? WHERE id = ? AND status = 'APPROVED'").bind(actor, new Date().toISOString(), "Bill cancelled: " + reason, n.id).run();
  await logNotice(env, actor, "notice_cancelled", n, { bill: bill.ref, reason });
}

// ---- shapes ----
function parse(x, d) { try { return x ? JSON.parse(x) : d; } catch (e) { return d; } }
export function noticeOut(n, pauses, today, bill) {
  const run = n.status === "PAID" ? runOf(n, pauses) : null;
  return {
    id: n.id, ref: n.ref, officeType: n.office_type, officeTier: n.office_tier, officeId: n.office_id, officeName: n.office_name, officeLabel: labelText(n.office_label),
    category: n.category, titleEn: n.title_en, titleHi: n.title_hi, bodyEn: n.body_en, bodyHi: n.body_hi, eventDate: n.event_date, eventTime: n.event_time, place: n.place,
    planId: n.plan_id, planName: n.plan_name, days: n.days, reach: n.reach, amount: n.amount, gst: n.gst, total: n.total,
    startOn: n.start_on, from: run ? run.from : null, to: run ? run.to : null, pausedDays: run ? run.paused : 0,
    status: n.status, state: stateOf(n, pauses, today), flags: parse(n.flags, []),
    requestedBy: n.requested_by, requestedAt: n.requested_at, decidedBy: n.decided_by, decidedAt: n.decided_at, decisionNote: n.decision_note,
    paidAt: n.paid_at, endedBy: n.ended_by, endedAt: n.ended_at, endReason: n.end_reason,
    bill: bill ? { id: bill.id, ref: bill.ref, status: bill.status, total: bill.total, dueOn: bill.due_on } : null,
    letterNeeded: needsLetter(n.office_type, n.category),
    letter: n.letter_key ? { no: n.letter_no, date: n.letter_date, by: n.letter_by, type: n.letter_type, size: n.letter_size, uploadedAt: n.letter_uploaded_at, verifiedHow: n.letter_verified_how || null } : null,
  };
}
// What citizens see: the notice and who published it. No prices, no people.
function publicOut(n, run) {
  return { ref: n.ref, category: n.category, titleEn: n.title_en, titleHi: n.title_hi, bodyEn: n.body_en, bodyHi: n.body_hi, eventDate: n.event_date, eventTime: n.event_time, place: n.place,
    office: n.office_name, officeLabel: labelText(n.office_label), until: run.to,
    authority: n.letter_key ? { no: n.letter_no, date: n.letter_date } : null };   // the letter's number and date only, never the letter
}
// Fair order without paid ranking: a different order each day and ward.
function dayHash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Notices shown on a ward or village page today.
export async function liveForWard(env, wardId, today) {
  today = today || istToday();
  if (!(await noticesReady(env))) return { notices: [], maxShown: 3 };
  const lu = await env.DB.prepare("SELECT lu.id, lu.area_id, lu.municipal_body_id, lu.mla_constituency_id, mb.has_mayor, m.mp_constituency_id, a.state FROM local_units lu LEFT JOIN municipal_bodies mb ON mb.id = lu.municipal_body_id LEFT JOIN mla_constituencies m ON m.id = lu.mla_constituency_id LEFT JOIN areas a ON a.id = lu.area_id WHERE lu.id = ?").bind(String(wardId || "")).first();
  if (!lu) return null;
  const keys = ["REP|LOCAL|" + lu.id, "REP|MLA|" + lu.mla_constituency_id, "REP|MP|" + lu.mp_constituency_id];
  if (lu.municipal_body_id && lu.has_mayor) keys.push("REP|MAYOR|" + lu.municipal_body_id);
  // grieviq-57: every member of a ward with several members (seats B-F).
  try { const { results: ss } = await env.DB.prepare("SELECT id FROM ward_seats WHERE local_unit_id = ?").bind(lu.id).all(); for (const x of ss || []) keys.push("REP|LOCAL|" + x.id); } catch (e) { /* before part40 */ }
  if (lu.area_id) {
    const { results } = await env.DB.prepare("SELECT id, wards FROM dept_offices WHERE area_id = ? AND retired_at IS NULL").bind(lu.area_id).all();
    for (const d of results || []) { const w = parse(d.wards, null); if (!Array.isArray(w) || !w.length || w.includes(lu.id)) keys.push("DEPT||" + d.id); }
  }
  const { results } = await env.DB.prepare("SELECT * FROM notices WHERE status = 'PAID' AND (office_type || '|' || COALESCE(office_tier, '') || '|' || office_id) IN (SELECT value FROM json_each(?))").bind(JSON.stringify(keys)).all();
  const pauses = await activePauses(env);
  const shown = (results || []).filter((n) => {
    if (stateOf(n, pauses, today) !== "LIVE") return false;
    // The ward's own area may be under the election code even if the office's home area isn't.
    return !(pausable(n) && pausedOn(pauses, lu.area_id, lu.state, today));
  }).sort((a, b) => dayHash(today + lu.id + a.id) - dayHash(today + lu.id + b.id));
  const s = (await liveVersion(env)).data;
  return { notices: shown.map((n) => publicOut(n, runOf(n, pauses))), maxShown: noticeSettings(s).maxShown };
}

// ---- what an office sees (representative console and department dashboard) ----
export async function officeView(env, offices) {
  const ready = await noticesReady(env);
  const live = await liveVersion(env);
  const s = live.data, ns = noticeSettings(s), today = istToday();
  const pauses = ready ? await activePauses(env) : [];
  const out = offices.map((o) => {
    const reach = reachOf(o.type, o.tier);
    const now = pausedOn(pauses, o.areaId, o.state, today);
    const next = pauses.filter((p) => pauseHits(p, o.areaId, o.state) && p.to_on >= today).map((p) => ({ label: p.label, from: p.from_on, to: p.to_on }));
    return { type: o.type, tier: o.tier, id: o.id, name: o.name, label: labelText(o.label), reach, vacant: !!o.vacant, plans: plansFor(s, reach), pausedNow: !!now, pauses: next };
  });
  let notices = [];
  if (ready && offices.length) {
    const keys = JSON.stringify(offices.map((o) => o.type + "|" + (o.tier || "") + "|" + o.id));
    const { results } = await env.DB.prepare("SELECT * FROM notices WHERE (office_type || '|' || COALESCE(office_tier, '') || '|' || office_id) IN (SELECT value FROM json_each(?)) ORDER BY requested_at DESC LIMIT 100").bind(keys).all();
    const rows = results || [];
    const billIds = rows.map((n) => n.bill_id).filter(Boolean);
    const bills = {};
    if (billIds.length) for (const b of (await env.DB.prepare("SELECT * FROM bills WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(billIds)).all()).results || []) bills[b.id] = b;
    notices = rows.map((n) => { const x = noticeOut(n, pauses, today, bills[n.bill_id]); delete x.flags; return x; });
  }
  return { ready, enabled: ns.enabled, today, maxLive: ns.maxLivePerOffice, maxStartDays: MAX_START_DAYS, gstRate: Number(s.gst.rate), categories: CATEGORIES, essential: ESSENTIAL, offices: out, notices,
    letters: ready && (await lettersReady(env)), letterCategories: LETTER_CATEGORIES, letterMaxMb: LETTER_MAX_BYTES / 1048576 };
}
// The office takes back its request (before it is paid).
export async function withdrawNotice(env, n, actor) {
  if (!n) return { status: 404, body: { error: "NOT_FOUND" } };
  if (!["PENDING", "APPROVED"].includes(n.status)) return { status: 409, body: { error: "NOT_OPEN" } };
  const now = new Date().toISOString();
  if (n.bill_id) {
    const bill = await env.DB.prepare("SELECT * FROM bills WHERE id = ?").bind(n.bill_id).first();
    if (bill && bill.status === "REPORTED") return { status: 409, body: { error: "PAYMENT_REPORTED" } };
    if (bill && bill.status === "DUE") {
      await env.DB.prepare("UPDATE bills SET status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?, cancel_reason = 'Notice withdrawn by the office' WHERE id = ? AND status = 'DUE'").bind(now, actor, bill.id).run();
      await logBill(env, bill.id, actor, "CANCELLED", { reason: "Notice withdrawn by the office", notice: n.ref });
    }
  }
  const r = await env.DB.prepare("UPDATE notices SET status = 'WITHDRAWN', ended_by = ?, ended_at = ? WHERE id = ? AND status IN ('PENDING', 'APPROVED')").bind(actor, now, n.id).run();
  if (!r.meta || r.meta.changes !== 1) return { status: 409, body: { error: "NOT_OPEN" } };
  await logNotice(env, actor, "notice_withdrawn", n, null);
  return { status: 200, body: { ok: true, status: "WITHDRAWN" } };
}
// Short emails to the office (no notice text beyond its reference).
export async function emailNoticeOffice(env, origin, n, kind, reason) {
  const fake = { office_type: n.office_type, office_tier: n.office_tier, office_id: n.office_id };
  const { billPeople } = await import("./billing.js");
  const to = await billPeople(env, fake);
  const where = n.office_type === "DEPT" ? origin + "/dept" : origin + "/rep";
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let subject, html;
  if (kind === "REJECTED") {
    subject = `GrievIQ: public notice ${n.ref} was not approved · सूचना स्वीकृत नहीं`;
    html = `<p>Your request for public notice <b>${esc(n.ref)}</b> (${esc(n.office_name)}) was not approved.</p><p>Reason: ${esc(reason)}</p><p>You can correct it and ask again at <a href="${esc(where)}">${esc(where)}</a> → Notices. Nothing is charged.</p><hr>` +
      `<p>सार्वजनिक सूचना <b>${esc(n.ref)}</b> का अनुरोध स्वीकृत नहीं हुआ। कारण: ${esc(reason)}</p><p>आप इसे सुधारकर <a href="${esc(where)}">${esc(where)}</a> पर सूचनाएँ में फिर अनुरोध कर सकते हैं। कोई शुल्क नहीं लिया गया।</p>`;
  } else {
    subject = `GrievIQ: public notice ${n.ref} was taken down · सूचना हटाई गई`;
    html = `<p>Public notice <b>${esc(n.ref)}</b> (${esc(n.office_name)}) was taken down by GrievIQ.</p><p>Reason: ${esc(reason)}</p><p>For questions about the payment, reply to GrievIQ support.</p><hr>` +
      `<p>सार्वजनिक सूचना <b>${esc(n.ref)}</b> GrievIQ द्वारा हटा दी गई। कारण: ${esc(reason)}</p><p>भुगतान संबंधी प्रश्नों के लिए GrievIQ सहायता से संपर्क करें।</p>`;
  }
  let sent = 0;
  for (const e of to) if (await sendEmailNow(env, e, subject, html)) sent++;
  return sent;
}

// grieviq-56: the office sends a new authority letter while its request waits.
export async function replaceLetter(env, n, b, file, actor) {
  if (!n) return { status: 404, body: { error: "NOT_FOUND" } };
  if (n.status !== "PENDING") return { status: 409, body: { error: "NOT_OPEN" } };
  if (!(await lettersReady(env))) return { status: 409, body: { error: "NOT_READY" } };
  const lt = await checkLetter(b, file, true, istToday());
  if (Object.keys(lt.fields).length) return { status: 400, body: { error: "CHECK_FIELDS", fields: lt.fields } };
  if (!env.PRIVATE_PHOTOS) return { status: 503, body: { error: "STORAGE_NOT_SET" } };
  const key = await storeLetter(env, n.id, lt.value);
  await env.DB.prepare("UPDATE notices SET letter_key = ?, letter_type = ?, letter_size = ?, letter_no = ?, letter_date = ?, letter_by = ?, letter_uploaded_at = ?, letter_verified_how = NULL WHERE id = ? AND status = 'PENDING'")
    .bind(key, lt.value.type, lt.value.bytes.length, lt.value.no, lt.value.date, lt.value.by, new Date().toISOString(), n.id).run();
  await logNotice(env, actor, n.letter_key ? "notice_letter_replaced" : "notice_letter_added", n, { no: lt.value.no, date: lt.value.date, by: lt.value.by, previous: n.letter_key || null });
  return { status: 200, body: { ok: true } };
}
// Office endpoints take JSON, or multipart with the letter in "letter".
export async function readBody(request) {
  const ct = String(request.headers.get("content-type") || "");
  if (/multipart\/form-data/i.test(ct)) {
    const fd = await request.formData();
    const b = {};
    for (const [k, v] of fd.entries()) if (typeof v === "string") b[k] = v;
    const f = fd.get("letter");
    return { b, file: f && typeof f !== "string" ? f : null };
  }
  return { b: await request.json(), file: null };
}
