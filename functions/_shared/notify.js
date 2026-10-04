// functions/_shared/notify.js
//
// Notifications for representatives' offices (approved Oct 2026).
//
// Three layers, as agreed:
//   1. In-app: every notice is a row in `notifications`, shown under the
//      bell in the rep console (and kept for a year).
//   2. Phone/computer: the notice is pushed to every device the person
//      turned notifications on for (web push, _shared/webpush.js; free).
//   3. Email, only as a backup: a person with no device that accepted the
//      push gets an email instead (email_outbox, retried up to 3 times).
//
// What a notice says (content-free, as for all staff emails): the
// reference, the ward, the type of problem and the dates. Never the
// complaint text, the place, photos or anything about the citizen.
//
// Nothing is ever sent twice: each notice has a dedupe_key (UNIQUE), and
// each case remembers the highest level it was announced to (notify_state).
//
// Who gets office notices: the office's representative and its office
// managers who cover that ward (team module). Field workers hear only
// about cases assigned to them.

import { resolveChain } from "./jurisdiction.js";
import { computeEscalation } from "./escalation.js";
import { toUtcMs } from "./time-limits.js";
import { coversWard, ROLE } from "./team.js";
import { sendPush, pushConfigured } from "./webpush.js";
import { recipientName, greetingHtml, SAFETY_LINE } from "./audit-office.js";
import { CATEGORY_HI } from "./category-names-hi.js";

export const KIND = {
  NEW_CASE: "NEW_CASE", MOVED_UP: "MOVED_UP", DAILY: "DAILY", ASSIGNED: "ASSIGNED", FIX_REPORT: "FIX_REPORT",
  OBSERVATION: "OBSERVATION", NUDGE: "NUDGE", ANNOUNCEMENT: "ANNOUNCEMENT", REPLY: "REPLY",
};
// Kinds that fall back to email when no device took the push. The others
// already have their own email (audit observations, admin nudges).
const EMAIL_BACKUP = new Set([KIND.NEW_CASE, KIND.MOVED_UP, KIND.DAILY, KIND.ASSIGNED, KIND.FIX_REPORT, KIND.ANNOUNCEMENT, KIND.REPLY]);

export const SUMMARY_HOUR_IST = 9;          // daily summary at 9:00 am India time
export const NEW_CASE_CATCHUP_HOURS = 6;    // a filing whose notice failed is caught up by the hourly job
export const EMAIL_TRIES = 3;
export const EMAIL_DAILY_WARN = 80;          // Resend free plan: 100 a day
export const KEEP_NOTICES_DAYS = 365;
export const KEEP_EMAILS_DAYS = 90;
const OPEN = ["OPEN", "ACKNOWLEDGED"];

// ---------------------------------------------------------------- helpers
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_HI = ["जन॰", "फ़र॰", "मार्च", "अप्रैल", "मई", "जून", "जुल॰", "अग॰", "सित॰", "अक्तू॰", "नव॰", "दिस॰"];
const pad = (n) => String(n).padStart(2, "0");
// "12 Oct, 5:30 pm" / "12 अक्तू॰, 17:30" in India time (Hindi uses the 24-hour clock).
export function istWhen(ms, lang) {
  if (ms == null || isNaN(ms)) return "";
  const d = new Date(ms + 5.5 * 3600000);
  const day = d.getUTCDate(), m = d.getUTCMonth(), h = d.getUTCHours(), mi = d.getUTCMinutes();
  if (lang === "hi") return day + " " + MON_HI[m] + ", " + pad(h) + ":" + pad(mi);
  return day + " " + MON_EN[m] + ", " + ((h % 12) || 12) + ":" + pad(mi) + " " + (h < 12 ? "am" : "pm");
}
export function istDate(ms) {
  const d = new Date(ms + 5.5 * 3600000);
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}
export function istHour(ms) { return new Date(ms + 5.5 * 3600000).getUTCHours(); }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
const low = (e) => String(e || "").trim().toLowerCase();
function catName(id, name, lang) { return lang === "hi" ? (CATEGORY_HI[id] || name || id || "") : (name || id || ""); }
function parseData(n) { if (!n || !n.data) return {}; if (typeof n.data === "object") return n.data; try { return JSON.parse(n.data) || {}; } catch (e) { return {}; } }

// The office id at each level of a case's chain (same order as chain.tiers).
export function chainOffices(chain) {
  return chain.tiers.map((t) => ({
    tier: t.tier,
    id: t.tier === "LOCAL" ? chain.localUnit.id : t.tier === "MAYOR" ? chain.municipalBody && chain.municipalBody.id : t.tier === "MLA" ? chain.mla.id : chain.mp.id,
    email: low(t.email) || null,
    label: t.label,
  }));
}

// When a level's time to act ends: from the clock start, one resolution
// limit per level above the starting one.
export function levelDueMs(g, category, chainTiers, index) {
  if (!category || !category.resolution_sla_hours) return null;
  const start = g.reopened_at && g.reopen_start_tier
    ? { ms: toUtcMs(g.reopened_at), index: Math.max(0, chainTiers.findIndex((t) => t.tier === g.reopen_start_tier)) }
    : { ms: toUtcMs(g.created_at), index: 0 };
  return start.ms + category.resolution_sla_hours * 3600000 * (index - start.index + 1);
}

// The office's representative plus its office managers covering this ward.
export async function officeRecipients(env, tier, officeId, wardId, repEmail) {
  const out = new Map();
  const rep = low(repEmail);
  if (rep) out.set(rep, ROLE.REP);
  if (!rep) return [];                       // no representative: the team is paused too
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM office_team WHERE office_tier = ? AND office_id = ? AND status = 'ACTIVE' AND role = ?"
    ).bind(tier, String(officeId), ROLE.OM).all();
    for (const t of results || []) {
      if (low(t.confirmed_by_rep_email) !== rep) continue;          // not confirmed by the current representative
      if (t.available != null && Number(t.available) === 0) continue;   // on leave
      if (wardId && !coversWard(t, String(wardId))) continue;
      out.set(low(t.member_email), ROLE.OM);
    }
  } catch (e) { /* team tables not there yet */ }
  return Array.from(out.keys());
}

// ----------------------------------------------------------- notice text
// Short text for a phone notification (and the email subject).
export function noticeText(n, lang) {
  const hi = lang === "hi";
  const d = parseData(n);
  const ward = n.ward_name || "";
  const type = catName(n.category_id, n.category_name, lang);
  const wt = [ward, type].filter(Boolean).join(" · ");
  const due = n.due_at ? istWhen(toUtcMs(n.due_at), lang) : "";
  const ack = d.ackDue ? istWhen(toUtcMs(d.ackDue), lang) : "";
  switch (n.kind) {
    case KIND.NEW_CASE:
      return { title: hi ? "नई शिकायत " + n.tracking_ref : "New complaint " + n.tracking_ref,
        body: wt + (hi ? "। " : ". ") + (ack ? (hi ? ack + " तक स्वीकार करें" : "Acknowledge by " + ack) : "") +
          (due ? (hi ? ", " + due + " तक कार्यवाही करें।" : ", act by " + due + ".") : (hi ? "। पहले अलग से समीक्षा होगी।" : ". Reviewed separately first.")) };
    case KIND.MOVED_UP:
      return { title: hi ? "शिकायत " + n.tracking_ref + " आपके कार्यालय में आई है" : "Complaint " + n.tracking_ref + " has come to your office",
        body: wt + (hi ? "। " : ". ") + (d.reason === "REOPENED" ? (hi ? "नागरिक ने इसे फिर से खोला है।" : "The citizen reopened it.") : (hi ? "पिछले स्तर की समय-सीमा बीत गई।" : "The time limit at the previous level passed.")) +
          (due ? (hi ? " " + due + " तक कार्यवाही करें।" : " Act by " + due + ".") : "") };
    case KIND.DAILY: {
      const parts = [];
      if (d.overdue) parts.push(hi ? d.overdue + " समय से पीछे" : d.overdue + " overdue");
      if (d.dueToday) parts.push(hi ? d.dueToday + " आज देय" : d.dueToday + " due today");
      if (d.waitingAck) parts.push(hi ? d.waitingAck + " स्वीकृति हेतु लंबित" : d.waitingAck + " waiting to be acknowledged");
      return { title: hi ? "आज का सारांश: " + d.total + " मामलों पर ध्यान दें" : "Today's summary: " + d.total + (d.total === 1 ? " case needs" : " cases need") + " attention",
        body: (d.officeName ? d.officeName + " · " : "") + parts.join(" · ") };
    }
    case KIND.ASSIGNED:
      return { title: hi ? "शिकायत " + n.tracking_ref + " आपको सौंपी गई" : "Complaint " + n.tracking_ref + " assigned to you",
        body: wt + (due ? (hi ? "। " + due + " तक कार्यवाही करें।" : ". Act by " + due + ".") : "") };
    case KIND.FIX_REPORT:
      return { title: hi ? "अनुमोदन हेतु समाधान रिपोर्ट: " + n.tracking_ref : "Fix report to approve: " + n.tracking_ref,
        body: wt + (hi ? "। टीम सदस्य ने इसे ठीक बताया है।" : ". A team member has reported it fixed.") };
    case KIND.OBSERVATION:
      return { title: hi ? "आपके कार्यालय के लिए लेखा-परीक्षा टिप्पणी" : "Audit observation for your office",
        body: hi ? "पढ़ने और उत्तर देने के लिए खोलें।" : "Open to read and respond." };
    case KIND.NUDGE:
      return { title: hi ? "GrievIQ से अनुस्मारक: " + n.tracking_ref : "Reminder from GrievIQ: " + n.tracking_ref,
        body: wt + (hi ? "। इस शिकायत पर कार्यवाही की आवश्यकता है।" : ". This complaint needs your attention.") };
    case KIND.ANNOUNCEMENT:
      return { title: hi ? "GrievIQ से संदेश" : "Message from GrievIQ", body: d.title || "" };
    case KIND.REPLY:
      return { title: hi ? "GrievIQ ने उत्तर दिया" : "GrievIQ replied", body: d.title || "" };
    default:
      return { title: "GrievIQ", body: "" };
  }
}

// Where a notice opens in the rep console.
export function noticeUrl(n) {
  const d = parseData(n);
  if (n.kind === KIND.ANNOUNCEMENT || n.kind === KIND.REPLY) return "/rep#msg=" + encodeURIComponent(d.aid || "") + "&n=" + encodeURIComponent(n.id);
  if (n.kind === KIND.OBSERVATION) return "/rep#audit=" + encodeURIComponent(d.obsId || "") + "&n=" + encodeURIComponent(n.id);
  if (n.kind === KIND.DAILY) return "/rep#n=" + encodeURIComponent(n.id);
  return "/rep#case=" + encodeURIComponent(n.grievance_id || "") + "&n=" + encodeURIComponent(n.id);
}

// Backup email: both languages, greeting by name, content-free.
async function staffEmail(env, origin, n) {
  const en = noticeText(n, "en"), hi = noticeText(n, "hi");
  const url = origin + noticeUrl(n);
  const who = await recipientName(env, n.recipient);
  const html = greetingHtml(who) +
    "<p><strong>" + esc(en.title) + "</strong></p><p>" + esc(en.body) + "</p>" +
    `<p>Open GrievIQ: <a href="${esc(url)}">${esc(origin + "/rep")}</a></p>` +
    "<p>Tip: turn on notifications in GrievIQ (the bell at the top) to get these alerts on your phone instead of by email.</p>" +
    "<p>For security, the details are shown only after you sign in. " + SAFETY_LINE + "</p>" +
    "<hr><p><strong>" + esc(hi.title) + "</strong></p><p>" + esc(hi.body) + "</p>" +
    `<p>GrievIQ खोलें: <a href="${esc(url)}">${esc(origin + "/rep")}</a></p>` +
    "<p>सुझाव: ये सूचनाएँ ईमेल के बजाय फ़ोन पर पाने के लिए GrievIQ में सूचनाएँ चालू करें (ऊपर घंटी)।</p>" +
    "<p>सुरक्षा के लिए विवरण साइन इन करने के बाद ही दिखते हैं। GrievIQ कभी भी ईमेल या फ़ोन पर आपका साइन-इन कोड नहीं माँगता।</p>";
  return { subject: "GrievIQ: " + en.title, html };
}

// ------------------------------------------------------------- creating
// Inserts notices (one per recipient), skipping any already sent, then
// delivers the new ones. base: { kind, key, officeTier, officeId, g, category,
// wardName, dueMs, data }. Returns the number of new notices.
export async function createNotices(env, origin, recipients, base) {
  const now = new Date().toISOString();
  const g = base.g || {};
  const fresh = [];
  for (const r of Array.from(new Set((recipients || []).map(low).filter(Boolean)))) {
    const row = {
      id: crypto.randomUUID(), recipient: r, kind: base.kind, dedupe_key: base.key + "|" + r,
      office_tier: base.officeTier || null, office_id: base.officeId != null ? String(base.officeId) : null,
      grievance_id: g.id || null, tracking_ref: g.tracking_ref || null,
      ward_name: base.wardName || null, category_id: (base.category && base.category.id) || g.category_id || null,
      category_name: (base.category && base.category.name) || null,
      due_at: base.dueMs ? new Date(base.dueMs).toISOString() : null,
      data: base.data ? JSON.stringify(base.data) : null, created_at: now,
    };
    try {
      const res = await env.DB.prepare(
        `INSERT OR IGNORE INTO notifications (id, recipient, kind, dedupe_key, office_tier, office_id, grievance_id, tracking_ref, ward_name, category_id, category_name, due_at, data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(row.id, row.recipient, row.kind, row.dedupe_key, row.office_tier, row.office_id, row.grievance_id, row.tracking_ref,
        row.ward_name, row.category_id, row.category_name, row.due_at, row.data, row.created_at).run();
      if (res && res.meta && res.meta.changes > 0) fresh.push(row);
    } catch (e) { /* notifications table not there yet */ }
  }
  if (fresh.length) await deliver(env, origin, fresh);
  return fresh.length;
}

// Push to each person's devices; email those no device took.
export async function deliver(env, origin, rows) {
  const people = Array.from(new Set(rows.map((r) => r.recipient)));
  let subs = [];
  if (pushConfigured(env) && people.length) {
    try {
      subs = (await env.DB.prepare("SELECT * FROM push_subscriptions WHERE email IN (SELECT value FROM json_each(?))").bind(JSON.stringify(people)).all()).results || [];
    } catch (e) { subs = []; }
  }
  const now = new Date().toISOString();
  for (const n of rows) {
    let pushed = false;
    for (const s of subs.filter((x) => low(x.email) === n.recipient)) {
      const t = noticeText(n, s.lang === "hi" ? "hi" : "en");
      const r = await sendPush(env, s, { title: t.title, body: t.body, url: noticeUrl(n), tag: n.kind === KIND.DAILY ? "daily" : (n.tracking_ref || n.kind), id: n.id },
        { urgency: n.kind === KIND.DAILY ? "normal" : "high" });
      try {
        if (r.ok) { pushed = true; await env.DB.prepare("UPDATE push_subscriptions SET last_ok_at = ?, fail_count = 0, last_error = NULL WHERE id = ?").bind(now, s.id).run(); }
        else if (r.gone) await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(s.id).run();
        else await env.DB.prepare("UPDATE push_subscriptions SET fail_count = fail_count + 1, last_error = ? WHERE id = ?").bind(String(r.status || r.error || "error"), s.id).run();
      } catch (e) { /* ignore */ }
    }
    try {
      if (pushed) await env.DB.prepare("UPDATE notifications SET pushed_at = ? WHERE id = ?").bind(now, n.id).run();
      else if (EMAIL_BACKUP.has(n.kind)) {
        const m = await staffEmail(env, origin, n);
        await queueEmail(env, n.recipient, "STAFF_" + n.kind, "EM:" + n.dedupe_key, m.subject, m.html, n.id);
      }
    } catch (e) { /* ignore */ }
  }
  await flushOutbox(env, 10);
}

// ---------------------------------------------------------------- email
export async function queueEmail(env, to, kind, key, subject, html, noticeId) {
  try {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO email_outbox (id, to_email, kind, dedupe_key, subject, html, status, attempts, created_at) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, ?)"
    ).bind(noticeId || crypto.randomUUID(), low(to), kind, key, subject, html, new Date().toISOString()).run();
  } catch (e) { /* outbox not there yet */ }
}

// Sends waiting emails (oldest first). Each gets EMAIL_TRIES attempts over
// successive runs; a failure is recorded with the reason.
export async function flushOutbox(env, limit) {
  if (!env.RESEND_API_KEY) return 0;
  let rows = [];
  try {
    rows = (await env.DB.prepare("SELECT * FROM email_outbox WHERE status = 'PENDING' ORDER BY created_at LIMIT ?").bind(limit || 20).all()).results || [];
  } catch (e) { return 0; }
  let sent = 0;
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    if (i > 0) await new Promise((r) => setTimeout(r, 550));      // Resend allows 2 a second
    let ok = false, err = null;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.OTP_FROM_EMAIL || "onboarding@resend.dev", to: [e.to_email], subject: e.subject, html: e.html }),
      });
      ok = res.ok;
      if (!ok) err = String(res.status) + " " + (await res.text()).slice(0, 160);
    } catch (x) { err = String((x && x.message) || x).slice(0, 160); }
    const now = new Date().toISOString();
    try {
      if (ok) {
        sent++;
        await env.DB.prepare("UPDATE email_outbox SET status = 'SENT', sent_at = ?, attempts = attempts + 1, last_error = NULL WHERE id = ?").bind(now, e.id).run();
        await env.DB.prepare("UPDATE notifications SET emailed_at = ? WHERE id = ?").bind(now, e.id).run();
      } else {
        await env.DB.prepare("UPDATE email_outbox SET attempts = attempts + 1, last_error = ?, status = CASE WHEN attempts + 1 >= ? THEN 'FAILED' ELSE 'PENDING' END WHERE id = ?")
          .bind(err, EMAIL_TRIES, e.id).run();
      }
    } catch (x) { /* ignore */ }
  }
  return sent;
}

// ----------------------------------------------------- citizen emails
function citizenEmail(kind, g, info, origin) {
  const hi = g.lang === "hi";
  const url = origin + "/status?ref=" + encodeURIComponent(g.tracking_ref);
  const type = catName(info.category.id, info.category.name, g.lang);
  const due = info.dueMs ? istWhen(info.dueMs, g.lang) : null;
  if (kind === "RECEIVED") {
    const ack = info.ackMs ? istWhen(info.ackMs, g.lang) : null;
    return hi ? {
      subject: `आपकी शिकायत दर्ज हो गई है — संदर्भ संख्या ${g.tracking_ref}`,
      html: `<p>आपकी शिकायत GrievIQ पर दर्ज हो गई है।</p>
        <p><strong>संदर्भ संख्या:</strong> ${esc(g.tracking_ref)}<br><strong>स्थान:</strong> ${esc(info.wardName)}<br><strong>समस्या का प्रकार:</strong> ${esc(type)}</p>
        <p>यह आपके ${esc(info.levelHi)} को भेज दी गई है।${ack ? ` उन्हें ${esc(ack)} तक इसे स्वीकार करना है` : ""}${due ? ` और ${esc(due)} तक कार्यवाही करनी है। समय पर कार्यवाही न होने पर यह अपने-आप अगले स्तर पर चली जाएगी।` : "। इस प्रकार की समस्या की पहले अलग से समीक्षा होती है।"}</p>
        <p>स्थिति देखें: <a href="${esc(url)}">${esc(url)}</a></p>
        <p>यह संदर्भ संख्या सँभालकर रखें। GrievIQ कभी भी आपसे पैसे या OTP नहीं माँगता।</p>`,
    } : {
      subject: `Your complaint has been filed — reference ${g.tracking_ref}`,
      html: `<p>Your complaint has been filed on GrievIQ.</p>
        <p><strong>Reference:</strong> ${esc(g.tracking_ref)}<br><strong>Place:</strong> ${esc(info.wardName)}<br><strong>Type of problem:</strong> ${esc(type)}</p>
        <p>It has been sent to your ${esc(info.levelEn)}.${ack ? ` They must acknowledge it by ${esc(ack)}` : ""}${due ? ` and act on it by ${esc(due)}. If they don't act in time, it moves up to the next level automatically.` : ". This type of problem is reviewed separately first."}</p>
        <p>Track it: <a href="${esc(url)}">${esc(url)}</a></p>
        <p>Keep this reference safe. GrievIQ never asks you for money or for a code.</p>`,
    };
  }
  // MOVED_UP
  return hi ? {
    subject: `आपकी शिकायत ${g.tracking_ref} आगे बढ़ा दी गई है`,
    html: `<p>आपकी शिकायत <strong>${esc(g.tracking_ref)}</strong> (${esc(info.wardName)} · ${esc(type)}) ${info.reason === "REOPENED" ? "फिर से खोले जाने के बाद" : "पिछले स्तर पर समय-सीमा बीत जाने के कारण"} अब <strong>आपके ${esc(info.levelHi)}</strong> को भेज दी गई है।</p>
      ${due ? `<p>उन्हें ${esc(due)} तक कार्यवाही करनी है। पिछला स्तर भी इसे देख सकता है।</p>` : ""}
      <p>स्थिति देखें: <a href="${esc(url)}">${esc(url)}</a></p>`,
  } : {
    subject: `Your complaint ${g.tracking_ref} has moved up`,
    html: `<p>Your complaint <strong>${esc(g.tracking_ref)}</strong> (${esc(info.wardName)} · ${esc(type)}) has now gone to <strong>your ${esc(info.levelEn)}</strong>${info.reason === "REOPENED" ? ", because it was reopened" : ", because the time limit at the previous level passed"}.</p>
      ${due ? `<p>They must act on it by ${esc(due)}. The level below can still see it.</p>` : ""}
      <p>Track it: <a href="${esc(url)}">${esc(url)}</a></p>`,
  };
}
const LEVEL_EN = { Corporator: "corporator", "Gram Pradhan": "gram pradhan", Mayor: "mayor's office", MLA: "MLA's office", MP: "MP's office" };
const LEVEL_HI = { Corporator: "पार्षद", "Gram Pradhan": "ग्राम प्रधान", Mayor: "महापौर कार्यालय", MLA: "विधायक कार्यालय", MP: "सांसद कार्यालय" };

async function emailCitizen(env, origin, kind, g, info) {
  const to = low(g.citizen_email);
  if (!to || !to.includes("@")) return;
  const m = citizenEmail(kind, g, Object.assign({ levelEn: LEVEL_EN[info.label] || info.label, levelHi: LEVEL_HI[info.label] || info.label }, info), origin);
  await queueEmail(env, to, "CITIZEN_" + kind, "CIT:" + kind + ":" + g.id + ":" + (info.indexKey || "0"), m.subject, m.html, null);
}

async function setState(env, gid, index, marker) {
  try {
    await env.DB.prepare(
      `INSERT INTO notify_state (grievance_id, notified_index, reopen_marker, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(grievance_id) DO UPDATE SET notified_index = excluded.notified_index, reopen_marker = excluded.reopen_marker, updated_at = excluded.updated_at`
    ).bind(gid, index, marker || "", new Date().toISOString()).run();
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------- the events
// A complaint was filed: tell the ward's office, and the citizen (if they
// gave an email). Never throws.
export async function notifyNewCase(env, origin, g, preload) {
  try {
    const chain = (preload && preload.chain) || await resolveChain(env, g.local_unit_id);
    const category = (preload && preload.category) || await env.DB.prepare("SELECT * FROM grievance_categories WHERE id = ?").bind(g.category_id).first();
    if (!chain || !category) return;
    const offices = chainOffices(chain);
    const first = offices[0];
    const created = toUtcMs(g.created_at) || Date.now();
    const ackMs = category.ack_sla_hours ? created + category.ack_sla_hours * 3600000 : null;
    const dueMs = levelDueMs(g, category, chain.tiers, 0);
    const people = await officeRecipients(env, first.tier, first.id, chain.localUnit.id, first.email);
    await createNotices(env, origin, people, {
      kind: KIND.NEW_CASE, key: "NEW:" + g.id, officeTier: first.tier, officeId: first.id, g, category,
      wardName: chain.localUnit.name, dueMs, data: ackMs ? { ackDue: new Date(ackMs).toISOString() } : null,
    });
    await emailCitizen(env, origin, "RECEIVED", g, { category, wardName: chain.localUnit.name, label: first.label, ackMs, dueMs });
    await setState(env, g.id, 0, "");
    await flushOutbox(env, 5);
  } catch (e) { /* the hourly job catches up */ }
}

// A case reached a new level (time ran out, or it was reopened).
export async function notifyMovedUp(env, origin, g, chain, category, index, reason) {
  const offices = chainOffices(chain);
  const o = offices[index];
  if (!o) return;
  const dueMs = levelDueMs(g, category, chain.tiers, index);
  const people = await officeRecipients(env, o.tier, o.id, chain.localUnit.id, o.email);
  const marker = g.reopened_at || "";
  await createNotices(env, origin, people, {
    kind: KIND.MOVED_UP, key: "UP:" + g.id + ":" + index + ":" + marker, officeTier: o.tier, officeId: o.id, g, category,
    wardName: chain.localUnit.name, dueMs, data: { reason, level: o.tier },
  });
  await emailCitizen(env, origin, "MOVED_UP", g, { category, wardName: chain.localUnit.name, label: o.label, dueMs, reason, indexKey: index + ":" + marker });
}

// A case was assigned to a field worker.
export async function notifyAssigned(env, origin, g, assignee, office) {
  try {
    const chain = await resolveChain(env, g.local_unit_id);
    const category = await env.DB.prepare("SELECT * FROM grievance_categories WHERE id = ?").bind(g.category_id).first();
    let dueMs = null;
    if (chain && category) {
      const r = computeEscalation(g, category, chain.tiers);
      dueMs = levelDueMs(g, category, chain.tiers, r.currentTierIndex);
    }
    await createNotices(env, origin, [assignee], {
      kind: KIND.ASSIGNED, key: "ASG:" + g.id + ":" + low(assignee) + ":" + Date.now(), officeTier: office.tier, officeId: office.id, g, category,
      wardName: chain ? chain.localUnit.name : null, dueMs,
    });
  } catch (e) { /* never blocks the assignment */ }
}

// A field worker sent a fix report: tell those who approve it.
export async function notifyFixReport(env, origin, g, office, reportId, submitter) {
  try {
    const chain = await resolveChain(env, g.local_unit_id);
    const category = await env.DB.prepare("SELECT * FROM grievance_categories WHERE id = ?").bind(g.category_id).first();
    const o = chain ? chainOffices(chain).find((x) => x.tier === office.tier) : null;
    const people = (await officeRecipients(env, office.tier, office.id, g.local_unit_id, o ? o.email : office.officeRepEmail)).filter((e) => e !== low(submitter));
    await createNotices(env, origin, people, {
      kind: KIND.FIX_REPORT, key: "FIX:" + reportId, officeTier: office.tier, officeId: office.id, g, category,
      wardName: chain ? chain.localUnit.name : null,
    });
  } catch (e) { /* never blocks the report */ }
}

// An admin nudge (the email is sent by the exceptions page itself).
export async function notifyNudge(env, origin, g, chain, category, upToIndex) {
  try {
    const offices = chainOffices(chain).slice(0, upToIndex + 1);
    const stamp = Date.now();
    for (const o of offices) {
      const people = await officeRecipients(env, o.tier, o.id, chain.localUnit.id, o.email);
      await createNotices(env, origin, people, { kind: KIND.NUDGE, key: "NUDGE:" + g.id + ":" + stamp + ":" + o.tier, officeTier: o.tier, officeId: o.id, g, category, wardName: chain.localUnit.name });
    }
  } catch (e) { /* never blocks the nudge */ }
}

// An audit observation for an office (its email is sent by the audit module).
export async function notifyObservation(env, origin, emails, obsId, office, what) {
  try {
    await createNotices(env, origin, emails, { kind: KIND.OBSERVATION, key: "OBS:" + obsId + ":" + (what || "") + ":" + Date.now(), officeTier: office && office.tier, officeId: office && office.id, data: { obsId } });
  } catch (e) { /* ignore */ }
}

// ------------------------------------------------------ the hourly job
// Loads every open case with its chain and category in a few queries.
async function openCasesWithChains(env) {
  const [cases, cats, units, mlas, mps, mbs] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM grievances WHERE status IN ('OPEN','ACKNOWLEDGED')`),
    env.DB.prepare("SELECT * FROM grievance_categories"),
    env.DB.prepare("SELECT * FROM local_units WHERE id IN (SELECT local_unit_id FROM grievances WHERE status IN ('OPEN','ACKNOWLEDGED'))"),
    env.DB.prepare("SELECT * FROM mla_constituencies"),
    env.DB.prepare("SELECT * FROM mp_constituencies"),
    env.DB.prepare("SELECT * FROM municipal_bodies"),
  ]);
  const by = (rows) => new Map((rows.results || []).map((r) => [String(r.id), r]));
  const cat = by(cats), unit = by(units), mla = by(mlas), mp = by(mps), mb = by(mbs);
  const out = [];
  for (const g of cases.results || []) {
    const lu = unit.get(String(g.local_unit_id));
    const c = cat.get(String(g.category_id));
    const m = lu && mla.get(String(lu.mla_constituency_id));
    const p = m && mp.get(String(m.mp_constituency_id));
    if (!lu || !c || !m || !p) continue;
    const body = lu.municipal_body_id ? mb.get(String(lu.municipal_body_id)) : null;
    const tiers = [{ tier: "LOCAL", label: lu.unit_type === "URBAN" ? "Corporator" : "Gram Pradhan", email: lu.rep_email }];
    if (body && body.has_mayor) tiers.push({ tier: "MAYOR", label: "Mayor", email: body.mayor_email });
    tiers.push({ tier: "MLA", label: "MLA", email: m.mla_email });
    tiers.push({ tier: "MP", label: "MP", email: p.mp_email });
    out.push({ g, category: c, chain: { localUnit: lu, municipalBody: body, mla: m, mp: p, tiers } });
  }
  return out;
}

// Runs every hour (Cloudflare Worker, cron "30 * * * *" = on the hour in
// India). Returns what it did. Never throws.
export async function runNotifications(env, origin, nowMs) {
  const now = nowMs || Date.now();
  const done = { newCases: 0, movedUp: 0, baseline: 0, summaries: 0, emails: 0, cleaned: 0, errors: 0 };
  let list = [];
  try { list = await openCasesWithChains(env); } catch (e) { done.errors++; return done; }
  let states = new Map();
  try {
    const { results } = await env.DB.prepare("SELECT * FROM notify_state WHERE grievance_id IN (SELECT id FROM grievances WHERE status IN ('OPEN','ACKNOWLEDGED'))").all();
    states = new Map((results || []).map((s) => [s.grievance_id, s]));
  } catch (e) { done.errors++; return done; }

  for (const { g, category, chain } of list) {
    try {
      const r = computeEscalation(g, category, chain.tiers);
      const idx = r.currentTierIndex;
      const marker = g.reopened_at || "";
      const st = states.get(g.id);
      if (!st) {
        const ageH = (now - toUtcMs(g.created_at)) / 3600000;
        if (!marker && idx === 0 && ageH <= NEW_CASE_CATCHUP_HOURS) { await notifyNewCase(env, origin, g, { chain, category }); done.newCases++; }
        else { await setState(env, g.id, idx, marker); done.baseline++; }      // older cases: start from where they are, silently
        continue;
      }
      if (marker && marker !== (st.reopen_marker || "")) {
        await notifyMovedUp(env, origin, g, chain, category, idx, "REOPENED");
        await setState(env, g.id, idx, marker); done.movedUp++;
      } else if (idx > st.notified_index) {
        await notifyMovedUp(env, origin, g, chain, category, idx, "TIME");
        await setState(env, g.id, idx, marker); done.movedUp++;
      }
    } catch (e) { done.errors++; }
  }

  if (istHour(now) === SUMMARY_HOUR_IST) {
    try { done.summaries = await dailySummaries(env, origin, list, now); } catch (e) { done.errors++; }
  }
  try { done.emails = await flushOutbox(env, 40); } catch (e) { done.errors++; }
  try {
    const a = await env.DB.prepare(`DELETE FROM notifications WHERE created_at < ?`).bind(new Date(now - KEEP_NOTICES_DAYS * 86400000).toISOString()).run();
    const b = await env.DB.prepare(`DELETE FROM email_outbox WHERE status <> 'PENDING' AND created_at < ?`).bind(new Date(now - KEEP_EMAILS_DAYS * 86400000).toISOString()).run();
    done.cleaned = ((a.meta && a.meta.changes) || 0) + ((b.meta && b.meta.changes) || 0);
  } catch (e) { /* ignore */ }
  return done;
}

// 9:00 am: one summary per office with something to act on.
export async function dailySummaries(env, origin, list, nowMs) {
  const day = istDate(nowMs);
  const offices = new Map();
  for (const { g, category, chain } of list) {
    const r = computeEscalation(g, category, chain.tiers);
    const o = chainOffices(chain)[r.currentTierIndex];
    if (!o || !o.email) continue;
    const key = o.tier + ":" + o.id;
    if (!offices.has(key)) offices.set(key, { o, name: o.tier === "LOCAL" ? chain.localUnit.name : o.tier === "MAYOR" ? chain.municipalBody.name : o.tier === "MLA" ? chain.mla.name : chain.mp.name, overdue: 0, dueToday: 0, waitingAck: 0, ids: new Set() });
    const s = offices.get(key);
    const due = levelDueMs(g, category, chain.tiers, r.currentTierIndex);
    let counted = false;
    if (due != null && due < nowMs) { s.overdue++; counted = true; }
    else if (due != null && due - nowMs <= 24 * 3600000) { s.dueToday++; counted = true; }
    if (!g.acknowledged_at) { s.waitingAck++; if (r.ackOverdue && !counted) { s.overdue++; } counted = true; }
    if (counted) s.ids.add(g.id);
  }
  let n = 0;
  for (const s of offices.values()) {
    if (!s.ids.size) continue;
    const people = await officeRecipients(env, s.o.tier, s.o.id, null, s.o.email);
    n += await createNotices(env, origin, people, {
      kind: KIND.DAILY, key: "DAY:" + day + ":" + s.o.tier + ":" + s.o.id, officeTier: s.o.tier, officeId: s.o.id,
      data: { total: s.ids.size, overdue: s.overdue, dueToday: s.dueToday, waitingAck: s.waitingAck, officeName: s.name, day },
    });
  }
  return n;
}

// Figures for the admin dashboard card.
export async function deliveryHealth(env) {
  const out = { emailsToday: 0, failed7d: 0, pending: 0, devices: 0, people: 0, limitWarn: EMAIL_DAILY_WARN, configured: pushConfigured(env), recentFailures: [] };
  try {
    const dayStart = new Date(Date.UTC(...(() => { const d = new Date(Date.now() + 5.5 * 3600000); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; })()) - 5.5 * 3600000).toISOString();
    const [a, b, c, d, f] = await env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE status = 'SENT' AND sent_at >= ?").bind(dayStart),
      env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE status = 'FAILED' AND created_at >= ?").bind(new Date(Date.now() - 7 * 86400000).toISOString()),
      env.DB.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE status = 'PENDING'"),
      env.DB.prepare("SELECT COUNT(*) AS n, COUNT(DISTINCT email) AS p FROM push_subscriptions"),
      env.DB.prepare("SELECT kind, to_email, last_error, created_at FROM email_outbox WHERE status = 'FAILED' ORDER BY created_at DESC LIMIT 5"),
    ]);
    out.emailsToday = (a.results[0] || {}).n || 0;
    out.failed7d = (b.results[0] || {}).n || 0;
    out.pending = (c.results[0] || {}).n || 0;
    out.devices = (d.results[0] || {}).n || 0;
    out.people = (d.results[0] || {}).p || 0;
    out.recentFailures = (f.results || []).map((r) => ({ kind: r.kind, to: maskEmail(r.to_email), error: String(r.last_error || "").slice(0, 80), at: r.created_at }));
  } catch (e) { out.missing = true; }
  return out;
}
function maskEmail(e) { const s = String(e || ""); const i = s.indexOf("@"); return i > 1 ? s[0] + "***" + s.slice(i) : "***"; }
