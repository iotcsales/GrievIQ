/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// Admin "Misuse" (grieviq-82): complaints reported by offices and departments
// (or flagged by the text check), appeals against "not genuine" closures,
// restrictions on filing (a second person approves), the monthly figures for
// the auditor, and the "SMS code before filing" switch.
(function () {
  "use strict";
  function T(k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function loc() { return window.GIQ && GIQ.locale ? GIQ.locale() : "en-IN"; }
  function day(s) { if (!s) return ""; var d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString(loc(), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); }
  var TABS = ["reports", "appeals", "restrictions", "month", "sms"];
  var S = { data: null, err: null, tab: "reports", f: {}, prefillRef: "" };
  try { var t0 = localStorage.getItem("giq-mu-tab"); if (TABS.indexOf(t0) >= 0) S.tab = t0; } catch (e) {}

  function msg(text, bad) { var m = $("mu-msg"); m.innerHTML = text ? '<p class="st-msg ' + (bad ? "error" : "success") + '">' + esc(text) + "</p>" : ""; if (text) m.focus(); }
  function api(body) {
    return fetch("/api/admin/misuse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); });
  }
  function errText(j) {
    var k = { SAME_PERSON: "adm.mu_e_same", NOT_CONFIGURED: "adm.mu_e_not_configured", NOT_TESTED: "adm.mu_e_not_tested", SEND_FAILED: "adm.mu_e_send_failed",
      ALREADY: "adm.mu_e_already", NOT_CLOSED: "adm.mu_e_not_closed", NO_VALUE: "adm.mu_e_no_value", NOT_FOUND: "adm.mu_e_not_found",
      NOTHING_OPEN: "adm.mu_e_changed", CHANGED: "adm.mu_e_changed", NOT_OPEN: "adm.mu_e_changed", NO_APPEAL: "adm.mu_e_changed", NOT_PENDING: "adm.mu_e_changed", NOT_ACTIVE: "adm.mu_e_changed" }[j.code];
    if (j.error === "INSUFFICIENT_ROLE" || j.error === "NOT_ADMIN") k = "adm.no_access";
    return T(k || "adm.ss_e_generic");
  }
  function load() {
    return fetch("/api/admin/misuse", { cache: "no-store" }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); }).then(function (x) {
      if (x.r.status === 503 && x.j.ready === false) { S.err = "adm.mu_not_ready"; render(); return; }
      if (!x.r.ok) { S.err = x.j.error === "INSUFFICIENT_ROLE" || x.j.error === "NOT_ADMIN" ? "adm.no_access" : "adm.ss_e_load"; render(); return; }
      S.data = x.j; S.err = null; render();
    }).catch(function () { S.err = "adm.ss_e_load"; render(); });
  }
  function badge(text, warn) { return '<span class="sa-badge' + (warn ? " sa-late" : "") + '">' + esc(text) + "</span>"; }
  function card(k, v) { return '<div class="ac-card"><div class="l">' + esc(T(k)) + '</div><div class="v">' + esc(v) + "</div></div>"; }
  function who(o, byKind) {
    if (byKind === "AUTO") return T("adm.mu_by_auto");
    if (!o) return "";
    return T(o.kind === "DEPT" ? "adm.mu_by_dept" : "adm.mu_by_office", { name: o.name, level: o.kind === "LOCAL" ? T("adm.mu_lvl_local") : o.kind });
  }
  function fe(form, k) { var f = S.f[form] || {}; return f[k] ? '<span class="ferr" id="' + form + "-" + k + '-e">' + esc(f[k]) + "</span>" : ""; }
  function inv(form, k) { var f = S.f[form] || {}; return f[k] ? ' aria-invalid="true" aria-describedby="' + form + "-" + k + '-e"' : ""; }
  function radios(form, name, opts, legend) {
    var f = S.f[form] || {};
    return '<fieldset class="rad"' + (f[name] ? ' aria-describedby="' + form + "-" + name + '-e"' : "") + "><legend>" + esc(legend) + "</legend>" + opts.map(function (o, i) {
      var id = form + "-" + name + "-" + o[0];
      return '<span class="ropt"><input type="radio" name="' + form + "-" + name + '" id="' + id + '" value="' + esc(o[0]) + '"' + (f["v_" + name] === o[0] ? " checked" : "") + '><label for="' + id + '">' + esc(o[1]) + "</label></span>";
    }).join("") + fe(form, name) + "</fieldset>";
  }
  function noteFld(form, label, hint) {
    var f = S.f[form] || {};
    return '<div class="fld"><label for="' + form + '-note">' + esc(label) + '</label><span class="hint" id="' + form + '-note-h">' + esc(hint) + '</span><textarea id="' + form + '-note" maxlength="500"' +
      (f.note ? ' aria-invalid="true" aria-describedby="' + form + "-note-h " + form + '-note-e"' : ' aria-describedby="' + form + '-note-h"') + ">" + esc(f.v_note || "") + "</textarea>" + fe(form, "note") + "</div>";
  }

  function caseHead(c) {
    var flags = (c.textFlags || []).map(function (k) { return badge(T("adm.mu_flag_" + k), true); }).join(" ");
    var cv = badge(T(c.contactVerified === "PHONE" ? "rep.cv_phone" : c.contactVerified === "EMAIL" ? "rep.cv_email" : "rep.cv_none"));
    return '<h2>' + esc(c.trackingRef) + ' <span class="sa-ref">' + esc(c.category) + " · " + esc(c.ward) + (c.area ? ", " + esc(c.area) : "") + "</span></h2>" +
      '<p class="acts" style="margin:4px 0">' + cv + " " + flags + (c.helper ? " " + badge(T("adm.mu_helper")) : "") + "</p>" +
      '<p class="muted-note">' + esc(T("adm.mu_filed", { date: day(c.createdAt) })) + " · " + esc(T("adm.mu_same90", { n: c.sameNumber90, ng: c.notGenuine90 })) + "</p>" +
      (c.description ? '<div class="mu-text">' + esc(c.description) + "</div>" : '<p class="muted-note">' + esc(T("adm.mu_removed")) + "</p>") +
      (c.location ? '<p class="muted-note">' + esc(T("adm.mu_place", { place: c.location })) + "</p>" : "");
  }
  function reportsTab() {
    var d = S.data, h = "";
    if (!d.reports.length) h += '<p class="muted-note">' + esc(T("adm.mu_none_waiting")) + "</p>";
    d.reports.forEach(function (x) {
      var c = x.case, form = "d-" + c.id;
      h += '<div class="pr-card" id="card-' + esc(c.id) + '">' + caseHead(c) +
        '<h3 class="sub-h">' + esc(T("adm.mu_reports_h")) + '</h3><ul class="mu-reps">' + x.reports.map(function (r) {
          return "<li><b>" + esc(who(r.office, r.byKind)) + "</b> · " + esc(T("adm.mu_r_" + r.reason)) + ' · <span class="muted">' + esc(day(r.at)) + "</span>" + (r.note && r.byKind !== "AUTO" ? '<br><span class="mu-q">“' + esc(r.note) + "”</span>" : "") + "</li>";
        }).join("") + "</ul>";
      if (d.canManage) {
        h += '<form class="hl-form" data-decide="' + esc(c.id) + '" novalidate><h3>' + esc(T("adm.mu_decide_h")) + "</h3>" +
          radios(form, "decision", [["GENUINE", T("adm.mu_dec_GENUINE")], ["NOT_GENUINE", T("adm.mu_dec_NOT_GENUINE")]], T("adm.mu_decide_q")) +
          noteFld(form, T("adm.mu_note"), T("adm.mu_note_hint")) +
          '<div class="acts"><button type="submit" class="primary">' + esc(T("adm.mu_save")) + "</button></div></form>";
      }
      h += "</div>";
    });
    if (d.decided && d.decided.length) {
      h += '<h3 class="sec-h">' + esc(T("adm.mu_decided_h")) + '</h3><div class="ac-table-wrap"><table class="ac-t"><thead><tr><th scope="col">' + esc(T("adm.mu_c_case")) + '</th><th scope="col">' + esc(T("adm.mu_c_decision")) + '</th><th scope="col">' + esc(T("adm.mu_c_by")) + '</th><th scope="col">' + esc(T("adm.mu_c_reason")) + "</th>" + (d.canManage ? '<th scope="col"><span class="sr-only">' + esc(T("adm.mu_restrict_btn")) + "</span></th>" : "") + "</tr></thead><tbody>" +
        d.decided.map(function (r) {
          return '<tr><th scope="row">' + esc(r.tracking_ref) + "</th><td>" + esc(T(r.status === "UPHELD" ? "adm.mu_st_UPHELD" : "adm.mu_st_DISMISSED")) + "</td><td>" + esc(r.decided_by) + '<br><span class="muted">' + esc(day(r.decided_at)) + "</span></td><td>" + esc(r.decision_note || "") + "</td>" +
            (d.canManage ? "<td>" + (r.status === "UPHELD" ? '<button type="button" data-prefill="' + esc(r.tracking_ref) + '">' + esc(T("adm.mu_restrict_btn")) + "</button>" : "") + "</td>" : "") + "</tr>";
        }).join("") + "</tbody></table></div>";
    }
    return h;
  }
  function appealsTab() {
    var d = S.data, h = "";
    if (!d.appeals.length) return '<p class="muted-note">' + esc(T("adm.mu_no_appeals")) + "</p>";
    d.appeals.forEach(function (c) {
      var form = "a-" + c.id, mine = c.notGenuineBy === d.me;
      h += '<div class="pr-card">' + caseHead(c) +
        '<dl class="sa-dl"><dt>' + esc(T("adm.mu_closed_why")) + "</dt><dd>" + esc(c.notGenuineReason || "") + '<br><span class="muted">' + esc(T("adm.mu_closed_by", { by: c.notGenuineBy || "", date: day(c.notGenuineAt) })) + "</span></dd>" +
        "<dt>" + esc(T("adm.mu_appeal_says")) + "</dt><dd>" + esc(c.appealNote || "") + '<br><span class="muted">' + esc(day(c.appealAt)) + "</span></dd></dl>";
      if (mine) h += '<p class="note">' + esc(T("adm.mu_appeal_mine")) + "</p>";
      else if (d.canManage) {
        h += '<form class="hl-form" data-appeal="' + esc(c.id) + '" novalidate><h3>' + esc(T("adm.mu_appeal_h")) + "</h3>" +
          radios(form, "decision", [["REOPEN", T("adm.mu_ap_REOPEN")], ["KEEP_CLOSED", T("adm.mu_ap_KEEP_CLOSED")]], T("adm.mu_decide_q")) +
          noteFld(form, T("adm.mu_note"), T("adm.mu_note_hint_citizen")) +
          '<div class="acts"><button type="submit" class="primary">' + esc(T("adm.mu_save")) + "</button></div></form>";
      }
      h += "</div>";
    });
    return h;
  }
  function restrictionsTab() {
    var d = S.data, h = '<p class="note">' + esc(T("adm.mu_rs_rule")) + "</p>", form = "rs";
    if (d.canManage) {
      var f = S.f[form] || {};
      if (S.prefillRef && !f.v_ref) f.v_ref = S.prefillRef;
      S.f[form] = f;
      h += '<form class="hl-form" id="rs-form" novalidate><h3>' + esc(T("adm.mu_rs_new_h")) + "</h3>" +
        '<div class="grid"><div class="fld"><label for="rs-ref">' + esc(T("adm.mu_rs_ref")) + '</label><input type="text" id="rs-ref" autocomplete="off" value="' + esc(f.v_ref || "") + '"' + inv(form, "ref") + ">" + fe(form, "ref") + "</div></div>" +
        radios(form, "kind", [["PHONE", T("adm.mu_rs_PHONE")], ["EMAIL", T("adm.mu_rs_EMAIL")]], T("adm.mu_rs_what")) +
        radios(form, "days", [["30", T("adm.mu_days", { n: 30 })], ["90", T("adm.mu_days", { n: 90 })], ["365", T("adm.mu_days", { n: 365 })]], T("adm.mu_rs_long")) +
        noteFld(form, T("adm.mu_rs_reason"), T("adm.mu_rs_reason_hint")) +
        '<div class="acts"><button type="submit" class="primary">' + esc(T("adm.mu_rs_propose")) + "</button></div></form>";
    }
    if (!d.restrictions.length) return h + '<p class="muted-note">' + esc(T("adm.mu_rs_none")) + "</p>";
    h += '<div class="ac-table-wrap"><table class="ac-t"><caption class="sr-only">' + esc(T("adm.mu_t_restrictions_cap")) + '</caption><thead><tr><th scope="col">' + esc(T("adm.mu_c_what")) + '</th><th scope="col">' + esc(T("adm.mu_c_status")) + '</th><th scope="col">' + esc(T("adm.mu_c_reason")) + '</th><th scope="col">' + esc(T("adm.mu_c_who")) + '</th><th scope="col"><span class="sr-only">' + esc(T("adm.mu_c_action")) + "</span></th></tr></thead><tbody>" +
      d.restrictions.map(function (r) {
        var act = "";
        if (r.canDecide) act = '<div class="acts"><button type="button" class="primary" data-approve="' + esc(r.id) + '">' + esc(T("adm.mu_rs_approve")) + '</button></div><div class="fld"><label for="rf-' + esc(r.id) + '">' + esc(T("adm.mu_rs_refuse_why")) + '</label><input type="text" id="rf-' + esc(r.id) + '" maxlength="500"></div><div class="acts"><button type="button" data-refuse="' + esc(r.id) + '">' + esc(T("adm.mu_rs_refuse")) + "</button></div>";
        else if (r.status === "PENDING") act = '<span class="muted">' + esc(T(r.proposedBy === d.me ? "adm.mu_rs_wait_other" : "adm.mu_rs_wait_approver")) + "</span>";
        else if (r.status === "ACTIVE" && d.canApprove) act = '<div class="fld"><label for="lf-' + esc(r.id) + '">' + esc(T("adm.mu_rs_lift_why")) + '</label><input type="text" id="lf-' + esc(r.id) + '" maxlength="500"></div><div class="acts"><button type="button" data-lift="' + esc(r.id) + '">' + esc(T("adm.mu_rs_lift")) + "</button></div>";
        var st = T("adm.mu_rs_st_" + r.status) + (r.status === "ACTIVE" ? " · " + T("adm.mu_until", { date: day(r.endsAt) }) : "");
        return '<tr><th scope="row">' + esc(T("adm.mu_rs_" + r.kind)) + " " + esc(r.hint || "") + '<br><span class="muted">' + esc(r.trackingRef || "") + " · " + esc(T("adm.mu_days", { n: r.days })) + "</span></th>" +
          "<td>" + badge(st, r.status === "PENDING") + "</td><td>" + esc(r.reason) + (r.liftReason ? '<br><span class="muted">' + esc(r.liftReason) + "</span>" : "") + "</td>" +
          "<td>" + esc(T("adm.mu_rs_proposed", { by: r.proposedBy, date: day(r.proposedAt) })) + (r.decidedBy ? "<br>" + esc(T("adm.mu_rs_decided", { by: r.decidedBy, date: day(r.decidedAt) })) : "") + (r.liftedBy ? "<br>" + esc(T("adm.mu_rs_lifted", { by: r.liftedBy })) : "") + "</td>" +
          "<td>" + act + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    return h;
  }
  function monthTab() {
    var m = S.data.month;
    var rows = [["reportedByOffices"], ["reportedByDepartments"], ["flaggedByTextCheck"], ["closedNotGenuine"], ["keptAsGenuine"], ["appeals"], ["appealsReopened"], ["restrictionsStarted"], ["restrictionsActive"], ["waiting"]];
    var h = '<p class="muted-note">' + esc(T("adm.mu_m_lede", { from: day(m.from + "T00:00:00+05:30") })) + "</p>" +
      '<div class="ac-table-wrap"><table class="ac-t"><caption class="sr-only">' + esc(T("adm.mu_t_month_cap")) + '</caption><thead><tr><th scope="col">' + esc(T("adm.mu_m_what")) + '</th><th scope="col" class="num">' + esc(T("adm.mu_m_n")) + "</th></tr></thead><tbody>" +
      rows.map(function (r) { return '<tr><th scope="row">' + esc(T("adm.mu_m_" + r[0])) + '</th><td class="num">' + esc(m[r[0]]) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<h3 class="sec-h">' + esc(T("adm.mu_m_top_h")) + '</h3><p class="muted-note">' + esc(T("adm.mu_m_top_p")) + "</p>";
    if (!m.topReporters.length) h += '<p class="muted-note">' + esc(T("adm.mu_m_top_none")) + "</p>";
    else h += '<div class="ac-table-wrap"><table class="ac-t"><thead><tr><th scope="col">' + esc(T("adm.mu_c_office")) + '</th><th scope="col" class="num">' + esc(T("adm.mu_c_reports")) + '</th><th scope="col" class="num">' + esc(T("adm.mu_c_dismissed")) + "</th></tr></thead><tbody>" +
      m.topReporters.map(function (r) { return '<tr><th scope="row">' + esc(who(r.office, "")) + '</th><td class="num">' + esc(r.reports) + '</td><td class="num">' + esc(r.dismissed) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    return h + '<div class="acts no-print"><button type="button" id="mu-print">' + esc(T("adm.mu_m_print")) + "</button></div>";
  }
  function smsTab() {
    var x = S.data.sms, form = "sms", f = S.f[form] || {};
    var can = x.configured && x.tested;
    var h = '<p class="note">' + esc(T("adm.mu_sms_rule")) + "</p>" +
      '<dl class="sa-dl"><dt>' + esc(T("adm.mu_sms_provider")) + "</dt><dd>" + badge(T(x.configured ? "adm.mu_sms_set" : "adm.mu_sms_not_set"), !x.configured) + "</dd>" +
      "<dt>" + esc(T("adm.mu_sms_test")) + "</dt><dd>" + badge(x.tested ? T("adm.mu_sms_tested", { date: day(x.testedAt) }) : T("adm.mu_sms_not_tested"), !x.tested) + "</dd>" +
      "<dt>" + esc(T("adm.mu_sms_now")) + "</dt><dd>" + badge(T(x.on ? "adm.mu_sms_on" : "adm.mu_sms_off")) + (x.changedBy ? ' <span class="muted">' + esc(T("adm.mu_sms_changed", { by: x.changedBy, date: day(x.changedAt) })) + "</span>" : "") + "</dd></dl>";
    if (x.canSwitch) {
      h += '<div class="mu-switch"><button type="button" role="switch" id="sms-switch" aria-checked="' + (x.on ? "true" : "false") + '" aria-labelledby="sms-switch-l"' + (!can && !x.on ? ' disabled aria-describedby="sms-switch-why"' : "") + '></button><span class="lbl" id="sms-switch-l">' + esc(T("adm.mu_sms_switch")) + "</span></div>" +
        (!can && !x.on ? '<p class="muted-note" id="sms-switch-why">' + esc(T(x.configured ? "adm.mu_sms_why_test" : "adm.mu_sms_why_setup")) + "</p>" : '<p class="muted-note">' + esc(T(x.on ? "adm.mu_sms_on_p" : "adm.mu_sms_off_p")) + "</p>");
      if (x.configured) {
        h += '<form class="hl-form" id="sms-test-form" novalidate><h3>' + esc(T("adm.mu_sms_test_h")) + '</h3><p class="muted-note">' + esc(T("adm.mu_sms_test_p")) + "</p>" +
          '<div class="pr-form"><div class="fld"><label for="sms-phone">' + esc(T("adm.mu_sms_phone")) + '</label><input type="tel" id="sms-phone" inputmode="numeric" autocomplete="off" value="' + esc(f.v_phone || "") + '"' + inv(form, "phone") + ">" + fe(form, "phone") + '</div><button type="submit">' + esc(T("adm.mu_sms_send_test")) + "</button></div></form>";
      }
    } else h += '<p class="muted-note">' + esc(T("adm.mu_sms_super_only")) + "</p>";
    if (!x.configured) {
      h += '<h3 class="sec-h">' + esc(T("adm.mu_sms_setup_h")) + '</h3><ol class="mu-steps">' +
        ["1", "2", "3", "4", "5"].map(function (n) { return "<li>" + T("adm.mu_sms_step" + n).split(/`([^`]+)`/).map(function (part, i) { return i % 2 ? "<code>" + esc(part) + "</code>" : esc(part); }).join("") + "</li>"; }).join("") + "</ol>";
    }
    if (x.history && x.history.length) {
      h += '<h3 class="sec-h">' + esc(T("adm.mu_sms_hist_h")) + '</h3><ul class="mu-reps">' + x.history.map(function (e) {
        return "<li><b>" + esc(T(e.on ? "adm.mu_sms_on" : "adm.mu_sms_off")) + "</b> · " + esc(e.by) + " · " + esc(day(e.at)) + (e.reason ? '<br><span class="muted">' + esc(e.reason) + "</span>" : "") + "</li>";
      }).join("") + "</ul>";
    }
    return h;
  }
  function tabs() {
    var d = S.data, n = { reports: d.reports.length, appeals: d.appeals.length, restrictions: d.restrictions.filter(function (r) { return r.status === "PENDING"; }).length };
    return '<div class="ac-tabs" role="tablist" aria-label="' + esc(T("adm.mu_tabs")) + '">' + TABS.map(function (t) {
      return '<button type="button" role="tab" id="mu-tab-' + t + '" aria-selected="' + (S.tab === t) + '" aria-controls="mu-panel" data-tab="' + t + '"' + (S.tab === t ? "" : ' tabindex="-1"') + ">" + esc(T("adm.mu_t_" + t)) + (n[t] ? " (" + n[t] + ")" : "") + "</button>";
    }).join("") + "</div>";
  }
  function render() {
    var app = $("mu-app");
    if (S.err) { app.innerHTML = '<p class="' + (S.err === "adm.mu_not_ready" ? "ac-warn" : "st-msg error") + '">' + esc(T(S.err)) + "</p>"; return; }
    var d = S.data; if (!d) return;
    var h = '<p class="note">' + esc(T("adm.mu_rule")) + "</p>" + '<div class="ac-cards">' + card("adm.mu_c_waiting", d.reports.length) + card("adm.mu_c_appeals", d.appeals.length) +
      card("adm.mu_c_pending", d.restrictions.filter(function (r) { return r.status === "PENDING"; }).length) + card("adm.mu_c_sms", T(d.sms.on ? "adm.mu_sms_on" : "adm.mu_sms_off")) + "</div>";
    if (!d.canManage) h += '<p class="muted-note">' + esc(T("adm.mu_read_only")) + "</p>";
    var body = S.tab === "appeals" ? appealsTab() : S.tab === "restrictions" ? restrictionsTab() : S.tab === "month" ? monthTab() : S.tab === "sms" ? smsTab() : reportsTab();
    app.innerHTML = h + tabs() + '<div id="mu-panel" role="tabpanel" aria-labelledby="mu-tab-' + S.tab + '" class="tabpanel">' + body + "</div>";
    wire();
  }
  function setTab(t, focus) {
    S.tab = t; try { localStorage.setItem("giq-mu-tab", t); } catch (e) {}
    render(); if (focus) { var b = $("mu-tab-" + t); if (b) b.focus(); }
  }
  function after(okKey) { S.f = {}; return load().then(function () { msg(T(okKey)); }); }
  function readForm(form, names) {
    var f = S.f[form] = S.f[form] || {};
    names.forEach(function (n) { var r = document.querySelector('input[name="' + form + "-" + n + '"]:checked'); f["v_" + n] = r ? r.value : ""; });
    var t = $(form + "-note"); if (t) f.v_note = t.value;
    return f;
  }
  function showErrs(form, errs, focusOrder) {
    var f = S.f[form]; Object.keys(f).forEach(function (k) { if (k.indexOf("v_") !== 0) delete f[k]; });
    Object.keys(errs).forEach(function (k) { f[k] = errs[k]; });
    render();
    for (var i = 0; i < focusOrder.length; i++) {
      if (!errs[focusOrder[i][0]]) continue;
      var el = document.querySelector(focusOrder[i][1]); if (el) { el.focus(); return; }
    }
  }
  function wire() {
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () { setTab(b.getAttribute("data-tab"), true); });
      b.addEventListener("keydown", function (e) {
        var i = TABS.indexOf(b.getAttribute("data-tab"));
        var n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
        if (n === null) return; e.preventDefault(); setTab(TABS[(n + TABS.length) % TABS.length], true);
      });
    });
    function decisionForm(attr, action, okKeys) {
      document.querySelectorAll("[" + attr + "]").forEach(function (fm) {
        var id = fm.getAttribute(attr), form = (action === "decide" ? "d-" : "a-") + id;
        fm.addEventListener("submit", function (e) {
          e.preventDefault();
          var f = readForm(form, ["decision"]), errs = {};
          if (!f.v_decision) errs.decision = T("adm.mu_e_decision");
          var len = (f.v_note || "").trim().length;
          if (len < 10 || len > 500) errs.note = T("adm.mu_e_note");
          var order = [["decision", 'input[name="' + form + '-decision"]'], ["note", "#" + form + "-note"]];
          if (Object.keys(errs).length) { showErrs(form, errs, order); return; }
          api({ action: action, grievanceId: id, decision: f.v_decision, note: f.v_note }).then(function (x) {
            if (x.r.status === 400 && x.j.fields) { var e2 = {}; if (x.j.fields.decision) e2.decision = T("adm.mu_e_decision"); if (x.j.fields.note) e2.note = T("adm.mu_e_note"); showErrs(form, e2, order); return; }
            if (!x.r.ok) { msg(errText(x.j), true); return; }
            return after(okKeys[f.v_decision]);
          }).catch(function () { msg(T("adm.ss_e_net"), true); });
        });
      });
    }
    decisionForm("data-decide", "decide", { GENUINE: "adm.mu_done_kept", NOT_GENUINE: "adm.mu_done_closed" });
    decisionForm("data-appeal", "appeal", { REOPEN: "adm.mu_done_reopened", KEEP_CLOSED: "adm.mu_done_kept_closed" });
    document.querySelectorAll("[data-prefill]").forEach(function (b) { b.addEventListener("click", function () { S.prefillRef = b.getAttribute("data-prefill"); S.f.rs = { v_ref: S.prefillRef }; setTab("restrictions"); var el = $("rs-ref"); if (el) el.focus(); }); });
    var rs = $("rs-form");
    if (rs) rs.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = readForm("rs", ["kind", "days"]), errs = {};
      f.v_ref = $("rs-ref").value.trim();
      if (!f.v_ref) errs.ref = T("adm.mu_e_ref");
      if (!f.v_kind) errs.kind = T("adm.mu_e_kind");
      if (!f.v_days) errs.days = T("adm.mu_e_days");
      var len = (f.v_note || "").trim().length;
      if (len < 20 || len > 500) errs.note = T("adm.mu_e_reason20");
      var order = [["ref", "#rs-ref"], ["kind", 'input[name="rs-kind"]'], ["days", 'input[name="rs-days"]'], ["note", "#rs-note"]];
      if (Object.keys(errs).length) { showErrs("rs", errs, order); return; }
      api({ action: "restrict", trackingRef: f.v_ref, kind: f.v_kind, days: Number(f.v_days), reason: f.v_note }).then(function (x) {
        if (x.r.status === 404) { showErrs("rs", { ref: T("adm.mu_e_not_found") }, order); return; }
        if (x.r.status === 400 && x.j.fields) { var e2 = {}; if (x.j.fields.kind) e2.kind = T("adm.mu_e_kind"); if (x.j.fields.days) e2.days = T("adm.mu_e_days"); if (x.j.fields.reason) e2.note = T("adm.mu_e_reason20"); showErrs("rs", e2, order); return; }
        if (!x.r.ok) { msg(errText(x.j), true); return; }
        S.prefillRef = ""; return after("adm.mu_done_proposed");
      }).catch(function () { msg(T("adm.ss_e_net"), true); });
    });
    document.querySelectorAll("[data-approve]").forEach(function (b) { b.addEventListener("click", function () {
      api({ action: "approve", id: b.getAttribute("data-approve") }).then(function (x) { if (!x.r.ok) { msg(errText(x.j), true); return; } return after("adm.mu_done_approved"); }).catch(function () { msg(T("adm.ss_e_net"), true); });
    }); });
    document.querySelectorAll("[data-refuse]").forEach(function (b) { b.addEventListener("click", function () {
      var id = b.getAttribute("data-refuse"), inp = $("rf-" + id), note = inp.value.trim();
      if (note.length < 10) { msg(T("adm.mu_e_note"), true); inp.setAttribute("aria-invalid", "true"); inp.focus(); return; }
      api({ action: "refuse", id: id, note: note }).then(function (x) { if (!x.r.ok) { msg(errText(x.j), true); return; } return after("adm.mu_done_refused"); }).catch(function () { msg(T("adm.ss_e_net"), true); });
    }); });
    document.querySelectorAll("[data-lift]").forEach(function (b) { b.addEventListener("click", function () {
      var id = b.getAttribute("data-lift"), inp = $("lf-" + id), note = inp.value.trim();
      if (note.length < 10) { msg(T("adm.mu_e_note"), true); inp.setAttribute("aria-invalid", "true"); inp.focus(); return; }
      api({ action: "lift", id: id, reason: note }).then(function (x) { if (!x.r.ok) { msg(errText(x.j), true); return; } return after("adm.mu_done_lifted"); }).catch(function () { msg(T("adm.ss_e_net"), true); });
    }); });
    var pr = $("mu-print"); if (pr) pr.addEventListener("click", function () { window.print(); });
    var sw = $("sms-switch");
    if (sw) sw.addEventListener("click", function () {
      var on = sw.getAttribute("aria-checked") !== "true";
      sw.disabled = true;
      api({ action: "sms_switch", on: on }).then(function (x) {
        if (!x.r.ok) { sw.disabled = false; msg(errText(x.j), true); return; }
        return load().then(function () { msg(T(on ? "adm.mu_done_sms_on" : "adm.mu_done_sms_off")); var s2 = $("sms-switch"); if (s2) s2.focus(); });
      }).catch(function () { sw.disabled = false; msg(T("adm.ss_e_net"), true); });
    });
    var tf = $("sms-test-form");
    if (tf) tf.addEventListener("submit", function (e) {
      e.preventDefault();
      var ph = $("sms-phone").value.replace(/\D/g, "").slice(-10);
      S.f.sms = { v_phone: $("sms-phone").value };
      if (!/^[6-9]\d{9}$/.test(ph)) { showErrs("sms", { phone: T("adm.mu_e_phone") }, [["phone", "#sms-phone"]]); return; }
      api({ action: "sms_test", phone: ph }).then(function (x) {
        if (!x.r.ok) { msg(errText(x.j) + (x.j.code === "SEND_FAILED" && x.j.error ? " (" + x.j.error + ")" : ""), true); return; }
        return after("adm.mu_done_test");
      }).catch(function () { msg(T("adm.ss_e_net"), true); });
    });
  }

  function applyTheme(theme) { document.documentElement.classList.toggle("light-theme", theme === "light"); $("theme-toggle").textContent = theme === "light" ? T("adm.theme_dark") : T("adm.theme_light"); }
  var saved = "dark"; try { saved = localStorage.getItem("griq-admin-theme") || "dark"; } catch (e) {}
  applyTheme(saved);
  $("theme-toggle").addEventListener("click", function () {
    var cur = "dark"; try { cur = localStorage.getItem("griq-admin-theme") || "dark"; } catch (e) {}
    var next = cur === "light" ? "dark" : "light"; try { localStorage.setItem("griq-admin-theme", next); } catch (e) {}
    applyTheme(next);
  });
  document.addEventListener("giq:lang", function () { var th = "dark"; try { th = localStorage.getItem("griq-admin-theme") || "dark"; } catch (e) {} applyTheme(th); render(); });
  load();
})();
