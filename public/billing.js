/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// public/billing.js (grieviq-41)
//
// "Billing" for offices: the representative console (representative and
// office manager) and the department dashboard. Shows the office's bills,
// GrievIQ's payment details (a UPI QR code for the exact amount and
// reference, the UPI ID and the bank account) and "I have paid".
//   GIQBilling.mount(element, { api: "/api/billing" | "/api/dept/billing", h: 2 })
// Needs i18n.js, /vendor/qrcode/qrcode.js and pay.js.
//
// Safety (payment-diversion fraud): every screen says to pay only to the
// details shown here, and to check the account name. The details come from
// GrievIQ's server, which applies them 24 hours after a change.
// WCAG 2.2 AA: real headings, labelled fields, an error list that takes
// focus, errors tied to fields, 44 px targets, copy buttons that say what was
// copied (status message), own colours checked in light and dark.
(function () {
  "use strict";
  function T(k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; }
  function hi() { return window.GIQ && window.GIQ.lang === "hi"; }
  var esc = function (s) { return window.GIQPay.esc(s); };
  var rupees = function (n) { return window.GIQPay.rupees(n); };
  function dateText(s) {
    if (!s) return "";
    var d = new Date(s.length === 10 ? s + "T00:00:00+05:30" : s);
    return isNaN(d) ? s : d.toLocaleDateString(hi() ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  }
  function todayIst() { return new Date(Date.now() + 19800000).toISOString().slice(0, 10); }

  // ---- colours (follow the page: light or dark) ----
  function bgOf(el) {
    while (el) {
      var m = getComputedStyle(el).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
      if (m && (m[4] == null || Number(m[4]) > 0.5)) return [+m[1], +m[2], +m[3]];
      el = el.parentElement;
    }
    return null;
  }
  function isDark(el) {
    var rgb = bgOf(el) || bgOf(document.body);
    if (!rgb) return false;
    var l = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2] < 0.2;
  }
  var CSS =
    ".gb{--gb-fg:#1b1f24;--gb-muted:#4a5360;--gb-border:#b9c1cb;--gb-card:#fff;--gb-soft:#f3f5f8;--gb-link:#1a4fb0;--gb-accent:#1f4a8a;--gb-on:#fff;--gb-warn-bg:#fff6e0;--gb-warn-fg:#5b4100;--gb-ok:#1e6b3a;--gb-bad:#a8322a;--gb-focus:#1a4fb0;color:var(--gb-fg);font-size:15px;line-height:1.55}" +
    ".gb.gb-dark{--gb-fg:#e7eaee;--gb-muted:#b3bcc7;--gb-border:#4a5666;--gb-card:#1d232c;--gb-soft:#252c37;--gb-link:#9fc0ff;--gb-accent:#9fc0ff;--gb-on:#0f1720;--gb-warn-bg:#2e2716;--gb-warn-fg:#f3dc9c;--gb-ok:#8fd8a6;--gb-bad:#ff9d94;--gb-focus:#9fc0ff}" +
    ".gb h2,.gb h3,.gb h4{color:var(--gb-fg);line-height:1.3}.gb h2{font-size:20px;margin:0 0 6px}.gb h3{font-size:17px;margin:0 0 6px}.gb h4{font-size:15px;margin:14px 0 6px}" +
    ".gb p{margin:0 0 10px}.gb a{color:var(--gb-link)}" +
    ".gb button:focus-visible,.gb a:focus-visible,.gb input:focus-visible,.gb [tabindex]:focus-visible{outline:3px solid var(--gb-focus);outline-offset:2px}" +
    ".gb .gb-safe{background:var(--gb-warn-bg);color:var(--gb-warn-fg);border-radius:10px;padding:10px 14px;margin:0 0 14px;font-size:14px}" +
    ".gb .gb-safe strong{color:inherit}" +
    ".gb .gb-bill{background:var(--gb-card);border:1px solid var(--gb-border);border-radius:12px;padding:14px 16px;margin:0 0 14px}" +
    ".gb .gb-bill.gb-st-PAID{border-left:5px solid var(--gb-ok)}.gb .gb-bill.gb-st-REPORTED{border-left:5px solid #c98a00}.gb .gb-bill.gb-st-DUE{border-left:5px solid var(--gb-accent)}" +
    ".gb .gb-pill{display:inline-block;font-size:13px;font-weight:600;padding:2px 10px;border-radius:999px;border:1px solid var(--gb-border);vertical-align:middle;margin-left:6px;color:var(--gb-fg)}" +
    ".gb dl.gb-dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:8px 0 10px;font-size:14.5px}.gb dl.gb-dl dt{color:var(--gb-muted)}.gb dl.gb-dl dd{margin:0;overflow-wrap:anywhere}" +
    ".gb .gb-total{font-weight:700;font-size:16px}" +
    ".gb .gb-how{border-top:1px solid var(--gb-border);margin-top:10px;padding-top:4px}" +
    ".gb .gb-ways{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:12px}" +
    ".gb .gb-way{background:var(--gb-soft);border-radius:10px;padding:12px 14px;min-width:0}" +
    ".gb .gb-qr{display:block;width:200px;max-width:100%;height:auto;border-radius:8px;margin:6px 0 8px}" +
    ".gb .gb-val{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;overflow-wrap:anywhere}" +
    ".gb .gb-copy,.gb .gb-btn{font:inherit;font-size:14px;min-height:44px;padding:8px 14px;border-radius:8px;border:1px solid var(--gb-border);background:var(--gb-card);color:var(--gb-fg);cursor:pointer}" +
    ".gb .gb-copy{min-height:36px;padding:4px 12px;font-size:13px;margin-left:6px}" +
    ".gb .gb-btn.gb-primary{background:var(--gb-accent);border-color:var(--gb-accent);color:var(--gb-on);font-weight:600}" +
    ".gb .gb-applink{display:inline-flex;align-items:center;min-height:44px;font-weight:600}" +
    ".gb .gb-ref{background:var(--gb-card);border:1px dashed var(--gb-border);border-radius:8px;padding:8px 12px;margin:10px 0;font-size:14.5px}" +
    ".gb form.gb-form{margin-top:6px}.gb .gb-fld{margin:0 0 12px}.gb .gb-fld label,.gb fieldset legend{display:block;font-weight:600;font-size:14px;margin:0 0 4px}" +
    ".gb .gb-hint{display:block;font-size:13px;color:var(--gb-muted);margin:0 0 4px}" +
    ".gb input[type=text],.gb input[type=number],.gb input[type=date]{font:inherit;font-size:15px;min-height:44px;padding:8px 10px;border-radius:8px;border:1px solid #6b7480;background:var(--gb-card);color:var(--gb-fg);width:100%;max-width:340px;box-sizing:border-box}" +
    ".gb.gb-dark input[type=text],.gb.gb-dark input[type=number],.gb.gb-dark input[type=date]{border-color:#8692a3;color-scheme:dark}" +
    ".gb input[aria-invalid=true]{border:2px solid var(--gb-bad)}" +
    ".gb fieldset{border:0;padding:0;margin:0 0 12px;min-width:0}.gb .gb-radio{display:inline-flex;align-items:center;gap:8px;min-height:44px;margin-right:18px}.gb .gb-radio input{width:20px;height:20px;margin:0}" +
    ".gb .gb-err{display:block;color:var(--gb-bad);font-weight:600;font-size:14px;margin:4px 0 0}" +
    ".gb .gb-errbox{border:2px solid var(--gb-bad);border-radius:10px;padding:10px 14px;margin:0 0 12px}.gb .gb-errbox h4{margin:0 0 6px}.gb .gb-errbox ul{margin:0;padding-left:20px}" +
    ".gb .gb-msg{font-weight:600;border-left:4px solid var(--gb-ok);padding-left:10px}.gb .gb-msg.gb-bad{border-left-color:var(--gb-bad)}" +
    ".gb .gb-past{font-size:14px;color:var(--gb-fg);border-left:3px solid var(--gb-border);padding-left:10px;margin:8px 0}" +
    ".gb .gb-copied{font-size:13px;margin-left:6px}" +
    "@media (max-width:560px){.gb dl.gb-dl{grid-template-columns:1fr}.gb dl.gb-dl dt{margin-top:6px}.gb .gb-qr{width:180px}}" +
    "@media print{.gb .gb-form,.gb .gb-copy{display:none}}";
  function addCss() { if (document.getElementById("gb-css")) return; var st = document.createElement("style"); st.id = "gb-css"; st.textContent = CSS; document.head.appendChild(st); }

  function mount(el, opts) {
    addCss();
    opts = opts || {};
    var st = { data: null, err: null, forms: {}, msg: null };
    var h = opts.h || 2, H = "h" + h, H2 = "h" + (h + 1), H3 = "h" + (h + 2);
    el.classList.add("gb");
    el.classList.toggle("gb-dark", isDark(el));

    function methodsOf() { return (st.data && st.data.pay && st.data.pay.methods) || []; }
    function ways(b) {
      var ms = methodsOf();
      if (!ms.length) return '<p class="gb-safe">' + esc(T("bill.no_methods", { email: st.data.pay.company.supportEmail })) + "</p>";
      return '<div class="gb-ways">' + ms.map(function (m, i) {
        var id = "gb-" + b.id + "-" + i;
        if (m.kind === "UPI") {
          var url = window.GIQPay.upiUrl(m, b.total, b.ref);
          return '<div class="gb-way"><' + H3 + ">" + esc(T("bill.upi_h")) + "</" + H3 + ">" +
            window.GIQPay.qrSvg(url, T("bill.qr_a", { amount: rupees(b.total), ref: b.ref, name: m.payeeName })).replace('class="giq-qr"', 'class="giq-qr gb-qr"') +
            '<p class="gb-hint">' + esc(T("bill.qr_help")) + "</p>" +
            "<p>" + esc(T("bill.upi_id")) + ' <span class="gb-val" id="' + id + '-v">' + esc(m.upiId) + "</span>" + copyBtn(m.upiId, T("bill.upi_id")) + "</p>" +
            "<p>" + esc(T("bill.payee")) + " <b>" + esc(m.payeeName) + "</b></p>" +
            '<p><a class="gb-applink" href="' + esc(url) + '">' + esc(T("bill.open_app")) + "</a></p></div>";
        }
        return '<div class="gb-way"><' + H3 + ">" + esc(T("bill.bank_h")) + "</" + H3 + '><dl class="gb-dl">' +
          "<dt>" + esc(T("bill.acct_name")) + "</dt><dd><b>" + esc(m.accountName) + "</b></dd>" +
          "<dt>" + esc(T("bill.bank")) + "</dt><dd>" + esc(m.bankName) + (m.branch ? ", " + esc(m.branch) : "") + "</dd>" +
          "<dt>" + esc(T("bill.acct_no")) + '</dt><dd><span class="gb-val">' + esc(m.accountNumber) + "</span>" + copyBtn(m.accountNumber, T("bill.acct_no")) + "</dd>" +
          "<dt>" + esc(T("bill.ifsc")) + '</dt><dd><span class="gb-val">' + esc(m.ifsc) + "</span>" + copyBtn(m.ifsc, T("bill.ifsc")) + "</dd>" +
          "<dt>" + esc(T("bill.acct_type")) + "</dt><dd>" + esc(T(m.accountType === "SAVINGS" ? "bill.savings" : "bill.current")) + "</dd></dl>" +
          '<p class="gb-hint">' + esc(T("bill.bank_help")) + "</p></div>";
      }).join("") + "</div>";
    }
    function copyBtn(text, what) {
      return '<button type="button" class="gb-copy" data-copy="' + esc(text) + '" data-what="' + esc(what) + '" aria-label="' + esc(T("bill.copy_a", { what: what })) + '">' + esc(T("bill.copy")) + "</button>";
    }
    function form(b) {
      var f = st.forms[b.id] || (st.forms[b.id] = { method: methodsOf().length && methodsOf()[0].kind === "BANK" ? "BANK" : "UPI", utr: "", amount: String(b.total), paidOn: todayIst(), fields: {} });
      var e = f.fields, p = "gbf-" + b.id + "-";
      var err = function (k) { return e[k] ? '<span class="gb-err" id="' + p + k + '-e">' + esc(T("bill.e_" + k + "_" + e[k])) + "</span>" : ""; };
      var inv = function (k, hint) { var d = [hint ? p + k + "-h" : "", e[k] ? p + k + "-e" : ""].filter(Boolean).join(" "); return (d ? ' aria-describedby="' + d + '"' : "") + (e[k] ? ' aria-invalid="true"' : ""); };
      var keys = Object.keys(e);
      return '<form class="gb-form" data-bill="' + esc(b.id) + '" novalidate><' + H3 + ">" + esc(T("bill.paid_h")) + "</" + H3 + ">" +
        '<p class="gb-hint">' + esc(T("bill.paid_help")) + "</p>" +
        (keys.length ? '<div class="gb-errbox" id="' + p + 'errs" tabindex="-1" role="alert"><h4>' + esc(T("bill.e_h", { n: keys.length })) + "</h4><ul>" + keys.map(function (k) {
          return '<li><a href="#' + p + k + '">' + esc(T("bill.f_" + k)) + ": " + esc(T("bill.e_" + k + "_" + e[k])) + "</a></li>"; }).join("") + "</ul></div>" : "") +
        '<fieldset id="' + p + 'method"' + (e.method ? ' aria-describedby="' + p + 'method-e"' : "") + "><legend>" + esc(T("bill.f_method")) + "</legend>" +
        [["UPI", "bill.m_upi"], ["BANK", "bill.m_bank"]].map(function (o) {
          return '<span class="gb-radio"><input type="radio" name="' + p + 'm" id="' + p + "m-" + o[0] + '" value="' + o[0] + '"' + (f.method === o[0] ? " checked" : "") + '><label for="' + p + "m-" + o[0] + '">' + esc(T(o[1])) + "</label></span>"; }).join("") + err("method") + "</fieldset>" +
        '<div class="gb-fld"><label for="' + p + 'utr">' + esc(T("bill.f_utr")) + '</label><span class="gb-hint" id="' + p + 'utr-h">' + esc(T("bill.h_utr")) + "</span>" +
        '<input type="text" id="' + p + 'utr" name="utr" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="30" value="' + esc(f.utr) + '"' + inv("utr", true) + ">" + err("utr") + "</div>" +
        '<div class="gb-fld"><label for="' + p + 'amount">' + esc(T("bill.f_amount")) + '</label><span class="gb-hint" id="' + p + 'amount-h">' + esc(T("bill.h_amount", { t: rupees(b.total) })) + "</span>" +
        '<input type="number" id="' + p + 'amount" name="amount" inputmode="numeric" min="1" step="1" value="' + esc(f.amount) + '"' + inv("amount", true) + ">" + err("amount") + "</div>" +
        '<div class="gb-fld"><label for="' + p + 'paidOn">' + esc(T("bill.f_paidOn")) + "</label>" +
        '<input type="date" id="' + p + 'paidOn" name="paidOn" max="' + todayIst() + '" value="' + esc(f.paidOn) + '"' + inv("paidOn") + ">" + err("paidOn") + "</div>" +
        '<button type="submit" class="gb-btn gb-primary"' + (f.busy ? " disabled" : "") + ">" + esc(T("bill.send")) + "</button>" +
        (f.msg ? '<p class="gb-msg gb-bad" role="alert">' + esc(f.msg) + "</p>" : "") + "</form>";
    }
    function bill(b) {
      var late = b.status === "DUE" && b.dueOn < todayIst();
      var out = '<article class="gb-bill gb-st-' + b.status + '" aria-labelledby="gb-h-' + esc(b.id) + '"><' + H2 + ' id="gb-h-' + esc(b.id) + '" tabindex="-1">' + esc(b.ref) +
        '<span class="gb-pill">' + esc(T("bill.st_" + b.status)) + "</span></" + H2 + ">" +
        '<dl class="gb-dl"><dt>' + esc(T("bill.office")) + "</dt><dd>" + esc(b.officeName) + "</dd>" +
        (b.kind === "NOTICE"
          ? "<dt>" + esc(T("bill.plan")) + "</dt><dd>" + esc(b.planName) + "</dd><dt>" + esc(T("bill.period")) + "</dt><dd>" + esc(T("bill.notice_period")) + "</dd>"
          : "<dt>" + esc(T("bill.plan")) + "</dt><dd>" + esc(b.planName) + " · " + esc(T(b.period === "YEAR" ? "bill.year" : "bill.month")) + "</dd>" +
            "<dt>" + esc(T("bill.period")) + "</dt><dd>" + esc(T("bill.range", { from: dateText(b.from), to: dateText(b.to) })) + "</dd>") +
        "<dt>" + esc(T("bill.amount")) + "</dt><dd>" + esc(rupees(b.amount)) + " + " + esc(T("bill.gst", { r: b.gstRate })) + " " + esc(rupees(b.gst)) + "</dd>" +
        "<dt>" + esc(T("bill.total")) + '</dt><dd class="gb-total">' + esc(rupees(b.total)) + "</dd>" +
        (b.status === "DUE" || b.status === "REPORTED" ? "<dt>" + esc(T("bill.due")) + "</dt><dd>" + (late ? "<b>" : "") + esc(dateText(b.dueOn)) + (late ? " — " + esc(T("bill.late")) + "</b>" : "") + "</dd>" : "") +
        "</dl>";
      // A payment that couldn't be matched matters only while the bill is still to pay.
      var returned = b.status === "DUE" ? b.payments.filter(function (p) { return p.status === "RETURNED"; }) : [];
      out += returned.map(function (p) { return '<p class="gb-past">' + esc(T("bill.returned", { utr: p.utr, reason: p.reason || "" })) + "</p>"; }).join("");
      if (b.status === "DUE") {
        out += '<div class="gb-how"><' + H3 + ">" + esc(T("bill.how_h")) + "</" + H3 + ">" +
          '<p class="gb-ref">' + T("bill.ref_line", { ref: "<b>" + esc(b.ref) + "</b>" }) + "</p>" + ways(b) + form(b) + "</div>";
      } else if (b.status === "REPORTED") {
        var p = b.payments.filter(function (x) { return x.status === "REPORTED"; })[0];
        out += '<p class="gb-msg">' + esc(T("bill.reported", { amount: rupees(p ? p.amount : b.total), date: dateText(p ? p.paidOn : ""), utr: p ? p.utr : "", cb: hi() ? st.data.pay.company.callbackHi : st.data.pay.company.callbackEn })) + "</p>";
      } else if (b.status === "PAID") {
        out += '<p class="gb-msg">' + esc(T("bill.paid", { date: dateText(b.paidAt) })) + "</p>";
      } else if (b.status === "CANCELLED") {
        out += '<p class="gb-past">' + esc(T("bill.cancelled", { reason: b.cancelReason || "" })) + "</p>";
      }
      return out + "</article>";
    }
    function render(focusId) {
      el.classList.toggle("gb-dark", isDark(el));
      if (st.err) { el.innerHTML = '<p class="gb-msg gb-bad" role="alert">' + esc(st.err) + "</p>"; return; }
      if (!st.data) { el.innerHTML = "<p>" + esc(T("bill.loading")) + "</p>"; return; }
      var d = st.data;
      var bills = d.bills.slice().sort(function (a, b) { var o = { DUE: 0, REPORTED: 1, PAID: 2, CANCELLED: 3 }; return o[a.status] - o[b.status]; });
      el.innerHTML = "<" + H + ' id="gb-title" tabindex="-1">' + esc(T("bill.h")) + "</" + H + ">" +
        "<p>" + esc(T("bill.intro")) + "</p>" +
        '<p class="gb-safe"><strong>' + esc(T("bill.safe_b")) + "</strong> " + esc(T("bill.safe", { name: d.pay.company.legalName })) + "</p>" +
        (st.msg ? '<p class="gb-msg" id="gb-msg" tabindex="-1" role="status">' + esc(st.msg) + "</p>" : "") +
        (!d.ready ? "<p>" + esc(T("bill.not_ready")) + "</p>" : bills.length ? bills.map(bill).join("") : "<p>" + esc(T("bill.none")) + "</p>") +
        '<p class="gb-hint">' + esc(T("bill.questions", { email: d.pay.company.supportEmail })) + "</p>" +
        '<p class="gb-copied" id="gb-copied" role="status" aria-live="polite"></p>';
      wire();
      var f = focusId && document.getElementById(focusId); if (f) f.focus();
    }
    function wire() {
      el.querySelectorAll("[data-copy]").forEach(function (b) {
        b.addEventListener("click", function () {
          var text = b.getAttribute("data-copy"), what = b.getAttribute("data-what"), out = document.getElementById("gb-copied");
          var done = function () { out.textContent = T("bill.copied", { what: what }); };
          try { navigator.clipboard.writeText(text).then(done, function () { out.textContent = T("bill.copy_fail"); }); } catch (e) { out.textContent = T("bill.copy_fail"); }
        });
      });
      el.querySelectorAll("form.gb-form").forEach(function (fm) {
        var id = fm.getAttribute("data-bill"), f = st.forms[id], p = "gbf-" + id + "-";
        fm.addEventListener("input", function (e) { if (e.target.name) f[e.target.name] = e.target.value; });
        fm.addEventListener("change", function (e) { if (e.target.type === "radio") f.method = e.target.value; else if (e.target.name) f[e.target.name] = e.target.value; });
        fm.querySelectorAll(".gb-errbox a").forEach(function (a) { a.addEventListener("click", function (ev) { ev.preventDefault(); var t = document.getElementById(a.getAttribute("href").slice(1)); if (t) { var i = t.querySelector ? (t.querySelector("input") || t) : t; i.focus(); } }); });
        fm.addEventListener("submit", function (ev) { ev.preventDefault(); send(id); });
      });
    }
    async function send(id) {
      var f = st.forms[id], p = "gbf-" + id + "-";
      f.fields = {}; f.msg = null;
      if (!f.utr.trim()) f.fields.utr = "REQUIRED";
      if (String(f.amount).trim() === "") f.fields.amount = "REQUIRED";
      if (!f.paidOn) f.fields.paidOn = "REQUIRED";
      if (Object.keys(f.fields).length) { render(p + "errs"); return; }
      f.busy = true; render();
      try {
        var res = await fetch(opts.api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ billId: id, method: f.method, utr: f.utr, amount: f.amount, paidOn: f.paidOn }) });
        var d = {}; try { d = await res.json(); } catch (e) {}
        f.busy = false;
        if (res.status === 400 && d.fields) { f.fields = d.fields; render(p + "errs"); return; }
        if (!res.ok) { f.msg = T(d.error === "ALREADY_REPORTED" || d.error === "ALREADY_PAID" ? "bill.e_already" : d.error === "TOO_MANY" ? "bill.e_too_many" : "bill.e_send"); render(); var b = document.querySelector('form[data-bill="' + id + '"] button[type=submit]'); if (b) b.focus(); return; }
        delete st.forms[id];
        st.msg = T(d.mismatch ? "bill.sent_mismatch" : "bill.sent");
        await load(); render("gb-msg");
      } catch (e) { f.busy = false; f.msg = T("bill.e_send"); render(); }
    }
    async function load() {
      try {
        var res = await fetch(opts.api); var d = await res.json();
        if (!res.ok) { st.err = T(d.error === "NOT_ALLOWED" ? "bill.e_not_allowed" : "bill.e_load"); st.data = null; return; }
        st.err = null; st.data = d;
      } catch (e) { st.err = T("bill.e_load"); }
    }
    render();
    load().then(function () { render(opts.focus ? "gb-title" : null); });
    el._gbRender = function () { render(); };
    return { reload: function () { return load().then(function () { render(); }); } };
  }
  // One listener for all billing boxes on the page: redraw in the new language.
  document.addEventListener("giq:lang", function () { document.querySelectorAll(".gb").forEach(function (x) { if (x._gbRender) x._gbRender(); }); });
  window.GIQBilling = { mount: mount };
})();
