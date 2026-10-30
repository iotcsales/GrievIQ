/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// Admin "Staff records" (grieviq-78): joining checks, policy sign-offs,
// contract dates and access pauses, the quarterly access review and leaving
// checklists. No salary, bank, Aadhaar or PAN, ID copies or attendance.
(function () {
  "use strict";
  function T(k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function loc() { return window.GIQ && GIQ.locale ? GIQ.locale() : "en-IN"; }
  function day(s) { if (!s) return ""; var d = new Date(String(s).length === 10 ? s + "T00:00:00Z" : s); return isNaN(d) ? s : d.toLocaleDateString(loc(), { day: "numeric", month: "short", year: "numeric", timeZone: String(s).length === 10 ? "UTC" : "Asia/Kolkata" }); }
  var TABS = ["people", "review", "leaving"];
  var S = { data: null, err: null, tab: "people", openId: null, errs: {}, rv: {} };
  try { var t0 = localStorage.getItem("giq-sr-tab"); if (TABS.indexOf(t0) >= 0) S.tab = t0; } catch (e) {}

  function msg(text, bad) { var m = $("sr-msg"); m.innerHTML = text ? '<p class="st-msg ' + (bad ? "error" : "success") + '">' + esc(text) + "</p>" : ""; if (text) m.focus(); }
  function api(body) {
    return fetch("/api/admin/staff-records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); });
  }
  function errText(j) {
    var k = { SELF: "adm.sr_e_self", CONTRACT_ENDED: "adm.sr_e_contract", STARTED: "adm.sr_e_started", POLICIES_NOT_ACCEPTED: "adm.pol_e_needed", LEFT: "adm.sr_e_left" }[j.error];
    return T(k || "adm.ss_e_generic");
  }
  function load() {
    return fetch("/api/admin/staff-records", { cache: "no-store" }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); }).then(function (x) {
      if (!x.r.ok) { S.err = x.j.error === "INSUFFICIENT_ROLE" || x.j.error === "NOT_ADMIN" ? "adm.no_access" : "adm.ss_e_load"; render(); return; }
      S.data = x.j; S.err = null; render();
    }).catch(function () { S.err = "adm.ss_e_load"; render(); });
  }
  function person(id) { return (S.data.people || []).find(function (p) { return p.id === id; }); }
  function roleName(r) { return T("adm.role_" + r); }
  function dutyName(d) { return T("adm.du_" + d); }
  function seenText(p) {
    if (!p.lastSeen) return T("adm.sr_never");
    return p.seenDays <= 0 ? T("adm.sr_seen_today") : T("adm.sr_seen_days", { n: p.seenDays });
  }
  function counts() {
    var c = S.data.counts;
    var card = function (k, v, vars) { return '<div class="ac-card"><div class="l">' + esc(T(k, vars)) + '</div><div class="v">' + esc(v) + "</div></div>"; };
    return '<div class="ac-cards">' + card("adm.sr_c_staff", c.staff) + card("adm.sr_c_checks", c.checksComplete + " / " + c.staff) + card("adm.sr_c_policies", c.policiesOk + " / " + c.staff) +
      card("adm.sr_c_soon", c.contractsSoon) + card("adm.sr_c_paused", c.paused) + card("adm.sr_c_review", T("adm.sr_rv_" + c.review), {}) + card("adm.sr_c_exits", c.exitsOpen) + "</div>";
  }
  function tabs() {
    return '<div class="ac-tabs" role="tablist" aria-label="' + esc(T("adm.sr_tabs")) + '">' + TABS.map(function (t) {
      return '<button type="button" role="tab" id="sr-tab-' + t + '" aria-selected="' + (S.tab === t) + '" aria-controls="sr-panel" data-tab="' + t + '"' + (S.tab === t ? "" : ' tabindex="-1"') + ">" + esc(T("adm.sr_t_" + t, { q: qName(S.data.quarter) })) + "</button>";
    }).join("") + "</div>";
  }
  function qName(q) { return q ? q.replace(/^(\d{4})-Q(\d)$/, function (_, y, n) { return T("adm.sr_quarter", { n: n, y: y }); }) : ""; }
  function badge(text, warn) { return '<span class="sa-badge' + (warn ? " sa-late" : "") + '">' + esc(text) + "</span>"; }

  function peopleTab() {
    if (S.openId) return personView(person(S.openId));
    var d = S.data, h = "";
    if (d.thresholds && d.thresholds.length) h += '<div class="ac-warn" role="note"><p style="margin:0 0 4px"><b>' + esc(T("adm.sr_th_h", { n: d.counts.staff })) + "</b></p><ul style=\"margin:0;padding-left:20px\">" +
      (d.thresholds.indexOf(10) >= 0 ? "<li>" + esc(T("adm.sr_th_10")) + "</li>" : "") + (d.thresholds.indexOf(20) >= 0 ? "<li>" + esc(T("adm.sr_th_20")) + "</li>" : "") + "</ul><p style=\"margin:4px 0 0\">" + esc(T("adm.sr_th_ca")) + "</p></div>";
    var list = d.people.filter(function (p) { return p.status !== "LEFT"; });
    h += '<div class="ac-table-wrap"><table class="ac-t"><caption class="sr-only">' + esc(T("adm.sr_t_people")) + '</caption><thead><tr><th scope="col">' + esc(T("adm.sr_c_person")) + '</th><th scope="col">' + esc(T("adm.sr_c_checks_s")) + '</th><th scope="col">' + esc(T("adm.sr_c_pol_s")) +
      '</th><th scope="col">' + esc(T("adm.sr_c_end")) + '</th><th scope="col">' + esc(T("adm.sr_c_seen")) + '</th><th scope="col"><span class="sr-only">' + esc(T("adm.sa_c_open")) + "</span></th></tr></thead><tbody>" +
      list.map(function (p) {
        return '<tr><th scope="row">' + esc(p.name) + (p.employeeId ? ' <span class="muted">(' + esc(p.employeeId) + ")</span>" : "") + '<br><span class="muted">' + esc(roleName(p.role)) + "</span>" + (p.autoPaused ? "<br>" + badge(T("adm.sr_paused_" + p.autoPaused), true) : "") + "</th>" +
          "<td>" + (p.missing.length ? badge(T("adm.sr_missing_n", { n: p.missing.length }), true) : badge(T("adm.sr_complete"))) + "</td>" +
          "<td>" + (p.policiesNeed.length ? badge(T("adm.sr_pol_todo"), true) : badge(T("adm.sr_pol_ok"))) + "</td>" +
          "<td>" + (p.record.contractEnd ? esc(day(p.record.contractEnd)) + (p.contractSoon ? " " + badge(T("adm.sr_soon"), true) : "") : '<span class="muted">—</span>') + "</td>" +
          "<td>" + esc(seenText(p)) + (p.flag ? " " + badge(T("adm.sr_flag"), true) : "") + "</td>" +
          '<td><button type="button" data-open="' + esc(p.id) + '" aria-label="' + esc(T("adm.sr_open_l", { name: p.name })) + '">' + esc(T("adm.sa_c_open")) + "</button></td></tr>";
      }).join("") + "</tbody></table></div>";
    return h;
  }
  function fe(k) { var c = S.errs[k]; return c ? T("adm.sr_e_" + k + "_" + c) : ""; }
  function fld(id, label, inner, err) { return '<div class="fld"><label for="' + id + '">' + esc(label) + "</label>" + inner + (err ? '<span class="ferr" id="' + id + '-e">' + esc(err) + "</span>" : "") + "</div>"; }
  function inv(id, err) { return err ? ' aria-invalid="true" aria-describedby="' + id + '-e"' : ""; }
  function personView(p) {
    if (!p) { S.openId = null; return peopleTab(); }
    var d = S.data, self = p.id === d.myId, edit = d.canManage && !self && p.status !== "LEFT", r = p.record;
    var h = '<div class="acts"><button type="button" id="sr-back">' + esc(T("adm.sa_back")) + "</button></div>" +
      '<h2 class="ac-sub" id="sr-person-h" tabindex="-1">' + esc(p.name) + (p.employeeId ? " (" + esc(p.employeeId) + ")" : "") + "</h2>";
    if (self) h += '<p class="note">' + esc(T("adm.sr_self")) + "</p>";
    if (p.autoPaused) {
      h += '<div class="ac-warn" role="note"><p style="margin:0">' + esc(T("adm.sr_paused_p_" + p.autoPaused, { date: day(p.autoPausedAt) })) + "</p></div>";
      if (edit) h += '<form id="sr-restore" class="ac-bar" novalidate>' + fld("sr-rs-reason", T("adm.sr_restore_reason"), '<input type="text" id="sr-rs-reason" maxlength="300" autocomplete="off"' + inv("sr-rs-reason", fe("reason")) + ">", fe("reason")) +
        '<button type="submit" class="primary">' + esc(T("adm.sr_restore_btn")) + "</button></form>";
    }
    h += '<dl class="sa-dl"><dt>' + esc(T("adm.sr_role")) + "</dt><dd>" + esc(roleName(p.role)) + "</dd>" +
      "<dt>" + esc(T("adm.sr_duties")) + "</dt><dd>" + esc(p.duties.length ? p.duties.map(dutyName).join(", ") : T("adm.sr_none")) + "</dd>" +
      "<dt>" + esc(T("adm.sr_c_seen")) + "</dt><dd>" + esc(seenText(p)) + (p.flag ? " · " + esc(T("adm.sr_flag_p", { n: d.dormant.pause })) : "") + "</dd>" +
      "<dt>" + esc(T("adm.sr_c_pol_s")) + "</dt><dd>" + esc(p.policiesNeed.length ? T("adm.sr_pol_need", { list: p.policiesNeed.map(function (k) { return T("adm.pol_" + k); }).join(", ") }) : T("adm.sr_pol_ok")) + "</dd></dl>";
    // the record
    var people = d.people.filter(function (x) { return x.status !== "LEFT" && x.id !== p.id; });
    h += '<form id="sr-record" class="hl-form" novalidate><h3>' + esc(T("adm.sr_record_h")) + '</h3><div class="grid">' +
      fld("sr-r-manager", T("adm.sr_manager"), '<select id="sr-r-manager"' + (edit ? "" : " disabled") + inv("sr-r-manager", fe("managerEmail")) + '><option value="">' + esc(T("adm.sr_none")) + "</option>" +
        people.map(function (x) { return '<option value="' + esc(x.email) + '"' + (x.id === r.managerId ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select>", fe("managerEmail")) +
      fld("sr-r-kind", T("adm.sr_kind"), '<select id="sr-r-kind"' + (edit ? "" : " disabled") + inv("sr-r-kind", fe("kind")) + '><option value="">' + esc(T("adm.sa_pick")) + "</option>" +
        d.kinds.map(function (k) { return '<option value="' + k + '"' + (k === r.kind ? " selected" : "") + ">" + esc(T("adm.sr_k_" + k)) + "</option>"; }).join("") + "</select>", fe("kind")) +
      ["joinedOn", "probationEnd", "contractEnd"].map(function (k) {
        return fld("sr-r-" + k, T("adm.sr_" + k), '<input type="date" id="sr-r-' + k + '" value="' + esc(r[k] || "") + '"' + (edit ? "" : " disabled") + inv("sr-r-" + k, fe(k)) + ">", fe(k));
      }).join("") + "</div>" +
      '<p class="muted-note">' + esc(T("adm.sr_record_p")) + "</p>" +
      (edit ? '<div class="acts"><button type="submit">' + esc(T("adm.sr_record_btn")) + "</button></div>" : "") + "</form>";
    // joining checks
    h += '<h3 class="sub-h">' + esc(T("adm.sr_checks_h")) + '</h3><p class="muted-note">' + esc(T("adm.sr_checks_p")) + '</p><div class="ac-table-wrap"><table class="ac-t"><thead><tr><th scope="col">' + esc(T("adm.sr_c_check")) + '</th><th scope="col">' + esc(T("adm.sr_c_done")) + "</th>" + (edit ? '<th scope="col">' + esc(T("adm.sr_c_record")) + "</th>" : "") + "</tr></thead><tbody>" +
      d.items.map(function (it) {
        var c = p.checks[it], need = p.needed.indexOf(it) >= 0;
        var row = '<tr><th scope="row">' + esc(T("adm.sr_i_" + it)) + '<br><span class="muted">' + esc(T("adm.sr_ih_" + it)) + "</span></th><td>" +
          (c ? esc(day(c.doneOn)) + (c.ref ? " · " + esc(c.ref) : "") + '<br><span class="muted">' + esc(T("adm.sr_by", { who: c.by })) + "</span>" : need ? badge(T("adm.sr_missing"), true) : '<span class="muted">' + esc(T("adm.sr_not_needed")) + "</span>") + "</td>";
        if (edit) {
          var id = "sr-ck-" + it, e = S.errs["ck_" + it] || {};
          row += '<td><div class="sr-ck"><label class="sr-only" for="' + id + '-d">' + esc(T("adm.sr_c_done") + ": " + T("adm.sr_i_" + it)) + '</label><input type="date" id="' + id + '-d" max="' + d.today + '" value="' + esc(c ? c.doneOn : d.today) + '"' + (e.doneOn ? ' aria-invalid="true" aria-describedby="' + id + '-e"' : "") + ">" +
            '<label class="sr-only" for="' + id + '-r">' + esc(T("adm.sr_ref") + ": " + T("adm.sr_i_" + it)) + '</label><input type="text" id="' + id + '-r" maxlength="80" autocomplete="off" placeholder="' + esc(T("adm.sr_ref")) + '" value="' + esc(c ? c.ref : "") + '">' +
            '<button type="button" data-check="' + it + '">' + esc(T("adm.sr_ck_btn")) + "</button></div>" + (e.doneOn ? '<span class="ferr" id="' + id + '-e">' + esc(T("adm.sr_e_doneOn_" + e.doneOn)) + "</span>" : "") + "</td>";
        }
        return row + "</tr>";
      }).join("") + "</tbody></table></div>";
    return h;
  }
  function reviewTab() {
    var d = S.data, rv = d.review, h = '<h2 class="ac-sub" style="margin-top:0">' + esc(T("adm.sr_rv_h", { q: qName(rv.quarter) })) + '</h2><p class="muted-note">' + esc(T("adm.sr_rv_p", { flag: d.dormant.flag, pause: d.dormant.pause })) + "</p>";
    if (!rv.started) return h + (d.canManage ? '<div class="acts"><button type="button" class="primary" id="sr-rv-start">' + esc(T("adm.sr_rv_start", { q: qName(rv.quarter) })) + "</button></div>" : '<p class="muted">' + esc(T("adm.sr_rv_none")) + "</p>");
    var done = rv.items.filter(function (i) { return i.decision; }).length;
    h += '<p role="status" class="' + (rv.finishedAt ? "st-msg success" : "muted-note") + '">' + esc(rv.finishedAt ? T("adm.sr_rv_done", { date: day(rv.finishedAt), who: rv.finishedBy }) : T("adm.sr_rv_progress", { n: done, m: rv.items.length })) + "</p>";
    return h + rv.items.map(function (i) {
      var e = S.rv[i.id] || {}, p = "sr-rv-" + i.id;
      var head = '<h3 class="sr-rv-name">' + esc(i.name) + (i.employeeId ? " (" + esc(i.employeeId) + ")" : "") + " · " + esc(roleName(i.role)) + "</h3>" +
        '<p class="muted-note" style="margin:2px 0 6px">' + esc((i.duties.length ? i.duties.map(dutyName).join(", ") + " · " : "") + (i.lastSeen ? (i.seenDays <= 0 ? T("adm.sr_seen_today") : T("adm.sr_seen_days", { n: i.seenDays })) : T("adm.sr_never"))) + (i.seenDays >= d.dormant.flag ? " · " + esc(T("adm.sr_flag")) : "") + "</p>";
      if (i.decision) return '<div class="hl-form">' + head + "<p>" + badge(T("adm.sr_d_" + i.decision), i.decision !== "KEEP") + (i.note ? " " + esc(i.note) : "") + ' <span class="muted">· ' + esc(T("adm.sr_by", { who: i.decidedBy })) + "</span></p></div>";
      if (i.mine) return '<div class="hl-form">' + head + '<p class="muted">' + esc(T("adm.sr_rv_mine")) + "</p></div>";
      if (!d.canManage) return '<div class="hl-form">' + head + '<p class="muted">' + esc(T("adm.sr_rv_waiting")) + "</p></div>";
      return '<form class="hl-form" data-rv="' + esc(i.id) + '" novalidate>' + head + '<fieldset class="rad"><legend>' + esc(T("adm.sr_rv_decide", { name: i.name })) + "</legend>" +
        ["KEEP", "CHANGE", "REMOVE"].map(function (k) { return '<span class="ropt"><input type="radio" name="' + p + '" id="' + p + "-" + k + '" value="' + k + '"' + (e.decision === k ? " checked" : "") + (e.f && e.f.decision ? ' aria-invalid="true"' : "") + '><label for="' + p + "-" + k + '">' + esc(T("adm.sr_d_" + k)) + "</label></span>"; }).join("") +
        (e.f && e.f.decision ? '<span class="ferr" role="alert">' + esc(T("adm.sr_e_decision")) + "</span>" : "") + "</fieldset>" +
        fld(p + "-n", T("adm.sr_rv_note"), '<input type="text" id="' + p + '-n" maxlength="300" autocomplete="off" value="' + esc(e.note || "") + '"' + inv(p + "-n", e.f && e.f.note ? T("adm.sr_e_note") : "") + ">", e.f && e.f.note ? T("adm.sr_e_note") : "") +
        '<div class="acts"><button type="submit">' + esc(T("adm.sr_rv_save")) + "</button></div></form>";
    }).join("");
  }
  function leavingTab() {
    var d = S.data, left = d.people.filter(function (p) { return p.exit; });
    var h = '<h2 class="ac-sub" style="margin-top:0">' + esc(T("adm.sr_t_leaving")) + '</h2><p class="muted-note">' + esc(T("adm.sr_lv_p")) + "</p>";
    if (!left.length) return h + '<p class="muted">' + esc(T("adm.sr_lv_none")) + "</p>";
    return h + left.map(function (p) {
      var x = p.exit, openN = x.open.length + (x.leadsOpen ? 1 : 0);
      return '<div class="hl-form"><h3>' + esc(p.name) + (p.employeeId ? " (" + esc(p.employeeId) + ")" : "") + " · " + esc(T("adm.sr_left_on", { date: day(p.leftAt) })) + " " + badge(openN ? T("adm.sr_lv_open", { n: openN }) : T("adm.sr_lv_done"), !!openN) + '</h3><ul class="sr-exit">' +
        d.exitItems.map(function (it) {
          var done = x.items[it];
          return "<li>" + (done ? '<span aria-hidden="true">✓ </span>' + esc(T("adm.sr_x_" + it)) + ' <span class="muted">· ' + esc(day(done.at)) + " · " + esc(done.by) + "</span>" :
            esc(T("adm.sr_x_" + it)) + (d.canManage ? ' <button type="button" data-exit="' + it + '" data-email="' + esc(p.email) + '" aria-label="' + esc(T("adm.sr_x_btn_l", { what: T("adm.sr_x_" + it), name: p.name })) + '">' + esc(T("adm.sr_x_btn")) + "</button>" : " " + badge(T("adm.sr_missing"), true))) + "</li>";
        }).join("") +
        "<li>" + (x.leadsOpen ? esc(T("adm.sr_x_leads", { n: x.leadsOpen })) + ' <a class="sr-link" href="/admin-sales.html">' + esc(T("adm.nav_sales")) + "</a>" : '<span aria-hidden="true">✓ </span>' + esc(T("adm.sr_x_leads_done"))) + "</li>" +
        '<li><span aria-hidden="true">✓ </span>' + esc(T("adm.sr_x_duties")) + "</li>" +
        '<li><span aria-hidden="true">✓ </span>' + esc(T("adm.sr_x_email")) + "</li></ul></div>";
    }).join("");
  }

  function render() {
    var app = $("sr-app");
    if (S.err) { app.innerHTML = '<p class="st-msg error">' + esc(T(S.err)) + "</p>"; return; }
    var d = S.data; if (!d) return;
    if (!d.ready) { app.innerHTML = '<p class="ac-warn">' + esc(T("adm.sr_not_ready")) + "</p>"; return; }
    var h = '<p class="note">' + esc(T("adm.sr_rule")) + "</p>" + counts();
    if (d.totalsOnly) { app.innerHTML = h + '<p class="muted-note">' + esc(T("adm.sr_totals_only")) + "</p>"; return; }
    if (!d.canManage) h += '<p class="muted-note">' + esc(T("adm.sr_read_only")) + "</p>";
    h += tabs() + '<div id="sr-panel" role="tabpanel" aria-labelledby="sr-tab-' + S.tab + '" class="tabpanel">' + (S.tab === "review" ? reviewTab() : S.tab === "leaving" ? leavingTab() : peopleTab()) + "</div>";
    app.innerHTML = h;
    wire();
  }
  function setTab(t, focus) {
    S.tab = t; S.openId = null; try { localStorage.setItem("giq-sr-tab", t); } catch (e) {}
    render(); if (focus) { var b = $("sr-tab-" + t); if (b) b.focus(); }
  }
  function after(okKey, focusId) {
    return load().then(function () { msg(T(okKey)); });
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
    document.querySelectorAll("[data-open]").forEach(function (b) { b.addEventListener("click", function () { S.openId = b.getAttribute("data-open"); S.errs = {}; render(); $("sr-person-h").focus(); }); });
    var back = $("sr-back"); if (back) back.addEventListener("click", function () { var id = S.openId; S.openId = null; render(); var b = document.querySelector('[data-open="' + id + '"]'); if (b) b.focus(); });
    var rec = $("sr-record");
    if (rec) rec.addEventListener("submit", function (e) {
      e.preventDefault();
      var p = person(S.openId);
      api({ action: "record", email: p.email, managerEmail: $("sr-r-manager").value, kind: $("sr-r-kind").value, joinedOn: $("sr-r-joinedOn").value, probationEnd: $("sr-r-probationEnd").value, contractEnd: $("sr-r-contractEnd").value }).then(function (x) {
        if (x.r.status === 400 && x.j.fields) { S.errs = x.j.fields; render(); var k = Object.keys(x.j.fields)[0]; var el = $("sr-r-" + (k === "managerEmail" ? "manager" : k)); if (el) el.focus(); return; }
        if (!x.r.ok) { msg(errText(x.j), true); return; }
        S.errs = {}; return after(x.j.restored ? "adm.sr_done_restored" : "adm.sr_done_record");
      }).catch(function () { msg(T("adm.ss_e_net"), true); });
    });
    document.querySelectorAll("[data-check]").forEach(function (b) {
      b.addEventListener("click", function () {
        var it = b.getAttribute("data-check"), p = person(S.openId), id = "sr-ck-" + it;
        api({ action: "check", email: p.email, item: it, doneOn: $(id + "-d").value, ref: $(id + "-r").value }).then(function (x) {
          if (x.r.status === 400 && x.j.fields) { S.errs = {}; S.errs["ck_" + it] = x.j.fields; render(); $(id + "-d").focus(); return; }
          if (!x.r.ok) { msg(errText(x.j), true); return; }
          S.errs = {}; return after("adm.sr_done_check");
        }).catch(function () { msg(T("adm.ss_e_net"), true); });
      });
    });
    var rs = $("sr-restore");
    if (rs) rs.addEventListener("submit", function (e) {
      e.preventDefault();
      api({ action: "restore", email: person(S.openId).email, reason: $("sr-rs-reason").value }).then(function (x) {
        if (x.r.status === 400 && x.j.fields) { S.errs = { reason: "REQUIRED" }; render(); $("sr-rs-reason").focus(); return; }
        if (!x.r.ok) { msg(errText(x.j), true); return; }
        S.errs = {}; return after("adm.sr_done_restored");
      }).catch(function () { msg(T("adm.ss_e_net"), true); });
    });
    var st = $("sr-rv-start");
    if (st) st.addEventListener("click", function () { api({ action: "review_start" }).then(function (x) { if (!x.r.ok) { msg(errText(x.j), true); return; } return after("adm.sr_done_rv_start"); }).catch(function () { msg(T("adm.ss_e_net"), true); }); });
    document.querySelectorAll("[data-rv]").forEach(function (f) {
      var id = f.getAttribute("data-rv"), p = "sr-rv-" + id;
      S.rv[id] = S.rv[id] || {};
      f.querySelectorAll('input[name="' + p + '"]').forEach(function (r) { r.addEventListener("change", function () { S.rv[id].decision = r.value; }); });
      $(p + "-n").addEventListener("input", function (e) { S.rv[id].note = e.target.value; });
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        api({ action: "review_decide", id: id, decision: S.rv[id].decision || "", note: S.rv[id].note || "" }).then(function (x) {
          if (x.r.status === 400 && x.j.fields) { S.rv[id].f = x.j.fields; render(); var el = x.j.fields.decision ? $(p + "-KEEP") : $(p + "-n"); if (el) el.focus(); return; }
          if (!x.r.ok) { msg(errText(x.j), true); return; }
          delete S.rv[id]; return after(x.j.finished ? "adm.sr_done_rv_finished" : "adm.sr_done_rv");
        }).catch(function () { msg(T("adm.ss_e_net"), true); });
      });
    });
    document.querySelectorAll("[data-exit]").forEach(function (b) {
      b.addEventListener("click", function () {
        api({ action: "exit", email: b.getAttribute("data-email"), item: b.getAttribute("data-exit") }).then(function (x) {
          if (!x.r.ok) { msg(errText(x.j), true); return; }
          return after("adm.sr_done_exit");
        }).catch(function () { msg(T("adm.ss_e_net"), true); });
      });
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
