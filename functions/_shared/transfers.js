/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// functions/_shared/transfers.js   (grieviq-54)
//
// Transfers of department officers and government officials, and the guard
// that stops an office or a dashboard being left with nobody by accident.
//
// Department officer transferred to another department office on GrievIQ:
//   the old record is closed (REMOVED, moved_to = new id, order_ref) and a
//   new one opened at the new office (moved_from = old id), keeping the
//   rules they accepted. Their sessions and phone alerts end; they sign in
//   again and land at the new office. A short email with no case details.
// Government official moved to another state, district or level (or a new
//   post email): the same, on the new letter (number and date). Their
//   report-email choices go with them.
// Guard: removing or transferring the last officer of an office that has
//   an agreement needs either the successor (added in the same step) or a
//   recorded choice to leave it with nobody for now. For government access,
//   the last official who can open a state's or district's dashboard needs
//   the same recorded choice.

export async function transfersReady(env) {
  try { await env.DB.prepare("SELECT moved_to FROM dept_officers LIMIT 1").first(); await env.DB.prepare("SELECT moved_to FROM gov_users LIMIT 1").first(); return true; }
  catch (e) { return false; }
}

const OPEN = ["OPEN", "ACKNOWLEDGED", "PENDING_CONFIRMATION"];
// Open complaints whose latest forwarding went to this department office.
export async function openCasesWithOffice(env, officeId) {
  try {
    const r = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM grievances g
       WHERE g.status IN (SELECT value FROM json_each(?))
         AND (SELECT s.office_id FROM case_dept_steps s WHERE s.grievance_id = g.id AND s.kind = 'FORWARDED' ORDER BY s.created_at DESC, s.rowid DESC LIMIT 1) = ?`
    ).bind(JSON.stringify(OPEN), String(officeId)).first();
    return r ? Number(r.n) : 0;
  } catch (e) { return 0; }
}

// Offices an officer can be transferred to: not retired, with an agreement in force.
export async function transferTargets(env, exceptOfficeId) {
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.name_en, d.name_hi, ar.name AS area_name FROM dept_offices d
     JOIN dept_agreements a ON a.office_id = d.id AND a.ended_at IS NULL
     LEFT JOIN areas ar ON ar.id = d.area_id
     WHERE d.retired_at IS NULL AND d.id <> ? ORDER BY d.name_en`
  ).bind(String(exceptOfficeId || "")).all();
  return (results || []).map((r) => ({ id: r.id, nameEn: r.name_en, nameHi: r.name_hi || null, area: r.area_name || null }));
}

// Department offices that have an agreement in force but no officer (all areas).
export async function officesWithNobody(env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT d.id FROM dept_offices d JOIN dept_agreements a ON a.office_id = d.id AND a.ended_at IS NULL
       WHERE d.retired_at IS NULL AND NOT EXISTS (SELECT 1 FROM dept_officers o WHERE o.office_id = d.id AND o.status = 'ACTIVE')`
    ).all();
    return new Set((results || []).map((r) => r.id));
  } catch (e) { return new Set(); }
}

// ---- government access: who can open which dashboard
// A district's figures can be opened by its district officials and by the
// state's officials; a state's by the state's officials; the national
// view by Union ministry officials.
export function covers(u, scope) {
  if (!u || u.status !== "ACTIVE") return false;
  if (scope.level === "NATIONAL") return u.level === "NATIONAL";
  if (scope.level === "STATE") return u.level === "STATE" && u.state_id === scope.stateId;
  if (scope.level === "DISTRICT") return (u.level === "DISTRICT" && u.district_id === scope.districtId) || (u.level === "STATE" && u.state_id === scope.stateId);
  return false;
}
export function scopeOf(u) { return { level: u.level, stateId: u.state_id || null, districtId: u.district_id || null }; }
// Is this official the only one who can open their own scope?
export function aloneIn(u, all) {
  if (!u || u.status !== "ACTIVE") return false;
  const s = scopeOf(u);
  return !all.some((x) => x.id !== u.id && covers(x, s));
}

// ---- content-free emails (both languages; no case or figure in them)
function escH(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
const FOOT = '<hr><p style="color:#555;font-size:13px">GrievIQ · Constituency Service &amp; Grievance Redressal Platform · क्षेत्र सेवा एवं शिकायत निवारण मंच</p>';
export function officerMovedEmail(name, fromOffice, toOffice, origin) {
  const url = String(origin || "https://grieviq.in") + "/dept", host = url.replace(/^https?:\/\//, "");
  const html = "<p>Dear " + escH(name) + ",</p><p>Your GrievIQ access has moved from <b>" + escH(fromOffice) + "</b> to <b>" + escH(toOffice) + "</b>, as recorded by GrievIQ's administrators.</p>" +
    `<p>Sign in again at <a href="${escH(url)}">${escH(host)}</a> with this email address to see the new office's complaints. Your previous office's records stay with that office.</p>` +
    "<p>For security, GrievIQ never puts complaint details in emails and never asks for your sign-in code.</p><hr>" +
    "<p>प्रिय " + escH(name) + ",</p><p>GrievIQ में आपकी पहुँच <b>" + escH(fromOffice) + "</b> से <b>" + escH(toOffice) + "</b> में स्थानांतरित कर दी गई है।</p>" +
    `<p>नए कार्यालय की शिकायतें देखने के लिए <a href="${escH(url)}">${escH(host)}</a> पर इसी ईमेल पते से फिर से साइन इन करें। पिछले कार्यालय के रिकॉर्ड उसी कार्यालय के पास रहेंगे।</p>` +
    "<p>सुरक्षा के लिए GrievIQ ईमेल में शिकायत का विवरण नहीं भेजता और कभी आपका साइन-इन कोड नहीं माँगता।</p>" + FOOT;
  return { subject: "Your GrievIQ access has moved · आपकी GrievIQ पहुँच स्थानांतरित हुई", html };
}
export function govMovedEmail(name, scopeEn, scopeHi, origin, path) {
  const url = String(origin || "https://grieviq.in") + (path || "/state"), host = url.replace(/^https?:\/\//, "");
  const html = "<p>Dear " + escH(name) + ",</p><p>Your access to GrievIQ's government dashboard has been changed, on your government's letter. You can now open: <b>" + escH(scopeEn) + "</b>.</p>" +
    `<p>Sign in again at <a href="${escH(url)}">${escH(host)}</a> with this email address.</p>` +
    "<p>For security, GrievIQ never puts figures or complaint details in emails and never asks for your sign-in code.</p><hr>" +
    "<p>प्रिय " + escH(name) + ",</p><p>आपकी सरकार के पत्र पर, GrievIQ के सरकारी डैशबोर्ड पर आपकी पहुँच बदल दी गई है। अब आप देख सकते हैं: <b>" + escH(scopeHi || scopeEn) + "</b>।</p>" +
    `<p><a href="${escH(url)}">${escH(host)}</a> पर इसी ईमेल पते से फिर से साइन इन करें।</p>` +
    "<p>सुरक्षा के लिए GrievIQ ईमेल में आँकड़े या शिकायत का विवरण नहीं भेजता और कभी आपका साइन-इन कोड नहीं माँगता।</p>" + FOOT;
  return { subject: "Your GrievIQ dashboard access has changed · आपकी डैशबोर्ड पहुँच बदली", html };
}
