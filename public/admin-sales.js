/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// Admin "Sales" (grieviq-77): leads from pilot requests and those added by
// sales staff, stages, what was done, follow-ups, territories and totals.
(function () {
  "use strict";
  function T(k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function loc() { return window.GIQ && GIQ.locale ? GIQ.locale() : "en-IN"; }
  function day(s) { if (!s) return ""; var d = new Date(String(s).length === 10 ? s + "T00:00:00Z" : s); return isNaN(d) ? s : d.toLocaleDateString(loc(), { day: "numeric", month: "short", year: "numeric", timeZone: String(s).length === 10 ? "UTC" : "Asia/Kolkata" }); }
  function when(s) { if (!s) return ""; var d = new Date(s); return isNaN(d) ? s : d.toLocaleString(loc(), { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); }
  var OPEN = ["NEW", "CONTACTED", "DEMO", "QUOTED"];
  var TABS = ["leads", "add", "totals", "territories"];
  var S = { data: null, err: null, tab: "leads", f: { stage: "OPEN", owner: "", q: "", due: false }, openId: null, det: null, add: blankAdd(), addErr: {}, errs: {}, busy: false, terr: {} };
  try { var t0 = localStorage.getItem("giq-sa-tab"); if (TABS.indexOf(t0) >= 0) S.tab = t0; } catch (e) {}
  function blankAdd() { return { officeKind: "", officeName: "", place: "", state: "", contactName: "", designation: "", mobile: "", email: "", nextDate: "", nextStep: "", owner: null }; }

  function msg(text, bad) { var m = $("sa-msg"); m.innerHTML = text ? '<p class="st-msg ' + (bad ? "error" : "success") + '">' + esc(text) + "</p>" : ""; if (text) m.focus(); }
  function api(body) {
    return fetch("/api/admin/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); });
  }
  function errText(j) {
    if (j.error === "CODE_NOT_ACCEPTED") return T("adm.sc_needed");
    if (j.error === "TAKEN") return T("adm.sa_e_taken");
    if (j.error === "CLOSED") return T("adm.sa_e_closed");
    if (j.error === "NOT_FOUND") return T("adm.sa_e_gone");
    return T("adm.ss_e_generic");
  }
  function load() {
    return fetch("/api/admin/sales", { cache: "no-store" }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); }).then(function (x) {
      if (!x.r.ok) { S.err = x.j.error === "INSUFFICIENT_ROLE" || x.j.error === "NOT_ADMIN" ? "adm.no_access" : "adm.ss_e_load"; render(); return; }
      S.data = x.j; S.err = null;
      if (S.data.totalsOnly) S.tab = "totals";
      if (!tabOk(S.tab)) S.tab = "leads";
      if (S.openId) return openLead(S.openId, true);
      render();
    }).catch(function () { S.err = "adm.ss_e_load"; render(); });
  }
  function tabOk(t) {
    var d = S.data;
    if (t === "add") return d.canWork;
    if (t === "totals") return d.canManage || d.auditor || d.totalsOnly;
    if (t === "territories") return d.canManage || d.auditor;
    return !d.totalsOnly;
  }
  function openLead(id, keep) {
    S.openId = id;
    return fetch("/api/admin/sales?id=" + encodeURIComponent(id), { cache: "no-store" }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); }).then(function (x) {
      if (!x.r.ok) { S.openId = null; S.det = null; render(); msg(T("adm.sa_e_gone"), true); return; }
      S.det = x.j; if (!keep) S.errs = {};
      render();
      if (!keep) { var h = $("sa-lead-h"); if (h) h.focus(); }
    });
  }

  // ---- pieces ----
  function stageName(s) { return T("adm.sa_st_" + s); }
  function ownerName(email) {
    if (!email) return T("adm.sa_nobody");
    if (S.data && email === S.data.me) return T("adm.sa_you");
    var p = (S.data.people || []).find(function (x) { return x.email === email; });
    return p ? p.name : email;
  }
  function stateName(code) { var s = (S.data.states || []).find(function (x) { return x.code === code; }); return s ? s.name : ""; }
  function opts(list, sel, keyPrefix, blank) {
    return (blank ? '<option value="">' + esc(T(blank)) + "</option>" : "") + list.map(function (v) { return '<option value="' + esc(v) + '"' + (v === sel ? " selected" : "") + ">" + esc(T(keyPrefix + v)) + "</option>"; }).join("");
  }
  function stateOpts(sel, only) {
    var list = (S.data.states || []).filter(function (s) { return !only || !only.length || only.indexOf(s.code) >= 0; });
    return '<option value="">' + esc(T("adm.sa_state_pick")) + "</option>" + list.map(function (s) { return '<option value="' + s.code + '"' + (s.code === sel ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("");
  }
  function fld(id, label, inner, err, wide, hint) {
    return '<div class="fld' + (wide ? " wide" : "") + '"><label for="' + id + '">' + esc(label) + "</label>" + (hint ? '<span class="hint" id="' + id + '-h">' + esc(hint) + "</span>" : "") + inner + (err ? '<span class="ferr" id="' + id + '-e">' + esc(err) + "</span>" : "") + "</div>";
  }
  function inv(id, err, hint) { var d = [hint ? id + "-h" : "", err ? id + "-e" : ""].filter(Boolean).join(" "); return (err ? ' aria-invalid="true"' : "") + (d ? ' aria-describedby="' + d + '"' : ""); }
  function input(id, val, err, extra) { return '<input id="' + id + '" value="' + esc(val || "") + '"' + inv(id, err, extra && extra.hint) + (extra && extra.attrs ? " " + extra.attrs : ' type="text"') + ' autocomplete="off">'; }
  function fe(map, k) { var c = map[k]; return c ? T("adm.sa_e_" + k + "_" + c) : ""; }

  function tiles() {
    var f = S.data.followups;
    var c = function (k, n, filter) { return '<button type="button" class="sa-tile" data-tile="' + filter + '"><span class="v">' + n + '</span><span class="l">' + esc(T(k)) + "</span></button>"; };
    return '<div class="sa-tiles">' + c("adm.sa_tile_due", f.due, "due") + c("adm.sa_tile_overdue", f.overdue, "overdue") + c("adm.sa_tile_open", f.open, "mine") + c(S.data.canManage ? "adm.sa_tile_free_all" : "adm.sa_tile_free", f.free, "free") + "</div>";
  }
  function tabs() {
    return '<div class="ac-tabs" role="tablist" aria-label="' + esc(T("adm.sa_tabs")) + '">' + TABS.filter(tabOk).map(function (t) {
      return '<button type="button" role="tab" id="sa-tab-' + t + '" aria-selected="' + (S.tab === t) + '" aria-controls="sa-panel" data-tab="' + t + '"' + (S.tab === t ? "" : ' tabindex="-1"') + ">" + esc(T("adm.sa_t_" + t)) + "</button>";
    }).join("") + "</div>";
  }
  function visible() {
    var f = S.f, q = f.q.trim().toLowerCase(), today = S.data.today;
    return S.data.leads.filter(function (l) {
      if (f.stage === "OPEN" && OPEN.indexOf(l.stage) < 0) return false;
      if (f.stage !== "OPEN" && f.stage !== "ALL" && l.stage !== f.stage) return false;
      if (f.owner === "ME" && l.owner !== S.data.me) return false;
      if (f.owner === "NONE" && l.owner) return false;
      if (f.owner && f.owner !== "ME" && f.owner !== "NONE" && l.owner !== f.owner) return false;
      if (f.due && !(l.nextDate && l.nextDate <= today && OPEN.indexOf(l.stage) >= 0)) return false;
      if (q && (l.ref + " " + l.officeName + " " + l.place + " " + l.stateName + " " + l.contactName).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function leadsTab() {
    var d = S.data, f = S.f;
    if (S.openId && S.det) return leadView();
    var owners = [["", "adm.sa_f_anyone"], ["ME", "adm.sa_f_me"], ["NONE", "adm.sa_nobody"]];
    var h = '<form class="hl-filter" id="sa-filter" role="search" onsubmit="return false">' +
      '<div class="fld"><label for="sa-f-stage">' + esc(T("adm.sa_stage")) + '</label><select id="sa-f-stage"><option value="OPEN"' + (f.stage === "OPEN" ? " selected" : "") + ">" + esc(T("adm.sa_f_open")) + '</option><option value="ALL"' + (f.stage === "ALL" ? " selected" : "") + ">" + esc(T("adm.sa_f_all")) + "</option>" + opts(d.stages, f.stage, "adm.sa_st_") + "</select></div>" +
      (d.canManage || d.auditor ? '<div class="fld"><label for="sa-f-owner">' + esc(T("adm.sa_owner")) + '</label><select id="sa-f-owner">' + owners.map(function (o) { return '<option value="' + o[0] + '"' + (f.owner === o[0] ? " selected" : "") + ">" + esc(T(o[1])) + "</option>"; }).join("") +
        (d.people || []).map(function (p) { return '<option value="' + esc(p.email) + '"' + (f.owner === p.email ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + "</select></div>" : "") +
      '<div class="fld"><label for="sa-f-q">' + esc(T("adm.sa_search")) + '</label><input type="search" id="sa-f-q" maxlength="60" autocomplete="off" value="' + esc(f.q) + '"></div>' +
      '<div class="chk"><input type="checkbox" id="sa-f-due"' + (f.due ? " checked" : "") + '><label for="sa-f-due">' + esc(T("adm.sa_f_due")) + "</label></div></form>";
    var list = visible();
    h += '<p class="muted-note" role="status" id="sa-count">' + esc(T("adm.sa_count", { n: list.length })) + "</p>";
    h += '<div class="ac-table-wrap"><table class="ac-t"><caption class="sr-only">' + esc(T("adm.sa_t_leads")) + '</caption><thead><tr><th scope="col">' + esc(T("adm.sa_c_lead")) + '</th><th scope="col">' + esc(T("adm.sa_stage")) + '</th><th scope="col">' + esc(T("adm.sa_owner")) + '</th><th scope="col">' + esc(T("adm.sa_next")) + '</th><th scope="col"><span class="sr-only">' + esc(T("adm.sa_c_open")) + "</span></th></tr></thead><tbody>" +
      (list.length ? list.map(function (l) {
        return '<tr><th scope="row"><span class="sa-ref">' + esc(l.ref) + "</span><br>" + esc(l.officeName) + '<br><span class="muted">' + esc([l.place, l.stateName].filter(Boolean).join(" · ")) + "</span></th>" +
          "<td>" + esc(stageName(l.stage)) + (l.lostReason ? '<br><span class="muted">' + esc(T("adm.sa_lr_" + l.lostReason)) + "</span>" : "") + "</td><td>" + esc(ownerName(l.owner)) + "</td>" +
          "<td>" + (l.nextDate ? esc(day(l.nextDate)) + (l.overdue ? ' <span class="sa-badge sa-late">' + esc(T("adm.sa_overdue")) + "</span>" : l.due ? ' <span class="sa-badge">' + esc(T("adm.sa_today")) + "</span>" : "") + (l.nextStep ? '<br><span class="muted">' + esc(l.nextStep) + "</span>" : "") : '<span class="muted">—</span>') + "</td>" +
          '<td><button type="button" data-open="' + esc(l.id) + '" aria-label="' + esc(T("adm.sa_open_l", { ref: l.ref })) + '">' + esc(T("adm.sa_c_open")) + "</button></td></tr>";
      }).join("") : '<tr><td colspan="5" class="muted">' + esc(T("adm.sa_none")) + "</td></tr>") + "</tbody></table></div>";
    return h;
  }
  function leadView() {
    var d = S.det, l = d.lead, a = l.access || {}, e = S.errs, open = OPEN.indexOf(l.stage) >= 0;
    var h = '<div class="acts"><button type="button" id="sa-back">' + esc(T("adm.sa_back")) + "</button></div>" +
      '<h2 class="ac-sub" id="sa-lead-h" tabindex="-1">' + esc(l.ref) + " · " + esc(l.officeName) + ' <span class="sa-badge">' + esc(stageName(l.stage)) + "</span></h2>";
    if (l.erased) h += '<p class="ac-warn">' + esc(T("adm.sa_erased")) + "</p>";
    h += '<dl class="sa-dl">' +
      "<dt>" + esc(T("adm.sa_kind")) + "</dt><dd>" + esc(T("adm.sa_k_" + l.officeKind)) + "</dd>" +
      "<dt>" + esc(T("adm.sa_place")) + "</dt><dd>" + esc([l.place, l.stateName].filter(Boolean).join(" · ") || "—") + "</dd>" +
      "<dt>" + esc(T("adm.sa_contact")) + "</dt><dd>" + esc([l.contactName, l.designation].filter(Boolean).join(", ") || "—") + "</dd>" +
      "<dt>" + esc(T("adm.sa_mobile")) + "</dt><dd>" + (l.mobile ? (S.data.auditor ? esc(l.mobile) : '<a href="tel:+91' + esc(l.mobile) + '">' + esc(l.mobile) + "</a>") : "—") + "</dd>" +
      "<dt>" + esc(T("adm.sa_email")) + "</dt><dd>" + (l.email ? (S.data.auditor ? esc(l.email) : '<a href="mailto:' + esc(l.email) + '">' + esc(l.email) + "</a>") : "—") + "</dd>" +
      "<dt>" + esc(T("adm.sa_owner")) + "</dt><dd>" + esc(ownerName(l.owner)) + "</dd>" +
      "<dt>" + esc(T("adm.sa_next")) + "</dt><dd>" + (l.nextDate ? esc(day(l.nextDate)) + (l.overdue ? " · " + esc(T("adm.sa_overdue")) : "") + (l.nextStep ? " · " + esc(l.nextStep) : "") : "—") + "</dd>" +
      "<dt>" + esc(T("adm.sa_source")) + "</dt><dd>" + esc(T("adm.sa_src_" + l.source)) + " · " + esc(when(l.createdAt)) + "</dd>" +
      (l.lostReason ? "<dt>" + esc(T("adm.sa_lost_reason")) + "</dt><dd>" + esc(T("adm.sa_lr_" + l.lostReason)) + "</dd>" : "") + "</dl>";
    if (d.quotations.length) h += '<h3 class="sub-h">' + esc(T("adm.sa_quotes")) + '</h3><ul class="hl-ev">' + d.quotations.map(function (q) {
      return "<li>" + esc(q.ref) + " · ₹" + Number(q.total).toLocaleString("en-IN") + " · " + esc(q.approval === "PENDING" ? T("adm.qt_st_PENDING") : T("adm.qt_st_" + q.status)) + "</li>"; }).join("") + "</ul>";
    // who has it
    if (a.take && !l.erased) h += '<div class="acts"><button type="button" class="primary" id="sa-take">' + esc(T("adm.sa_take")) + "</button></div>";
    if (S.data.canManage && !l.erased) h += '<form id="sa-assign" class="ac-bar" novalidate><div class="fld"><label for="sa-as-owner">' + esc(T("adm.sa_give")) + '</label><select id="sa-as-owner"><option value="">' + esc(T("adm.sa_nobody")) + "</option>" +
      (S.data.people || []).map(function (p) { return '<option value="' + esc(p.email) + '"' + (p.email === l.owner ? " selected" : "") + ">" + esc(p.name) + (p.states && p.states.length ? " (" + esc(p.states.join(", ")) + ")" : "") + "</option>"; }).join("") +
      '</select></div><button type="submit">' + esc(T("adm.sa_give_btn")) + "</button></form>";
    if (a.edit && !l.erased) {
      if (open) {
        h += '<form id="sa-log" class="hl-form" novalidate><h3>' + esc(T("adm.sa_log_h")) + '</h3><fieldset class="rad"><legend>' + esc(T("adm.sa_log_kind")) + "</legend>" +
          S.data.activity.map(function (k) { return '<span class="ropt"><input type="radio" name="sa-lk" id="sa-lk-' + k + '" value="' + k + '"' + ((S.logKind || "CALL") === k ? " checked" : "") + '><label for="sa-lk-' + k + '">' + esc(T("adm.sa_ev_" + k)) + "</label></span>"; }).join("") + "</fieldset>" +
          fld("sa-l-note", T("adm.sa_log_note"), '<textarea id="sa-l-note" maxlength="500"' + inv("sa-l-note", fe(e, "note"), true) + ">" + esc(S.logNote || "") + "</textarea>", fe(e, "note"), true, T("adm.sa_rule_short")) +
          '<div class="grid">' + fld("sa-l-next", T("adm.sa_next_date"), input("sa-l-next", S.logNext !== undefined ? S.logNext : (l.nextDate || ""), fe(e, "nextDate"), { attrs: 'type="date" min="' + S.data.today + '"' }), fe(e, "nextDate")) +
          fld("sa-l-step", T("adm.sa_next_step"), input("sa-l-step", S.logStep !== undefined ? S.logStep : l.nextStep, fe(e, "nextStep"), { attrs: 'type="text" maxlength="160"' }), fe(e, "nextStep")) + "</div>" +
          '<div class="acts"><button type="submit" class="primary">' + esc(T("adm.sa_log_btn")) + "</button>" +
          '<a class="btnlink" href="/admin-bills.html?lead=' + encodeURIComponent(l.id) + '#bl-qt">' + esc(T("adm.sa_make_quote")) + "</a></div></form>";
      }
      var st = S.stage || l.stage;
      h += '<form id="sa-stage" class="hl-form" novalidate><h3>' + esc(T(open ? "adm.sa_stage_h" : "adm.sa_reopen_h")) + '</h3><div class="grid">' +
        fld("sa-s-stage", T("adm.sa_stage"), '<select id="sa-s-stage">' + opts(S.data.stages, st, "adm.sa_st_") + "</select>", fe(e, "stage")) +
        (st === "LOST" ? fld("sa-s-reason", T("adm.sa_lost_reason"), '<select id="sa-s-reason"' + inv("sa-s-reason", fe(e, "lostReason")) + ">" + opts(S.data.lostReasons, S.lostReason || l.lostReason || "", "adm.sa_lr_", "adm.sa_pick") + "</select>", fe(e, "lostReason")) : "") + "</div>" +
        fld("sa-s-note", T(st === "WON" ? "adm.sa_won_note" : "adm.sa_stage_note"), input("sa-s-note", S.stageNote || "", fe(e, "stageNote"), { attrs: 'type="text" maxlength="500"' }), fe(e, "stageNote"), true) +
        '<div class="acts"><button type="submit">' + esc(T("adm.sa_stage_btn")) + "</button></div></form>";
      h += '<details class="hl-form" id="sa-det"' + (S.detOpen ? " open" : "") + '><summary style="cursor:pointer;font-weight:600;min-height:32px">' + esc(T("adm.sa_edit_h")) + "</summary>" + detailsForm(l, e, "sa-d-") +
        '<div class="acts"><button type="button" id="sa-d-save">' + esc(T("adm.sa_save")) + "</button></div></details>";
    }
    h += '<h3 class="sub-h">' + esc(T("adm.sa_history")) + '</h3><ol class="hl-ev" reversed>' + d.events.map(function (x) {
      var what = x.kind === "STAGE" ? T("adm.sa_ev_STAGE", { from: x.from ? stageName(x.from) : "—", to: stageName(x.to) }) : x.kind === "OWNER" ? T("adm.sa_ev_OWNER", { who: ownerName(x.note || null) }) : T("adm.sa_ev_" + x.kind);
      var note = x.kind === "OWNER" ? "" : x.note;
      return "<li><b>" + esc(what) + "</b>" + (note ? ": " + esc(note) : "") + ' <span class="muted">· ' + esc(when(x.at)) + " · " + esc(x.by === "system" ? T("adm.sa_system") : x.by) + "</span></li>";
    }).join("") + "</ol>";
    return h;
  }
  function detailsForm(v, e, p) {
    var mine = !S.data.canManage && S.data.myStates.length ? S.data.myStates : null;
    var kinds = S.data.officeKinds.filter(function (k) { return S.data.canManage || k !== "NATIONAL" || v.officeKind === k; });
    return '<div class="grid">' +
      fld(p + "kind", T("adm.sa_kind"), '<select id="' + p + 'kind"' + inv(p + "kind", fe(e, "officeKind")) + ">" + opts(kinds, v.officeKind, "adm.sa_k_", "adm.sa_pick") + "</select>", fe(e, "officeKind")) +
      fld(p + "office", T("adm.sa_office"), input(p + "office", v.officeName, fe(e, "officeName"), { attrs: 'type="text" maxlength="160"' }), fe(e, "officeName")) +
      fld(p + "place", T("adm.sa_place_l"), input(p + "place", v.place, fe(e, "place"), { attrs: 'type="text" maxlength="160"' }), fe(e, "place")) +
      fld(p + "state", T("adm.sa_state"), '<select id="' + p + 'state"' + inv(p + "state", fe(e, "state")) + ">" + stateOpts(v.state, mine) + "</select>", fe(e, "state")) +
      fld(p + "cname", T("adm.sa_cname"), input(p + "cname", v.contactName, fe(e, "contactName"), { attrs: 'type="text" maxlength="80"' }), fe(e, "contactName")) +
      fld(p + "desig", T("adm.sa_desig"), input(p + "desig", v.designation, fe(e, "designation"), { attrs: 'type="text" maxlength="80"' }), fe(e, "designation")) +
      fld(p + "mobile", T("adm.sa_mobile"), input(p + "mobile", v.mobile, fe(e, "mobile"), { attrs: 'type="tel" inputmode="tel" maxlength="16"', hint: true }), fe(e, "mobile"), false, T("adm.sa_contact_hint")) +
      fld(p + "email", T("adm.sa_email"), input(p + "email", v.email, fe(e, "email"), { attrs: 'type="email" maxlength="120" spellcheck="false"' }), fe(e, "email")) + "</div>";
  }
  function readDetails(p) {
    return { officeKind: $(p + "kind").value, officeName: $(p + "office").value, place: $(p + "place").value, state: $(p + "state").value, contactName: $(p + "cname").value,
      designation: $(p + "desig").value, mobile: $(p + "mobile").value, email: $(p + "email").value };
  }
  var FOCUS = { officeKind: "kind", officeName: "office", place: "place", state: "state", contactName: "cname", designation: "desig", mobile: "mobile", email: "email", nextDate: "next", nextStep: "step", owner: "owner" };
  function addTab() {
    var v = S.add, e = S.addErr, p = "sa-a-";
    var h = '<form id="sa-add" class="hl-form" novalidate><h2 class="ac-sub" style="margin-top:0">' + esc(T("adm.sa_add_h")) + '</h2><p class="muted-note">' + esc(T("adm.sa_add_p")) + "</p>";
    if (e.mobile === "DUPLICATE") h += '<p class="ac-warn" role="alert">' + esc(T("adm.sa_dup", { ref: S.dupRef || "" })) + "</p>";
    h += detailsForm(v, e, p) + '<div class="grid">' +
      fld(p + "next", T("adm.sa_next_date"), input(p + "next", v.nextDate, fe(e, "nextDate"), { attrs: 'type="date" min="' + S.data.today + '"' }), fe(e, "nextDate")) +
      fld(p + "step", T("adm.sa_next_step"), input(p + "step", v.nextStep, fe(e, "nextStep"), { attrs: 'type="text" maxlength="160"' }), fe(e, "nextStep"));
    if (S.data.canManage) h += fld(p + "owner", T("adm.sa_owner"), '<select id="' + p + 'owner"><option value="">' + esc(T("adm.sa_nobody")) + '</option><option value="' + esc(S.data.me) + '"' + (v.owner === null || v.owner === S.data.me ? " selected" : "") + ">" + esc(T("adm.sa_you")) + "</option>" +
      (S.data.people || []).filter(function (x) { return x.email !== S.data.me; }).map(function (x) { return '<option value="' + esc(x.email) + '"' + (v.owner === x.email ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select>", "");
    return h + '</div><p class="muted-note">' + esc(T("adm.sa_rule")) + '</p><div class="acts"><button type="submit" class="primary"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.sa_add_btn")) + "</button>" +
      (e.mobile === "DUPLICATE" ? '<button type="button" id="sa-a-same">' + esc(T("adm.sa_dup_ok")) + "</button>" : "") + "</div></form>";
  }
  function totalsTab() {
    var t = S.data.totals; if (!t) return "";
    var card = function (k, v, vars) { return '<div class="ac-card"><div class="l">' + esc(T(k, vars)) + '</div><div class="v">' + esc(v) + "</div></div>"; };
    var h = '<h2 class="ac-sub" style="margin-top:0">' + esc(T("adm.sa_tot_stages")) + '</h2><div class="ac-cards">' + S.data.stages.map(function (s) { return card("adm.sa_st_" + s, t.stages[s] || 0); }).join("") + "</div>" +
      '<h2 class="ac-sub">' + esc(T("adm.sa_tot_month")) + '</h2><div class="ac-cards">' + card("adm.sa_tot_new", t.newMonth) + card("adm.sa_tot_won", t.wonMonth) + card("adm.sa_tot_lost", t.lostMonth) + card("adm.sa_tot_overdue", t.overdue) + card("adm.sa_tot_noowner", t.noOwner) + "</div>";
    var lr = Object.keys(t.lostReasons);
    h += '<h2 class="ac-sub">' + esc(T("adm.sa_tot_lost_h", { from: day(t.fyStart) })) + '</h2><div class="ac-table-wrap"><table class="ac-t"><thead><tr><th scope="col">' + esc(T("adm.sa_lost_reason")) + '</th><th scope="col" class="num">' + esc(T("adm.sa_tot_n")) + "</th></tr></thead><tbody>" +
      (lr.length ? lr.map(function (k) { return '<tr><td>' + esc(T("adm.sa_lr_" + k)) + '</td><td class="num">' + t.lostReasons[k] + "</td></tr>"; }).join("") : '<tr><td colspan="2" class="muted">' + esc(T("adm.sa_none")) + "</td></tr>") + "</tbody></table></div>";
    var kk = Object.keys(t.openByKind);
    h += '<h2 class="ac-sub">' + esc(T("adm.sa_tot_kind_h")) + '</h2><div class="ac-table-wrap"><table class="ac-t"><thead><tr><th scope="col">' + esc(T("adm.sa_kind")) + '</th><th scope="col" class="num">' + esc(T("adm.sa_tot_n")) + "</th></tr></thead><tbody>" +
      (kk.length ? kk.map(function (k) { return '<tr><td>' + esc(T("adm.sa_k_" + k)) + '</td><td class="num">' + t.openByKind[k] + "</td></tr>"; }).join("") : '<tr><td colspan="2" class="muted">' + esc(T("adm.sa_none")) + "</td></tr>") + "</tbody></table></div>";
    return h;
  }
  function territoriesTab() {
    var people = S.data.people || [];
    var h = '<h2 class="ac-sub" style="margin-top:0">' + esc(T("adm.sa_t_territories")) + '</h2><p class="muted-note">' + esc(T("adm.sa_terr_p")) + "</p>";
    if (!people.length) return h + '<p class="muted">' + esc(T("adm.sa_no_people")) + "</p>";
    return h + people.map(function (p, i) {
      var chosen = S.terr[p.email] || p.states;
      var head = esc(p.name) + (p.employeeId ? " (" + esc(p.employeeId) + ")" : "") + " · " + esc(T("adm.role_" + p.role)) + " · " + esc(p.states.length ? p.states.map(stateName).join(", ") : T("adm.sa_terr_none"));
      if (!S.data.canManage) return '<p class="sa-terr-ro">' + head + "</p>";
      return '<details class="hl-form" data-terr="' + i + '"><summary style="cursor:pointer;min-height:32px">' + head + '</summary><fieldset class="rad"><legend>' + esc(T("adm.sa_terr_pick", { who: p.name })) + '</legend><div class="sa-states">' +
        S.data.states.map(function (s) { var id = "sa-tr-" + i + "-" + s.code; return '<span class="chk"><input type="checkbox" id="' + id + '" value="' + s.code + '"' + (chosen.indexOf(s.code) >= 0 ? " checked" : "") + '><label for="' + id + '">' + esc(s.name) + "</label></span>"; }).join("") +
        '</div></fieldset><div class="acts"><button type="button" data-terr-save="' + i + '">' + esc(T("adm.sa_terr_save", { who: p.name })) + "</button></div></details>";
    }).join("");
  }

  function render() {
    var app = $("sa-app");
    if (S.err) { app.innerHTML = '<p class="st-msg error">' + esc(T(S.err)) + "</p>"; return; }
    var d = S.data; if (!d) return;
    if (!d.ready) { app.innerHTML = '<p class="ac-warn">' + esc(T("adm.sa_not_ready")) + "</p>"; return; }
    var h = '<p class="note">' + esc(T("adm.sa_rule")) + "</p>";
    if (d.totalsOnly) { app.innerHTML = h + '<p class="muted-note">' + esc(T("adm.sa_totals_only")) + "</p>" + totalsTab(); return; }
    if (d.auditor) h += '<p class="muted-note">' + esc(T("adm.sa_auditor")) + "</p>";
    if (d.canWork) h += tiles();
    h += tabs() + '<div id="sa-panel" role="tabpanel" aria-labelledby="sa-tab-' + S.tab + '" class="tabpanel">';
    h += S.tab === "add" ? addTab() : S.tab === "totals" ? totalsTab() : S.tab === "territories" ? territoriesTab() : leadsTab();
    app.innerHTML = h + "</div>";
    wire();
  }
  function setTab(t, focus) {
    S.tab = t; S.openId = null; S.det = null;
    try { localStorage.setItem("giq-sa-tab", t); } catch (e) {}
    render(); if (focus) { var b = $("sa-tab-" + t); if (b) b.focus(); }
  }
  function wire() {
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () { setTab(b.getAttribute("data-tab"), true); });
      b.addEventListener("keydown", function (e) {
        var list = TABS.filter(tabOk), i = list.indexOf(b.getAttribute("data-tab"));
        var n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : null;
        if (n === null) return; e.preventDefault(); setTab(list[(n + list.length) % list.length], true);
      });
    });
    document.querySelectorAll("[data-tile]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-tile");
        S.f = { stage: "OPEN", owner: k === "free" ? "NONE" : "ME", q: "", due: k === "due" || k === "overdue" };
        if (!S.data.canManage && k !== "free") S.f.owner = "";
        setTab("leads"); var c = $("sa-count"); if (c) { c.setAttribute("tabindex", "-1"); c.focus(); }
      });
    });
    var fs = $("sa-f-stage"); if (fs) fs.addEventListener("change", function () { S.f.stage = fs.value; render(); $("sa-f-stage").focus(); });
    var fo = $("sa-f-owner"); if (fo) fo.addEventListener("change", function () { S.f.owner = fo.value; render(); $("sa-f-owner").focus(); });
    var fq = $("sa-f-q"); if (fq) fq.addEventListener("input", function () { S.f.q = fq.value; var pos = fq.selectionStart; render(); var q2 = $("sa-f-q"); q2.focus(); try { q2.setSelectionRange(pos, pos); } catch (e) {} });
    var fd = $("sa-f-due"); if (fd) fd.addEventListener("change", function () { S.f.due = fd.checked; render(); $("sa-f-due").focus(); });
    document.querySelectorAll("[data-open]").forEach(function (b) { b.addEventListener("click", function () { S.stage = null; S.lostReason = null; S.stageNote = ""; S.logNote = ""; S.logNext = undefined; S.logStep = undefined; S.detOpen = false; openLead(b.getAttribute("data-open")); }); });
    var back = $("sa-back"); if (back) back.addEventListener("click", function () { var id = S.openId; S.openId = null; S.det = null; render(); var b = document.querySelector('[data-open="' + id + '"]'); if (b) b.focus(); });
    var take = $("sa-take"); if (take) take.addEventListener("click", function () { act({ action: "take", id: S.openId }, "adm.sa_done_take"); });
    var asg = $("sa-assign"); if (asg) asg.addEventListener("submit", function (e) { e.preventDefault(); act({ action: "assign", id: S.openId, owner: $("sa-as-owner").value }, "adm.sa_done_give"); });
    var lg = $("sa-log");
    if (lg) {
      lg.querySelectorAll('input[name="sa-lk"]').forEach(function (r) { r.addEventListener("change", function () { S.logKind = r.value; }); });
      $("sa-l-note").addEventListener("input", function (e) { S.logNote = e.target.value; });
      $("sa-l-next").addEventListener("change", function (e) { S.logNext = e.target.value; });
      $("sa-l-step").addEventListener("input", function (e) { S.logStep = e.target.value; });
      lg.addEventListener("submit", function (e) {
        e.preventDefault();
        act({ action: "log", id: S.openId, kind: S.logKind || "CALL", note: $("sa-l-note").value, nextDate: $("sa-l-next").value, nextStep: $("sa-l-step").value }, "adm.sa_done_log", { note: "sa-l-note", nextDate: "sa-l-next", nextStep: "sa-l-step", kind: "sa-lk-CALL" }, function () { S.logNote = ""; S.logNext = undefined; S.logStep = undefined; });
      });
    }
    var sf = $("sa-stage");
    if (sf) {
      $("sa-s-stage").addEventListener("change", function (e) { S.stage = e.target.value; render(); $("sa-s-stage").focus(); });
      var rs = $("sa-s-reason"); if (rs) rs.addEventListener("change", function (e) { S.lostReason = e.target.value; });
      $("sa-s-note").addEventListener("input", function (e) { S.stageNote = e.target.value; });
      sf.addEventListener("submit", function (e) {
        e.preventDefault();
        act({ action: "stage", id: S.openId, stage: $("sa-s-stage").value, lostReason: rs ? rs.value : "", note: $("sa-s-note").value }, "adm.sa_done_stage", { stage: "sa-s-stage", lostReason: "sa-s-reason", stageNote: "sa-s-note" }, function () { S.stage = null; S.stageNote = ""; }, { note: "stageNote" });
      });
    }
    var det = $("sa-det"); if (det) det.addEventListener("toggle", function () { S.detOpen = det.open; });
    var ds = $("sa-d-save"); if (ds) ds.addEventListener("click", function () {
      var focus = {}; Object.keys(FOCUS).forEach(function (k) { focus[k] = "sa-d-" + FOCUS[k]; });
      act(Object.assign({ action: "details", id: S.openId }, readDetails("sa-d-")), "adm.sa_done_details", focus);
    });
    var add = $("sa-add");
    if (add) {
      add.addEventListener("input", saveAdd); add.addEventListener("change", saveAdd);
      add.addEventListener("submit", function (e) { e.preventDefault(); create(false); });
      var same = $("sa-a-same"); if (same) same.addEventListener("click", function () { create(true); });
    }
    document.querySelectorAll("[data-terr-save]").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = +b.getAttribute("data-terr-save"), p = S.data.people[i];
        var states = Array.prototype.map.call(document.querySelectorAll('[data-terr="' + i + '"] input:checked'), function (x) { return x.value; });
        api({ action: "territory", email: p.email, states: states }).then(function (x) {
          if (!x.r.ok) { msg(errText(x.j), true); return; }
          return load().then(function () { msg(T("adm.sa_done_terr", { who: p.name })); });
        }).catch(function () { msg(T("adm.ss_e_net"), true); });
      });
    });
  }
  function saveAdd() {
    var v = readDetails("sa-a-");
    Object.assign(S.add, v, { nextDate: $("sa-a-next").value, nextStep: $("sa-a-step").value });
    var o = $("sa-a-owner"); if (o) S.add.owner = o.value;
  }
  function create(sameOk) {
    saveAdd(); S.busy = true;
    var body = Object.assign({ action: "create", sameOk: !!sameOk }, S.add);
    if (!S.data.canManage) delete body.owner; else if (body.owner === null) body.owner = S.data.me;
    api(body).then(function (x) {
      S.busy = false;
      if (x.r.status === 400 && x.j.fields) {
        S.addErr = x.j.fields; S.dupRef = x.j.ref || ""; render();
        var k = Object.keys(x.j.fields)[0]; var el = $("sa-a-" + (FOCUS[k] || "office")); if (el) el.focus();
        return;
      }
      if (!x.r.ok) { render(); msg(errText(x.j), true); return; }
      S.add = blankAdd(); S.addErr = {}; S.tab = "leads";
      return load().then(function () { return openLead(x.j.id); }).then(function () { msg(T("adm.sa_done_add", { ref: x.j.ref })); });
    }).catch(function () { S.busy = false; render(); msg(T("adm.ss_e_net"), true); });
  }
  // A change to the open lead. focusMap: field -> element id for errors.
  function act(body, okKey, focusMap, after, rename) {
    api(body).then(function (x) {
      if (x.r.status === 400 && x.j.fields) {
        var f = {}; Object.keys(x.j.fields).forEach(function (k) { f[(rename && rename[k]) || k] = x.j.fields[k]; });
        S.errs = f; render();
        var k = Object.keys(f)[0], el = focusMap && $(focusMap[k]); if (el) el.focus();
        return;
      }
      if (!x.r.ok) { msg(errText(x.j), true); return; }
      S.errs = {}; if (after) after();
      return load().then(function () { msg(T(okKey)); });
    }).catch(function () { msg(T("adm.ss_e_net"), true); });
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
