/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/gov-report-run.js   (grieviq-50)
//
// Report emails for officials who chose them (gov_report_prefs), sent by
// the hourly scheduler from 8 am India time:
//   MONTHLY  on the 1st: last month's MIS report is ready
//   WEEKLY   on Mondays: this week's cases pending over 30 days are ready
// Like every GrievIQ staff email they carry no figures and no case details,
// only that the report is ready and where to sign in, so nothing leaks if
// an email is forwarded. Each email is sent once (gov_report_sends).
import { usable } from "./gov-auth.js";
import { prevMonth } from "./gov-stats.js";

const SEND_FROM_HOUR = 8, MAX_PER_RUN = 200;
function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function monthLabel(mo, locale) { return new Date(mo + "-01T00:00:00+05:30").toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }); }

export function reportEmail(kind, period, scopeEn, scopeHi, origin) {
  const url = String(origin || "https://grieviq.in") + "/gov", host = url.replace(/^https?:\/\//, "");
  const foot = "<p>For security, GrievIQ emails never contain figures or complaint details, and GrievIQ never asks for your sign-in code.</p><hr>";
  const footHi = "<p>सुरक्षा के लिए GrievIQ के ईमेल में कभी आँकड़े या शिकायत का विवरण नहीं होता, और GrievIQ कभी आपका साइन-इन कोड नहीं माँगता।</p>" +
    '<hr><p style="color:#555;font-size:13px">GrievIQ · Government dashboard · सरकारी डैशबोर्ड</p>';
  if (kind === "MONTHLY") {
    const en = monthLabel(period, "en-IN"), hi = monthLabel(period, "hi-IN");
    return {
      subject: "GrievIQ: monthly report for " + en + " is ready · मासिक रिपोर्ट तैयार है",
      html: `<p>The GrievIQ MIS report for <b>${esc(en)}</b> (${esc(scopeEn)}) is ready.</p><p>Sign in at <a href="${esc(url)}">${esc(host)}</a> and choose <b>Reports</b> to see it or download it as PDF or Excel.</p>` + foot +
        `<p><b>${esc(hi)}</b> (${esc(scopeHi)}) की GrievIQ MIS रिपोर्ट तैयार है।</p><p><a href="${esc(url)}">${esc(host)}</a> पर साइन इन करें और इसे देखने या PDF या Excel में डाउनलोड करने के लिए <b>रिपोर्ट</b> चुनें।</p>` + footHi,
    };
  }
  return {
    subject: "GrievIQ: this week's list of cases pending over 30 days · 30 दिन से अधिक लंबित मामले",
    html: `<p>This week's report of cases pending over 30 days (${esc(scopeEn)}) is ready.</p><p>Sign in at <a href="${esc(url)}">${esc(host)}</a>, choose <b>Reports</b> and open <b>Cases pending over 30 days</b>.</p>` + foot +
      `<p>इस सप्ताह की 30 दिन से अधिक लंबित मामलों की रिपोर्ट (${esc(scopeHi)}) तैयार है।</p><p><a href="${esc(url)}">${esc(host)}</a> पर साइन इन करें, <b>रिपोर्ट</b> चुनें और <b>30 दिन से अधिक लंबित मामले</b> खोलें।</p>` + footHi,
  };
}

// Which emails are due now (India time). Returns [{ kind, period }].
export function dueKinds(nowMs) {
  const ist = new Date(nowMs + 5.5 * 3600000);
  if (ist.getUTCHours() < SEND_FROM_HOUR) return [];
  const day = ist.toISOString().slice(0, 10), out = [];
  if (ist.getUTCDate() === 1) out.push({ kind: "MONTHLY", period: prevMonth(day.slice(0, 7)) });
  if (ist.getUTCDay() === 1) out.push({ kind: "WEEKLY", period: day });
  return out;
}

export async function runGovReports(env, origin, nowMs, send) {
  const due = dueKinds(nowMs);
  if (!due.length) return { due: 0, sent: 0 };
  let rows;
  try {
    rows = (await env.DB.prepare(
      `SELECT u.*, p.monthly, p.weekly, s.name_en AS state_en, s.name_hi AS state_hi, d.name_en AS district_en, d.name_hi AS district_hi
         FROM gov_report_prefs p JOIN gov_users u ON u.id = p.user_id
         LEFT JOIN states s ON s.id = u.state_id LEFT JOIN districts d ON d.id = u.district_id
        WHERE u.status = 'ACTIVE' AND (p.monthly = 1 OR p.weekly = 1)`
    ).all()).results || [];
  } catch (e) { return { due: due.length, sent: 0, notReady: true }; }
  let sent = 0, failed = 0;
  for (const { kind, period } of due) {
    for (const u of rows) {
      if (sent + failed >= MAX_PER_RUN) break;
      if (!usable(u) || !(kind === "MONTHLY" ? u.monthly : u.weekly)) continue;
      // Claim the email first (primary key): a second run never sends it again.
      const claim = await env.DB.prepare("INSERT OR IGNORE INTO gov_report_sends (user_id, kind, period, sent_at, ok) VALUES (?, ?, ?, ?, 0)")
        .bind(u.id, kind, period, new Date(nowMs).toISOString()).run();
      if (!claim.meta || !claim.meta.changes) continue;
      const scopeEn = u.level === "DISTRICT" ? (u.district_en || "") + " district, " + (u.state_en || "") : u.state_en || "";
      const scopeHi = u.level === "DISTRICT" ? "ज़िला " + (u.district_hi || u.district_en || "") + ", " + (u.state_hi || u.state_en || "") : u.state_hi || u.state_en || "";
      const m = reportEmail(kind, period, scopeEn, scopeHi, origin);
      const ok = await send(env, u.email, m.subject, m.html);
      if (ok) { sent++; await env.DB.prepare("UPDATE gov_report_sends SET ok = 1 WHERE user_id = ? AND kind = ? AND period = ?").bind(u.id, kind, period).run(); }
      else failed++;
    }
  }
  return { due: due.length, sent, failed };
}
