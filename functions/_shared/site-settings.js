/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/site-settings.js
//
// "Prices & site details" (grieviq-39, approved 11 Oct 2026).
//
// Everything a super admin can change about what GrievIQ publishes for
// offices: the plans and their prices, GST, discounts and offers, the
// company's details and contacts, the payment policy text and the claims
// that stay switched off until they are true.
//
// Storage (part27):
//   site_settings_draft     one row ("draft"), edited freely, never public
//   site_settings_versions  every published version, append-only (triggers
//                           refuse UPDATE and DELETE); the newest is live
// Before part27 is run, or if nothing has been published yet, DEFAULTS are
// live, so every page works either way.
//
// Rules kept here (not only in the page):
//   - Same price for every party: discounts belong to a plan, never to one
//     office; no private coupon codes.
//   - An offer has a real end date and switches itself off after it
//     (Guidelines for Prevention and Regulation of Dark Patterns, 2023:
//     "false urgency").
//   - Two offers never stack; the one that saves the buyer more applies.
//   - Prices are whole rupees; GST is worked out and rounded to the rupee.

export const DEFAULTS = {
  plans: [
    { id: "pradhan", nameEn: "Gram Pradhan office", nameHi: "ग्राम प्रधान कार्यालय", forEn: "For a gram panchayat's Pradhan and their team", forHi: "ग्राम पंचायत के प्रधान और उनकी टीम के लिए",
      billing: "MONTHLY", monthly: 999, yearly: null, quoteEn: "", quoteHi: "", seats: 3, extraSeat: 499, descEn: "Village complaints in one place, field checks with photos, alerts and a monthly report.", descHi: "गाँव की शिकायतें एक स्थान पर, फ़ोटो सहित स्थल-जाँच, सूचनाएँ और मासिक रिपोर्ट।", shown: true, retired: false, pilot: true, next: null },
    { id: "councillor", nameEn: "Ward Councillor office", nameHi: "पार्षद कार्यालय", forEn: "For a ward councillor (corporator) and their team", forHi: "वार्ड पार्षद और उनकी टीम के लिए",
      billing: "MONTHLY", monthly: 1999, yearly: null, quoteEn: "", quoteHi: "", seats: 3, extraSeat: 499, descEn: "Ward console, field checks with photos, push alerts and a monthly performance report.", descHi: "वार्ड कंसोल, फ़ोटो सहित स्थल-जाँच, पुश सूचनाएँ और मासिक प्रदर्शन रिपोर्ट।", shown: true, retired: false, pilot: true, next: null },
    { id: "mla", nameEn: "MLA office", nameHi: "विधायक कार्यालय", forEn: "For an MLA's constituency office", forHi: "विधायक के क्षेत्रीय कार्यालय के लिए",
      billing: "MONTHLY", monthly: 7999, yearly: null, quoteEn: "", quoteHi: "", seats: 10, extraSeat: 499, descEn: "All wards in the assembly seat, team roles, the escalation queue and a performance dashboard.", descHi: "विधानसभा क्षेत्र के सभी वार्ड, टीम भूमिकाएँ, अग्रसारित शिकायतें और प्रदर्शन डैशबोर्ड।", shown: true, retired: false, pilot: true, next: null },
    { id: "mp_mayor", nameEn: "MP or Mayor office", nameHi: "सांसद या महापौर कार्यालय", forEn: "For an MP's or a Mayor's office", forHi: "सांसद या महापौर के कार्यालय के लिए",
      billing: "MONTHLY", monthly: 11999, yearly: null, quoteEn: "", quoteHi: "", seats: 20, extraSeat: 499, descEn: "Every ward and assembly seat in the area, cross-area performance figures and the audit trail.", descHi: "क्षेत्र के सभी वार्ड और विधानसभा क्षेत्र, क्षेत्रवार प्रदर्शन आँकड़े और ऑडिट ट्रेल।", shown: true, retired: false, pilot: true, next: null },
    { id: "dept_office", nameEn: "Department office (one office)", nameHi: "विभागीय कार्यालय (एक कार्यालय)", forEn: "For one government department office", forHi: "एक सरकारी विभागीय कार्यालय के लिए",
      billing: "YEARLY", monthly: null, yearly: 42000, quoteEn: "", quoteHi: "", seats: 15, extraSeat: null, descEn: "Department dashboard, officer logins, response-time reports and the audit trail.", descHi: "विभागीय डैशबोर्ड, अधिकारी लॉगिन, उत्तर-समय रिपोर्ट और ऑडिट ट्रेल।", shown: true, retired: false, pilot: true, next: null },
    { id: "dept_city", nameEn: "City-wide or multi-office department", nameHi: "नगर-स्तरीय या बहु-कार्यालय विभाग", forEn: "For a department with many offices in a city", forHi: "नगर में अनेक कार्यालयों वाले विभाग के लिए",
      billing: "QUOTE", monthly: null, yearly: null, quoteEn: "₹2–8 lakh a year, quoted by the number of offices", quoteHi: "₹2–8 लाख प्रति वर्ष, कार्यालयों की संख्या के अनुसार", seats: null, extraSeat: null, descEn: "Many offices, custom reports and training for every office.", descHi: "अनेक कार्यालय, विशेष रिपोर्ट और हर कार्यालय के लिए प्रशिक्षण।", shown: true, retired: false, pilot: false, next: null },
  ],
  gst: { rate: 18, gstin: "", sac: "" },
  yearly: { mode: "MONTHS", months: 10, percent: 0 },
  pilot: { days: 90, oncePerOffice: true },
  offers: [],
  company: {
    legalName: "IOTC (Indus Overseas Trading Corporation)",
    cin: "",
    address: "Plot no. SC 01/B8, Sector-150, Noida, Uttar Pradesh, 201310",
    goName: "Amit Singh",
    goEmail: "grievance@grieviq.in",
    goPhone: "",
    supportEmail: "support@grieviq.in",
    securityEmail: "security@grieviq.in",
    phone: "",
    whatsapp: "",
    hoursEn: "",
    hoursHi: "",
    callbackEn: "within 2 working days",
    callbackHi: "2 कार्य-दिवसों के भीतर",
  },
  policies: { refundEn: "", refundHi: "", payEn: "UPI or bank transfer (NEFT, RTGS or IMPS)", payHi: "UPI या बैंक ट्रांसफ़र (NEFT, RTGS या IMPS)" },
  claims: { gem: false, india: false, audited: false, auditedOn: "", auditedBy: "" },
  // grieviq-41: where offices pay (UPI ID and bank accounts). Never public:
  // shown only to signed-in representatives, office managers and department
  // officers on their bills. `pending` is set by the server only (see
  // settlePayments): new or changed details wait 24 hours.
  payments: { methods: [], pending: null },
  // grieviq-46: office subscriptions. Offices already using GrievIQ when
  // this was installed are pilots until defaultPilotEnd.
  subscriptions: { reminderDays: 7, graceDays: 7, defaultPilotEnd: "2026-12-31" },
  // grieviq-55: paid public notices. One price per plan for every office of
  // the same reach (priceLocal: ward or village offices and department
  // offices; priceWide: Mayor, MLA and MP offices, shown across many wards),
  // GST extra. A request keeps the price it was quoted.
  notices: {
    enabled: true, maxLivePerOffice: 2, maxShown: 3,
    plans: [
      { id: "week", nameEn: "One week", nameHi: "एक सप्ताह", days: 7, priceLocal: 299, priceWide: 999, shown: true, retired: false },
      { id: "fortnight", nameEn: "Two weeks", nameHi: "दो सप्ताह", days: 14, priceLocal: 499, priceWide: 1799, shown: true, retired: false },
      { id: "month", nameEn: "One month (30 days)", nameHi: "एक माह (30 दिन)", days: 30, priceLocal: 899, priceWide: 2999, shown: true, retired: false },
    ],
  },
  // grieviq-72: Community helpers. One monthly fee for everyone, GST
  // INCLUDED (price is what the helper pays). Applications stay closed
  // until the super admin opens them.
  helpers: { open: false, price: 499 },
};
// Settings published before a section existed get that section's defaults.
export function withDefaults(data) {
  const d = data && typeof data === "object" ? data : {};
  for (const k of Object.keys(DEFAULTS)) if (d[k] === undefined) d[k] = clone(DEFAULTS[k]);
  return d;
}

export const LIMITS = { plans: 20, offers: 10, price: 100000000, payMethods: 6, noticePlans: 8 };
export const PAY_DELAY_HOURS = 24;
export const HELPER_PRICE = { min: 100, max: 100000 };
// A price that includes GST, split into the amount before GST and the GST.
export function gstIncluded(price, rate) {
  const base = Math.round(Number(price) * 100 / (100 + Number(rate || 0)));
  return { price: Number(price), base, gst: Number(price) - base, rate: Number(rate || 0) };
}
const UPI_RE = /^[a-z0-9][a-z0-9._-]{1,99}@[a-z][a-z0-9.-]{1,49}$/i;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^[0-9]{9,18}$/;
const PAYEE_RE = /^[A-Za-z0-9 .,&()'\/-]{2,60}$/;   // plain letters: the name goes into the UPI QR code
const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9_]{2,30}$/;
const PHONE_RE = /^\+?[0-9 ]{8,16}$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function istToday(ms) { return new Date((ms || Date.now()) + 5.5 * 3600000).toISOString().slice(0, 10); }
function realDate(s) { if (!DATE_RE.test(s)) return false; const d = new Date(s + "T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

function str(v, max) {
  if (v == null) return "";
  return String(v).normalize("NFC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, max + 1);
}
function longStr(v, max) {
  if (v == null) return "";
  return String(v).normalize("NFC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max + 1);
}
function money(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

// Checks and tidies what the admin page sends. Returns { data, fields }
// where fields maps a path ("plans.2.monthly") to a reason code.
export function cleanSettings(raw) {
  const f = {};
  const r = raw && typeof raw === "object" ? raw : {};
  const out = clone(DEFAULTS);
  const need = (path, v, max, required) => {
    const s = str(v, max);
    if (s.length > max) f[path] = "LENGTH";
    else if (required && !s) f[path] = "REQUIRED";
    return s.slice(0, max);
  };
  const amount = (path, v, required, min) => {
    const n = money(v);
    if (n === null) { if (required) f[path] = "REQUIRED"; return null; }
    if (!Number.isInteger(n) || n < (min || 0) || n > LIMITS.price) { f[path] = "RANGE"; return null; }
    return n;
  };

  // Plans
  const plans = Array.isArray(r.plans) ? r.plans : [];
  if (plans.length > LIMITS.plans) f.plans = "TOO_MANY";
  const seen = new Set();
  out.plans = plans.slice(0, LIMITS.plans).map((p, i) => {
    p = p || {};
    const at = "plans." + i + ".";
    const q = {};
    q.id = str(p.id, 30).toLowerCase();
    if (!ID_RE.test(q.id)) f[at + "id"] = "FORMAT"; else if (seen.has(q.id)) f[at + "id"] = "DUPLICATE";
    seen.add(q.id);
    q.nameEn = need(at + "nameEn", p.nameEn, 60, true);
    q.nameHi = need(at + "nameHi", p.nameHi, 60, true);
    q.forEn = need(at + "forEn", p.forEn, 120, false);
    q.forHi = need(at + "forHi", p.forHi, 120, false);
    q.billing = ["MONTHLY", "YEARLY", "QUOTE"].includes(p.billing) ? p.billing : (f[at + "billing"] = "REQUIRED", "MONTHLY");
    q.monthly = q.billing === "MONTHLY" ? amount(at + "monthly", p.monthly, true, 1) : null;
    q.yearly = q.billing === "YEARLY" ? amount(at + "yearly", p.yearly, true, 1) : null;
    q.quoteEn = q.billing === "QUOTE" ? need(at + "quoteEn", p.quoteEn, 120, true) : "";
    q.quoteHi = q.billing === "QUOTE" ? need(at + "quoteHi", p.quoteHi, 120, true) : "";
    const seats = money(p.seats);
    if (seats === null) q.seats = null;
    else if (!Number.isInteger(seats) || seats < 1 || seats > 1000) { f[at + "seats"] = "RANGE"; q.seats = null; } else q.seats = seats;
    q.extraSeat = amount(at + "extraSeat", p.extraSeat, false, 0);
    q.descEn = need(at + "descEn", p.descEn, 200, false);
    q.descHi = need(at + "descHi", p.descHi, 200, false);
    q.shown = !!p.shown;
    q.retired = !!p.retired;
    if (q.retired) q.shown = false;
    q.pilot = q.billing !== "QUOTE" && !!p.pilot;
    q.next = null;
    const n = p.next;
    if (n && (n.from || n.monthly != null || n.yearly != null) && q.billing !== "QUOTE") {
      const from = str(n.from, 10);
      if (!realDate(from)) f[at + "next.from"] = "DATE";
      const v = q.billing === "MONTHLY" ? amount(at + "next.monthly", n.monthly, true, 1) : amount(at + "next.yearly", n.yearly, true, 1);
      q.next = { from, monthly: q.billing === "MONTHLY" ? v : null, yearly: q.billing === "YEARLY" ? v : null };
    }
    return q;
  });
  if (!out.plans.length) f.plans = "NONE";

  // GST
  const g = r.gst || {};
  const rate = Number(g.rate);
  if (!(rate >= 0 && rate <= 28) || Math.round(rate * 100) !== rate * 100) f["gst.rate"] = "RANGE";
  out.gst = { rate: f["gst.rate"] ? 18 : rate, gstin: str(g.gstin, 15).toUpperCase(), sac: str(g.sac, 8) };
  if (out.gst.gstin && !GSTIN_RE.test(out.gst.gstin)) f["gst.gstin"] = "FORMAT";
  if (out.gst.sac && !/^\d{4,8}$/.test(out.gst.sac)) f["gst.sac"] = "FORMAT";

  // Yearly discount and pilot
  const y = r.yearly || {};
  const mode = y.mode === "PERCENT" ? "PERCENT" : "MONTHS";
  const months = Number(y.months), pct = Number(y.percent);
  if (mode === "MONTHS" && !(Number.isInteger(months) && months >= 1 && months <= 12)) f["yearly.months"] = "RANGE";
  if (mode === "PERCENT" && !(Number.isInteger(pct) && pct >= 0 && pct <= 90)) f["yearly.percent"] = "RANGE";
  out.yearly = { mode, months: mode === "MONTHS" && !f["yearly.months"] ? months : (Number.isInteger(months) && months >= 1 && months <= 12 ? months : 12), percent: mode === "PERCENT" && !f["yearly.percent"] ? pct : 0 };
  const pl = r.pilot || {};
  const days = Number(pl.days);
  if (!(Number.isInteger(days) && days >= 0 && days <= 365)) f["pilot.days"] = "RANGE";
  out.pilot = { days: f["pilot.days"] ? 90 : days, oncePerOffice: pl.oncePerOffice !== false };

  // Offers
  const offers = Array.isArray(r.offers) ? r.offers : [];
  if (offers.length > LIMITS.offers) f.offers = "TOO_MANY";
  const planIds = out.plans.map((p) => p.id);
  const oseen = new Set();
  out.offers = offers.slice(0, LIMITS.offers).map((o, i) => {
    o = o || {};
    const at = "offers." + i + ".";
    const q = {};
    q.id = str(o.id, 30).toLowerCase() || ("offer" + (i + 1));
    if (!ID_RE.test(q.id)) f[at + "id"] = "FORMAT"; else if (oseen.has(q.id)) f[at + "id"] = "DUPLICATE";
    oseen.add(q.id);
    q.nameEn = need(at + "nameEn", o.nameEn, 60, true);
    q.nameHi = need(at + "nameHi", o.nameHi, 60, true);
    q.type = o.type === "AMOUNT" ? "AMOUNT" : "PERCENT";
    const v = money(o.value);
    if (q.type === "PERCENT" && !(Number.isInteger(v) && v >= 1 && v <= 90)) f[at + "value"] = "RANGE";
    if (q.type === "AMOUNT" && !(Number.isInteger(v) && v >= 1 && v <= LIMITS.price)) f[at + "value"] = "RANGE";
    q.value = Number.isFinite(v) ? v : null;
    q.plans = (Array.isArray(o.plans) ? o.plans : []).map((x) => String(x)).filter((x, k, a) => a.indexOf(x) === k);
    if (!q.plans.length) f[at + "plans"] = "REQUIRED";
    else if (q.plans.some((x) => !planIds.includes(x))) f[at + "plans"] = "UNKNOWN";
    q.start = str(o.start, 10); q.end = str(o.end, 10);
    if (!realDate(q.start)) f[at + "start"] = "DATE";
    if (!q.end) f[at + "end"] = "REQUIRED"; else if (!realDate(q.end)) f[at + "end"] = "DATE";
    else if (realDate(q.start) && q.end < q.start) f[at + "end"] = "BEFORE_START";
    q.withYearly = !!o.withYearly;
    return q;
  });

  // Company and contacts
  const c = r.company || {};
  const oc = {};
  oc.legalName = need("company.legalName", c.legalName, 120, true);
  oc.cin = need("company.cin", c.cin, 30, false).toUpperCase();
  oc.address = need("company.address", c.address, 240, true);
  oc.goName = need("company.goName", c.goName, 80, true);
  for (const k of ["goEmail", "supportEmail", "securityEmail"]) {
    oc[k] = need("company." + k, c[k], 120, true).toLowerCase();
    if (oc[k] && !f["company." + k] && !EMAIL_RE.test(oc[k])) f["company." + k] = "FORMAT";
  }
  for (const k of ["goPhone", "phone", "whatsapp"]) {
    oc[k] = need("company." + k, c[k], 20, false);
    if (oc[k] && !f["company." + k] && !PHONE_RE.test(oc[k])) f["company." + k] = "FORMAT";
  }
  oc.hoursEn = need("company.hoursEn", c.hoursEn, 120, false);
  oc.hoursHi = need("company.hoursHi", c.hoursHi, 120, false);
  oc.callbackEn = need("company.callbackEn", c.callbackEn, 60, true);
  oc.callbackHi = need("company.callbackHi", c.callbackHi, 60, true);
  out.company = oc;

  // Policies
  const po = r.policies || {};
  out.policies = {};
  for (const [k, max] of [["refundEn", 1500], ["refundHi", 1500], ["payEn", 160], ["payHi", 160]]) {
    const s = k.startsWith("refund") ? longStr(po[k], max) : str(po[k], max);
    if (s.length > max) f["policies." + k] = "LENGTH";
    out.policies[k] = s.slice(0, max);
  }
  if (!!out.policies.refundEn !== !!out.policies.refundHi) f[out.policies.refundEn ? "policies.refundHi" : "policies.refundEn"] = "BOTH";

  // Claims (switched off until true)
  const cl = r.claims || {};
  out.claims = { gem: !!cl.gem, india: !!cl.india, audited: !!cl.audited, auditedOn: str(cl.auditedOn, 10), auditedBy: str(cl.auditedBy, 120).slice(0, 120) };
  if (out.claims.audited) {
    if (!realDate(out.claims.auditedOn)) f["claims.auditedOn"] = "DATE";
    else if (out.claims.auditedOn > istToday()) f["claims.auditedOn"] = "FUTURE";
    if (!out.claims.auditedBy) f["claims.auditedBy"] = "REQUIRED";
  }
  // Subscriptions (grieviq-46)
  const sb = r.subscriptions || {};
  const rd = Number(sb.reminderDays), gd = Number(sb.graceDays);
  out.subscriptions = { reminderDays: 7, graceDays: 7, defaultPilotEnd: "2026-12-31" };
  if (!(Number.isInteger(rd) && rd >= 1 && rd <= 30)) f["subscriptions.reminderDays"] = "RANGE"; else out.subscriptions.reminderDays = rd;
  if (!(Number.isInteger(gd) && gd >= 0 && gd <= 30)) f["subscriptions.graceDays"] = "RANGE"; else out.subscriptions.graceDays = gd;
  const dpe = str(sb.defaultPilotEnd, 10);
  if (!realDate(dpe)) f["subscriptions.defaultPilotEnd"] = "DATE"; else out.subscriptions.defaultPilotEnd = dpe;

  // Paid public notices (grieviq-55)
  const nt = r.notices && typeof r.notices === "object" ? r.notices : clone(DEFAULTS.notices);
  const ml = Number(nt.maxLivePerOffice), ms = Number(nt.maxShown);
  out.notices = { enabled: nt.enabled !== false, maxLivePerOffice: 2, maxShown: 3, plans: [] };
  if (!(Number.isInteger(ml) && ml >= 1 && ml <= 10)) f["notices.maxLivePerOffice"] = "RANGE"; else out.notices.maxLivePerOffice = ml;
  if (!(Number.isInteger(ms) && ms >= 1 && ms <= 6)) f["notices.maxShown"] = "RANGE"; else out.notices.maxShown = ms;
  const nplans = Array.isArray(nt.plans) ? nt.plans : [];
  if (nplans.length > LIMITS.noticePlans) f["notices.plans"] = "TOO_MANY";
  const nseen = new Set();
  out.notices.plans = nplans.slice(0, LIMITS.noticePlans).map((p, i) => {
    p = p || {};
    const at = "notices.plans." + i + ".";
    const q = {};
    q.id = str(p.id, 30).toLowerCase();
    if (!ID_RE.test(q.id)) f[at + "id"] = "FORMAT"; else if (nseen.has(q.id)) f[at + "id"] = "DUPLICATE";
    nseen.add(q.id);
    q.nameEn = need(at + "nameEn", p.nameEn, 40, true);
    q.nameHi = need(at + "nameHi", p.nameHi, 40, true);
    const dd = money(p.days);
    if (dd === null) { f[at + "days"] = "REQUIRED"; q.days = null; }
    else if (!Number.isInteger(dd) || dd < 1 || dd > 90) { f[at + "days"] = "RANGE"; q.days = null; } else q.days = dd;
    q.priceLocal = amount(at + "priceLocal", p.priceLocal, true, 1);
    q.priceWide = amount(at + "priceWide", p.priceWide, true, 1);
    q.retired = !!p.retired;
    q.shown = !q.retired && !!p.shown;
    return q;
  });
  if (out.notices.enabled && !out.notices.plans.some((p) => p.shown)) f["notices.plans"] = "NONE_SHOWN";

  // Community helpers (grieviq-72): monthly fee, GST included.
  const hp = r.helpers && typeof r.helpers === "object" ? r.helpers : clone(DEFAULTS.helpers);
  out.helpers = { open: !!hp.open, price: 499 };
  const hpp = money(hp.price);
  if (hpp === null) f["helpers.price"] = "REQUIRED";
  else if (!Number.isInteger(hpp) || hpp < HELPER_PRICE.min || hpp > HELPER_PRICE.max) f["helpers.price"] = "RANGE";
  else out.helpers.price = hpp;

  // Payment details (grieviq-41)
  const pm = r.payments && Array.isArray(r.payments.methods) ? r.payments.methods : [];
  if (pm.length > LIMITS.payMethods) f["payments"] = "TOO_MANY";
  const pseen = new Set();
  out.payments = { methods: pm.slice(0, LIMITS.payMethods).map((m, i) => {
    m = m || {};
    const at = "payments.methods." + i + ".";
    const q = {};
    q.id = str(m.id, 30).toLowerCase() || ("pm" + (i + 1));
    if (!ID_RE.test(q.id)) f[at + "id"] = "FORMAT"; else if (pseen.has(q.id)) f[at + "id"] = "DUPLICATE";
    pseen.add(q.id);
    q.kind = m.kind === "BANK" ? "BANK" : "UPI";
    q.shown = m.shown !== false;
    if (q.kind === "UPI") {
      q.upiId = need(at + "upiId", m.upiId, 150, true).toLowerCase().replace(/\s+/g, "");
      if (q.upiId && !f[at + "upiId"] && !UPI_RE.test(q.upiId)) f[at + "upiId"] = "FORMAT";
      q.payeeName = need(at + "payeeName", m.payeeName, 60, true);
      if (q.payeeName && !f[at + "payeeName"] && !PAYEE_RE.test(q.payeeName)) f[at + "payeeName"] = "PLAIN";
    } else {
      q.accountName = need(at + "accountName", m.accountName, 100, true);
      q.bankName = need(at + "bankName", m.bankName, 80, true);
      q.branch = need(at + "branch", m.branch, 120, false);
      q.accountNumber = str(m.accountNumber, 30).replace(/[\s-]/g, "");
      if (!q.accountNumber) f[at + "accountNumber"] = "REQUIRED"; else if (!ACCOUNT_RE.test(q.accountNumber)) f[at + "accountNumber"] = "FORMAT";
      q.ifsc = str(m.ifsc, 20).toUpperCase().replace(/\s+/g, "");
      if (!q.ifsc) f[at + "ifsc"] = "REQUIRED"; else if (!IFSC_RE.test(q.ifsc)) f[at + "ifsc"] = "FORMAT";
      q.accountType = m.accountType === "SAVINGS" ? "SAVINGS" : "CURRENT";
    }
    return q;
  }), pending: null };
  return { data: out, fields: f };
}

// ---- Payment details: the 24-hour rule (grieviq-41) ----
// Payment-diversion fraud works by quietly swapping the account people pay
// into. So new or changed details go live only PAY_DELAY_HOURS after they are
// published; every super admin is emailed and any of them can cancel the
// change meanwhile. Taking details down (hiding or removing) is safe and
// happens at once.
function payKey(m) { const c = Object.assign({}, m); delete c.id; delete c.shown; return JSON.stringify(c, Object.keys(c).sort()); }
// What offices see now, and the change waiting (if any).
export function paymentState(data, nowMs) {
  const p = (data && data.payments) || { methods: [], pending: null };
  const now = nowMs == null ? Date.now() : nowMs;
  if (p.pending && Date.parse(p.pending.activeFrom) <= now) return { current: p.pending.methods || [], pending: null, changedAt: p.pending.activeFrom };
  return { current: p.methods || [], pending: p.pending || null };
}
// The list the super admin edits: the waiting change if there is one.
export function editablePayments(data) {
  const p = (data && data.payments) || {};
  return clone(p.pending ? p.pending.methods || [] : p.methods || []);
}
// Same settings with payments as plain "what is wanted" (for comparing versions).
export function forCompare(data) {
  const c = clone(data || {});
  c.payments = { methods: editablePayments(data) };
  return c;
}
// Decide how new payment details (target) take effect against what is live.
// Returns { payments, kind } with kind NONE | KEEP | NOW | LATER | CANCELLED.
export function settlePayments(liveData, target, nowMs, actor) {
  const now = nowMs == null ? Date.now() : nowMs;
  const st = paymentState(liveData, now);
  const cur = st.current;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (same(target, cur)) return { payments: { methods: clone(cur), pending: null }, kind: st.pending ? "CANCELLED" : "NONE" };
  if (st.pending && same(target, st.pending.methods)) return { payments: { methods: clone(cur), pending: clone(st.pending) }, kind: "KEEP" };
  const shownNow = new Set(cur.filter((m) => m.shown).map(payKey));
  if (target.filter((m) => m.shown).every((m) => shownNow.has(payKey(m)))) return { payments: { methods: clone(target), pending: null }, kind: "NOW" };
  const activeFrom = new Date(now + PAY_DELAY_HOURS * 3600000).toISOString();
  return { payments: { methods: clone(cur), pending: { methods: clone(target), activeFrom, by: actor || null, at: new Date(now).toISOString() } }, kind: "LATER" };
}
// Account numbers partly hidden (for logs, emails and other admin roles).
export function maskAccount(n) { n = String(n || ""); return n.length > 4 ? "X".repeat(n.length - 4) + n.slice(-4) : n; }
export function maskPayments(data) {
  if (!data || !data.payments) return data;
  const c = clone(data);
  const m = (list) => (list || []).map((x) => x.kind === "BANK" ? Object.assign({}, x, { accountNumber: maskAccount(x.accountNumber) }) : x);
  c.payments.methods = m(c.payments.methods);
  if (c.payments.pending) c.payments.pending.methods = m(c.payments.pending.methods);
  return c;
}
// One line per method, for emails: "UPI iotc@hdfcbank" / "Bank account XXXX4321, HDFC Bank".
export function payLine(m) { return m.kind === "UPI" ? "UPI " + m.upiId : "Bank account " + maskAccount(m.accountNumber) + ", " + m.bankName + " (" + m.ifsc + ")"; }

// ---- Storage ----
export async function liveVersion(env) {
  try {
    const r = await env.DB.prepare("SELECT version, data, created_at, created_by FROM site_settings_versions ORDER BY version DESC LIMIT 1").first();
    if (r) return { version: r.version, data: withDefaults(JSON.parse(r.data)), publishedAt: r.created_at, publishedBy: r.created_by };
  } catch (e) { /* before part27 */ }
  return { version: 0, data: clone(DEFAULTS), publishedAt: null, publishedBy: null };
}
export async function draftRow(env) {
  try {
    const r = await env.DB.prepare("SELECT data, base_version, updated_at, updated_by FROM site_settings_draft WHERE id = 'draft'").first();
    if (r) return { data: withDefaults(JSON.parse(r.data)), baseVersion: r.base_version, updatedAt: r.updated_at, updatedBy: r.updated_by };
  } catch (e) { /* before part27 */ }
  return null;
}
export async function settingsReady(env) {
  try { await env.DB.prepare("SELECT 1 FROM site_settings_versions LIMIT 1").all(); return true; } catch (e) { return false; }
}

// ---- Prices ----
function offerPrice(price, offer) {
  if (price == null || !offer) return price;
  return offer.type === "PERCENT" ? Math.round(price * (100 - offer.value) / 100) : Math.max(0, price - offer.value);
}
export function withGst(price, rate) { return price == null ? null : Math.round(price * (100 + Number(rate || 0)) / 100); }

// The prices a buyer sees today for one plan.
export function planPrices(s, plan, today) {
  today = today || istToday();
  const nextLive = plan.next && plan.next.from && plan.next.from <= today;
  const base = {
    monthly: plan.billing === "MONTHLY" ? (nextLive && plan.next.monthly ? plan.next.monthly : plan.monthly) : null,
    yearlyOnly: plan.billing === "YEARLY" ? (nextLive && plan.next.yearly ? plan.next.yearly : plan.yearly) : null,
  };
  let yearly = null;
  if (plan.billing === "MONTHLY") {
    yearly = s.yearly.mode === "PERCENT" ? Math.round(base.monthly * 12 * (100 - s.yearly.percent) / 100) : base.monthly * s.yearly.months;
  } else if (plan.billing === "YEARLY") yearly = base.yearlyOnly;
  // Offers running today for this plan; never stacked: the bigger saving wins.
  const running = (s.offers || []).filter((o) => o.plans.includes(plan.id) && o.start <= today && today <= o.end);
  const pick = (price, canUse) => {
    if (price == null) return null;
    let best = null, bestPrice = price;
    for (const o of running) { if (!canUse(o)) continue; const p = offerPrice(price, o); if (p < bestPrice) { best = o; bestPrice = p; } }
    return best ? { offer: best, price: bestPrice } : null;
  };
  const mOffer = pick(base.monthly, () => true);
  const yOffer = pick(yearly, (o) => plan.billing === "YEARLY" || o.withYearly);
  const upcoming = plan.next && plan.next.from > today ? { from: plan.next.from, monthly: plan.next.monthly, yearly: plan.next.yearly, monthlyGst: withGst(plan.next.monthly, s.gst.rate), yearlyGst: withGst(plan.next.yearly, s.gst.rate) } : null;
  const offerOut = (x) => x ? { id: x.offer.id, nameEn: x.offer.nameEn, nameHi: x.offer.nameHi, type: x.offer.type, value: x.offer.value, end: x.offer.end, price: x.price, priceGst: withGst(x.price, s.gst.rate) } : null;
  return {
    monthly: base.monthly, monthlyGst: withGst(base.monthly, s.gst.rate),
    yearly, yearlyGst: withGst(yearly, s.gst.rate),
    monthlyOffer: offerOut(mOffer), yearlyOffer: offerOut(yOffer),
    extraSeat: plan.extraSeat, extraSeatGst: withGst(plan.extraSeat, s.gst.rate),
    upcoming,
  };
}

// What the public pages are given: only published, public fields, worked out for today.
export function publicView(s, meta, today) {
  today = today || istToday();
  const plans = s.plans.filter((p) => p.shown && !p.retired).map((p) => Object.assign({
    id: p.id, nameEn: p.nameEn, nameHi: p.nameHi, forEn: p.forEn, forHi: p.forHi, billing: p.billing,
    quoteEn: p.quoteEn, quoteHi: p.quoteHi, seats: p.seats, descEn: p.descEn, descHi: p.descHi, pilot: p.pilot,
  }, planPrices(s, p, today)));
  const c = s.company;
  const offers = (s.offers || []).filter((o) => o.start <= today && today <= o.end && o.plans.some((id) => plans.find((p) => p.id === id)))
    .map((o) => ({ id: o.id, nameEn: o.nameEn, nameHi: o.nameHi, type: o.type, value: o.value, start: o.start, end: o.end, withYearly: o.withYearly,
      plans: o.plans.filter((id) => plans.find((p) => p.id === id)) }));
  return {
    version: meta.version, updatedAt: meta.publishedAt, today,
    plans, offers,
    gst: { rate: s.gst.rate, gstin: s.gst.gstin || "" },
    yearly: s.yearly, pilot: s.pilot,
    company: { legalName: c.legalName, cin: c.cin, address: c.address, goName: c.goName, goEmail: c.goEmail, goPhone: c.goPhone,
      supportEmail: c.supportEmail, securityEmail: c.securityEmail, phone: c.phone, whatsapp: c.whatsapp,
      hoursEn: c.hoursEn, hoursHi: c.hoursHi, callbackEn: c.callbackEn, callbackHi: c.callbackHi },
    policies: s.policies,
    helpers: Object.assign({ open: !!(s.helpers && s.helpers.open) }, gstIncluded((s.helpers || DEFAULTS.helpers).price, s.gst.rate)),
    claims: { gem: !!s.claims.gem, india: !!s.claims.india, audited: !!s.claims.audited, auditedOn: s.claims.audited ? s.claims.auditedOn : "", auditedBy: s.claims.audited ? s.claims.auditedBy : "" },
  };
}

// The differences between two versions, for the audit log: [{ path, before, after }].
export function diffSettings(a, b, prefix, out) {
  out = out || [];
  prefix = prefix || "";
  if (a === b) return out;
  const isObj = (x) => x && typeof x === "object";
  if (Array.isArray(a) && Array.isArray(b) && a.every((x) => isObj(x) && x.id) && b.every((x) => isObj(x) && x.id)) {
    const ids = Array.from(new Set(a.map((x) => x.id).concat(b.map((x) => x.id))));
    for (const id of ids) diffSettings(a.find((x) => x.id === id), b.find((x) => x.id === id), prefix + "[" + id + "].", out);
    return out;
  }
  if (isObj(a) && isObj(b) && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of Array.from(new Set(Object.keys(a).concat(Object.keys(b))))) diffSettings(a[k], b[k], prefix + k + ".", out);
    return out;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path: prefix.replace(/\.$/, ""), before: a === undefined ? null : a, after: b === undefined ? null : b });
  return out;
}
