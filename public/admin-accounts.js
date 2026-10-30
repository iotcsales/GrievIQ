/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// Admin "Accounts" (grieviq-76): GST tax invoices, credit notes, receipt and
// refund vouchers, and the reports a CA needs (sales register, GST summary,
// TDS to claim, money owed, unearned yearly plans, Razorpay settlements),
// with CSV exports. Accounts staff and the super admin; the auditor reads.
(function () {
  "use strict";
  function T(k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function loc() { return window.GIQ && GIQ.locale ? GIQ.locale() : "en-IN"; }
  function inr(n) { n = Number(n || 0); return (n < 0 ? "−₹" : "₹") + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function day(s) { if (!s) return ""; var d = new Date(String(s).length === 10 ? s + "T00:00:00Z" : s); return isNaN(d) ? s : d.toLocaleDateString(loc(), { day: "numeric", month: "short", year: "numeric", timeZone: String(s).length === 10 ? "UTC" : "Asia/Kolkata" }); }
  function monthName(m) { var d = new Date(m + "-01T00:00:00Z"); return isNaN(d) ? m : d.toLocaleDateString(loc(), { month: "long", year: "numeric", timeZone: "UTC" }); }
  var TABS = ["summary", "register", "gst", "tds", "receivables", "deferred", "settlements"];
  var S = { tab: "summary", month: null, data: {}, sum: null, err: null, busy: false, set: null, setErr: {}, lockNote: "", unlockReason: "", unlockErr: false };
  try { var t0 = localStorage.getItem("giq-ac-tab"); if (TABS.indexOf(t0) >= 0) S.tab = t0; } catch (e) {}

  function msg(text, bad) { var m = $("ac-msg"); m.innerHTML = text ? '<p class="st-msg ' + (bad ? "error" : "success") + '">' + esc(text) + "</p>" : ""; if (text) m.focus(); }
  function get(view) {
    return fetch("/api/admin/accounts?view=" + view + (S.month ? "&month=" + S.month : ""), { cache: "no-store" }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); });
  }
  function post(body) {
    return fetch("/api/admin/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); });
  }
  function load() {
    return get("summary").then(function (x) {
      if (!x.r.ok) { S.err = x.j.error === "INSUFFICIENT_ROLE" || x.j.error === "NOT_ADMIN" ? "adm.no_access" : "adm.ss_e_load"; render(); return; }
      S.sum = x.j; if (!S.month) S.month = x.j.month;
      if (!S.set && x.j.settings) S.set = JSON.parse(JSON.stringify(x.j.settings));
      return S.tab === "summary" ? render() : loadTab();
    }).catch(function () { S.err = "adm.ss_e_load"; render(); });
  }
  function loadTab() {
    if (S.tab === "summary") { render(); return Promise.resolve(); }
    S.data[S.tab] = null; render();
    return get(S.tab).then(function (x) { S.data[S.tab] = x.r.ok ? x.j : { error: true }; render(); }).catch(function () { S.data[S.tab] = { error: true }; render(); });
  }

  // ---- pieces ----
  function tabs() {
    return '<div class="ac-tabs" role="tablist" aria-label="' + esc(T("adm.ac_tabs")) + '">' + TABS.map(function (t) {
      return '<button type="button" role="tab" id="ac-tab-' + t + '" aria-selected="' + (S.tab === t) + '" aria-controls="ac-panel" data-tab="' + t + '"' + (S.tab === t ? "" : ' tabindex="-1"') + ">" + esc(T("adm.ac_t_" + t)) + "</button>";
    }).join("") + "</div>";
  }
  function monthBar(extra) {
    var ms = (S.sum && S.sum.months) || [];
    if (S.month && ms.indexOf(S.month) < 0) ms = [S.month].concat(ms);
    return '<div class="ac-bar"><div class="fld"><label for="ac-month">' + esc(T("adm.ac_month")) + '</label><select id="ac-month">' +
      ms.map(function (m) { return '<option value="' + esc(m) + '"' + (m === S.month ? " selected" : "") + ">" + esc(monthName(m)) + "</option>"; }).join("") + "</select></div>" + (extra || "") + "</div>";
  }
  function table(head, rows, foot) {
    return '<div class="ac-table-wrap"><table class="ac-t"><thead><tr>' + head.map(function (h) { return '<th scope="col"' + (h.num ? ' class="num"' : "") + ">" + esc(T(h.k)) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      (rows.length ? rows.join("") : '<tr><td colspan="' + head.length + '" class="muted">' + esc(T("adm.ac_none")) + "</td></tr>") + (foot || "") + "</tbody></table></div>";
  }
  function td(v, num) { return "<td" + (num ? ' class="num"' : "") + ">" + v + "</td>"; }
  function kindName(k) { return T("adm.ac_k_" + k); }

  function summary() {
    var d = S.sum, h = "";
    if (!d.gstOk) h += '<p class="ac-warn">' + esc(T("adm.ac_no_gstin")) + "</p>";
    if (d.eInvoiceWarn) h += '<p class="ac-warn">' + esc(T("adm.ac_einv_warn")) + "</p>";
    h += '<div class="ac-cards">' +
      '<div class="ac-card"><div class="l">' + esc(T("adm.ac_gstin")) + '</div><div class="v" style="font-size:16px">' + esc(d.gstin || "—") + "</div><div class=\"l\">" + esc(d.supplierStateName ? d.supplierStateName + " (" + d.supplierState + ")" : "") + "</div></div>" +
      '<div class="ac-card"><div class="l">' + esc(T("adm.ac_turnover", { fy: d.fy })) + '</div><div class="v">' + esc(inr(d.turnover)) + '</div><div class="l">' + esc(T("adm.ac_einv_note")) + "</div></div>" +
      '<div class="ac-card"><div class="l">' + esc(T("adm.ac_from")) + '</div><div class="v" style="font-size:16px">' + esc(d.settings.invoiceFrom ? day(d.settings.invoiceFrom) : T("adm.ac_from_none")) + "</div></div></div>";
    h += '<h2 class="ac-sub">' + esc(T("adm.ac_next_h")) + "</h2>" + table([{ k: "adm.ac_series" }, { k: "adm.ac_next" }], Object.keys(d.nextNumbers).map(function (k) {
      return "<tr>" + td(esc(T("adm.ac_s_" + k))) + td("<code>" + esc(d.nextNumbers[k]) + "</code>") + "</tr>"; }));
    if (d.canManage) h += '<div class="acts"><button type="button" class="primary" id="ac-sync"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.ac_sync")) + '</button></div><p class="muted-note">' + esc(T("adm.ac_sync_p")) + "</p>";
    // filed months
    h += '<h2 class="ac-sub">' + esc(T("adm.ac_locks_h")) + '</h2><p class="muted-note">' + esc(T("adm.ac_locks_p")) + "</p>" +
      table([{ k: "adm.ac_month" }, { k: "adm.ac_locked_by" }, { k: "adm.ac_note" }], (d.locks || []).map(function (l) { return "<tr>" + td(esc(monthName(l.month))) + td(esc(l.locked_by) + " · " + esc(day(l.locked_at))) + td(esc(l.note || "")) + "</tr>"; }));
    if (d.canManage) h += '<form id="ac-lock" class="ac-bar" novalidate><div class="fld"><label for="ac-lock-m">' + esc(T("adm.ac_lock_month")) + '</label><input type="month" id="ac-lock-m" max="' + esc(prevMonth(d.today)) + '" value="' + esc(prevMonth(d.today)) + '"></div>' +
      '<div class="fld" style="max-width:none;flex:1 1 220px"><label for="ac-lock-n">' + esc(T("adm.ac_note")) + '</label><input type="text" id="ac-lock-n" maxlength="300" autocomplete="off" value="' + esc(S.lockNote) + '"></div><button type="submit">' + esc(T("adm.ac_lock_btn")) + "</button></form>";
    if (d.isSuper && (d.locks || []).length) h += '<form id="ac-unlock" class="ac-bar" novalidate><div class="fld"><label for="ac-unlock-m">' + esc(T("adm.ac_unlock_month")) + '</label><select id="ac-unlock-m">' + d.locks.map(function (l) { return '<option value="' + esc(l.month) + '">' + esc(monthName(l.month)) + "</option>"; }).join("") + "</select></div>" +
      '<div class="fld" style="max-width:none;flex:1 1 220px"><label for="ac-unlock-r">' + esc(T("adm.ac_reason")) + '</label><input type="text" id="ac-unlock-r" maxlength="300" autocomplete="off" value="' + esc(S.unlockReason) + '"' + (S.unlockErr ? ' aria-invalid="true" aria-describedby="ac-unlock-e"' : "") + ">" + (S.unlockErr ? '<span class="ferr" id="ac-unlock-e">' + esc(T("adm.ac_e_reason10")) + "</span>" : "") + '</div><button type="submit" class="danger">' + esc(T("adm.ac_unlock_btn")) + "</button></form>";
    h += settingsForm(d);
    return h;
  }
  function prevMonth(today) { var y = +today.slice(0, 4), m = +today.slice(5, 7) - 1; if (m === 0) { y--; m = 12; } return y + "-" + String(m).padStart(2, "0"); }
  function settingsForm(d) {
    var s = S.set, e = S.setErr, ro = !d.isSuper;
    var f = function (id, label, val, err, extra) {
      return '<div class="fld"><label for="' + id + '">' + esc(label) + '</label><input type="' + ((extra && extra.type) || "text") + '" id="' + id + '" value="' + esc(val || "") + '"' + (ro ? " disabled" : "") + ((extra && extra.max) ? ' maxlength="' + extra.max + '"' : "") + (err ? ' aria-invalid="true" aria-describedby="' + id + '-e"' : "") + ' autocomplete="off" spellcheck="false">' + (err ? '<span class="ferr" id="' + id + '-e">' + esc(T("adm.ac_e_" + err)) + "</span>" : "") + "</div>";
    };
    var h = '<h2 class="ac-sub">' + esc(T("adm.ac_set_h")) + '</h2><p class="muted-note">' + esc(T(ro ? "adm.ac_set_ro" : "adm.ac_set_p")) + '</p><form id="ac-set" novalidate>' +
      '<div class="ac-form">' + f("as-sacOffice", T("adm.ac_sac_office"), s.sacOffice, e.sacOffice, { max: 6 }) + f("as-sacHelper", T("adm.ac_sac_helper"), s.sacHelper, e.sacHelper, { max: 6 }) +
      f("as-invoiceFrom", T("adm.ac_from"), s.invoiceFrom, e.invoiceFrom, { type: "date" }) + "</div>" +
      "<fieldset class=\"rad\" style=\"border:0;padding:0\"><legend>" + esc(T("adm.ac_prefixes")) + '</legend><div class="ac-form">' +
      ["R", "D", "H", "S", "N"].map(function (k) { return f("as-p-" + k, T("adm.ac_s_" + k), s.prefixes[k], e["prefixes." + k], { max: 5 }); }).join("") + "</div></fieldset>" +
      "<fieldset class=\"rad\" style=\"border:0;padding:0\"><legend>" + esc(T("adm.ac_cn_prefixes")) + '</legend><div class="ac-form">' +
      ["R", "D", "H", "S", "N"].map(function (k) { return f("as-c-" + k, T("adm.ac_s_" + k), s.cnPrefixes[k], e["cnPrefixes." + k], { max: 5 }); }).join("") +
      f("as-rv", T("adm.ac_s_RV"), s.rvPrefix, e.rvPrefix, { max: 5 }) + f("as-rf", T("adm.ac_s_RF"), s.rfPrefix, e.rfPrefix, { max: 5 }) + "</div></fieldset>" +
      (e.prefixes === "SAME" ? '<p class="ferr" role="alert">' + esc(T("adm.ac_e_SAME")) + "</p>" : "");
    if (!ro) h += '<div class="fld" style="max-width:520px"><label for="as-reason">' + esc(T("adm.ac_reason")) + '</label><input type="text" id="as-reason" maxlength="300" autocomplete="off" value="' + esc(s.reason || "") + '"' + (e.reason ? ' aria-invalid="true" aria-describedby="as-reason-e"' : "") + ">" + (e.reason ? '<span class="ferr" id="as-reason-e">' + esc(T("adm.ac_e_reason")) + "</span>" : "") + "</div>" +
      '<div class="acts"><button type="submit" class="primary"' + (S.busy ? " disabled" : "") + ">" + esc(T("adm.ac_set_save")) + "</button></div>";
    return h + '<p class="muted-note">' + esc(T("adm.ac_set_note")) + "</p></form>";
  }
  function exports() {
    return ["register", "gstr1", "tally"].map(function (x) { return '<a class="btnlink" href="/api/admin/accounts?export=' + x + "&month=" + esc(S.month) + '" download>' + esc(T("adm.ac_x_" + x)) + "</a>"; }).join("");
  }
  function register(d) {
    return monthBar(exports()) + (d.locked ? '<p class="muted-note">' + esc(T("adm.ac_locked_note")) + "</p>" : "") +
      table([{ k: "adm.ac_c_no" }, { k: "adm.ac_c_kind" }, { k: "adm.ac_c_date" }, { k: "adm.ac_c_party" }, { k: "adm.ac_c_place" }, { k: "adm.ac_c_taxable", num: 1 }, { k: "adm.ac_c_tax", num: 1 }, { k: "adm.ac_c_total", num: 1 }],
        d.docs.map(function (x) {
          return "<tr>" + td('<a href="/tax-doc?id=' + encodeURIComponent(x.id) + '&src=admin" target="_blank" rel="noopener">' + esc(x.number) + "</a>" + (x.cancelled ? '<br><span class="muted">' + esc(T("adm.ac_credited")) + "</span>" : "")) +
            td(esc(kindName(x.kind))) + td(esc(day(x.date))) + td(esc(x.partyName) + (x.partyGstin ? '<br><span class="muted">' + esc(x.partyGstin) + "</span>" : "")) + td(esc(x.placeName)) +
            td(esc(inr(x.taxable)), 1) + td(esc(inr(x.cgst + x.sgst + x.igst)), 1) + td(esc(inr(x.total)), 1) + "</tr>";
        }));
  }
  function gst(d) {
    var t = d.totals;
    var h = monthBar(exports()) + '<div class="ac-cards">' + [["adm.ac_c_taxable", t.taxable], ["adm.ac_cgst", t.cgst], ["adm.ac_sgst", t.sgst], ["adm.ac_igst", t.igst]].map(function (x) {
      return '<div class="ac-card"><div class="l">' + esc(T(x[0])) + '</div><div class="v">' + esc(inr(x[1])) + "</div></div>"; }).join("") + "</div>";
    var tx = function (r) { return td(esc(inr(r.taxable)), 1) + td(esc(inr(r.cgst)), 1) + td(esc(inr(r.sgst)), 1) + td(esc(inr(r.igst)), 1); };
    var head4 = [{ k: "adm.ac_c_taxable", num: 1 }, { k: "adm.ac_cgst", num: 1 }, { k: "adm.ac_sgst", num: 1 }, { k: "adm.ac_igst", num: 1 }];
    h += '<h2 class="ac-sub">' + esc(T("adm.ac_b2b")) + "</h2>" + table([{ k: "adm.ac_c_no" }, { k: "adm.ac_c_gstin" }, { k: "adm.ac_c_party" }, { k: "adm.ac_c_place" }].concat(head4),
      d.b2b.map(function (r) { return "<tr>" + td(esc(r.number) + (r.kind === "CREDIT_NOTE" ? '<br><span class="muted">' + esc(kindName(r.kind)) + "</span>" : "")) + td(esc(r.gstin)) + td(esc(r.name)) + td(esc(r.place)) + tx(r) + "</tr>"; }));
    h += '<h2 class="ac-sub">' + esc(T("adm.ac_b2c")) + "</h2>" + table([{ k: "adm.ac_c_place" }, { k: "adm.ac_c_rate" }].concat(head4),
      d.b2c.map(function (r) { return "<tr>" + td(esc(r.placeName + " (" + r.place + ")")) + td(esc(r.rate + "%")) + tx(r) + "</tr>"; }));
    h += '<h2 class="ac-sub">' + esc(T("adm.ac_sac_h")) + "</h2>" + table([{ k: "adm.ac_c_sac" }, { k: "adm.ac_c_rate" }].concat(head4),
      d.sac.map(function (r) { return "<tr>" + td(esc(r.sac)) + td(esc(r.rate + "%")) + tx(r) + "</tr>"; }));
    h += '<h2 class="ac-sub">' + esc(T("adm.ac_docs_h")) + "</h2>" + table([{ k: "adm.ac_series" }, { k: "adm.ac_c_from" }, { k: "adm.ac_c_to" }, { k: "adm.ac_c_count", num: 1 }],
      d.documents.map(function (r) { return "<tr>" + td(esc(kindName(r.kind))) + td(esc(r.from)) + td(esc(r.to)) + td(esc(r.count), 1) + "</tr>"; }));
    if (d.advances.length) h += '<h2 class="ac-sub">' + esc(T("adm.ac_adv_h")) + '</h2><p class="muted-note">' + esc(T("adm.ac_adv_p")) + "</p>" + table([{ k: "adm.ac_c_no" }, { k: "adm.ac_c_kind" }, { k: "adm.ac_c_place" }].concat(head4),
      d.advances.map(function (r) { return "<tr>" + td(esc(r.number)) + td(esc(kindName(r.kind))) + td(esc(r.place)) + tx(r) + "</tr>"; }));
    return h;
  }
  function tds(d) {
    return '<p class="muted-note">' + esc(T("adm.ac_tds_p")) + "</p>" + table([{ k: "adm.ac_c_bill" }, { k: "adm.ac_c_party" }, { k: "adm.ac_c_invoice" }, { k: "adm.ac_c_gsttds", num: 1 }, { k: "adm.ac_c_ittds", num: 1 }, { k: "adm.ac_c_cert" }, { k: "adm.ac_c_date" }],
      d.tds.map(function (r) { return "<tr>" + td(esc(r.bill)) + td(esc(r.office) + (r.gstin ? '<br><span class="muted">' + esc(r.gstin) + "</span>" : "")) + td(esc(r.invoice || "—")) + td(esc(inr(r.gstTds)), 1) + td(esc(inr(r.itTds)), 1) + td(esc(r.cert || "—")) + td(esc(day(r.at))) + "</tr>"; }));
  }
  function receivables(d) {
    var b = ["NOT_DUE", "D30", "D60", "D90", "OVER90"];
    return '<div class="ac-cards">' + b.map(function (k) { return '<div class="ac-card"><div class="l">' + esc(T("adm.ac_b_" + k)) + '</div><div class="v">' + esc(inr(d.sums[k] || 0)) + "</div></div>"; }).join("") + "</div>" +
      table([{ k: "adm.ac_c_bill" }, { k: "adm.ac_c_party" }, { k: "adm.ac_c_invoice" }, { k: "adm.ac_c_due" }, { k: "adm.ac_c_age" }, { k: "adm.ac_c_total", num: 1 }],
        d.receivables.map(function (r) { return "<tr>" + td(esc(r.bill) + (r.reported ? '<br><span class="muted">' + esc(T("adm.ac_reported")) + "</span>" : "")) + td(esc(r.office)) + td(esc(r.invoice || "—")) + td(esc(day(r.dueOn))) + td(esc(T("adm.ac_b_" + r.bucket))) + td(esc(inr(r.total)), 1) + "</tr>"; }));
  }
  function deferred(d) {
    return monthBar() + '<p class="muted-note">' + esc(T("adm.ac_def_p", { date: day(d.asOf) })) + "</p>" +
      table([{ k: "adm.ac_c_bill" }, { k: "adm.ac_c_party" }, { k: "adm.ac_c_period" }, { k: "adm.ac_c_taxable", num: 1 }, { k: "adm.ac_c_unearned", num: 1 }],
        d.deferred.map(function (r) { return "<tr>" + td(esc(r.bill)) + td(esc(r.office)) + td(esc(day(r.from) + " – " + day(r.to))) + td(esc(inr(r.amount)), 1) + td(esc(inr(r.unearned)), 1) + "</tr>"; }),
        '<tr class="tot"><td colspan="4">' + esc(T("adm.ac_total")) + '</td><td class="num">' + esc(inr(d.totalUnearned)) + "</td></tr>");
  }
  function settlements(d) {
    var t = d.totals;
    return monthBar(S.sum.canManage ? '<button type="button" id="ac-fetch"' + (S.busy || !d.rzpOn ? " disabled" : "") + ">" + esc(T("adm.ac_fetch")) + "</button>" : "") +
      (!d.rzpOn ? '<p class="muted-note">' + esc(T("adm.ac_rzp_off")) + "</p>" : "") +
      '<div class="ac-cards">' + [["adm.ac_c_amount", t.amount], ["adm.ac_c_fee", t.fee], ["adm.ac_c_feegst", t.tax], ["adm.ac_c_net", t.net]].map(function (x) {
        return '<div class="ac-card"><div class="l">' + esc(T(x[0])) + '</div><div class="v">' + esc(inr(x[1])) + "</div></div>"; }).join("") + "</div>" +
      table([{ k: "adm.ac_c_payment" }, { k: "adm.ac_c_matched" }, { k: "adm.ac_c_amount", num: 1 }, { k: "adm.ac_c_fee", num: 1 }, { k: "adm.ac_c_feegst", num: 1 }, { k: "adm.ac_c_net", num: 1 }, { k: "adm.ac_c_settlement" }],
        d.settlements.map(function (r) { return "<tr>" + td('<span lang="en">' + esc(r.payment) + "</span>") + td(r.matched ? esc(T("adm.ac_m_" + r.matched.kind)) + " · " + esc(r.matched.ref || "") : '<span class="muted">' + esc(T("adm.ac_m_none")) + "</span>") +
          td(esc(inr(r.amount)), 1) + td(esc(inr(r.fee)), 1) + td(esc(inr(r.tax)), 1) + td(esc(inr(r.net)), 1) + td(esc((r.utr || "") + (r.settledAt ? " · " + day(r.settledAt) : ""))) + "</tr>"; }));
  }

  function render(focusId) {
    var app = $("ac-app");
    if (S.err) { app.innerHTML = '<p class="muted">' + esc(T(S.err)) + "</p>"; return; }
    if (!S.sum) return;
    if (S.sum.ready === false) { app.innerHTML = '<p class="muted">' + esc(T("adm.ac_not_ready")) + "</p>"; return; }
    var body;
    if (S.tab === "summary") body = summary();
    else {
      var d = S.data[S.tab];
      body = !d ? '<p class="muted">' + esc(T("adm.it_loading")) + "</p>" : d.error ? '<p class="muted">' + esc(T("adm.ss_e_load")) + "</p>" :
        ({ register: register, gst: gst, tds: tds, receivables: receivables, deferred: deferred, settlements: settlements })[S.tab](d);
    }
    app.innerHTML = (!S.sum.canManage && !S.sum.isSuper ? '<p class="readonly-tag" style="margin-left:0">' + esc(T("adm.hl_readonly")) + "</p>" : "") + tabs() +
      '<section id="ac-panel" role="tabpanel" aria-labelledby="ac-tab-' + S.tab + '">' + body + "</section>";
    if (focusId) { var el = $(focusId); if (el) el.focus(); }
  }

  // ---- events ----
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.getAttribute("data-tab")) { S.tab = b.getAttribute("data-tab"); try { localStorage.setItem("giq-ac-tab", S.tab); } catch (x) {} msg(""); loadTab().then(function () { var t = $("ac-tab-" + S.tab); if (t) t.focus(); }); return; }
    if (b.id === "ac-sync") {
      S.busy = true; render();
      post({ action: "sync" }).then(function (x) {
        S.busy = false;
        if (!x.r.ok) { render(); msg(T("adm.ss_e_generic"), true); return; }
        return load().then(function () { msg(x.j.on ? T("adm.ac_synced", { n: x.j.issued.length }) : T("adm.ac_sync_off_" + (x.j.reason || "NO_GSTIN")), !x.j.on); });
      });
      return;
    }
    if (b.id === "ac-fetch") {
      S.busy = true; render();
      post({ action: "fetch_settlements", month: S.month }).then(function (x) {
        S.busy = false;
        if (!x.r.ok) { render(); msg(T(x.j.error === "RZP_OFF" ? "adm.ac_rzp_off" : "adm.ac_fetch_fail"), true); return; }
        return loadTab().then(function () { msg(T("adm.ac_fetched", { n: x.j.lines })); });
      });
    }
  });
  document.addEventListener("keydown", function (e) {
    var t = e.target; if (!t || t.getAttribute("role") !== "tab") return;
    var i = TABS.indexOf(t.getAttribute("data-tab")), n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (n == null) return;
    e.preventDefault(); n = (n + TABS.length) % TABS.length; $("ac-tab-" + TABS[n]).click();
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "ac-month") { S.month = e.target.value; loadTab().then(function () { var m = $("ac-month"); if (m) m.focus(); }); }
  });
  document.addEventListener("input", function (e) {
    if (e.target.id === "ac-lock-n") S.lockNote = e.target.value;
    if (e.target.id === "ac-unlock-r") S.unlockReason = e.target.value;
  });
  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (f.id === "ac-lock") {
      e.preventDefault();
      post({ action: "lock", month: $("ac-lock-m").value, note: $("ac-lock-n").value }).then(function (x) {
        if (!x.r.ok) { msg(T(x.j.error === "ALREADY_LOCKED" ? "adm.ac_e_locked" : x.j.fields ? "adm.ac_e_past" : "adm.ss_e_generic"), true); return; }
        S.lockNote = ""; load().then(function () { msg(T("adm.ac_locked_ok")); });
      });
    }
    if (f.id === "ac-unlock") {
      e.preventDefault();
      post({ action: "unlock", month: $("ac-unlock-m").value, reason: $("ac-unlock-r").value }).then(function (x) {
        if (!x.r.ok) { S.unlockErr = !!x.j.fields; render("ac-unlock-r"); if (!x.j.fields) msg(T("adm.ss_e_generic"), true); return; }
        S.unlockErr = false; S.unlockReason = ""; load().then(function () { msg(T("adm.ac_unlocked_ok")); });
      });
    }
    if (f.id === "ac-set") {
      e.preventDefault();
      var v = function (id) { var el = $(id); return el ? el.value.trim() : ""; };
      var s = S.set;
      s.sacOffice = v("as-sacOffice"); s.sacHelper = v("as-sacHelper"); s.invoiceFrom = v("as-invoiceFrom"); s.reason = v("as-reason");
      ["R", "D", "H", "S", "N"].forEach(function (k) { s.prefixes[k] = v("as-p-" + k).toUpperCase(); s.cnPrefixes[k] = v("as-c-" + k).toUpperCase(); });
      s.rvPrefix = v("as-rv").toUpperCase(); s.rfPrefix = v("as-rf").toUpperCase();
      S.busy = true; render();
      post(Object.assign({ action: "settings" }, s)).then(function (x) {
        S.busy = false;
        if (x.r.status === 400 && x.j.fields) {
          S.setErr = x.j.fields; render();
          var k = Object.keys(x.j.fields)[0], map = { sacOffice: "as-sacOffice", sacHelper: "as-sacHelper", invoiceFrom: "as-invoiceFrom", reason: "as-reason", rvPrefix: "as-rv", rfPrefix: "as-rf" };
          var id = map[k] || (k.indexOf("prefixes.") === 0 ? "as-p-" + k.slice(9) : k.indexOf("cnPrefixes.") === 0 ? "as-c-" + k.slice(11) : "as-p-R");
          var el = $(id); if (el) el.focus(); return;
        }
        if (!x.r.ok) { render(); msg(T("adm.ss_e_generic"), true); return; }
        S.setErr = {}; S.set = null; load().then(function () { msg(T("adm.ac_set_saved")); });
      });
    }
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
