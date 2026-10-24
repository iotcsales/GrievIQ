/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// public/admin-handovers.js   (grieviq-53): Change of representative.
(function () {
  "use strict";
  function T(key, vars) { return window.GIQ ? window.GIQ.t(key, vars) : key; }
  function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  function timeText(s) { if (!s) return ""; var d = new Date(s); return isNaN(d) ? s : d.toLocaleString(window.GIQ ? GIQ.locale() : "en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); }
  function dateText(s) { if (!s) return "—"; var d = new Date(s.slice(0, 10) + "T00:00:00+05:30"); return isNaN(d) ? s : d.toLocaleDateString(window.GIQ ? GIQ.locale() : "en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); }

  var TYPES = ["ward", "mayor", "mla", "mp"];
  var KINDS = ["NEW_REP", "ADMINISTRATOR", "VACANT"];
  var REASONS = ["ELECTION", "BY_ELECTION", "RESIGNATION", "DEATH", "DISQUALIFICATION", "ADMINISTRATOR", "TERM_ENDED", "OTHER"];
  var FIELDS = ["seat", "kind", "newName", "newPhone", "newEmail", "reason", "reasonNote", "evidence", "effectiveDate"];
  var S = { data: null, err: null, form: blank("ward"), notes: {} };
  function blank(type) { return { seatType: type, seatId: "", kind: "NEW_REP", newName: "", newPhone: "", newEmail: "", reason: "", reasonNote: "", evidence: "", effectiveDate: "", errors: {} }; }

  function seatsOf(type) { return (S.data && S.data.seats && S.data.seats[type]) || []; }
  function seatOf(type, id) { return seatsOf(type).find(function (x) { return x.id === id; }) || null; }
  function statusWord(st) { return T("adm.ho_st_" + st); }
  function seatOption(type, x) {
    var who = x.status === "VACANT" ? T("adm.ho_vacant_tag") : (x.name || T("adm.ho_no_name")) + (x.email ? " (" + x.email + ")" : "");
    var place = type === "ward" ? x.place + (x.area ? " · " + x.area : "") : x.place;
    return place + " — " + who + (x.status === "ADMINISTRATOR" ? " · " + T("adm.ho_admin_tag") : "");
  }
  function kindWord(k) { return T("adm.ho_k_" + k); }
  function personText(p) { return p && (p.name || p.email) ? (p.name ? p.name + (p.email ? " (" + p.email + ")" : "") : p.email) : T("adm.ho_nobody"); }

  // ---------------- the form
  function fld(id, key, label, hint, type, extra) {
    var f = S.form, e = f.errors[key];
    var desc = [hint ? id + "-h" : "", e ? id + "-e" : ""].filter(Boolean).join(" ");
    return '<div class="fld"><label for="' + id + '">' + esc(T(label)) + "</label>" + (hint ? '<span class="hint" id="' + id + '-h">' + esc(T(hint)) + "</span>" : "") +
      '<input type="' + (type || "text") + '" id="' + id + '" data-f="' + key + '" value="' + esc(f[key]) + '" autocomplete="off"' + (extra || "") + (e ? ' aria-invalid="true"' : "") + (desc ? ' aria-describedby="' + desc + '"' : "") + ">" +
      (e ? '<span class="ferr" id="' + id + '-e">' + esc(T("adm.ho_e_" + key + "_" + e)) + "</span>" : "") + "</div>";
  }
  function renderForm() {
    var f = S.form, d = S.data;
    var seat = seatOf(f.seatType, f.seatId);
    var errs = FIELDS.filter(function (k) { return f.errors[k]; });
    var opts = [["", T("adm.ho_pick_seat")]].concat(seatsOf(f.seatType).map(function (x) { return [x.id, seatOption(f.seatType, x)]; }));
    var se = f.errors.seat;
    var h = '<section class="bl-new" aria-labelledby="ho-new-h"><h2 id="ho-new-h">' + esc(T("adm.ho_new_h")) + "</h2>" +
      (errs.length ? '<div class="ss-errors" id="ho-errs" tabindex="-1" role="alert"><h2>' + esc(T("adm.gv_fix_h")) + "</h2><ul>" + errs.map(function (k) {
        return '<li><a href="#ho-' + (k === "kind" ? "k-" + f.kind : k) + '">' + esc(T("adm.ho_f_" + k) + ": " + T("adm.ho_e_" + k + "_" + f.errors[k])) + "</a></li>"; }).join("") + "</ul></div>" : "") +
      '<form id="ho-form" novalidate>' +
      '<fieldset class="rad"><legend>' + esc(T("adm.ho_f_level")) + "</legend>" + TYPES.map(function (t) {
        return '<span class="ropt"><input type="radio" name="ho-type" id="ho-t-' + t + '" value="' + t + '"' + (f.seatType === t ? " checked" : "") + '><label for="ho-t-' + t + '">' + esc(T("adm.ho_t_" + t)) + "</label></span>"; }).join("") + "</fieldset>" +
      '<div class="fld wide"><label for="ho-seat">' + esc(T("adm.ho_f_seat")) + '</label><span class="hint" id="ho-seat-h">' + esc(T("adm.ho_f_seat_h")) + "</span>" +
        '<select id="ho-seat" class="ho-seat" data-f="seatId" data-search="1" aria-describedby="ho-seat-h' + (se ? " ho-seat-e" : "") + '"' + (se ? ' aria-invalid="true"' : "") + ">" +
        opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === f.seatId ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" +
        (se ? '<span class="ferr" id="ho-seat-e">' + esc(T("adm.ho_e_seat_" + se)) + "</span>" : "") + "</div>";
    if (seat) {
      h += '<div class="ho-cur" role="group" aria-labelledby="ho-cur-h"><p id="ho-cur-h" class="sub-h">' + esc(T("adm.ho_cur_h")) + "</p><dl>" +
        "<dt>" + esc(T("adm.ho_cur_who")) + "</dt><dd>" + esc(seat.status === "VACANT" ? T("adm.ho_nobody") : personText(seat)) + "</dd>" +
        "<dt>" + esc(T("adm.ho_cur_status")) + "</dt><dd>" + esc(statusWord(seat.status)) + "</dd></dl></div>";
    }
    var ke = f.errors.kind;
    h += '<fieldset class="rad"' + (ke ? ' aria-describedby="ho-kind-e"' : "") + "><legend>" + esc(T("adm.ho_f_kind")) + "</legend>" + KINDS.map(function (k) {
      return '<span class="ropt"><input type="radio" name="ho-kind" id="ho-k-' + k + '" value="' + k + '"' + (f.kind === k ? " checked" : "") + '><label for="ho-k-' + k + '">' + esc(T("adm.ho_k_" + k)) + "</label></span>"; }).join("") +
      (ke ? '<span class="ferr" id="ho-kind-e">' + esc(T("adm.ho_e_kind_" + ke)) + "</span>" : "") + "</fieldset>";
    if (f.kind !== "VACANT") {
      h += '<div class="grid">' + fld("ho-newName", "newName", f.kind === "ADMINISTRATOR" ? "adm.ho_f_newName_admin" : "adm.ho_f_newName", null, "text", ' maxlength="120"') +
        fld("ho-newEmail", "newEmail", "adm.ho_f_newEmail", "adm.ho_f_newEmail_h", "email", ' maxlength="200"') +
        fld("ho-newPhone", "newPhone", "adm.ho_f_newPhone", "adm.ho_f_newPhone_h", "tel", ' maxlength="40"') + "</div>";
    } else {
      h += '<p class="hint" id="ho-vacant-h">' + esc(T("adm.ho_vacant_h")) + "</p>";
    }
    var re = f.errors.reason;
    h += '<div class="grid"><div class="fld"><label for="ho-reason">' + esc(T("adm.ho_f_reason")) + "</label>" +
      '<select id="ho-reason" data-f="reason"' + (re ? ' aria-invalid="true" aria-describedby="ho-reason-e"' : "") + ">" +
      [["", T("adm.ho_pick_reason")]].concat(REASONS.map(function (r) { return [r, T("adm.ho_r_" + r)]; })).map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === f.reason ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" +
      (re ? '<span class="ferr" id="ho-reason-e">' + esc(T("adm.ho_e_reason_" + re)) + "</span>" : "") + "</div>" +
      fld("ho-reasonNote", "reasonNote", "adm.ho_f_reasonNote", "adm.ho_f_reasonNote_h", "text", ' maxlength="300"') + "</div>" +
      '<div class="grid">' + fld("ho-evidence", "evidence", "adm.ho_f_evidence", "adm.ho_f_evidence_h", "text", ' maxlength="300"') +
      fld("ho-effectiveDate", "effectiveDate", "adm.ho_f_effectiveDate", "adm.ho_f_effectiveDate_h", "date", ' max="' + esc(d.today) + '"') + "</div>" +
      '<div class="ho-what" role="note"><b>' + esc(T("adm.ho_what_h")) + "</b><ul>" +
        ["adm.ho_what_1", "adm.ho_what_2", "adm.ho_what_3", "adm.ho_what_4", "adm.ho_what_5"].map(function (k) { return "<li>" + esc(T(k)) + "</li>"; }).join("") + "</ul></div>" +
      '<div class="acts small">' + (d.canApply
        ? '<button type="submit" class="primary" id="ho-apply" data-apply="1">' + esc(T("adm.ho_apply_btn")) + '</button><button type="submit" id="ho-ask" data-apply="0">' + esc(T("adm.ho_ask_btn_second")) + "</button>"
        : '<button type="submit" class="primary" id="ho-ask" data-apply="0">' + esc(T("adm.ho_ask_btn")) + "</button>") + "</div></form></section>";
    return h;
  }

  // ---------------- waiting and recent
  function dl(rows) { return "<dl>" + rows.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") + "</dl>"; }
  function detailRows(r) {
    return [
      [T("adm.ho_l_from"), r.old.status === "VACANT" ? T("adm.ho_nobody") : personText(r.old)],
      [T("adm.ho_l_to"), r.kind === "VACANT" ? T("adm.ho_k_VACANT") : personText(r.next) + (r.kind === "ADMINISTRATOR" ? " · " + T("adm.ho_admin_tag") : "")],
      [T("adm.ho_l_why"), T("adm.ho_r_" + r.reason) + (r.reasonNote ? " · " + r.reasonNote : "")],
      [T("adm.ho_l_evidence"), r.evidence],
      [T("adm.ho_l_effective"), dateText(r.effectiveDate)],
      [T("adm.ho_l_asked"), T("adm.gv_by", { date: timeText(r.requestedAt), by: r.requestedBy })],
    ];
  }
  function pendingCard(r) {
    var p = "ho-p-" + r.id.replace(/[^a-zA-Z0-9]/g, "");
    var mine = r.requestedBy === S.data.me;
    var h = '<article class="sb-card ho-card k-' + r.kind + '" aria-labelledby="' + p + '-h"><h3 id="' + p + '-h">' + esc(r.seatLabel) + ' <span class="badge">' + esc(kindWord(r.kind)) + "</span></h3>" + dl(detailRows(r));
    if (S.data.canApply && !mine) {
      h += '<div class="ho-acts"><button type="button" class="primary" data-act="approve" data-id="' + esc(r.id) + '">' + esc(T("adm.ho_approve")) + "</button>" +
        '<div class="fld"><label for="' + p + '-n">' + esc(T("adm.ho_reject_note")) + '</label><input type="text" id="' + p + '-n" maxlength="300" autocomplete="off" value="' + esc(S.notes[r.id] || "") + '"></div>' +
        '<button type="button" class="danger" data-act="reject" data-id="' + esc(r.id) + '">' + esc(T("adm.ho_reject")) + "</button></div>";
    } else if (mine) {
      h += '<p class="hint">' + esc(T(S.data.canApply ? "adm.ho_mine_other" : "adm.ho_mine_wait")) + '</p><div class="ho-acts"><button type="button" data-act="withdraw" data-id="' + esc(r.id) + '">' + esc(T("adm.ho_withdraw")) + "</button></div>";
    }
    return h + '<p class="row-msg" role="status" aria-live="polite"></p></article>';
  }
  function summaryText(r) {
    var s = r.summary; if (!s) return "";
    var parts = [];
    if (s.assignmentsReturned) parts.push(T("adm.ho_sum_assign", { n: s.assignmentsReturned }));
    if (s.shareSwitchedOff) parts.push(T("adm.ho_sum_share"));
    if (s.outgoingSignedOut) parts.push(T("adm.ho_sum_signedout"));
    if (r.planAcceptedAt) parts.push(T("adm.ho_sum_plan"));
    if (r.welcomeSeenAt) parts.push(T("adm.ho_sum_seen"));
    return parts.join(" · ");
  }
  function recentTable(rows) {
    if (!rows.length) return '<p class="muted">' + esc(T("adm.ho_recent_none")) + "</p>";
    return '<div class="table-wrap"><table class="ho-log"><caption class="vh">' + esc(T("adm.ho_recent_h")) + '</caption><thead><tr>' +
      ["adm.ho_c_when", "adm.ho_c_seat", "adm.ho_c_change", "adm.ho_c_status", "adm.ho_c_by"].map(function (k) { return '<th scope="col">' + esc(T(k)) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) {
        var change = kindWord(r.kind) + ": " + (r.old.status === "VACANT" ? T("adm.ho_nobody") : (r.old.name || r.old.email || T("adm.ho_nobody"))) + " → " + (r.kind === "VACANT" ? T("adm.ho_vacant_word") : (r.next.name || r.next.email));
        var extra = r.status === "APPLIED" ? summaryText(r) : (r.decisionNote || "");
        return "<tr><td>" + esc(dateText(r.effectiveDate)) + "</td><td>" + esc(r.seatLabel) + "</td><td>" + esc(change) + (extra ? '<span class="sub">' + esc(extra) + "</span>" : "") + "</td>" +
          '<td><span class="badge st-' + esc(r.status) + '">' + esc(T("adm.ho_s_" + r.status)) + "</span></td><td>" + esc(r.decidedBy || r.requestedBy) + '<span class="sub">' + esc(timeText(r.decidedAt || r.requestedAt)) + "</span></td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function render() {
    var app = document.getElementById("ho-app");
    if (S.err) { app.innerHTML = '<p class="muted">' + esc(S.err()) + "</p>"; return; }
    var d = S.data; if (!d) return;
    var canAct = d.canRequest || d.canApply;
    document.getElementById("readonly-tag").hidden = canAct;
    if (!d.ready) { app.innerHTML = '<p class="muted">' + esc(T("adm.ho_not_ready")) + "</p>"; return; }
    app.innerHTML = (canAct ? renderForm() : "") +
      '<section class="ho-sec" aria-labelledby="ho-wait-h"><h2 id="ho-wait-h">' + esc(T("adm.ho_wait_h", { n: d.pending.length })) + "</h2>" +
        (d.pending.length ? d.pending.map(pendingCard).join("") : '<p class="muted">' + esc(T("adm.ho_wait_none")) + "</p>") + "</section>" +
      '<section class="ho-sec" aria-labelledby="ho-recent-h"><h2 id="ho-recent-h">' + esc(T("adm.ho_recent_h")) + '</h2><p class="muted">' + esc(T("adm.ho_recent_p")) + "</p>" + recentTable(d.recent) + "</section>";
    wire();
  }
  function readForm() {
    document.querySelectorAll("#ho-form [data-f]").forEach(function (el) { S.form[el.getAttribute("data-f")] = el.value; });
    var k = document.querySelector('input[name="ho-kind"]:checked'); if (k) S.form.kind = k.value;
  }
  function focusEl(id) { var el = document.getElementById(id); if (el) el.focus(); }
  function wire() {
    var form = document.getElementById("ho-form");
    if (form) {
      form.querySelectorAll('input[name="ho-type"]').forEach(function (r) { r.addEventListener("change", function () { readForm(); var keep = S.form; S.form = blank(r.value); ["kind", "newName", "newPhone", "newEmail", "reason", "reasonNote", "evidence", "effectiveDate"].forEach(function (k) { S.form[k] = keep[k]; }); render(); focusEl("ho-t-" + r.value); }); });
      form.querySelectorAll('input[name="ho-kind"]').forEach(function (r) { r.addEventListener("change", function () { readForm(); render(); focusEl("ho-k-" + r.value); }); });
      var seat = document.getElementById("ho-seat");
      seat.addEventListener("change", function () { readForm(); render(); focusEl("ho-seat"); });
      form.addEventListener("submit", submit);
      form.querySelectorAll("button[type=submit]").forEach(function (b) { b.addEventListener("click", function () { form.setAttribute("data-apply", b.getAttribute("data-apply")); }); });
    }
    document.querySelectorAll("[data-act]").forEach(function (b) { b.addEventListener("click", function () { act(b); }); });
    document.querySelectorAll('.ho-card input[type="text"]').forEach(function (inp) { inp.addEventListener("input", function () { var id = inp.closest(".ho-card").querySelector("[data-id]").getAttribute("data-id"); S.notes[id] = inp.value; }); });
  }
  function say(text, ok) { var m = document.getElementById("ho-msg"); m.className = "st-msg " + (ok ? "success" : "error"); m.textContent = text; m.focus(); }

  async function submit(ev) {
    ev.preventDefault(); readForm();
    var f = S.form, form = document.getElementById("ho-form"), apply = form.getAttribute("data-apply") === "1" && S.data.canApply;
    var seat = seatOf(f.seatType, f.seatId);
    if (apply && seat) {
      var q = seat.email && f.kind !== "VACANT" ? T("adm.ho_apply_q", { who: seat.name || seat.email, place: seat.place }) : T("adm.ho_apply_q2", { place: seat.place });
      if (!confirm(q)) return;
    }
    var btns = form.querySelectorAll("button[type=submit]"); btns.forEach(function (b) { b.disabled = true; });
    try {
      var res = await fetch("/api/admin/handovers", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "propose", seatType: f.seatType, seatId: f.seatId, kind: f.kind, newName: f.newName, newPhone: f.newPhone, newEmail: f.newEmail,
          reason: f.reason, reasonNote: f.reasonNote, evidence: f.evidence, effectiveDate: f.effectiveDate, applyNow: apply }) });
      var d = await res.json();
      if ((res.status === 400 || res.status === 409) && d.fields) { f.errors = d.fields; render(); focusEl("ho-errs"); return; }
      btns.forEach(function (b) { b.disabled = false; });
      if (res.status === 409 && d.error === "OUT_OF_DATE") { await load(); say(T("adm.ho_out_of_date")); return; }
      if (!res.ok) { say(T("adm.ss_e_generic")); return; }
      var place = seat ? seat.place : "";
      S.form = blank(f.seatType);
      await load();
      say(T(d.status === "APPLIED" ? "adm.ho_applied_ok" : "adm.ho_asked_ok", { place: place }), true);
    } catch (e) { btns.forEach(function (b) { b.disabled = false; }); say(T("adm.ss_e_net")); }
  }
  async function act(btn) {
    var id = btn.getAttribute("data-id"), action = btn.getAttribute("data-act");
    var card = btn.closest(".sb-card"), m = card.querySelector(".row-msg"), note = card.querySelector('input[type="text"]');
    var r = S.data.pending.find(function (x) { return x.id === id; });
    if (action === "approve" && !confirm(T("adm.ho_approve_q", { place: r ? r.seatLabel : "" }))) return;
    if (note) note.removeAttribute("aria-invalid");
    btn.disabled = true; m.className = "row-msg"; m.textContent = T("adm.saving");
    try {
      var res = await fetch("/api/admin/handovers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: action, id: id, note: note ? note.value : "" }) });
      var d = await res.json(); btn.disabled = false;
      if (res.status === 400 && d.fields && d.fields.note) { m.className = "row-msg error"; m.textContent = T("adm.ho_e_note"); if (note) { note.setAttribute("aria-invalid", "true"); note.focus(); } return; }
      if (res.status === 409 && d.error === "OUT_OF_DATE") { await load(); say(T("adm.ho_out_of_date")); return; }
      if (!res.ok) { m.className = "row-msg error"; m.textContent = T("adm.ss_e_generic"); return; }
      delete S.notes[id];
      await load();
      say(T("adm.ho_done_" + action, { place: r ? r.seatLabel : "" }), true);
    } catch (e) { btn.disabled = false; m.className = "row-msg error"; m.textContent = T("adm.ss_e_net"); }
  }
  async function load() {
    try {
      var res = await fetch("/api/admin/handovers"); var d = await res.json();
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
    applyTheme(next);
  });
  document.addEventListener("giq:lang", function () { var th = "dark"; try { th = localStorage.getItem("griq-admin-theme") || "dark"; } catch (e) {} applyTheme(th); if (S.data) { if (document.getElementById("ho-form")) readForm(); render(); } });
  load();
})();
