/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// public/admin-notices.js   (grieviq-55): Public notices for GrievIQ staff.
(function () {
  "use strict";
  function T(key, vars) { return window.GIQ ? window.GIQ.t(key, vars) : key; }
  function hi() { return window.GIQ && GIQ.lang === "hi"; }
  function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  function rupees(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
  function timeText(s) { if (!s) return ""; var d = new Date(s); return isNaN(d) ? s : d.toLocaleString(window.GIQ ? GIQ.locale() : "en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); }
  function dateText(s) { if (!s) return "—"; var d = new Date(s.slice(0, 10) + "T00:00:00+05:30"); return isNaN(d) ? s : d.toLocaleDateString(window.GIQ ? GIQ.locale() : "en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); }
  var S = { data: null, err: null, checks: {}, notes: {}, pause: { label: "", state: "", areaId: "", from: "", to: "", errors: {} } };
  function label(n) { return (hi() ? n.officeLabel[1] : n.officeLabel[0]) + ", " + n.officeName; }
  function titleOf(n) { return (hi() ? n.titleHi || n.titleEn : n.titleEn || n.titleHi) || ""; }
  function stateText(n) { return T("adm.nt_st_" + n.state, { from: dateText(n.from), to: dateText(n.to) }); }
  function preview(n) {
    if (!window.GIQNoticeCard) return "";
    return '<div class="pn-host" data-pn="' + esc(n.id) + '">' + window.GIQNoticeCard.card({ ref: n.ref, category: n.category, titleEn: n.titleEn, titleHi: n.titleHi, bodyEn: n.bodyEn, bodyHi: n.bodyHi,
      eventDate: n.eventDate, eventTime: n.eventTime, place: n.place, office: n.officeName, officeLabel: n.officeLabel, until: n.to,
      authority: n.letter ? { no: n.letter.no, date: n.letter.date } : null }, { h: 4, idp: "ntv-" }) + "</div>";
  }
  // grieviq-56: the authority letter, to verify before approving.
  function sizeText(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
  function letterBox(n) {
    if (!S.data.letters) return "";
    if (!n.letter) return n.letterNeeded ? '<p class="nt-flags nt-noletter" role="note"><b>' + esc(T("adm.nt_letter_missing_h")) + "</b> " + esc(T("adm.nt_letter_missing")) + "</p>" : "";
    var L = n.letter, t = L.type === "application/pdf" ? "PDF" : L.type === "image/png" ? "PNG" : "JPG";
    return '<div class="nt-letter"><p class="sub-h"><b>' + esc(T(n.letterNeeded ? "adm.nt_letter_h_req" : "adm.nt_letter_h")) + "</b></p>" +
      dl([[T("adm.nt_letter_no"), L.no], [T("adm.nt_letter_date"), dateText(L.date)], [T("adm.nt_letter_by"), L.by], [T("adm.nt_letter_file"), t + ", " + sizeText(L.size) + " · " + T("adm.gv_by", { date: timeText(L.uploadedAt), by: n.requestedBy })],
        [T("adm.nt_letter_verified"), L.verifiedHow || ""]]) +
      '<p><a class="nt-link" href="/api/admin/notice-letter?id=' + encodeURIComponent(n.id) + '" download>' + esc(T("adm.nt_letter_open")) + '<span class="vh"> ' + esc(n.ref) + "</span></a></p></div>";
  }
  // Both languages for the reviewer: the card shows one, the other is listed.
  function otherLang(n) {
    var hasEn = n.titleEn || n.bodyEn, hasHi = n.titleHi || n.bodyHi;
    if (!(hasEn && hasHi)) return "";
    var o = hi() ? "En" : "Hi";
    return '<details><summary>' + esc(T(o === "Hi" ? "adm.nt_hindi_text" : "adm.nt_english_text")) + '</summary><p lang="' + (o === "Hi" ? "hi" : "en") + '"><b>' + esc(n["title" + o]) + "</b><br>" + esc(n["body" + o]) + "</p></details>";
  }
  function dl(rows) { return "<dl>" + rows.filter(function (r) { return r[1]; }).map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") + "</dl>"; }
  function facts(n) {
    return dl([
      [T("adm.nt_l_office"), label(n)],
      [T("adm.nt_l_plan"), T("adm.nt_plan_v", { name: n.planName, days: n.days, amount: rupees(n.amount), total: rupees(n.total), reach: T("adm.nt_reach_" + n.reach) })],
      [T("adm.nt_l_dates"), n.from ? T("adm.nt_runs", { from: dateText(n.from), to: dateText(n.to) }) + (n.pausedDays ? " · " + T("adm.nt_paused_added", { n: n.pausedDays }) : "") : T("adm.nt_asked_start", { date: dateText(n.startOn) })],
      [T("adm.nt_l_asked"), T("adm.gv_by", { date: timeText(n.requestedAt), by: n.requestedBy })],
      [T("adm.nt_l_bill"), n.bill ? n.bill.ref + " · " + T("adm.nt_bill_" + n.bill.status) : ""],
      [T("adm.nt_l_decided"), n.decidedBy ? T("adm.gv_by", { date: timeText(n.decidedAt), by: n.decidedBy }) : ""],
    ]);
  }
  function pendingCard(n) {
    var p = "nt-" + n.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16), d = S.data;
    var c = S.checks[n.id] || {};
    var h = '<article class="sb-card nt-card st-' + esc(n.state) + '" aria-labelledby="' + p + '-h"><h3 id="' + p + '-h">' + esc(n.ref) + " · " + esc(titleOf(n)) + ' <span class="badge">' + esc(stateText(n)) + "</span></h3>" +
      facts(n) +
      (n.flags && n.flags.length ? '<p class="nt-flags" role="note"><b>' + esc(T("adm.nt_flags")) + "</b> " + esc(n.flags.join(", ")) + "</p>" : "") +
      preview(n) + otherLang(n) + letterBox(n);
    var blocked = d.letters && n.letterNeeded && !n.letter;
    var allChecks = n.letter ? d.checks.concat(["LETTER"]) : d.checks;
    if (d.canManage && blocked) {
      h += '<div class="nt-acts"><div class="fld"><label for="' + p + '-n">' + esc(T("adm.nt_reject_note")) + '</label><span class="hint" id="' + p + '-nh">' + esc(T("adm.nt_reject_h")) + '</span><input type="text" id="' + p + '-n" maxlength="300" autocomplete="off" aria-describedby="' + p + '-nh" value="' + esc(S.notes[n.id] || T("adm.nt_letter_reject_text")) + '"></div>' +
        '<button type="button" class="danger" data-act="reject" data-id="' + esc(n.id) + '">' + esc(T("adm.nt_reject")) + "</button></div>";
    } else if (d.canManage) {
      h += '<fieldset class="nt-checks"' + (S.checkErr === n.id ? ' aria-describedby="' + p + '-ce"' : "") + "><legend>" + esc(T("adm.nt_checks_h")) + "</legend>" + allChecks.map(function (k) {
        return '<div class="chk"><input type="checkbox" id="' + p + "-c-" + k + '" data-check="' + k + '" data-id="' + esc(n.id) + '"' + (c[k] ? " checked" : "") + '><label for="' + p + "-c-" + k + '">' + esc(T("adm.nt_c_" + k)) + "</label></div>";
      }).join("") + (S.checkErr === n.id ? '<span class="ferr" id="' + p + '-ce">' + esc(T("adm.nt_e_checks")) + "</span>" : "") +
        (n.letter ? '<div class="fld"><label for="' + p + '-vh">' + esc(T("adm.nt_verified_how")) + '</label><span class="hint" id="' + p + '-vhh">' + esc(T("adm.nt_verified_how_h")) + "</span>" +
          '<input type="text" id="' + p + '-vh" data-vh="' + esc(n.id) + '" maxlength="300" autocomplete="off" value="' + esc((S.vh || {})[n.id] || "") + '" aria-describedby="' + p + "-vhh" + (S.vhErr === n.id ? " " + p + "-vhe" : "") + '"' + (S.vhErr === n.id ? ' aria-invalid="true"' : "") + ">" +
          (S.vhErr === n.id ? '<span class="ferr" id="' + p + '-vhe">' + esc(T("adm.nt_e_verified")) + "</span>" : "") + "</div>" : "") + "</fieldset>" +
        '<div class="nt-acts"><button type="button" class="primary" data-act="approve" data-id="' + esc(n.id) + '">' + esc(T("adm.nt_approve")) + "</button>" +
        '<div class="fld"><label for="' + p + '-n">' + esc(T("adm.nt_reject_note")) + '</label><span class="hint" id="' + p + '-nh">' + esc(T("adm.nt_reject_h")) + '</span><input type="text" id="' + p + '-n" maxlength="300" autocomplete="off" aria-describedby="' + p + '-nh" value="' + esc(S.notes[n.id] || "") + '"></div>' +
        '<button type="button" class="danger" data-act="reject" data-id="' + esc(n.id) + '">' + esc(T("adm.nt_reject")) + "</button></div>";
    }
    return h + '<p class="row-msg" role="status" aria-live="polite"></p></article>';
  }
  function runningCard(n) {
    var p = "nr-" + n.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
    var h = '<article class="sb-card nt-card st-' + esc(n.state) + '" aria-labelledby="' + p + '-h"><h3 id="' + p + '-h">' + esc(n.ref) + " · " + esc(titleOf(n)) + ' <span class="badge">' + esc(stateText(n)) + "</span></h3>" + facts(n) +
      "<details><summary>" + esc(T("adm.nt_show")) + "</summary>" + preview(n) + otherLang(n) + letterBox(n) + "</details>";
    if (S.data.canManage && n.status === "PAID") {
      h += '<details><summary>' + esc(T("adm.nt_takedown_h")) + '</summary><div class="nt-acts"><div class="fld"><label for="' + p + '-n">' + esc(T("adm.nt_takedown_note")) + '</label><span class="hint" id="' + p + '-nh">' + esc(T("adm.nt_takedown_hint")) + '</span><input type="text" id="' + p + '-n" maxlength="300" autocomplete="off" aria-describedby="' + p + '-nh"></div>' +
        '<button type="button" class="danger" data-act="takedown" data-id="' + esc(n.id) + '">' + esc(T("adm.nt_takedown")) + "</button></div></details>";
    }
    return h + '<p class="row-msg" role="status" aria-live="polite"></p></article>';
  }
  function recordTable(rows) {
    if (!rows.length) return '<p class="muted">' + esc(T("adm.nt_record_none")) + "</p>";
    return '<div class="table-wrap"><table class="nt-log"><caption class="vh">' + esc(T("adm.nt_record_h")) + "</caption><thead><tr>" +
      ["adm.nt_c_ref", "adm.nt_c_office", "adm.nt_c_notice", "adm.nt_c_status", "adm.nt_c_total"].map(function (k) { return '<th scope="col">' + esc(T(k)) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (n) {
        var why = n.state === "REJECTED" ? n.decisionNote : n.endReason;
        return "<tr><td>" + esc(n.ref) + '<span class="sub">' + esc(dateText(n.requestedAt)) + "</span></td><td>" + esc(label(n)) + "</td><td>" + esc(titleOf(n)) + "</td><td>" + esc(stateText(n)) + (why ? '<span class="sub">' + esc(why) + "</span>" : "") + "</td><td>" + esc(rupees(n.total)) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function pauseForm() {
    var f = S.pause, d = S.data, e = f.errors;
    var fld = function (k, type, opt) {
      opt = opt || {}; var id = "np-" + k, er = e[k];
      var desc = [opt.hint ? id + "-h" : "", er ? id + "-e" : ""].filter(Boolean).join(" ");
      return '<div class="fld"><label for="' + id + '">' + esc(T("adm.nt_p_" + k)) + "</label>" + (opt.hint ? '<span class="hint" id="' + id + '-h">' + esc(T(opt.hint)) + "</span>" : "") +
        '<input type="' + type + '" id="' + id + '" data-p="' + k + '" value="' + esc(f[k]) + '" autocomplete="off"' + (opt.max ? ' maxlength="' + opt.max + '"' : "") + (er ? ' aria-invalid="true"' : "") + (desc ? ' aria-describedby="' + desc + '"' : "") + ">" +
        (er ? '<span class="ferr" id="' + id + '-e">' + esc(T("adm.nt_pe_" + er)) + "</span>" : "") + "</div>";
    };
    var sel = function (k, opts) {
      var id = "np-" + k, er = e[k];
      return '<div class="fld"><label for="' + id + '">' + esc(T("adm.nt_p_" + k)) + '</label><select id="' + id + '" data-p="' + k + '"' + (er ? ' aria-invalid="true" aria-describedby="' + id + '-e"' : "") + ">" +
        opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === f[k] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" +
        (er ? '<span class="ferr" id="' + id + '-e">' + esc(T("adm.nt_pe_" + er)) + "</span>" : "") + "</div>";
    };
    var areas = d.areas.filter(function (a) { return a.state === f.state; });
    return '<form id="np-form" class="bl-new" novalidate aria-labelledby="np-h"><h3 id="np-h">' + esc(T("adm.nt_pause_new")) + "</h3>" +
      '<div class="grid">' + fld("label", "text", { max: 120, hint: "adm.nt_p_label_h" }) +
      sel("state", [["", T("adm.gv_pick_state")]].concat(d.states.map(function (s) { return [s, s]; }))) +
      sel("areaId", [["", T("adm.nt_p_whole_state")]].concat(areas.map(function (a) { return [a.id, a.name]; }))) + "</div>" +
      '<div class="grid">' + fld("from", "date") + fld("to", "date", { hint: "adm.nt_p_to_h" }) + "</div>" +
      '<div class="acts small"><button type="submit" class="primary" id="np-go">' + esc(T("adm.nt_pause_go")) + "</button></div></form>";
  }
  function pauseList() {
    var list = S.data.pauses;
    if (!list.length) return '<p class="muted">' + esc(T("adm.nt_pause_none")) + "</p>";
    return list.map(function (p) {
      var where = p.areaId ? ((S.data.areas.find(function (a) { return a.id === p.areaId; }) || {}).name || p.areaId) + ", " + p.state : T("adm.nt_whole", { state: p.state });
      var id = "pz-" + p.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
      return '<div class="nt-pause' + (p.removedAt ? " gone" : p.now ? " now" : "") + '"><p><b>' + esc(p.label) + "</b> · " + esc(where) + " · " + esc(dateText(p.from)) + " – " + esc(dateText(p.to)) +
        ' <span class="badge">' + esc(T(p.removedAt ? "adm.nt_pause_removed" : p.now ? "adm.nt_pause_now" : "adm.nt_pause_later")) + "</span></p>" +
        (p.removedAt ? '<p class="muted">' + esc(T("adm.gv_by", { date: timeText(p.removedAt), by: p.removedBy }) + " · " + p.removeReason) + "</p>"
          : S.data.canManage ? '<div class="nt-acts"><div class="fld"><label for="' + id + '">' + esc(T("adm.nt_pause_rm_why")) + '</label><input type="text" id="' + id + '" maxlength="300" autocomplete="off"></div><button type="button" data-act="pause_remove" data-id="' + esc(p.id) + '">' + esc(T("adm.nt_pause_rm")) + "</button></div>" : "") +
        '<p class="row-msg" role="status" aria-live="polite"></p></div>';
    }).join("");
  }
  function render() {
    var app = document.getElementById("nt-app");
    if (S.err) { app.innerHTML = '<p class="muted">' + esc(S.err()) + "</p>"; return; }
    var d = S.data; if (!d) return;
    document.getElementById("readonly-tag").hidden = d.canManage;
    if (!d.ready) { app.innerHTML = '<p class="muted">' + esc(T("adm.nt_not_ready")) + "</p>"; return; }
    var pending = d.notices.filter(function (n) { return n.state === "PENDING"; });
    var running = d.notices.filter(function (n) { return ["APPROVED", "SCHEDULED", "LIVE", "PAUSED"].indexOf(n.state) >= 0; });
    var done = d.notices.filter(function (n) { return ["ENDED", "REJECTED", "WITHDRAWN", "TAKEN_DOWN", "CANCELLED"].indexOf(n.state) >= 0; });
    app.innerHTML = (d.enabled ? "" : '<p class="warnline">' + esc(T("adm.nt_off")) + "</p>") +
      '<section class="nt-sec" aria-labelledby="nt-wait-h"><h2 id="nt-wait-h">' + esc(T("adm.nt_wait_h", { n: pending.length })) + "</h2>" + (pending.length ? pending.map(pendingCard).join("") : '<p class="muted">' + esc(T("adm.nt_wait_none")) + "</p>") + "</section>" +
      '<section class="nt-sec" aria-labelledby="nt-run-h"><h2 id="nt-run-h">' + esc(T("adm.nt_run_h", { n: running.length })) + '</h2><p class="muted">' + esc(T("adm.nt_run_p")) + "</p>" + (running.length ? running.map(runningCard).join("") : '<p class="muted">' + esc(T("adm.nt_run_none")) + "</p>") + "</section>" +
      '<section class="nt-sec" aria-labelledby="nt-pause-h"><h2 id="nt-pause-h">' + esc(T("adm.nt_pause_h")) + '</h2><p class="muted">' + esc(T("adm.nt_pause_p")) + "</p>" + (d.canManage ? pauseForm() : "") + pauseList() + "</section>" +
      '<section class="nt-sec" aria-labelledby="nt-rec-h"><h2 id="nt-rec-h">' + esc(T("adm.nt_record_h")) + '</h2><p class="muted">' + esc(T("adm.nt_record_p")) + "</p>" + recordTable(done) + "</section>";
    app.querySelectorAll(".pn-host").forEach(function (x) { if (window.GIQNoticeCard) window.GIQNoticeCard.theme(x); });
    wire();
  }
  function say(text, ok) { var m = document.getElementById("nt-msg"); m.className = "st-msg " + (ok ? "success" : "error"); m.textContent = text; m.focus(); }
  function wire() {
    document.querySelectorAll("[data-check]").forEach(function (c) { c.addEventListener("change", function () { var id = c.getAttribute("data-id"); (S.checks[id] = S.checks[id] || {})[c.getAttribute("data-check")] = c.checked; }); });
    document.querySelectorAll("[data-act]").forEach(function (b) { b.addEventListener("click", function () { act(b); }); });
    document.querySelectorAll("[data-vh]").forEach(function (inp) { inp.addEventListener("input", function () { (S.vh = S.vh || {})[inp.getAttribute("data-vh")] = inp.value; }); });
    document.querySelectorAll('.nt-card input[type="text"]:not([data-vh])').forEach(function (inp) { inp.addEventListener("input", function () { var b = inp.closest(".nt-card").querySelector("[data-id]"); if (b) S.notes[b.getAttribute("data-id")] = inp.value; }); });
    var pf = document.getElementById("np-form");
    if (pf) {
      pf.addEventListener("submit", addPause);
      var st = document.getElementById("np-state"); st.addEventListener("change", function () { readPause(); S.pause.areaId = ""; render(); document.getElementById("np-state").focus(); });
    }
  }
  function readPause() { document.querySelectorAll("#np-form [data-p]").forEach(function (x) { S.pause[x.getAttribute("data-p")] = x.value; }); }
  async function post(body) {
    var res = await fetch("/api/admin/notices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    var d = {}; try { d = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, d: d };
  }
  async function act(btn) {
    var id = btn.getAttribute("data-id"), a = btn.getAttribute("data-act");
    var box = btn.closest(".sb-card, .nt-pause"), m = box.querySelector(".row-msg"), note = box.querySelector('input[type="text"]:not([data-vh])');
    var n = S.data.notices.find(function (x) { return x.id === id; });
    if (a === "approve") {
      var c = S.checks[id] || {}, need = n.letter ? S.data.checks.concat(["LETTER"]) : S.data.checks;
      if (need.some(function (k) { return !c[k]; })) { S.checkErr = id; render(); var first = document.querySelector('[data-id="' + id + '"][data-check]:not(:checked)'); if (first) first.focus(); return; }
      S.checkErr = null;
      if (n.letter && String((S.vh || {})[id] || "").trim().length < 10) { S.vhErr = id; render(); var vh = document.querySelector('[data-vh="' + id + '"]'); if (vh) vh.focus(); return; }
      S.vhErr = null;
      if (!confirm(T("adm.nt_approve_q", { ref: n.ref, total: rupees(n.total) }))) return;
    }
    if (a === "takedown" && !confirm(T("adm.nt_takedown_q", { ref: n.ref }))) return;
    if (note) note.removeAttribute("aria-invalid");
    btn.disabled = true; m.className = "row-msg"; m.textContent = T("adm.saving");
    try {
      var body = a === "approve" ? { action: a, id: id, checks: S.checks[id], verifiedHow: (S.vh || {})[id] || "" } : { action: a, id: id, reason: note ? note.value : "" };
      var r = await post(body);
      btn.disabled = false;
      if (r.status === 400 && r.d.fields && r.d.fields.reason) { m.className = "row-msg error"; m.textContent = T("adm.nt_e_reason_" + (a === "takedown" ? "takedown" : "short")); if (note) { note.setAttribute("aria-invalid", "true"); note.focus(); } return; }
      if (!r.ok) { m.className = "row-msg error"; m.textContent = T(r.d.error === "ALREADY_DECIDED" ? "adm.nt_e_decided" : "adm.ss_e_generic"); return; }
      S.checkErr = null; delete S.checks[id]; delete S.notes[id];
      await load();
      say(T("adm.nt_done_" + a, { ref: n ? n.ref : "", bill: r.d.bill || "" }), true);
    } catch (e) { btn.disabled = false; m.className = "row-msg error"; m.textContent = T("adm.ss_e_net"); }
  }
  async function addPause(ev) {
    ev.preventDefault(); readPause();
    var f = S.pause, btn = document.getElementById("np-go"); btn.disabled = true;
    try {
      var r = await post({ action: "pause_add", label: f.label, state: f.state, areaId: f.areaId, from: f.from, to: f.to });
      btn.disabled = false;
      if (r.status === 400 && r.d.fields) { f.errors = r.d.fields; render(); var k = ["label", "state", "areaId", "from", "to"].find(function (x) { return r.d.fields[x]; }); var el = k && document.getElementById("np-" + k); if (el) el.focus(); return; }
      if (!r.ok) { say(T("adm.ss_e_generic")); return; }
      var lbl = f.label;
      S.pause = { label: "", state: "", areaId: "", from: "", to: "", errors: {} };
      await load();
      say(T("adm.nt_done_pause_add", { label: lbl }), true);
    } catch (e) { btn.disabled = false; say(T("adm.ss_e_net")); }
  }
  async function load() {
    try {
      var res = await fetch("/api/admin/notices"); var d = await res.json();
      if (!res.ok) { S.err = function () { return d.error === "NOT_ADMIN" || d.error === "INSUFFICIENT_ROLE" ? T("adm.no_access") : T("adm.ss_e_load"); }; render(); return; }
      S.err = null; S.data = d; render();
    } catch (e) { S.err = function () { return T("adm.ss_e_load"); }; render(); }
  }
  function applyTheme(theme) { document.documentElement.classList.toggle("light-theme", theme === "light"); document.getElementById("theme-toggle").textContent = theme === "light" ? T("adm.theme_dark") : T("adm.theme_light"); }
  var saved = "dark"; try { saved = localStorage.getItem("griq-admin-theme") || "dark"; } catch (e) {}
  applyTheme(saved);
  document.getElementById("theme-toggle").addEventListener("click", function () {
    var cur = "dark"; try { cur = localStorage.getItem("griq-admin-theme") || "dark"; } catch (e) {}
    var next = cur === "light" ? "dark" : "light"; try { localStorage.setItem("griq-admin-theme", next); } catch (e) {}
    applyTheme(next); if (S.data) render();
  });
  document.addEventListener("giq:lang", function () { var th = "dark"; try { th = localStorage.getItem("griq-admin-theme") || "dark"; } catch (e) {} applyTheme(th); if (S.data) { if (document.getElementById("np-form")) readPause(); render(); } });
  load();
})();
