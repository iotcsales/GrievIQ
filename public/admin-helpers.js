/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// public/admin-helpers.js (grieviq-72): Admin → Community helpers.
// Lists what needs doing first (to check, to approve, appeals, refunds), then
// every helper and application. Opening one shows its details, the ID photo
// and selfie on request (each view is recorded), the forms for the next step
// and its history. The server (/api/admin/helpers) checks every permission
// and the maker-checker rule itself.
(function () {
  "use strict";
  function T(k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function loc() { return window.GIQ ? GIQ.locale() : "en-IN"; }
  function day(s) { if (!s) return ""; try { return new Date(String(s).slice(0, 10) + "T00:00:00Z").toLocaleDateString(loc(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); } catch (e) { return s; } }
  function when(s) { if (!s) return ""; var d = new Date(s); return isNaN(d) ? s : d.toLocaleString(loc(), { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); }
  function rupees(n) { return "₹" + Number(n).toLocaleString("en-IN"); }
  function istToday() { return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); }
  var S = { d: null, err: null, open: {}, detail: {}, show: {}, forms: {}, fields: {}, filter: "OPEN", q: "", busy: null, rowMsg: {}, phone: {} };

  function staffName(e) { return e ? String(e) : ""; }
  function st(h) { return T("adm.hl_st_" + h.status); }
  function stage(h) {
    if (h.recheck === "WAITING") return "RECHECK_WAITING";
    if (h.recheck === "CHECKED") return "RECHECK_CHECKED";
    return h.rawStatus;
  }
  function needsCheck(h) { return h.rawStatus === "WAITING" || h.recheck === "WAITING"; }
  function needsApproval(h) { return h.rawStatus === "CHECKED" || h.recheck === "CHECKED"; }
  function cardPending(h) { return !!(h.card && h.card.photo && h.card.status === "PENDING" && ["ACTIVE", "LAPSED", "SUSPENDED"].indexOf(h.rawStatus) >= 0); }
  function appealOpen(h) { return h.appeal && !h.appeal.result && (h.rawStatus === "SUSPENDED" || h.rawStatus === "REMOVED"); }

  function load() {
    return fetch("/api/admin/helpers", { cache: "no-store" }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); }).then(function (x) {
      if (!x.r.ok) { S.err = x.j.error === "NOT_ADMIN" || x.j.error === "INSUFFICIENT_ROLE" ? "adm.no_access" : "adm.hl_e_load"; render(); return; }
      S.err = null; S.d = x.j; render();
      return Promise.all(Object.keys(S.open).filter(function (id) { return S.open[id]; }).map(loadOne)).then(function () { render(); });
    }).catch(function () { S.err = "adm.hl_e_load"; render(); });
  }
  function loadOne(id) {
    return fetch("/api/admin/helpers?id=" + encodeURIComponent(id), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { if (j.helper) S.detail[id] = j.helper; });
  }
  function post(body) {
    return fetch("/api/admin/helpers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); });
  }

  // ---- pieces ----
  function errOf(id, k) { var f = S.fields[id] || {}; return f[k] ? '<span class="ferr" id="hl-' + id + "-" + k + '-e">' + esc(T("adm.hl_e_" + f[k])) + "</span>" : ""; }
  function inv(id, k) { var f = S.fields[id] || {}; return f[k] ? ' aria-invalid="true" aria-describedby="hl-' + id + "-" + k + '-e"' : ""; }
  function chk(id, k, label) {
    var f = S.forms[id] || {};
    return '<div class="chk"><input type="checkbox" id="hl-' + id + "-" + k + '" data-f="' + k + '" data-h="' + id + '"' + (f[k] ? " checked" : "") + inv(id, k) + '><label for="hl-' + id + "-" + k + '">' + esc(T(label)) + "</label></div>" + errOf(id, k);
  }
  function txt(id, k, label, hint, rows) {
    var f = S.forms[id] || {};
    return '<div class="fld"><label for="hl-' + id + "-" + k + '">' + esc(T(label)) + "</label>" + (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") +
      '<textarea id="hl-' + id + "-" + k + '" data-f="' + k + '" data-h="' + id + '" rows="' + (rows || 3) + '"' + inv(id, k) + ">" + esc(f[k] || "") + "</textarea>" + errOf(id, k) + "</div>";
  }
  function rowMsg(id) { var m = S.rowMsg[id]; return m ? '<p class="st-msg ' + (m.bad ? "error" : "success") + '" id="hl-' + id + '-msg" tabindex="-1" role="' + (m.bad ? "alert" : "status") + '">' + esc(m.text) + "</p>" : ""; }

  function summaryDl(h) {
    var rows = [
      ["adm.hl_f_ref", h.ref || T("adm.hl_no_ref")],
      ["adm.hl_f_place", [h.unit, h.area].filter(Boolean).join(", ")],
      ["adm.hl_f_id", T("adm.hl_id_v", { type: T("hp.idn_" + h.idType), last4: h.idLast4 })],
      ["adm.hl_f_mobile", h.mobile],
    ];
    if (h.email) rows.push(["adm.hl_f_email", h.email]);
    if (h.about) rows.push(["adm.hl_f_about", h.about]);
    rows.push(["adm.hl_f_applied", when(h.submittedAt || h.createdAt)]);
    if (h.checkedBy) rows.push(["adm.hl_f_checked", T("adm.hl_by_on", { who: staffName(h.checkedBy), when: when(h.checkedAt) }) + (h.videoOn ? " · " + T("adm.hl_video_on", { d: day(h.videoOn) }) : "")]);
    if (h.recheckBy) rows.push(["adm.hl_f_rechecked", T("adm.hl_by_on", { who: staffName(h.recheckBy), when: when(h.recheckAt) })]);
    if (h.checkNote) rows.push(["adm.hl_f_check_note", h.checkNote]);
    if (h.decidedBy) rows.push(["adm.hl_f_decided", T("adm.hl_by_on", { who: staffName(h.decidedBy), when: when(h.decidedAt) })]);
    if (h.decisionNote) rows.push(["adm.hl_f_reason", (h.refuseKind ? T("adm.hl_kind_" + h.refuseKind) + " · " : "") + h.decisionNote]);
    if (h.paidUntil) rows.push(["adm.hl_f_paid", day(h.paidUntil) + (h.inGrace ? " · " + T("adm.hl_grace") : "")]);
    if (h.kycDue) rows.push(["adm.hl_f_kyc", day(h.kycDue) + (h.kycOverdue ? " · " + T("adm.hl_overdue") : "")]);
    if (h.actionBy) rows.push(["adm.hl_f_action", T("adm.hl_by_on", { who: staffName(h.actionBy), when: when(h.actionAt) }) + " · " + (h.actionReason || "")]);
    if (h.appeal) rows.push(["adm.hl_f_appeal", h.appeal.text + " (" + when(h.appeal.at) + ")" + (h.appeal.result ? " → " + T("adm.hl_ap_" + h.appeal.result) + " · " + staffName(h.appeal.by) + " · " + (h.appeal.note || "") : "")]);
    if (h.strikes) rows.push(["adm.hl_f_strikes", T("adm.hl_strikes_v", { n: h.strikes })]);
    if (h.card) rows.push(["adm.hl_f_card", !h.card.photo ? T("adm.hl_card_none") : h.card.status === "OK" ? T("adm.hl_card_ok", { who: staffName(h.card.by), when: when(h.card.at) }) : T("adm.hl_card_pending")]);
    rows.push(["adm.hl_f_files", h.filesDeleted ? T("adm.hl_files_deleted", { d: day(h.filesDeleted) }) : h.filesIn ? T("adm.hl_files_kept") : "—"]);
    return "<dl>" + rows.map(function (r) { return "<dt>" + esc(T(r[0])) + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") + "</dl>";
  }
  function flags(h, det) {
    var out = "";
    (h.sameMobile || []).forEach(function (r) { out += '<p class="hl-flag">' + esc(T("adm.hl_same_mobile", { ref: r })) + "</p>"; });
    ((det && det.same) || []).filter(function (x) { return x.why === "ID"; }).forEach(function (x) { out += '<p class="hl-flag">' + esc(T("adm.hl_same_id", { ref: x.ref, st: T("adm.hl_st_" + x.status) })) + "</p>"; });
    return out;
  }
  function photos(h) {
    var kinds = (h.filesIn ? ["id", "selfie"] : []).concat(h.card && h.card.photo ? ["card"] : []);
    if (!S.d.canFiles || !kinds.length || !(mine(h).check || mine(h).approve)) return "";
    var sh = S.show[h.id] || {};
    var LBL = { id: "adm.hl_show_id", selfie: "adm.hl_show_selfie", card: "adm.hl_show_card" }, ALT = { id: "adm.hl_alt_id", selfie: "adm.hl_alt_selfie", card: "adm.hl_alt_card" };
    return '<div class="acts small">' + kinds.map(function (k) {
      return sh[k] ? "" : '<button type="button" data-act="show" data-k="' + k + '" data-h="' + h.id + '">' + esc(T(LBL[k])) + "</button>";
    }).join("") + '</div><p class="muted-note">' + esc(T("adm.hl_show_note")) + '</p><div class="hl-imgs">' + kinds.filter(function (k) { return sh[k]; }).map(function (k) {
      if (sh[k] === "loading") return '<p class="muted-note">' + esc(T("adm.it_loading")) + "</p>";
      if (sh[k] === "error") return '<p class="hl-flag">' + esc(T("adm.hl_e_FILES_GONE")) + "</p>";
      return '<figure><img src="' + esc(sh[k]) + '" alt="' + esc(T(ALT[k], { name: h.name })) + '"><figcaption>' + esc(T(LBL[k])) + "</figcaption></figure>";
    }).join("") + "</div>";
  }
  function checkForm(h) {
    var id = h.id, f = S.forms[id] || (S.forms[id] = { videoOn: istToday() });
    return '<form class="hl-form" data-form="check" data-h="' + id + '" novalidate><h3>' + esc(T(h.recheck ? "adm.hl_check_re_h" : "adm.hl_check_h")) + "</h3>" +
      chk(id, "idClear", "adm.hl_c_idClear") + chk(id, "selfieMatch", "adm.hl_c_selfieMatch") + chk(id, "videoDone", "adm.hl_c_videoDone") +
      (h.card && h.card.photo && h.card.status !== "OK" ? chk(id, "cardMatch", "adm.hl_c_cardMatch") : "") +
      (h.idType === "AADHAAR" ? chk(id, "aadhaarMasked", "adm.hl_c_aadhaarMasked") : "") +
      '<div class="fld"><label for="hl-' + id + '-videoOn">' + esc(T("adm.hl_c_videoOn")) + '</label><input type="date" id="hl-' + id + '-videoOn" data-f="videoOn" data-h="' + id + '" max="' + istToday() + '" value="' + esc(f.videoOn || "") + '"' + inv(id, "videoOn") + ">" + errOf(id, "videoOn") + "</div>" +
      txt(id, "note", "adm.hl_c_note", T("adm.hl_c_note_h"), 2) +
      '<div class="acts"><button type="submit" class="primary"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.hl_check_btn")) + "</button></div></form>";
  }
  function refuseForm(h) {
    var id = h.id, f = S.forms[id] || (S.forms[id] = {});
    return '<form class="hl-form" data-form="refuse" data-h="' + id + '" novalidate><h3>' + esc(T("adm.hl_refuse_h")) + "</h3>" +
      '<fieldset class="rad"><legend>' + esc(T("adm.hl_refuse_kind")) + "</legend>" +
      ["NOT_FAULT", "FORGED"].filter(function (k) { return k === "NOT_FAULT" || (S.d.canApprove && mine(h).approve); }).map(function (k) {
        return '<span class="ropt"><input type="radio" name="hl-' + id + '-kind" id="hl-' + id + "-kind-" + k + '" value="' + k + '" data-f="kind" data-h="' + id + '"' + (f.kind === k ? " checked" : "") + '><label for="hl-' + id + "-kind-" + k + '">' + esc(T("adm.hl_kind_" + k + "_l")) + "</label></span>";
      }).join("") + errOf(id, "kind") + "</fieldset>" +
      txt(id, "reason", "adm.hl_reason", T("adm.hl_reason_h", { a: S.d.limits.reason[0], b: S.d.limits.reason[1] }), 3) +
      '<div class="acts"><button type="submit" class="danger"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.hl_refuse_btn")) + "</button></div></form>";
  }
  function cardForms(h) {
    var id = h.id;
    return '<form class="hl-form" data-form="cardok" data-h="' + id + '" novalidate><h3>' + esc(T("adm.hl_card_ok_h")) + '</h3><p class="muted-note">' + esc(T("adm.hl_card_ok_p")) + "</p>" +
      chk(id, "matches", "adm.hl_c_cardMatch") + '<div class="acts"><button type="submit" class="primary"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.hl_card_ok_btn")) + "</button></div></form>" +
      '<form class="hl-form" data-form="cardref" data-h="' + id + '" novalidate><h3>' + esc(T("adm.hl_card_ref_h")) + "</h3>" +
      txt(id, "reason", "adm.hl_reason", T("adm.hl_card_ref_hint", { a: S.d.limits.reason[0], b: S.d.limits.reason[1] }), 2) +
      '<div class="acts"><button type="submit" class="danger"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.hl_card_ref_btn")) + "</button></div></form>";
  }
  function approveBox(h) {
    var checker = h.recheck === "CHECKED" ? h.recheckBy : h.checkedBy;
    if (String(checker || "").toLowerCase() === String(S.d.me || "").toLowerCase()) return '<p class="hl-flag">' + esc(T("adm.hl_you_checked")) + "</p>";
    return '<div class="hl-form"><h3>' + esc(T(h.recheck ? "adm.hl_approve_re_h" : "adm.hl_approve_h")) + '</h3><p class="muted-note">' + esc(T(h.recheck ? "adm.hl_approve_re_p" : "adm.hl_approve_p", { who: checker })) + '</p><div class="acts"><button type="button" class="primary" data-act="approve" data-h="' + h.id + '"' + (S.busy ? " disabled" : "") + ">" + esc(T(h.recheck ? "adm.hl_approve_re_btn" : "adm.hl_approve_btn")) + "</button></div></div>";
  }
  function actionForm(h) {
    var id = h.id;
    var canSuspend = h.rawStatus === "ACTIVE" || h.rawStatus === "LAPSED";
    var canRemove = canSuspend || h.rawStatus === "SUSPENDED";
    if (!canRemove) return "";
    return '<form class="hl-form" data-form="action" data-h="' + id + '" novalidate><h3>' + esc(T("adm.hl_action_h")) + '</h3><p class="muted-note">' + esc(T("adm.hl_action_p")) + "</p>" +
      txt(id, "reason", "adm.hl_reason", T("adm.hl_reason_h", { a: S.d.limits.reason[0], b: S.d.limits.reason[1] }), 3) +
      '<div class="acts">' + (canSuspend ? '<button type="submit" data-do="suspend"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.hl_suspend_btn")) + "</button>" : "") +
      '<button type="submit" class="danger" data-do="remove"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.hl_remove_btn")) + "</button></div></form>" +
      (h.rawStatus === "SUSPENDED" && !appealOpen(h) ? '<form class="hl-form" data-form="reinstate" data-h="' + id + '" novalidate><h3>' + esc(T("adm.hl_reinstate_h")) + "</h3>" + txt(id, "note", "adm.hl_note_l", "", 2) +
        '<div class="acts"><button type="submit"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.hl_reinstate_btn")) + "</button></div></form>" : "");
  }
  function appealForm(h) {
    var id = h.id, f = S.forms[id] || (S.forms[id] = {});
    if (String(h.actionBy || "").toLowerCase() === String(S.d.me || "").toLowerCase()) return '<p class="hl-flag">' + esc(T("adm.hl_you_decided")) + "</p>";
    return '<form class="hl-form" data-form="appeal" data-h="' + id + '" novalidate><h3>' + esc(T("adm.hl_appeal_h")) + "</h3><p>" + esc(h.appeal.text) + "</p>" +
      '<fieldset class="rad"><legend>' + esc(T("adm.hl_appeal_result")) + "</legend>" + ["OVERTURNED", "UPHELD"].map(function (k) {
        return '<span class="ropt"><input type="radio" name="hl-' + id + '-result" id="hl-' + id + "-res-" + k + '" value="' + k + '" data-f="result" data-h="' + id + '"' + (f.result === k ? " checked" : "") + '><label for="hl-' + id + "-res-" + k + '">' + esc(T("adm.hl_ap_" + k + "_l")) + "</label></span>";
      }).join("") + errOf(id, "result") + "</fieldset>" + txt(id, "note", "adm.hl_appeal_note", T("adm.hl_appeal_note_h"), 3) +
      '<div class="acts"><button type="submit" class="primary"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.hl_appeal_btn")) + "</button></div></form>";
  }
  function history(det) {
    if (!det) return '<p class="muted-note">' + esc(T("adm.it_loading")) + "</p>";
    var pays = (det.payments || []).filter(function (p) { return p.status !== "CREATED" && p.status !== "EXPIRED"; });
    var fl = det.filings || [];
    var fhtml = fl.length ? "<h3>" + esc(T("adm.hl_filings")) + '</h3><ul class="hl-ev">' + fl.map(function (f) {
      return "<li>" + esc([when(f.at), f.unit || "", T("adm.hl_fs_" + f.status)].concat(f.flags.map(function (x) { return T("adm.hl_flag_" + x); })).concat(f.removed ? [T("adm.hl_removed_" + f.removed)] : []).join(" · ")) + "</li>";
    }).join("") + "</ul>" : "";
    return fhtml + (pays.length ? "<h3>" + esc(T("adm.hl_payments")) + '</h3><ul class="hl-ev">' + pays.map(function (p) {
      return "<li>" + esc([p.receiptNo || "—", T("hp.rc_" + p.kind), rupees(p.price), T("hp.rc_st_" + p.status), day(p.settledAt), p.paymentId || ""].join(" · ")) + (p.receiptNo ? ' · <a href="/helper-receipt?id=' + encodeURIComponent(p.id) + '&src=admin">' + esc(T("hp.rc_view")) + "</a>" : "") + "</li>";
    }).join("") + "</ul>" : "") +
      "<h3>" + esc(T("adm.hl_history")) + '</h3><ul class="hl-ev">' + (det.events || []).map(function (e) {
        return "<li>" + esc(when(e.at)) + " · " + esc(T("adm.hl_ev_" + e.action) !== "adm.hl_ev_" + e.action ? T("adm.hl_ev_" + e.action) : e.action) + " · " + esc(e.actor) + "</li>";
      }).join("") + "</ul>";
  }
  function card(h) {
    var open = !!S.open[h.id], det = S.detail[h.id];
    var title = h.name + (h.ref ? " · " + h.ref : "");
    var body = "";
    if (open) {
      body = summaryDl(h) + flags(h, det) + photos(h) + rowMsg(h.id);
      var m = mine(h), out = false;
      if (S.d.canCheck && needsCheck(h)) { if (m.check) body += h.filesIn ? checkForm(h) : '<p class="hl-flag">' + esc(T("adm.hl_files_gone")) + "</p>"; else out = true; }
      var iChecked = String(h.recheck === "CHECKED" ? h.recheckBy : h.checkedBy || "").toLowerCase() === String(S.d.me || "").toLowerCase();
      if (needsApproval(h) && ((S.d.canApprove && m.approve) || iChecked)) body += approveBox(h);
      else if (needsApproval(h) && S.d.canApprove) out = true;
      if (S.d.canCheck && m.check && (h.rawStatus === "WAITING" || h.rawStatus === "CHECKED")) body += refuseForm(h);
      if (S.d.canCheck && cardPending(h) && !needsCheck(h) && !needsApproval(h)) { if (m.check) body += cardForms(h); else out = true; }
      if (S.d.canApprove && m.approve && appealOpen(h)) body += appealForm(h);
      if (S.d.canApprove && m.approve) body += actionForm(h);
      if (out) body += '<p class="hl-flag">' + esc(T("adm.hl_outside", { area: h.area || "" })) + "</p>";
      body += history(det);
    }
    return '<section class="pr-card" aria-labelledby="hl-h-' + h.id + '"><h2 id="hl-h-' + h.id + '">' + esc(title) + ' <span class="hl-badge">' + esc(st(h)) + "</span>" +
      (h.recheck ? ' <span class="hl-badge">' + esc(T("adm.hl_recheck_" + h.recheck)) + "</span>" : "") + (cardPending(h) ? ' <span class="hl-badge">' + esc(T("adm.hl_card_badge")) + "</span>" : "") + (appealOpen(h) ? ' <span class="hl-badge">' + esc(T("adm.hl_appeal_badge")) + "</span>" : "") + "</h2>" +
      '<p class="muted-note">' + esc([h.unit, h.area].filter(Boolean).join(", ")) + " · " + esc(when(h.submittedAt || h.createdAt)) + "</p>" +
      '<div class="acts small"><button type="button" data-act="open" data-h="' + h.id + '" aria-expanded="' + open + '" aria-controls="hl-b-' + h.id + '">' + esc(T(open ? "adm.hl_close" : "adm.hl_open")) + "</button></div>" +
      '<div id="hl-b-' + h.id + '">' + body + "</div></section>";
  }
  // ---- grieviq-73: complaints filed by helpers, waiting for a call or flagged ----
  function filingCard(f, kind) {
    var id = "f" + f.id, sh = S.phone[f.id];
    var html = '<section class="pr-card" aria-labelledby="hl-h-' + id + '"><h2 id="hl-h-' + id + '">' + esc(f.category || "") + " · " + esc(f.unit || "") + ' <span class="hl-badge">' + esc(f.helperRef || "") + "</span></h2>" +
      '<p class="muted-note">' + esc(T("adm.hl_filed_on", { when: when(f.createdAt) })) + (f.callTries ? " · " + esc(T("adm.hl_call_tries", { n: f.callTries })) : "") + "</p>" +
      (f.description ? "<p>" + esc(f.description) + "</p>" : "") + (f.place ? '<p class="muted-note">' + esc(f.place) + "</p>" : "") +
      f.flags.map(function (x) { return '<p class="hl-flag">' + esc(T("adm.hl_flag_" + x + "_l")) + "</p>"; }).join("") + rowMsg(id);
    if (kind === "call") {
      html += "<p>" + esc(T("adm.hl_call_mobile")) + " <b>" + esc(sh || f.mobile || "") + "</b></p>";
      if (S.d.canCall && f.mine === false) html += '<p class="hl-flag">' + esc(T("adm.hl_outside_f")) + "</p>";
      else if (S.d.canCall) {
        html += (sh ? "" : '<div class="acts small"><button type="button" data-act="phone" data-f="' + esc(f.id) + '">' + esc(T("adm.hl_show_phone")) + '</button></div><p class="muted-note">' + esc(T("adm.hl_show_phone_note")) + "</p>") +
          '<form class="hl-form" data-form="call" data-h="' + id + '" data-f="' + esc(f.id) + '" novalidate><h3>' + esc(T("adm.hl_call_h")) + "</h3>" +
          '<fieldset class="rad"><legend>' + esc(T("adm.hl_call_outcome")) + "</legend>" + ["CONFIRMED", "NO_ANSWER", "NOT_NOW", "NOT_ASKED"].map(function (o) {
            var fm = S.forms[id] || {};
            return '<span class="ropt"><input type="radio" name="hl-' + id + '-o" id="hl-' + id + "-o-" + o + '" value="' + o + '" data-f="outcome" data-h="' + id + '"' + (fm.outcome === o ? " checked" : "") + '><label for="hl-' + id + "-o-" + o + '">' + esc(T("adm.hl_call_" + o)) + "</label></span>";
          }).join("") + errOf(id, "outcome") + "</fieldset>" + txt(id, "note", "adm.hl_note_opt", T("adm.hl_c_note_h"), 2) +
          '<div class="acts"><button type="submit" class="primary"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.hl_call_btn")) + "</button></div></form>";
      }
    } else if (S.d.canCall && f.mine !== false) {
      var fm2 = S.forms[id] || {};
      html += '<form class="hl-form" data-form="flagrev" data-h="' + id + '" data-f="' + esc(f.id) + '" novalidate><h3>' + esc(T("adm.hl_flag_h")) + "</h3>" +
        '<fieldset class="rad"><legend>' + esc(T("adm.hl_flag_q")) + "</legend>" + ["FINE", "FAKE"].map(function (o) {
          return '<span class="ropt"><input type="radio" name="hl-' + id + '-r" id="hl-' + id + "-r-" + o + '" value="' + o + '" data-f="review" data-h="' + id + '"' + (fm2.review === o ? " checked" : "") + '><label for="hl-' + id + "-r-" + o + '">' + esc(T("adm.hl_flag_" + o)) + "</label></span>";
        }).join("") + errOf(id, "review") + "</fieldset>" + txt(id, "note", "adm.hl_reason", T("adm.hl_flag_note_h"), 2) +
        '<div class="acts"><button type="submit" class="primary"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.hl_flag_btn")) + "</button></div></form>";
    }
    return html + "</section>";
  }
  function filingSecs() {
    var calls = S.d.calls || [], flagged = S.d.flagged || [];
    return '<section id="hl-calls" aria-labelledby="hl-calls-h"><h2 class="hl-sec" id="hl-calls-h">' + esc(T("adm.hl_calls_h")) + '<span class="hl-count">' + calls.length + '</span></h2><p class="muted-note">' + esc(T("adm.hl_calls_p")) + "</p>" +
      (calls.length ? calls.map(function (f) { return filingCard(f, "call"); }).join("") : '<p class="muted">' + esc(T("adm.hl_none")) + "</p>") + "</section>" +
      '<section id="hl-flagged" aria-labelledby="hl-flagged-h"><h2 class="hl-sec" id="hl-flagged-h">' + esc(T("adm.hl_flagged_h")) + '<span class="hl-count">' + flagged.length + "</span></h2>" +
      (flagged.length ? flagged.map(function (f) { return filingCard(f, "flag"); }).join("") : '<p class="muted">' + esc(T("adm.hl_none")) + "</p>") + "</section>";
  }
  function refunds() {
    var list = S.d.refunds || [];
    var head = '<h2 class="hl-sec" id="hl-refunds">' + esc(T("adm.hl_refunds_h")) + '<span class="hl-count">' + list.length + "</span></h2>";
    if (!list.length) return head + '<p class="muted">' + esc(T("adm.hl_none")) + "</p>";
    return head + list.map(function (p) {
      var id = "p" + p.id;
      return '<section class="pr-card" aria-labelledby="hl-h-' + id + '"><h2 id="hl-h-' + id + '">' + (p.name ? esc(p.name) + " · " : "") + esc(p.ref || "") + " · " + esc(rupees(p.amountTaken)) + "</h2>" +
        '<p class="muted-note">' + esc(T("adm.hl_why_" + (p.refundWhy || "AMOUNT"))) + " · " + esc(p.receiptNo || "") + " · " + esc(p.paymentId || "") + "</p>" + rowMsg(id) +
        (S.d.canRefund && p.mine !== false ? '<div class="acts small"><button type="button" class="primary" data-act="refund" data-p="' + esc(p.id) + '"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.hl_refund_btn", { amount: rupees(p.amountTaken) })) + "</button></div>" +
          '<form class="hl-form" data-form="refunded" data-h="' + id + '" data-p="' + esc(p.id) + '" novalidate>' + txt(id, "note", "adm.hl_refunded_note", T("adm.hl_refunded_note_h"), 2) +
          '<div class="acts"><button type="submit"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.hl_refunded_btn")) + "</button></div></form>" : "") + "</section>";
    }).join("");
  }
  // ---- grieviq-75: duties by area ----
  function mine(h) { return h.mine || { check: !!S.d.canCheck, approve: !!S.d.canApprove, any: true }; }
  function areaList(d) { return d.areas ? d.areas.map(function (id) { var a = (S.d.coverage && S.d.coverage.areas || []).find(function (x) { return x.id === id; }); return a ? a.name : id; }).join(", ") : T("adm.du_all_areas"); }
  function coverBox() {
    var c = S.d.coverage; if (!c) return "";
    var warn = c.checkers < 1 || c.approvers < 1 || (c.checkers + c.approvers) < 2;
    var areaRows = (c.areas || []).map(function (a) {
      var none = a.checkers < 1 || a.approvers < 1;
      return "<li" + (none ? ' class="hl-flag"' : "") + ">" + esc(T("adm.hl_cov_area", { area: a.name, c: a.checkers, a: a.approvers })) +
        (none ? " — " + esc(T("adm.hl_cov_nobody")) : (!a.ownCheckers || !a.ownApprovers) ? " — " + esc(T("adm.hl_cov_by_all")) : "") + "</li>";
    }).join("");
    var mineTxt = (S.d.duties || []).map(function (d) { return T("adm.du_" + d.duty) + " (" + areaList(d) + ")"; }).join(" · ");
    return '<section class="hl-cover" aria-labelledby="hl-cov-h"><h2 class="hl-sec" id="hl-cov-h">' + esc(T("adm.hl_cov_h")) + "</h2>" +
      "<p>" + esc(T("adm.hl_cov_line", { c: c.checkers, a: c.approvers })) + (S.d.isSuper ? ' <a href="/admin-staff.html">' + esc(T("adm.hl_cov_assign")) + "</a>" : "") + "</p>" +
      (warn ? '<p class="hl-flag">' + esc(T("adm.hl_cov_warn")) + "</p>" : "") +
      (areaRows ? '<ul class="hl-ev">' + areaRows + "</ul>" : "") +
      '<p class="muted-note">' + esc(mineTxt ? T("adm.hl_cov_mine", { duties: mineTxt }) : T("adm.hl_cov_none_mine")) + "</p></section>";
  }
  function paymentsView() {
    var d = S.d, list = d.payments || [];
    return '<p class="muted-note">' + esc(T("adm.hl_pay_only")) + "</p>" + refunds() +
      '<h2 class="hl-sec" id="hl-pays">' + esc(T("adm.hl_pays_h")) + '<span class="hl-count">' + list.length + "</span></h2>" +
      (list.length ? '<div class="hl-table-wrap"><table class="hl-table"><caption class="sr-only">' + esc(T("adm.hl_pays_h")) + "</caption><thead><tr><th scope=\"col\">" + esc(T("adm.hl_pt_ref")) + "</th><th scope=\"col\">" + esc(T("adm.hl_pt_receipt")) + "</th><th scope=\"col\">" + esc(T("adm.hl_pt_amount")) + "</th><th scope=\"col\">" + esc(T("adm.hl_pt_status")) + "</th><th scope=\"col\">" + esc(T("adm.hl_pt_date")) + "</th></tr></thead><tbody>" +
        list.map(function (p) { return "<tr><td>" + esc(p.ref) + "</td><td>" + (p.receiptNo ? '<a href="/helper-receipt?id=' + encodeURIComponent(p.id) + '&src=admin">' + esc(p.receiptNo) + "</a>" : "—") + "</td><td>" + esc(rupees(p.price)) + "</td><td>" + esc(T("hp.rc_st_" + p.status)) + "</td><td>" + esc(day(p.settledAt || p.startedAt)) + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : '<p class="muted">' + esc(T("adm.hl_none")) + "</p>");
  }
  function render(focusId) {
    var app = $("hl-app");
    if (S.err) { app.innerHTML = '<p class="muted">' + esc(T(S.err)) + "</p>"; return; }
    var d = S.d; if (!d) return;
    if (!d.ready) { app.innerHTML = '<p class="muted">' + esc(T("adm.hl_not_ready")) + "</p>"; return; }
    if (d.paymentsOnly) { app.innerHTML = paymentsView(); if (focusId) { var fe = $(focusId); if (fe) fe.focus(); } return; }
    var hs = d.helpers;
    var toCheck = hs.filter(needsCheck), toApprove = hs.filter(needsApproval), appeals = hs.filter(appealOpen);
    var cards = hs.filter(function (h) { return cardPending(h) && !needsCheck(h) && !needsApproval(h) && !appealOpen(h); });
    var q = S.q.trim().toLowerCase();
    var rest = hs.filter(function (h) {
      var okF = S.filter === "ALL" || (S.filter === "OPEN" ? ["ACTIVE", "LAPSED", "SUSPENDED", "DRAFT"].indexOf(h.rawStatus) >= 0 : h.rawStatus === S.filter);
      var okQ = !q || [h.name, h.ref, h.unit, h.mobile].join(" ").toLowerCase().indexOf(q) >= 0;
      return okF && okQ && !needsCheck(h) && !needsApproval(h) && !appealOpen(h) && cards.indexOf(h) < 0;
    });
    var sec = function (key, list, id) {
      return '<section id="' + id + '" aria-labelledby="' + id + '-h"><h2 class="hl-sec" id="' + id + '-h">' + esc(T(key)) + '<span class="hl-count">' + list.length + "</span></h2>" + (list.length ? list.map(card).join("") : '<p class="muted">' + esc(T("adm.hl_none")) + "</p>") + "</section>";
    };
    app.innerHTML = (d.setUp ? "" : '<p class="st-warn">' + esc(T("adm.hl_not_set_up")) + "</p>") +
      (!d.canCheck && !d.canApprove ? '<p class="readonly-tag" style="margin-left:0">' + esc(T("adm.hl_readonly_duty")) + "</p>" : "") + coverBox() +
      sec("adm.hl_to_check", toCheck, "hl-check") + sec("adm.hl_to_approve", toApprove, "hl-approve") + sec("adm.hl_appeals", appeals, "hl-appeals") + sec("adm.hl_cards", cards, "hl-cards") + filingSecs() + refunds() +
      '<h2 class="hl-sec" id="hl-all">' + esc(T("adm.hl_all")) + '<span class="hl-count">' + rest.length + "</span></h2>" +
      '<div class="hl-filter"><div class="fld"><label for="hl-filter">' + esc(T("adm.hl_filter")) + '</label><select id="hl-filter">' +
        ["OPEN", "ALL", "ACTIVE", "LAPSED", "SUSPENDED", "REMOVED", "REFUSED", "STOPPED", "WITHDRAWN", "DRAFT"].map(function (k) { return '<option value="' + k + '"' + (S.filter === k ? " selected" : "") + ">" + esc(T(k === "OPEN" ? "adm.hl_f_open" : k === "ALL" ? "adm.hl_f_all" : "adm.hl_st_" + k)) + "</option>"; }).join("") + "</select></div>" +
      '<div class="fld"><label for="hl-q">' + esc(T("adm.hl_search")) + '</label><input type="search" id="hl-q" value="' + esc(S.q) + '" autocomplete="off"></div></div>' +
      (rest.length ? rest.map(card).join("") : '<p class="muted">' + esc(T("adm.hl_none")) + "</p>");
    if (focusId) { var el = $(focusId); if (el) el.focus(); }
  }

  // ---- events ----
  function done(id, x, okKey) {
    S.busy = null;
    if (x.r.ok) {
      var text = T(okKey, { ref: x.j.ref || x.j.trackingRef || "" });
      S.fields[id] = {}; S.forms[id] = {}; S.rowMsg[id] = { text: text };
      return load().then(function () {
        if ($("hl-" + id + "-msg")) { $("hl-msg").innerHTML = ""; render("hl-" + id + "-msg"); return; }
        // The item has moved off its list (sent, dropped): say so at the top.
        $("hl-msg").innerHTML = '<p class="st-msg success" tabindex="-1" id="hl-msg-p">' + esc(text) + "</p>"; $("hl-msg-p").focus();
      });
    }
    if (x.j.error === "CHECK_FIELDS") { S.fields[id] = x.j.fields || {}; S.rowMsg[id] = { text: T("adm.hl_e_fields"), bad: true }; render("hl-" + id + "-msg"); return; }
    S.rowMsg[id] = { text: T("adm.hl_e_" + (x.j.error || "x")) !== "adm.hl_e_" + (x.j.error || "x") ? T("adm.hl_e_" + x.j.error) : T("adm.hl_e_generic"), bad: true };
    render("hl-" + id + "-msg");
  }
  function fail(id) { S.busy = null; S.rowMsg[id] = { text: T("adm.hl_e_generic"), bad: true }; render("hl-" + id + "-msg"); }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.getAttribute("data-act"), id = b.getAttribute("data-h");
    if (act === "open") {
      S.open[id] = !S.open[id];
      render(); var again = document.querySelector('[data-act="open"][data-h="' + id + '"]'); if (again) again.focus();
      if (S.open[id]) loadOne(id).then(function () { render(); var a2 = document.querySelector('[data-act="open"][data-h="' + id + '"]'); if (a2) a2.focus(); });
      return;
    }
    if (act === "show") {
      // Fetched once per click (each fetch is recorded in the helper's history); kept in this page only.
      var s = S.show[id] || (S.show[id] = {}), k = b.getAttribute("data-k");
      s[k] = "loading"; render();
      fetch("/api/admin/helpers?file=" + encodeURIComponent(id) + "&kind=" + k, { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.blob(); })
        .then(function (bl) { s[k] = URL.createObjectURL(bl); }, function () { s[k] = "error"; })
        .then(function () { return loadOne(id); }).then(function () { render(); });
      return;
    }
    if (act === "phone") {
      var fid = b.getAttribute("data-f");
      fetch("/api/admin/helpers?phone=" + encodeURIComponent(fid), { cache: "no-store" }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
        .then(function (x) { if (x.r.ok) S.phone[fid] = x.j.mobile; else S.rowMsg["f" + fid] = { text: T("adm.hl_e_generic"), bad: true }; render(); });
      return;
    }
    if (act === "approve") { S.busy = "x"; render(); post({ action: "approve", id: id }).then(function (x) { return done(id, x, "adm.hl_ok_approved"); }, function () { fail(id); }); return; }
    if (act === "refund") { var pid = b.getAttribute("data-p"), rid = "p" + pid; S.busy = "x"; render(); post({ action: "refund", paymentId: pid }).then(function (x) { return done(rid, x, "adm.hl_ok_refunded"); }, function () { fail(rid); }); return; }
  });
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "hl-q") { S.q = t.value; render("hl-q"); return; }
    var id = t.getAttribute && t.getAttribute("data-h"), k = t.getAttribute && t.getAttribute("data-f");
    if (id && k && t.type !== "checkbox" && t.type !== "radio") { (S.forms[id] = S.forms[id] || {})[k] = t.value; }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "hl-filter") { S.filter = t.value; render("hl-filter"); return; }
    var id = t.getAttribute("data-h"), k = t.getAttribute("data-f");
    if (!id || !k) return;
    var f = S.forms[id] = S.forms[id] || {};
    if (t.type === "checkbox") f[k] = t.checked; else f[k] = t.value;
  });
  document.addEventListener("submit", function (e) {
    var fm = e.target; if (!fm.getAttribute("data-form")) return;
    e.preventDefault();
    var kind = fm.getAttribute("data-form"), id = fm.getAttribute("data-h"), f = S.forms[id] || {};
    var by = e.submitter && e.submitter.getAttribute("data-do");
    var body, okKey;
    if (kind === "check") { body = { action: "check", id: id, idClear: !!f.idClear, selfieMatch: !!f.selfieMatch, videoDone: !!f.videoDone, cardMatch: !!f.cardMatch, aadhaarMasked: !!f.aadhaarMasked, videoOn: f.videoOn || "", note: f.note || "" }; okKey = "adm.hl_ok_checked"; }
    else if (kind === "refuse") { body = { action: "refuse", id: id, kind: f.kind || "", reason: f.reason || "" }; okKey = "adm.hl_ok_refused"; }
    else if (kind === "action") { body = { action: by === "suspend" ? "suspend" : "remove", id: id, reason: f.reason || "" }; okKey = by === "suspend" ? "adm.hl_ok_suspended" : "adm.hl_ok_removed"; }
    else if (kind === "cardok") { body = { action: "card-ok", id: id, matches: !!f.matches }; okKey = "adm.hl_ok_card"; }
    else if (kind === "cardref") { body = { action: "card-refuse", id: id, reason: f.reason || "" }; okKey = "adm.hl_ok_card_ref"; }
    else if (kind === "reinstate") { body = { action: "reinstate", id: id, note: f.note || "" }; okKey = "adm.hl_ok_reinstated"; }
    else if (kind === "appeal") { body = { action: "appeal", id: id, result: f.result || "", note: f.note || "" }; okKey = "adm.hl_ok_appeal"; }
    else if (kind === "call") { body = { action: "call", filingId: fm.getAttribute("data-f"), outcome: f.outcome || "", note: f.note || "" }; okKey = f.outcome === "CONFIRMED" ? "adm.hl_ok_call_sent" : "adm.hl_ok_call"; }
    else if (kind === "flagrev") { body = { action: "flag", filingId: fm.getAttribute("data-f"), review: f.review || "", note: f.note || "" }; okKey = "adm.hl_ok_flag"; }
    else if (kind === "refunded") { body = { action: "refunded", paymentId: fm.getAttribute("data-p"), note: f.note || "" }; okKey = "adm.hl_ok_refunded"; }
    if (!body) return;
    S.busy = "x"; render();
    post(body).then(function (x) { return done(id, x, okKey); }, function () { fail(id); });
  });
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
