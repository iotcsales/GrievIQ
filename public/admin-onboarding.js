/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// Admin "Onboarding form" (grieviq-83): filled by sales staff when an office
// or a department office joins GrievIQ, one section at a time, on a phone.
// It saves itself; a sales manager who did not fill it checks it and sends
// it for setup (change requests for the office's contacts and localities,
// and a setup checklist). Also: a copy to print, and a blank form to print
// for places without a network. The questions come from the server
// (functions/_shared/onboarding.js), so page and server always agree.
(function () {
  "use strict";
  function T(k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; }
  function has(k) { var v = T(k); return v && v !== k; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function loc() { return window.GIQ && GIQ.locale ? GIQ.locale() : "en-IN"; }
  function day(s) { if (!s) return ""; var d = new Date(String(s).length === 10 ? s + "T00:00:00Z" : s); return isNaN(d) ? s : d.toLocaleDateString(loc(), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); }
  function when(s) { if (!s) return ""; var d = new Date(s); return isNaN(d) ? s : d.toLocaleString(loc(), { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); }
  function clock(d) { return d.toLocaleTimeString(loc(), { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); }

  var Q = new URLSearchParams(location.search);
  var S = {
    mode: Q.get("blank") ? "blank" : Q.get("lead") ? (Q.get("print") ? "print" : "form") : "queue",
    lead: Q.get("lead") || "", d: null, err: null, step: 0, a: {}, fields: {}, version: 0,
    saveState: "idle", savedAt: null, dirty: false, timer: null, retry: null, conflict: false, missingShown: false,
    pick: {}, results: {}, msg: null,
  };
  // Free text that looks like an ID, card or mobile number is refused by the
  // server too (functions/_shared/onboarding.js personalIn).
  var ID_LIKE = /(^|[^\d])\d(?:[\s-]?\d){11,18}(?!\d)/, PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/i, MOBILE = /(^|[^\d])(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?!\d)/;
  function personalIn(s) { s = String(s || ""); if (ID_LIKE.test(s) || PAN.test(s)) return "ID"; if (MOBILE.test(s)) return "MOBILE"; return null; }

  function msg(text, bad) { S.msg = text ? { text: text, bad: !!bad } : null; var m = $("ob-msg"); if (!m) return; m.innerHTML = text ? '<p class="st-msg ' + (bad ? "error" : "success") + '">' + esc(text) + "</p>" : ""; if (text) m.focus(); }
  function api(body) {
    return fetch("/api/admin/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); });
  }
  function errText(j) {
    var k = { CODE_NOT_ACCEPTED: "adm.sc_needed", LOCKED: "ob.e_locked", CHANGED: "ob.e_changed", OWN_FORM: "ob.e_own", NOT_FOUND: "adm.sa_e_gone", ERASED: "adm.sa_erased", INSUFFICIENT_ROLE: "adm.no_access" }[j.error];
    return T(k || "adm.ss_e_generic");
  }

  // ---- loading ----
  function load() {
    var url = S.mode === "blank" ? "/api/admin/onboarding?schema=" + (Q.get("blank") === "DEPARTMENT" ? "DEPARTMENT" : "OFFICE")
      : S.mode === "queue" ? "/api/admin/onboarding?queue=1" : "/api/admin/onboarding?lead=" + encodeURIComponent(S.lead);
    return fetch(url, { cache: "no-store" }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); }).then(function (x) {
      if (!x.r.ok) { S.err = x.j.error === "NOT_FOUND" ? "adm.sa_e_gone" : x.j.error === "INSUFFICIENT_ROLE" || x.j.error === "NOT_ADMIN" ? "adm.no_access" : "adm.ss_e_load"; render(); return; }
      S.d = x.j; S.err = null;
      if (S.mode === "form" || S.mode === "print") {
        S.a = x.j.form ? JSON.parse(JSON.stringify(x.j.form.answers || {})) : {};
        S.version = x.j.form ? x.j.form.version : 0;
        if (!x.j.form && x.j.can.edit) prefill();
        S.d.missingNow = x.j.missing || null;
        S.conflict = false;
      }
      render();
    }).catch(function () { S.err = "adm.ss_e_load"; render(); });
  }
  // A new form starts with what the lead already says.
  function prefill() {
    var l = S.d.lead;
    if (S.d.kind === "OFFICE") { if (l.state) S.a.o_state = l.state; S.a.o_title_area = l.officeName; }
    else { if (l.state) S.a.d_state = l.state; S.a.d_name = l.officeName; }
    S.a.v_date = S.d.today;
  }

  // ---- labels ----
  function secName(id) { return T("ob.s_" + id); }
  function lbl(k) { return T("ob.f_" + k); }
  function optName(k, o) {
    if (k === "x_reason") return T("adm.sa_lr_" + o);
    var key = "ob.o_" + k + "_" + o; if (has(key)) return T(key);
    return T("ob.o_" + o);
  }
  function fieldsOf(sec) { return S.d.fields.filter(function (f) { return f.s === sec; }); }
  function def(k) { return S.d.fields.find(function (f) { return f.k === k; }); }
  function stateName(c) { var s = (S.d.states || []).find(function (x) { return x.code === c; }); return s ? s.name : c; }
  function steps() { return S.d.sections.concat(["review"]); }
  function editable() { return !!(S.d && S.d.can && S.d.can.edit) && !S.conflict; }
  function reqWhen(f) {
    var o = S.a.x_outcome;
    var signed = o === "SIGNED_PILOT" || o === "SIGNED_PAID";
    return f.req === true || (f.req === "signed" && signed) || (f.req === "declined" && o === "DECLINED") || (f.req === "later" && (o === "FOLLOW_UP" || o === "NOT_NOW"));
  }

  // ---- field errors (from the server) and warnings (as typed) ----
  function errFor(path) {
    var c = S.fields[path]; if (!c) return "";
    return T("ob.e_" + c);
  }
  function describe(id, hint, err) { var d = [hint ? id + "-h" : "", err ? id + "-e" : ""].filter(Boolean).join(" "); return (err ? ' aria-invalid="true"' : "") + (d ? ' aria-describedby="' + d + '"' : ""); }

  // ---- one field ----
  function control(f, id, val, path, ro) {
    var err = errFor(path), hintKey = "ob.h_" + f.k, hint = has(hintKey) ? T(hintKey) : "";
    var dis = ro ? " disabled" : "";
    var req = reqWhen(f) ? ' <span class="req">' + esc(T("ob.required")) + "</span>" : "";
    var head = '<label for="' + id + '">' + esc(lbl(f.k)) + req + "</label>" + (hint ? '<span class="hint" id="' + id + '-h">' + esc(hint) + "</span>" : "");
    var tail = err ? '<span class="ferr" id="' + id + '-e">' + esc(err) + "</span>" : "";
    var t = f.t, v = val == null ? "" : val, h;
    if (t === "text" || t === "gstin" || t === "pins") h = '<input type="text" id="' + id + '" data-p="' + esc(path) + '" maxlength="' + (t === "gstin" ? 15 : (f.max || 300)) + '" value="' + esc(v) + '"' + (t === "pins" ? ' inputmode="numeric"' : "") + (t === "gstin" ? ' autocapitalize="characters" spellcheck="false"' : "") + describe(id, hint, err) + dis + ">";
    else if (t === "area") h = '<textarea id="' + id + '" data-p="' + esc(path) + '" maxlength="' + (f.max || 300) + '" rows="3"' + describe(id, hint, err) + dis + ">" + esc(v) + "</textarea>";
    else if (t === "int") h = '<input type="number" id="' + id + '" data-p="' + esc(path) + '" inputmode="numeric" min="' + (f.min || 0) + '" max="' + (f.maxN || 100000) + '" step="1" value="' + esc(v) + '"' + describe(id, hint, err) + dis + ">";
    else if (t === "date") h = '<input type="date" id="' + id + '" data-p="' + esc(path) + '" value="' + esc(v) + '"' + describe(id, hint, err) + dis + ">";
    else if (t === "email") h = '<input type="email" id="' + id + '" data-p="' + esc(path) + '" maxlength="120" spellcheck="false" autocapitalize="off" value="' + esc(v) + '"' + describe(id, hint, err) + dis + ">";
    else if (t === "phone") h = '<input type="tel" id="' + id + '" data-p="' + esc(path) + '" inputmode="tel" maxlength="20" value="' + esc(v) + '"' + describe(id, hint, err) + dis + ">";
    else if (t === "state") h = '<select id="' + id + '" data-p="' + esc(path) + '"' + describe(id, hint, err) + dis + '><option value="">' + esc(T("adm.sa_state_pick")) + "</option>" + S.d.states.map(function (s) { return '<option value="' + s.code + '"' + (s.code === v ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select>";
    else if (t === "enum" && f.opts.length > 5) h = '<select id="' + id + '" data-p="' + esc(path) + '"' + describe(id, hint, err) + dis + '><option value="">' + esc(T("adm.sa_pick")) + "</option>" + f.opts.map(function (o) { return '<option value="' + o + '"' + (o === v ? " selected" : "") + ">" + esc(optName(f.k, o)) + "</option>"; }).join("") + "</select>";
    else if (t === "enum" || t === "multi") {
      var multi = t === "multi", list = multi ? (v || []) : [v];
      return '<fieldset class="rad ob-fs" id="' + id + '"' + describe(id, hint, err) + "><legend>" + esc(lbl(f.k)) + req + "</legend>" + (hint ? '<span class="hint" id="' + id + '-h">' + esc(hint) + "</span>" : "") + '<div class="ob-opts">' +
        f.opts.map(function (o, i) {
          var oid = id + "-" + i;
          return '<span class="ropt"><input type="' + (multi ? "checkbox" : "radio") + '" name="' + id + '" id="' + oid + '" value="' + o + '" data-p="' + esc(path) + '" data-t="' + t + '"' + (list.indexOf(o) >= 0 ? " checked" : "") + dis + '><label for="' + oid + '">' + esc(optName(f.k, o)) + "</label></span>";
        }).join("") + "</div>" + tail + "</fieldset>";
    }
    else if (t === "bool") return '<div class="chk ob-chk"><input type="checkbox" id="' + id + '" data-p="' + esc(path) + '" data-t="bool"' + (v === true ? " checked" : "") + describe(id, hint, err) + dis + '><label for="' + id + '">' + esc(lbl(f.k)) + req + "</label>" + (hint ? '<span class="hint" id="' + id + '-h">' + esc(hint) + "</span>" : "") + tail + "</div>";
    else if (t === "office") return picker(f, id, v, path, ro, head, tail);
    var warn = (t === "text" || t === "area") && personalIn(v) && !err ? '<span class="ob-warn" id="' + id + '-w" role="alert">' + esc(T("ob.warn_" + personalIn(v))) + "</span>" : "";
    return '<div class="fld' + (t === "area" ? " wide" : "") + '">' + head + h + warn + tail + "</div>";
  }
  // A GrievIQ record (the office, or a ward): search, pick, change.
  function picker(f, id, v, path, ro, head, tail) {
    var type = path.indexOf("loc_rows") === 0 ? "ward" : (S.d.officeType || "ward");
    var h = '<div class="fld wide ob-picker">' + head;
    if (v && v.id) {
      h += '<p class="ob-picked" id="' + id + '"><span class="sa-badge">' + esc(T("ob.picked")) + "</span> " + esc(v.label) + "</p>" + (ro ? "" : '<div class="acts"><button type="button" data-unpick="' + esc(path) + '">' + esc(T("ob.pick_change")) + "</button></div>");
      return h + tail + "</div>";
    }
    if (ro) return h + '<p class="muted" id="' + id + '">' + esc(T("ob.not_picked")) + "</p>" + tail + "</div>";
    var res = S.results[path];
    h += '<input type="search" id="' + id + '" data-find="' + esc(path) + '" data-type="' + type + '" maxlength="60" autocomplete="off" value="' + esc(S.pick[path] || "") + '" aria-describedby="' + id + '-r">' +
      '<div id="' + id + '-r" class="ob-results" role="status">' + (res ? (res.length ? '<ul class="ob-list">' + res.map(function (o, i) { return '<li><button type="button" data-pick="' + esc(path) + '" data-i="' + i + '">' + esc(o.label) + "</button></li>"; }).join("") + "</ul>" : '<span class="muted">' + esc(T("ob.find_none")) + "</span>") : "") + "</div>";
    return h + tail + "</div>";
  }
  function rowsBlock(f, ro) {
    var rows = S.a[f.k] || [], h = '<div class="ob-rows" id="ob-' + f.k + '">';
    var err = errFor(f.k);
    if (!rows.length) h += '<p class="muted">' + esc(T("ob.rows_none_" + f.k)) + "</p>";
    rows.forEach(function (r, i) {
      var rowErr = S.missingShown && (S.d.missingNow || []).some(function (m) { return m.k === f.k + "." + i; });
      h += '<fieldset class="card ob-row' + (rowErr ? " ob-row-bad" : "") + '" id="ob-' + f.k + "-" + i + '"><legend>' + esc(T("ob.row_" + f.k, { n: i + 1 })) + "</legend>" + (rowErr ? '<p class="ferr">' + esc(T("ob.row_incomplete_" + f.k)) + "</p>" : "") + '<div class="grid">' +
        f.cols.map(function (c) { return control(Object.assign({}, c, { k: f.k + "_" + c.k }), "ob-" + f.k + "-" + i + "-" + c.k, r[c.k], f.k + "." + i + "." + c.k, ro); }).join("") + "</div>" +
        (ro ? "" : '<div class="acts"><button type="button" class="danger" data-delrow="' + f.k + '" data-i="' + i + '">' + esc(T("ob.row_remove_" + f.k, { n: i + 1 })) + "</button></div>") + "</fieldset>";
    });
    if (!ro) {
      h += '<div class="acts"><button type="button" data-addrow="' + f.k + '"' + (rows.length >= f.maxRows ? " disabled" : "") + ">" + esc(T("ob.row_add_" + f.k)) + "</button>";
      var ownIn = S.a.o_record && S.a.o_record.type === "ward" && rows.some(function (r) { return r.unit && r.unit.id === S.a.o_record.id; });
      if (f.k === "loc_rows" && S.a.o_record && S.a.o_record.id && S.d.kind === "OFFICE" && !ownIn) h += '<button type="button" id="ob-add-units">' + esc(T(S.a.o_record.type === "ward" ? "ob.add_own_ward" : "ob.add_all_wards")) + "</button>";
      h += "</div>";
    }
    return h + (err ? '<p class="ferr">' + esc(err) + "</p>" : "") + "</div>";
  }
  function sectionHtml(sec, ro) {
    var intro = has("ob.i_" + sec) ? '<p class="note">' + esc(T("ob.i_" + sec)) + "</p>" : "";
    var plain = [], h = "";
    fieldsOf(sec).forEach(function (f) {
      if (f.t === "rows") { if (plain.length) { h += '<div class="grid">' + plain.join("") + "</div>"; plain = []; } h += '<h3 class="sub-h">' + esc(lbl(f.k)) + "</h3>" + rowsBlock(f, ro); return; }
      if (sec === "plan" && (f.k === "p_pilot_start" || f.k === "p_pilot_end") && S.a.p_start !== "PILOT") return;
      if (sec === "outcome" && (f.k === "x_reason" || f.k === "x_reason_words") && S.a.x_outcome !== "DECLINED") return;
      if (sec === "outcome" && (f.k === "x_next_step" || f.k === "x_next_date") && ["FOLLOW_UP", "NOT_NOW"].indexOf(S.a.x_outcome) < 0) return;
      if (sec === "office" && f.k === "o_seat" && !(S.a.o_record && S.a.o_record.type === "ward")) return;
      plain.push(control(f, "ob-" + f.k, S.a[f.k], f.k, ro));
    });
    if (plain.length) h += '<div class="grid">' + plain.join("") + "</div>";
    return intro + h;
  }

  // ---- the form, a section at a time ----
  function stepNav() {
    var st = steps();
    var wide = window.matchMedia && window.matchMedia("(min-width: 700px)").matches;
    return '<details class="ob-steps-d"' + (wide || S.navOpen ? " open" : "") + ' id="ob-steps-d"><summary>' + esc(T("ob.steps_all")) + '</summary><nav class="ob-steps" aria-label="' + esc(T("ob.steps")) + '"><ol>' + st.map(function (s, i) {
      return '<li><button type="button" data-step="' + i + '"' + (i === S.step ? ' aria-current="step"' : "") + ">" + (i + 1) + ". " + esc(s === "review" ? T("ob.s_review") : secName(s)) + "</button></li>";
    }).join("") + "</ol></nav></details>";
  }
  function saveLine() {
    if (!editable()) return "";
    var t = S.saveState === "saving" ? T("ob.saving") : S.saveState === "offline" ? "" : S.saveState === "error" ? T("ob.save_failed") : S.savedAt ? T("ob.saved_at", { t: clock(S.savedAt) }) : S.d.form ? T("ob.saved_before") : T("ob.not_started");
    var h = '<p class="ob-save" id="ob-save" role="status">' + esc(t) + "</p>";
    if (S.saveState === "offline") h += '<div class="ob-offline" role="alert" id="ob-offline"><b>' + esc(T("ob.offline_h")) + "</b> " + esc(T("ob.offline")) + '</div>';
    return h;
  }
  function header() {
    var d = S.d, l = d.lead, f = d.form;
    var h = '<div class="acts"><a class="btnlink" href="/admin-sales.html#lead=' + encodeURIComponent(l.id) + '">' + esc(T("ob.back_lead")) + "</a>" +
      (f ? '<a class="btnlink" href="/admin-onboarding.html?lead=' + encodeURIComponent(l.id) + '&print=1">' + esc(T("ob.print_copy")) + "</a>" : "") +
      '<a class="btnlink" href="/admin-onboarding.html?blank=' + d.kind + '">' + esc(T("ob.print_blank")) + "</a></div>";
    h += '<h1 id="ob-h" tabindex="-1">' + esc(T("ob.title")) + '</h1><p class="subtitle"><span class="sa-ref">' + esc(l.ref) + "</span> · " + esc(l.officeName) + " · " + esc(T("adm.sa_k_" + l.officeKind)) +
      ' <span class="sa-badge">' + esc(T("ob.st_" + (f ? f.status : "NEW"))) + "</span></p>";
    if (d.auditor) h += '<p class="muted-note">' + esc(T("ob.auditor")) + "</p>";
    if (l.erased || (f && f.erased)) h += '<p class="ac-warn">' + esc(T("ob.erased")) + "</p>";
    if (f && f.status === "RETURNED" && f.returnNote) h += '<div class="ac-warn" role="note"><b>' + esc(T("ob.returned_h")) + "</b> " + esc(f.returnNote) + "</div>";
    if (S.conflict) h += '<div class="ob-offline" role="alert"><b>' + esc(T("ob.conflict_h")) + "</b> " + esc(T("ob.conflict")) + ' <button type="button" id="ob-reload">' + esc(T("ob.reload")) + "</button></div>";
    h += '<div class="note ob-rule">' + esc(T("ob.never")) + "</div>";
    return h;
  }
  function formView() {
    var st = steps(), cur = st[S.step], last = S.step === st.length - 1;
    var h = header() + saveLine() + '<p class="ob-progress-l" id="ob-progress-l">' + esc(T("ob.step_of", { n: S.step + 1, of: st.length, name: cur === "review" ? T("ob.s_review") : secName(cur) })) + "</p>" +
      '<progress class="ob-progress" max="' + st.length + '" value="' + (S.step + 1) + '" aria-labelledby="ob-progress-l"></progress>' + stepNav();
    h += '<section class="panel ob-sec" aria-labelledby="ob-sec-h"><h2 id="ob-sec-h" tabindex="-1">' + esc(cur === "review" ? T("ob.s_review") : secName(cur)) + "</h2>";
    h += cur === "review" ? reviewHtml() : sectionHtml(cur, !editable());
    h += '<div class="acts ob-nav">' + (S.step > 0 ? '<button type="button" id="ob-prev">' + esc(T("ob.prev")) + "</button>" : "") +
      (!last ? '<button type="button" class="primary" id="ob-next">' + esc(T("ob.next")) + "</button>" : "") + "</div></section>";
    return h;
  }
  function missingNow() { return S.d.missingNow || []; }
  function reviewHtml() {
    var miss = missingNow(), h = "";
    if (!S.d.form) h += '<p class="muted-note">' + esc(T("ob.fill_first")) + "</p>";
    else if (miss.length) {
      h += '<div class="ss-errors" id="ob-missing" tabindex="-1"><h3 class="sub-h">' + esc(T("ob.missing_h", { n: miss.length })) + "</h3><ul>" + miss.map(function (m) {
        var base = m.k.split(".")[0], f = def(base) || {}, sec = f.s;
        var text = m.k.indexOf(".") > 0 ? T("ob.row_incomplete_" + base) + " (" + T("ob.row_" + base, { n: +m.k.split(".")[1] + 1 }) + ")" : lbl(base) + ": " + T("ob.why_" + m.why);
        return '<li><a href="#" data-goto="' + esc(sec) + '" data-focus="' + esc(m.k) + '">' + esc(secName(sec)) + " · " + esc(text) + "</a></li>";
      }).join("") + "</ul></div>";
    } else h += '<p class="st-msg success">' + esc(T("ob.ready_submit")) + "</p>";
    if (S.saveState === "offline" || S.dirty) h += '<p class="muted-note">' + esc(T("ob.wait_save")) + "</p>";
    h += '<p class="muted-note">' + esc(T("ob.submit_what")) + "</p>";
    h += '<div class="acts"><button type="button" class="primary" id="ob-submit"' + (!editable() || miss.length || S.dirty || S.saveState === "offline" || !S.d.form ? " disabled" : "") + ">" + esc(T("ob.submit")) + "</button></div>";
    return h;
  }

  // ---- read-only: the whole form, for checking, setup and printing ----
  function answerText(f, v) {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "";
    if (f.t === "enum") return optName(f.k, v);
    if (f.t === "multi") return v.map(function (o) { return optName(f.k, o); }).join(", ");
    if (f.t === "bool") return v ? T("ob.yes") : "";
    if (f.t === "state") return stateName(v);
    if (f.t === "date") return day(v);
    if (f.t === "office") return v.label || "";
    return String(v);
  }
  function summaryHtml(blank) {
    return S.d.sections.map(function (sec) {
      var h = '<section class="ob-print-sec"><h2>' + esc(secName(sec)) + "</h2>", plain = [];
      var flush = function () { if (plain.length) { h += '<table class="ac-t ob-qa"><thead><tr><th scope="col">' + esc(T("ob.q")) + '</th><th scope="col">' + esc(T("ob.ans")) + "</th></tr></thead><tbody>" + plain.join("") + "</tbody></table>"; plain = []; } };
      fieldsOf(sec).forEach(function (f) {
        if (f.t === "rows") {
          flush();
          var rows = blank ? [{}, {}, {}, {}] : (S.a[f.k] || []);
          h += '<h3 class="sub-h">' + esc(lbl(f.k)) + '</h3><div class="ac-table-wrap"><table class="ac-t ob-grid"><thead><tr>' + f.cols.map(function (c) { return '<th scope="col">' + esc(lbl(f.k + "_" + c.k)) + "</th>"; }).join("") + "</tr></thead><tbody>" +
            (rows.length ? rows.map(function (r) { return "<tr>" + f.cols.map(function (c) { return "<td>" + (blank ? "&nbsp;" : esc(answerText(Object.assign({}, c, { k: f.k + "_" + c.k }), r[c.k]))) + "</td>"; }).join("") + "</tr>"; }).join("")
              : '<tr><td colspan="' + f.cols.length + '" class="muted">' + esc(T("ob.none_given")) + "</td></tr>") + "</tbody></table></div>";
          return;
        }
        var shown = blank ? (f.t === "bool" ? "☐" : f.t === "enum" || f.t === "multi" ? f.opts.map(function (o) { return "☐ " + optName(f.k, o); }).join("   ") : "") : answerText(f, S.a[f.k]);
        if (!blank && !shown) shown = "";
        plain.push('<tr><th scope="row">' + esc(lbl(f.k)) + "</th><td>" + (shown ? esc(shown) : blank ? "&nbsp;" : '<span class="muted">—</span>') + "</td></tr>");
      });
      flush();
      return h + "</section>";
    }).join("");
  }
  function signOff() {
    return '<section class="ob-print-sec"><h2>' + esc(T("ob.sign_h")) + '</h2><table class="ac-t ob-sign"><thead><tr><th scope="col"><span class="sr-only">' + esc(T("ob.sign_who")) + '</span></th><th scope="col">' + esc(T("ob.sign_name")) + '</th><th scope="col">' + esc(T("ob.sign_sig")) + '</th><th scope="col">' + esc(T("ob.sign_date")) + "</th></tr></thead><tbody>" +
      ["ob.sign_sales", "ob.sign_office", "ob.sign_manager"].map(function (k) { return '<tr><th scope="row">' + esc(T(k)) + "</th><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>"; }).join("") + "</tbody></table></section>";
  }
  function banner() {
    return '<div class="ob-banner"><span class="ob-logo" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M34.3 11.7A16 16 0 1 0 40 25H33"/><path d="M12.7 35.3 8 43l9.2-4.5z" fill="#fff"/><path d="M20 22l6 6 15-17" stroke="#E8B631"/></svg></span><span><b>GrievIQ</b><br><span class="ob-tag">' + esc(T("ob.tagline")) + '</span></span><span class="ob-site">grieviq.in</span></div>';
  }
  function printView(blank) {
    var d = S.d, l = d.lead || null, f = d.form || null;
    var h = '<div class="acts no-print">' + (l ? '<a class="btnlink" href="/admin-onboarding.html?lead=' + encodeURIComponent(l.id) + '">' + esc(T("ob.back_form")) + "</a>" : '<a class="btnlink" href="/admin-sales.html">' + esc(T("ob.back_sales")) + "</a>") +
      '<button type="button" class="primary" id="ob-print">' + esc(T("ob.print")) + "</button></div>" + banner();
    h += '<h1 id="ob-h" tabindex="-1">' + esc(T(blank ? (d.kind === "DEPARTMENT" ? "ob.blank_title_d" : "ob.blank_title_o") : "ob.title")) + "</h1>";
    if (l) h += '<p class="subtitle">' + esc(l.ref) + " · " + esc(l.officeName) + " · " + esc(T("adm.sa_k_" + l.officeKind)) + (f ? " · " + esc(T("ob.st_" + f.status)) + " · " + esc(T("ob.printed_on", { d: day(d.today) })) : "") + "</p>";
    else h += '<p class="subtitle">' + esc(T("ob.blank_sub")) + "</p>";
    h += '<div class="note ob-rule">' + esc(T("ob.never")) + "</div>" + summaryHtml(blank) + signOff();
    return h;
  }
  function eventsHtml() {
    var ev = S.d.events || []; if (!ev.length) return "";
    return '<h3 class="sub-h">' + esc(T("ob.history")) + '</h3><ol class="hl-ev" reversed>' + ev.map(function (e) {
      var what = e.kind === "TASK_DONE" || e.kind === "TASK_UNDONE" ? T("ob.ev_" + e.kind, { task: T("ob.task_" + e.note) }) : e.kind === "SUBMITTED" ? T("ob.ev_SUBMITTED", { outcome: e.note ? T("ob.o_x_outcome_" + e.note) : "" }) : e.kind === "SENT" ? T("ob.ev_SENT", { n: e.note || 0 }) : T("ob.ev_" + e.kind);
      return "<li><b>" + esc(what) + "</b>" + (e.kind === "RETURNED" && e.note ? ": " + esc(e.note) : "") + ' <span class="muted">· ' + esc(when(e.at)) + " · " + esc(e.by === "system" ? T("adm.sa_system") : e.by) + "</span></li>";
    }).join("") + "</ol>";
  }
  var TASK_LINK = { PILOT: "/admin-subscriptions.html", PLAN: "/admin-subscriptions.html", DEPT_OFFICE: "/admin-departments.html", AGREEMENT: "/admin-departments.html", OFFICERS: "/admin-departments.html" };
  function setupHtml() {
    var d = S.d, f = d.form;
    var h = '<section class="panel" aria-labelledby="ob-setup-h"><h2 id="ob-setup-h">' + esc(T("ob.setup_h")) + "</h2>";
    h += '<h3 class="sub-h">' + esc(T("ob.changes_h")) + "</h3>";
    h += d.changes.length ? '<ul class="hl-ev">' + d.changes.map(function (c) { return "<li>" + esc(c.label) + ' · <span class="sa-badge">' + esc(T("adm.c_st_" + c.status)) + "</span>" + (c.note ? ' <span class="muted">' + esc(c.note) + "</span>" : "") + "</li>"; }).join("") + '</ul><p><a href="/admin-change-requests.html">' + esc(T("ob.changes_open")) + "</a></p>" : '<p class="muted">' + esc(T("ob.changes_none")) + "</p>";
    if (f.setupNotes.length) h += '<h3 class="sub-h">' + esc(T("ob.by_hand_h")) + '</h3><ul class="hl-ev">' + f.setupNotes.map(function (n) { return "<li>" + esc(T("ob.what_" + n.what.kind, { label: n.what.label })) + " — " + esc(T("ob.why_note_" + n.why)) + "</li>"; }).join("") + "</ul>";
    h += '<h3 class="sub-h">' + esc(T("ob.checklist_h")) + '</h3><div class="ob-tasks">' + f.checklist.map(function (t) {
      var id = "ob-task-" + t.k;
      return '<div class="chk"><input type="checkbox" id="' + id + '" data-task="' + t.k + '"' + (t.done ? " checked" : "") + (d.can.tick ? "" : " disabled") + '><label for="' + id + '">' + esc(T("ob.task_" + t.k)) + "</label>" +
        '<span class="hint">' + esc(T("ob.task_how_" + t.k)) + (TASK_LINK[t.k] ? ' <a href="' + TASK_LINK[t.k] + '">' + esc(T("ob.task_open")) + "</a>" : "") + (t.done ? " · " + esc(T("ob.task_done_by", { who: t.done.by, when: when(t.done.at) })) : "") + "</span></div>";
    }).join("") + "</div>";
    if (d.kind === "OFFICE" && (S.a.team_rows || []).length) h += '<p class="muted-note">' + esc(T("ob.team_note")) + "</p>";
    return h + "</section>";
  }
  function lockedView() {
    var d = S.d, f = d.form;
    var h = header();
    if (d.can.check) {
      var signed = f.outcome === "SIGNED_PILOT" || f.outcome === "SIGNED_PAID";
      h += '<section class="panel" aria-labelledby="ob-check-h"><h2 id="ob-check-h">' + esc(T("ob.check_h")) + "</h2><p>" + esc(T(signed ? "ob.check_p_signed" : "ob.check_p_other", { who: f.submittedBy, when: when(f.submittedAt) })) + "</p>" +
        '<div class="acts"><button type="button" class="primary" id="ob-check">' + esc(T(signed ? "ob.check_send" : "ob.check_close")) + "</button></div>" +
        '<form id="ob-return" class="hl-form" novalidate><div class="fld"><label for="ob-return-note">' + esc(T("ob.return_note")) + '</label><span class="hint" id="ob-return-note-h">' + esc(T("ob.return_hint")) + "</span><textarea id=\"ob-return-note\" maxlength=\"300\" rows=\"2\" aria-describedby=\"ob-return-note-h" + (S.retErr ? " ob-return-note-e" : "") + '"' + (S.retErr ? ' aria-invalid="true"' : "") + ">" + esc(S.retNote || "") + "</textarea>" +
        (S.retErr ? '<span class="ferr" id="ob-return-note-e">' + esc(T("ob.e_note")) + "</span>" : "") + '</div><div class="acts"><button type="submit">' + esc(T("ob.return_btn")) + "</button></div></form></section>";
    } else if (d.can.checkBlockedOwn) h += '<p class="ac-warn">' + esc(T("ob.check_own")) + "</p>";
    else if (f.status === "SUBMITTED") h += '<p class="muted-note">' + esc(T("ob.waiting_check", { when: when(f.submittedAt) })) + "</p>";
    if (f.status === "CHECKED") h += '<p class="st-msg success">' + esc(T("ob.checked_line", { who: f.checkedBy, when: when(f.checkedAt) })) + "</p>";
    if (f.status === "SENT") h += '<p class="st-msg success">' + esc(T("ob.sent_line", { who: f.checkedBy, when: when(f.checkedAt) })) + "</p>" + setupHtml();
    h += '<section class="panel"><h2 class="sub-h">' + esc(T("ob.answers_h")) + "</h2>" + summaryHtml(false) + "</section>" + eventsHtml();
    return h;
  }
  function queueView() {
    var d = S.d;
    var h = '<div class="acts"><a class="btnlink" href="/admin-sales.html">' + esc(T("ob.back_sales")) + '</a><a class="btnlink" href="/admin-onboarding.html?blank=OFFICE">' + esc(T("ob.print_blank_o")) + '</a><a class="btnlink" href="/admin-onboarding.html?blank=DEPARTMENT">' + esc(T("ob.print_blank_d")) + "</a></div>" +
      '<h1 id="ob-h" tabindex="-1">' + esc(T("ob.queue_h")) + '</h1><p class="subtitle">' + esc(T("ob.queue_sub")) + "</p>";
    if (!d.forms.length) return h + '<p class="muted">' + esc(T("ob.queue_none")) + "</p>";
    return h + '<div class="ac-table-wrap"><table class="ac-t"><caption class="sr-only">' + esc(T("ob.queue_h")) + '</caption><thead><tr><th scope="col">' + esc(T("adm.sa_c_lead")) + '</th><th scope="col">' + esc(T("ob.f_x_outcome")) + '</th><th scope="col">' + esc(T("ob.q_by")) + '</th><th scope="col"><span class="sr-only">' + esc(T("adm.sa_c_open")) + "</span></th></tr></thead><tbody>" +
      d.forms.map(function (f) {
        return '<tr><th scope="row"><span class="sa-ref">' + esc(f.ref) + "</span><br>" + esc(f.officeName) + "</th><td>" + esc(f.outcome ? T("ob.o_x_outcome_" + f.outcome) : "—") + "</td><td>" + esc(f.submittedBy) + '<br><span class="muted">' + esc(when(f.submittedAt)) + "</span>" + (f.mine ? '<br><span class="sa-badge">' + esc(T("ob.q_yours")) + "</span>" : "") + "</td>" +
          '<td><a class="btnlink" href="/admin-onboarding.html?lead=' + encodeURIComponent(f.lead) + '" aria-label="' + esc(T("ob.q_open", { ref: f.ref })) + '">' + esc(T("adm.sa_c_open")) + "</a></td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function render() {
    var app = $("ob-app");
    if (S.err) { app.innerHTML = '<p class="st-msg error">' + esc(T(S.err)) + '</p><p><a href="/admin-sales.html">' + esc(T("ob.back_sales")) + "</a></p>"; return; }
    var d = S.d; if (!d) return;
    if (!d.ready) { app.innerHTML = '<p class="ac-warn">' + esc(T("ob.not_ready")) + "</p>"; return; }
    var active = document.activeElement && document.activeElement.id, pos = null;
    try { if (active && document.activeElement.selectionStart != null) pos = document.activeElement.selectionStart; } catch (e) {}
    var h;
    if (S.mode === "queue") h = queueView();
    else if (S.mode === "blank") h = printView(true);
    else if (S.mode === "print") h = printView(false);
    else if (d.form && ["SUBMITTED", "CHECKED", "SENT"].indexOf(d.form.status) >= 0) h = lockedView();
    else if (!d.can.edit && !d.form) h = header() + '<p class="muted">' + esc(T("ob.none_yet")) + "</p>";
    else if (!d.can.edit) h = lockedView();
    else h = formView();
    app.innerHTML = '<div id="ob-msg" class="hl-msg" role="status" aria-live="polite" tabindex="-1">' + (S.msg ? '<p class="st-msg ' + (S.msg.bad ? "error" : "success") + '">' + esc(S.msg.text) + "</p>" : "") + "</div>" + h;
    document.title = T("ob.page_title");
    wire();
    if (active && $(active)) { var el = $(active); el.focus(); if (pos != null) try { el.setSelectionRange(pos, pos); } catch (e) {} }
  }

  // ---- answers ----
  function setPath(path, value) {
    var p = path.split(".");
    if (p.length === 1) { if (value == null || value === "" || (Array.isArray(value) && !value.length)) delete S.a[p[0]]; else S.a[p[0]] = value; return; }
    var rows = S.a[p[0]] = S.a[p[0]] || [], row = rows[+p[1]] = rows[+p[1]] || {};
    if (value == null || value === "") delete row[p[2]]; else row[p[2]] = value;
  }
  function getPath(path) { var p = path.split("."); if (p.length === 1) return S.a[p[0]]; var r = (S.a[p[0]] || [])[+p[1]]; return r ? r[p[2]] : null; }
  function changed(rerender) {
    S.dirty = true; S.saveState = "pending";
    clearTimeout(S.timer); S.timer = setTimeout(save, 1200);
    if (rerender) render();
    else { var sv = $("ob-save"); if (sv) sv.textContent = T("ob.unsaved"); }
  }
  function save() {
    clearTimeout(S.timer);
    if (!S.dirty || !editable() || S.saving) return Promise.resolve();
    S.saving = true; S.saveState = "saving"; var sv = $("ob-save"); if (sv) sv.textContent = T("ob.saving");
    var sent = JSON.stringify(S.a);
    return api({ action: "save", lead: S.lead, version: S.version, answers: JSON.parse(sent) }).then(function (x) {
      S.saving = false;
      if (x.r.status === 409 && x.j.error === "CHANGED") { S.conflict = true; S.saveState = "error"; render(); return; }
      if (!x.r.ok) { S.saveState = "error"; render(); msg(errText(x.j), true); return; }
      S.version = x.j.version; S.fields = x.j.fields || {}; S.d.missingNow = x.j.missing || [];
      if (!S.d.form) S.d.form = { status: "DRAFT", answers: {}, version: S.version, editors: [S.d.me], checklist: [], setupNotes: [] };
      S.d.can.submit = true;
      S.dirty = JSON.stringify(S.a) !== sent; S.saveState = S.dirty ? "pending" : "saved"; S.savedAt = new Date();
      clearInterval(S.retry); S.retry = null;
      var hadErr = Object.keys(S.fields).length;
      if (S.dirty) { clearTimeout(S.timer); S.timer = setTimeout(save, 800); }
      render();
      if (hadErr && !S.errAnnounced) { S.errAnnounced = true; msg(T("ob.some_refused"), true); }
      if (!hadErr) S.errAnnounced = false;
    }).catch(function () {
      S.saving = false; S.saveState = "offline"; render();
      if (!S.retry) S.retry = setInterval(function () { if (navigator.onLine !== false) save(); }, 15000);
    });
  }
  window.addEventListener("online", function () { if (S.saveState === "offline") save(); });
  window.addEventListener("beforeunload", function (e) { if (S.dirty && editable()) { e.preventDefault(); e.returnValue = ""; } });

  function readControl(el) {
    var t = el.getAttribute("data-t"), path = el.getAttribute("data-p");
    if (t === "bool") return el.checked ? true : null;
    if (t === "multi") return Array.prototype.map.call(document.querySelectorAll('input[name="' + el.name + '"]:checked'), function (x) { return x.value; });
    if (el.type === "radio") return el.checked ? el.value : getPath(path);
    if (el.type === "number") return el.value === "" ? null : el.value;
    return el.value;
  }
  function goStep(i, focusId) {
    save();
    S.step = Math.max(0, Math.min(steps().length - 1, i));
    if (steps()[S.step] === "review") S.missingShown = true;
    S.navOpen = false;
    render();
    var el = focusId ? $(focusId) : $("ob-sec-h");
    // A group of choices or a block of rows: its first box takes the focus.
    if (el && /^(FIELDSET|DIV|P)$/.test(el.tagName)) el = el.querySelector("input:not([disabled]), select, textarea, button") || el;
    if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: "center" }); }
  }
  var findTimer = null;
  function wire() {
    var app = $("ob-app");
    app.querySelectorAll("[data-p]").forEach(function (el) {
      var ev = el.tagName === "SELECT" || el.type === "checkbox" || el.type === "radio" || el.type === "date" ? "change" : "input";
      el.addEventListener(ev, function () {
        var path = el.getAttribute("data-p"), v = readControl(el);
        setPath(path, v);
        delete S.fields[path];
        // Answers that show or hide other questions redraw the section.
        var re = ["p_start", "x_outcome"].indexOf(path) >= 0 || (el.tagName === "SELECT" && false);
        if ((el.type === "text" || el.tagName === "TEXTAREA") && el.getAttribute("data-p")) {
          var w = $(el.id + "-w"), p = personalIn(el.value);
          if (p && !w) { re = true; } else if (!p && w) { re = true; }
        }
        changed(re);
      });
    });
    app.querySelectorAll("[data-step]").forEach(function (b) { b.addEventListener("click", function () { goStep(+b.getAttribute("data-step")); }); });
    var sd = $("ob-steps-d"); if (sd) sd.addEventListener("toggle", function () { S.navOpen = sd.open; });
    var nx = $("ob-next"); if (nx) nx.addEventListener("click", function () { goStep(S.step + 1); });
    var pv = $("ob-prev"); if (pv) pv.addEventListener("click", function () { goStep(S.step - 1); });
    app.querySelectorAll("[data-goto]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var sec = a.getAttribute("data-goto"), k = a.getAttribute("data-focus"), parts = k.split(".");
        var id = parts.length > 1 ? "ob-" + parts[0] + "-" + parts[1] : (def(k) && def(k).t === "rows" ? "ob-" + k : "ob-" + k);
        goStep(S.d.sections.indexOf(sec), id);
      });
    });
    app.querySelectorAll("[data-addrow]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-addrow"); S.a[k] = (S.a[k] || []).concat([{}]);
        changed(true); var n = S.a[k].length - 1, f = def(k); var el = $("ob-" + k + "-" + n + "-" + f.cols[0].k); if (el) el.focus();
      });
    });
    app.querySelectorAll("[data-delrow]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-delrow"), i = +b.getAttribute("data-i");
        S.a[k] = (S.a[k] || []).filter(function (_, j) { return j !== i; }); if (!S.a[k].length) delete S.a[k];
        Object.keys(S.fields).forEach(function (p) { if (p.indexOf(k + ".") === 0) delete S.fields[p]; });
        changed(true); var add = document.querySelector('[data-addrow="' + k + '"]'); if (add) add.focus();
        msg(T("ob.row_removed"));
      });
    });
    app.querySelectorAll("[data-find]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var path = inp.getAttribute("data-find"), q = inp.value.trim(); S.pick[path] = inp.value;
        clearTimeout(findTimer);
        if (q.length < 2) { S.results[path] = null; var r0 = $(inp.id + "-r"); if (r0) r0.innerHTML = ""; return; }
        findTimer = setTimeout(function () {
          fetch("/api/admin/onboarding?find=" + encodeURIComponent(q) + "&type=" + inp.getAttribute("data-type"), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { S.results[path] = j.results || []; render(); })
            .catch(function () { var r1 = $(inp.id + "-r"); if (r1) r1.textContent = T("ob.find_offline"); });
        }, 350);
      });
    });
    app.querySelectorAll("[data-pick]").forEach(function (b) {
      b.addEventListener("click", function () {
        var path = b.getAttribute("data-pick"), o = S.results[path][+b.getAttribute("data-i")];
        setPath(path, { type: o.type, id: o.id, label: o.label }); S.results[path] = null; S.pick[path] = "";
        changed(true); var id = "ob-" + path.split(".").join("-"); var el = document.querySelector('[data-unpick="' + path + '"]'); if (el) el.focus(); else if ($(id)) $(id).focus();
      });
    });
    app.querySelectorAll("[data-unpick]").forEach(function (b) {
      b.addEventListener("click", function () { var path = b.getAttribute("data-unpick"); setPath(path, null); changed(true); var el = $("ob-" + path.split(".").join("-")); if (el) el.focus(); });
    });
    var au = $("ob-add-units");
    if (au) au.addEventListener("click", function () {
      var rec = S.a.o_record;
      fetch("/api/admin/onboarding?units=" + rec.type + "&id=" + encodeURIComponent(rec.id), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
        var have = (S.a.loc_rows || []).map(function (r) { return r.unit && r.unit.id; }), added = 0;
        (j.results || []).forEach(function (u) { if (have.indexOf(u.id) < 0) { S.a.loc_rows = (S.a.loc_rows || []).concat([{ unit: u }]); added++; } });
        changed(true); msg(T("ob.units_added", { n: added }));
      }).catch(function () { msg(T("ob.find_offline"), true); });
    });
    var sb = $("ob-submit");
    if (sb) sb.addEventListener("click", function () {
      sb.disabled = true;
      api({ action: "submit", lead: S.lead, version: S.version }).then(function (x) {
        if (x.r.status === 400 && x.j.missing) { S.d.missingNow = x.j.missing; render(); var m = $("ob-missing"); if (m) m.focus(); return; }
        if (!x.r.ok) { sb.disabled = false; msg(errText(x.j), true); return; }
        S.dirty = false;
        return load().then(function () { msg(T("ob.done_submit")); var h = $("ob-h"); if (h) h.focus(); });
      }).catch(function () { sb.disabled = false; msg(T("adm.ss_e_net"), true); });
    });
    var ck = $("ob-check");
    if (ck) ck.addEventListener("click", function () {
      ck.disabled = true;
      api({ action: "check", lead: S.lead }).then(function (x) {
        if (!x.r.ok) { ck.disabled = false; msg(errText(x.j), true); return; }
        return load().then(function () { msg(T(x.j.status === "SENT" ? "ob.done_sent" : "ob.done_checked", { n: x.j.changeRequests || 0 })); });
      }).catch(function () { ck.disabled = false; msg(T("adm.ss_e_net"), true); });
    });
    var rf = $("ob-return");
    if (rf) {
      $("ob-return-note").addEventListener("input", function (e) { S.retNote = e.target.value; });
      rf.addEventListener("submit", function (e) {
        e.preventDefault();
        api({ action: "return", lead: S.lead, note: $("ob-return-note").value }).then(function (x) {
          if (x.r.status === 400) { S.retErr = true; render(); $("ob-return-note").focus(); return; }
          if (!x.r.ok) { msg(errText(x.j), true); return; }
          S.retErr = false; S.retNote = "";
          return load().then(function () { msg(T("ob.done_returned")); });
        }).catch(function () { msg(T("adm.ss_e_net"), true); });
      });
    }
    app.querySelectorAll("[data-task]").forEach(function (c) {
      c.addEventListener("change", function () {
        var k = c.getAttribute("data-task");
        api({ action: "task", lead: S.lead, task: k, done: c.checked }).then(function (x) {
          if (!x.r.ok) { c.checked = !c.checked; msg(errText(x.j), true); return; }
          var on = c.checked;
          return load().then(function () { msg(T(on ? "ob.done_task" : "ob.done_untask", { task: T("ob.task_" + k) })); var el = $("ob-task-" + k); if (el) el.focus(); });
        }).catch(function () { c.checked = !c.checked; msg(T("adm.ss_e_net"), true); });
      });
    });
    var pr = $("ob-print"); if (pr) pr.addEventListener("click", function () { window.print(); });
    var rl = $("ob-reload"); if (rl) rl.addEventListener("click", function () { S.dirty = false; clearTimeout(S.timer); load(); });
  }

  function applyTheme(theme) { document.documentElement.classList.toggle("light-theme", theme === "light"); var b = $("theme-toggle"); if (b) b.textContent = theme === "light" ? T("adm.theme_dark") : T("adm.theme_light"); }
  var saved = "dark"; try { saved = localStorage.getItem("griq-admin-theme") || "dark"; } catch (e) {}
  applyTheme(saved);
  var tt = $("theme-toggle");
  if (tt) tt.addEventListener("click", function () {
    var cur = "dark"; try { cur = localStorage.getItem("griq-admin-theme") || "dark"; } catch (e) {}
    var next = cur === "light" ? "dark" : "light"; try { localStorage.setItem("griq-admin-theme", next); } catch (e) {}
    applyTheme(next);
  });
  document.addEventListener("giq:lang", function () { var th = "dark"; try { th = localStorage.getItem("griq-admin-theme") || "dark"; } catch (e) {} applyTheme(th); render(); });
  load();
})();
