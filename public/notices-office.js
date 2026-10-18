/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// public/notices-office.js (grieviq-55)
//
// "Public notices" for offices: the representative console (representative
// and office manager) and the department dashboard. The office sees its
// notices and their state, asks for a new one in the fixed template with a
// live preview of what citizens will see, and can take back a request
// before it is paid.
//   GIQNotices.mount(element, { api: "/api/notices/office" | "/api/dept/notices", h: 2, onBilling: fn })
// Needs i18n.js and notice-card.js.
// WCAG 2.2 AA: real headings, labelled fields and groups, an error list that
// takes focus with links to the fields, errors tied to fields, 44 px
// targets, own colours checked in light and dark.
(function () {
  "use strict";
  function T(k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; }
  function hi() { return window.GIQ && window.GIQ.lang === "hi"; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  function rupees(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
  function dateText(s) {
    if (!s) return "";
    var d = new Date(s.length === 10 ? s + "T00:00:00+05:30" : s);
    return isNaN(d) ? s : d.toLocaleDateString(hi() ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  }
  function addDays(s, n) { var d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  var CSS =
    ".gn{--gn-fg:#1b1f24;--gn-muted:#4a5360;--gn-border:#b9c1cb;--gn-card:#fff;--gn-soft:#f3f5f8;--gn-accent:#1f4a8a;--gn-on:#fff;--gn-ok:#1e6b3a;--gn-bad:#a8322a;--gn-warn-bg:#fff6e0;--gn-warn-fg:#5b4100;--gn-focus:#1a4fb0;color:var(--gn-fg);font-size:15px;line-height:1.55}" +
    ".gn.gn-dark{--gn-fg:#e7eaee;--gn-muted:#b3bcc7;--gn-border:#4a5666;--gn-card:#1d232c;--gn-soft:#252c37;--gn-accent:#9fc0ff;--gn-on:#0f1720;--gn-ok:#8fd8a6;--gn-bad:#ff9d94;--gn-warn-bg:#2e2716;--gn-warn-fg:#f3dc9c;--gn-focus:#9fc0ff}" +
    ".gn h2,.gn h3,.gn h4{color:var(--gn-fg);line-height:1.3}.gn h2{font-size:20px;margin:0 0 6px}.gn h3{font-size:17px;margin:18px 0 6px}.gn h4{font-size:15.5px;margin:0 0 4px}" +
    ".gn p{margin:0 0 10px}.gn .gn-muted{color:var(--gn-muted)}" +
    ".gn button:focus-visible,.gn input:focus-visible,.gn textarea:focus-visible,.gn a:focus-visible,.gn summary:focus-visible,.gn [tabindex]:focus-visible{outline:3px solid var(--gn-focus);outline-offset:2px}" +
    ".gn .gn-rules{background:var(--gn-soft);border-radius:10px;padding:10px 14px;margin:0 0 12px;font-size:14px}.gn .gn-rules ul{margin:4px 0 6px;padding-left:20px}.gn .gn-rules p{margin:4px 0}" +
    ".gn .gn-warn{background:var(--gn-warn-bg);color:var(--gn-warn-fg);border-radius:10px;padding:10px 14px;margin:0 0 12px;font-size:14px}" +
    ".gn .gn-item{background:var(--gn-card);border:1px solid var(--gn-border);border-left:5px solid var(--gn-accent);border-radius:12px;padding:12px 16px;margin:0 0 12px}" +
    ".gn .gn-item.gn-st-LIVE{border-left-color:var(--gn-ok)}.gn .gn-item.gn-st-APPROVED,.gn .gn-item.gn-st-PAUSED{border-left-color:#c98a00}.gn .gn-item.gn-st-REJECTED,.gn .gn-item.gn-st-TAKEN_DOWN{border-left-color:var(--gn-bad)}" +
    ".gn .gn-item.gn-st-ENDED,.gn .gn-item.gn-st-WITHDRAWN,.gn .gn-item.gn-st-CANCELLED{border-left-color:var(--gn-border)}" +
    ".gn .gn-pill{display:inline-block;font-size:13px;font-weight:600;padding:2px 10px;border-radius:999px;border:1px solid var(--gn-border);vertical-align:middle;margin-left:6px;color:var(--gn-fg)}" +
    ".gn dl.gn-dl{display:grid;grid-template-columns:max-content 1fr;gap:3px 14px;margin:6px 0 8px;font-size:14.5px}.gn dl.gn-dl dt{color:var(--gn-muted)}.gn dl.gn-dl dd{margin:0;overflow-wrap:anywhere}" +
    ".gn details{margin:6px 0 0}.gn summary{cursor:pointer;color:var(--gn-accent);font-weight:600;min-height:36px;display:inline-flex;align-items:center}" +
    ".gn .gn-btn{font:inherit;font-size:14.5px;min-height:44px;padding:8px 16px;border-radius:8px;border:1px solid var(--gn-border);background:var(--gn-card);color:var(--gn-fg);cursor:pointer;margin:4px 8px 4px 0}" +
    ".gn .gn-btn.gn-primary{background:var(--gn-accent);border-color:var(--gn-accent);color:var(--gn-on);font-weight:600}.gn .gn-btn.gn-danger{color:var(--gn-bad);border-color:var(--gn-bad)}" +
    ".gn .gn-form{background:var(--gn-card);border:1px solid var(--gn-border);border-radius:12px;padding:14px 16px;margin:6px 0 12px}" +
    ".gn .gn-fld{margin:0 0 12px}.gn .gn-fld label,.gn fieldset legend{display:block;font-weight:600;font-size:14.5px;margin:0 0 4px;color:var(--gn-fg)}" +
    ".gn .gn-hint{display:block;font-size:13px;color:var(--gn-muted);margin:0 0 4px}" +
    ".gn input[type=text],.gn input[type=date],.gn textarea{font:inherit;font-size:15px;min-height:44px;padding:8px 10px;border-radius:8px;border:1px solid #6b7480;background:var(--gn-card);color:var(--gn-fg);width:100%;max-width:560px;box-sizing:border-box}" +
    ".gn input[type=file]{font:inherit;font-size:14.5px;min-height:44px;max-width:100%;color:var(--gn-fg)}" +
    ".gn textarea{min-height:96px;resize:vertical}.gn input[type=date]{max-width:220px}" +
    ".gn.gn-dark input,.gn.gn-dark textarea{border-color:#8692a3;color-scheme:dark}" +
    ".gn [aria-invalid=true]{border:2px solid var(--gn-bad)!important}" +
    ".gn fieldset{border:0;padding:0;margin:0 0 12px;min-width:0}.gn fieldset.gn-lang{border:1px solid var(--gn-border);border-radius:10px;padding:8px 12px 2px}" +
    ".gn .gn-radio{display:flex;align-items:flex-start;gap:8px;min-height:40px;margin:0 0 2px}.gn .gn-radio input{width:20px;height:20px;margin:3px 0 0;flex:none}" +
    ".gn .gn-radio .gn-sub{display:block;font-size:13px;color:var(--gn-muted)}" +
    ".gn .gn-cats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr));gap:0 16px}" +
    ".gn .gn-err{display:block;color:var(--gn-bad);font-weight:600;font-size:14px;margin:4px 0 0}" +
    ".gn .gn-errbox{border:2px solid var(--gn-bad);border-radius:10px;padding:10px 14px;margin:0 0 12px}.gn .gn-errbox h4{margin:0 0 6px}.gn .gn-errbox ul{margin:0;padding-left:20px}.gn .gn-errbox a{color:var(--gn-fg)}" +
    ".gn .gn-msg{font-weight:600;border-left:4px solid var(--gn-ok);padding-left:10px}.gn .gn-msg.gn-bad{border-left-color:var(--gn-bad)}" +
    ".gn .gn-preview{border:1px dashed var(--gn-border);border-radius:10px;padding:10px 12px;margin:6px 0 12px;background:var(--gn-soft)}" +
    ".gn .gn-total{font-weight:700}.gn .vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}";
  function addCss() { if (document.getElementById("gn-css")) return; var st = document.createElement("style"); st.id = "gn-css"; st.textContent = CSS; document.head.appendChild(st); }
  var FIELDS = ["office", "category", "titleEn", "bodyEn", "titleHi", "bodyHi", "eventDate", "eventTime", "place", "planId", "startOn", "letter", "letterNo", "letterDate", "letterBy"];
  function sizeText(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }

  function mount(el, opts) {
    addCss();
    opts = opts || {};
    var h = opts.h || 2, H = "h" + h, H2 = "h" + (h + 1), H3 = "h" + (h + 2);
    var st = { data: null, err: null, f: null, fields: {}, msg: null, open: false, busy: false, file: null, rl: {} };
    el.classList.add("gn");
    var dark = window.GIQNoticeCard ? window.GIQNoticeCard.isDark(el) : false;
    el.classList.toggle("gn-dark", dark);
    el.classList.add("pn-wrap"); el.classList.toggle("pn-dark", dark);   // the notice previews (notice-card.js)

    function blank() {
      var d = st.data, offs = (d && d.offices || []).filter(function (o) { return !o.vacant; });
      return { office: offs.length === 1 ? offs[0].tier + "|" + offs[0].id : "", category: "", titleEn: "", bodyEn: "", titleHi: "", bodyHi: "", eventDate: "", eventTime: "", place: "", planId: "", startOn: d ? d.today : "", letterNo: "", letterDate: "", letterBy: "" };
    }
    function officeOf(key) { return (st.data.offices || []).find(function (o) { return (o.tier + "|" + o.id) === key; }) || null; }
    function officeLabel(o) { return (hi() ? o.label[1] : o.label[0]) + ", " + o.name; }
    function planText(p) { return T("ntc.plan_line", { name: hi() ? p.nameHi : p.nameEn, days: p.days, amount: rupees(p.amount), gst: rupees(p.gst), total: rupees(p.total) }); }

    function itemHtml(n) {
      var stText = T("ntc.st_" + n.state, { from: dateText(n.from), to: dateText(n.to) });
      var t = (hi() ? n.titleHi || n.titleEn : n.titleEn || n.titleHi) || "";
      var dates = n.from ? T("ntc.runs", { from: dateText(n.from), to: dateText(n.to) }) + (n.pausedDays ? " · " + T("ntc.paused_added", { n: n.pausedDays }) : "") : T("ntc.asked_start", { date: dateText(n.startOn) });
      var bill = n.bill ? T("ntc.bill_" + n.bill.status, { ref: n.bill.ref, date: dateText(n.bill.dueOn) }) : "";
      var why = n.state === "REJECTED" ? n.decisionNote : (n.state === "TAKEN_DOWN" || n.state === "CANCELLED") ? n.endReason : "";
      var canWithdraw = (n.status === "PENDING" || n.status === "APPROVED") && !(n.bill && n.bill.status === "REPORTED");
      var p = "gn-n-" + n.ref.replace(/[^A-Za-z0-9]/g, "");
      return '<article class="gn-item gn-st-' + esc(n.state) + '" aria-labelledby="' + p + '-h"><' + H3 + ' id="' + p + '-h">' + esc(t) + ' <span class="gn-pill">' + esc(stText) + "</span></" + H3 + ">" +
        '<dl class="gn-dl"><dt>' + esc(T("ntc.ref")) + "</dt><dd>" + esc(n.ref) + "</dd>" +
        "<dt>" + esc(T("ntc.office")) + "</dt><dd>" + esc((hi() ? n.officeLabel[1] : n.officeLabel[0]) + ", " + n.officeName) + "</dd>" +
        "<dt>" + esc(T("ntc.plan")) + "</dt><dd>" + esc(T("ntc.plan_short", { name: n.planName, days: n.days, total: rupees(n.total) })) + "</dd>" +
        "<dt>" + esc(T("ntc.dates")) + "</dt><dd>" + esc(dates) + "</dd>" +
        (bill ? "<dt>" + esc(T("ntc.bill")) + "</dt><dd>" + esc(bill) + "</dd>" : "") +
        (why ? "<dt>" + esc(T("ntc.why")) + "</dt><dd>" + esc(why) + "</dd>" : "") +
        (n.letter ? "<dt>" + esc(T("ntc.letter")) + "</dt><dd>" + esc(T("ntc.letter_v", { no: n.letter.no, date: dateText(n.letter.date), by: n.letter.by })) + "</dd>"
          : n.letterNeeded && n.status === "PENDING" && st.data.letters ? "<dt>" + esc(T("ntc.letter")) + "</dt><dd>" + esc(T("ntc.letter_missing")) + "</dd>" : "") + "</dl>" +
        (n.status === "PENDING" && st.data.letters ? replaceForm(n) : "") +
        (n.status === "APPROVED" && n.bill && n.bill.status === "DUE" && opts.onBilling ? '<button type="button" class="gn-btn gn-primary" data-bill="1">' + esc(T("ntc.pay")) + "</button>" : "") +
        (canWithdraw ? '<button type="button" class="gn-btn gn-danger" data-withdraw="' + esc(n.id) + '">' + esc(T("ntc.withdraw")) + '<span class="vh"> ' + esc(n.ref) + "</span></button>" : "") +
        "<details><summary>" + esc(T("ntc.show")) + "</summary>" + (window.GIQNoticeCard ? window.GIQNoticeCard.card({ ref: n.ref + "-v", category: n.category, titleEn: n.titleEn, titleHi: n.titleHi, bodyEn: n.bodyEn, bodyHi: n.bodyHi,
          eventDate: n.eventDate, eventTime: n.eventTime, place: n.place, office: n.officeName, officeLabel: n.officeLabel, until: n.to,
          authority: n.letter ? { no: n.letter.no, date: n.letter.date } : null }, { h: h + 3, idp: "gnv-" }) : "") + "</details></article>";
    }

    function replaceForm(n) {
      var p = "gn-rl-" + n.ref.replace(/[^A-Za-z0-9]/g, ""), r = st.rl[n.id] || {}, e = r.fields || {};
      var f1 = function (k, type, extra, hint) {
        return '<div class="gn-fld"><label for="' + p + "-" + k + '">' + esc(T("ntc.f_" + k)) + "</label>" + (hint ? '<span class="gn-hint" id="' + p + "-" + k + '-h">' + esc(hint) + "</span>" : "") +
          '<input type="' + type + '" id="' + p + "-" + k + '" name="' + k + '"' + (extra || "") + (type === "file" ? "" : ' value="' + esc(r[k] || "") + '" autocomplete="off"') +
          (e[k] ? ' aria-invalid="true" aria-describedby="' + p + "-" + k + '-e"' : hint ? ' aria-describedby="' + p + "-" + k + '-h"' : "") + ">" +
          (e[k] ? '<span class="gn-err" id="' + p + "-" + k + '-e">' + esc(T("ntc.e_" + e[k])) + "</span>" : "") + "</div>";
      };
      return '<details' + (r.open ? " open" : "") + ' data-rld="' + esc(n.id) + '"><summary>' + esc(T(n.letter ? "ntc.letter_replace" : "ntc.letter_add")) + '</summary><form data-rl="' + esc(n.id) + '" novalidate>' +
        f1("letter", "file", ' accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"', T("ntc.letter_file_h", { n: st.data.letterMaxMb })) +
        f1("letterNo", "text", ' maxlength="60"') + f1("letterDate", "date", ' max="' + esc(st.data.today) + '"') + f1("letterBy", "text", ' maxlength="120"', T("ntc.letterBy_h")) +
        '<button type="submit" class="gn-btn gn-primary">' + esc(T("ntc.letter_send")) + "</button></form></details>";
    }
    async function sendLetter(fm) {
      var id = fm.getAttribute("data-rl"), r = st.rl[id] = { open: true };
      ["letterNo", "letterDate", "letterBy"].forEach(function (k) { r[k] = fm.querySelector('[name="' + k + '"]').value; });
      var file = fm.querySelector('[name="letter"]').files[0];
      var fd = new FormData(); fd.append("action", "letter"); fd.append("id", id);
      ["letterNo", "letterDate", "letterBy"].forEach(function (k) { fd.append(k, r[k]); });
      if (file) fd.append("letter", file, file.name);
      try {
        var res = await fetch(opts.api, { method: "POST", credentials: "same-origin", body: fd });
        var d = await res.json().catch(function () { return {}; });
        var n = st.data.notices.find(function (x) { return x.id === id; });
        if (res.status === 400 && d.fields) { r.fields = d.fields; render(); var k = ["letter", "letterNo", "letterDate", "letterBy"].find(function (x) { return d.fields[x]; }); var t = document.getElementById("gn-rl-" + n.ref.replace(/[^A-Za-z0-9]/g, "") + "-" + k); if (t) t.focus(); return; }
        if (!res.ok) { st.msg = { bad: true, text: T("ntc.e_generic") }; render("gn-msg"); return; }
        delete st.rl[id];
        await load();
        st.msg = { text: T("ntc.letter_sent", { ref: n ? n.ref : "" }) }; render("gn-msg");
      } catch (e) { st.msg = { bad: true, text: T("ntc.e_net") }; render("gn-msg"); }
    }
    function fld(k, type, opt) {
      opt = opt || {};
      var f = st.f, e = st.fields[k], id = "gn-" + k;
      var desc = [opt.hint ? id + "-h" : "", e ? id + "-e" : ""].filter(Boolean).join(" ");
      var attrs = ' id="' + id + '" data-k="' + k + '"' + (desc ? ' aria-describedby="' + desc + '"' : "") + (e ? ' aria-invalid="true"' : "") + (opt.lang ? ' lang="' + opt.lang + '"' : "") + (opt.max ? ' maxlength="' + opt.max + '"' : "") + (opt.min ? ' min="' + opt.min + '"' : "") + (opt.maxd ? ' max="' + opt.maxd + '"' : "");
      var ctl = type === "textarea" ? "<textarea" + attrs + ' rows="4">' + esc(f[k]) + "</textarea>" : '<input type="' + type + '"' + attrs + ' autocomplete="off" value="' + esc(f[k]) + '">';
      return '<div class="gn-fld"><label for="' + id + '">' + esc(T("ntc.f_" + k)) + (opt.optional ? " " + esc(T("ntc.optional")) : "") + "</label>" + (opt.hint ? '<span class="gn-hint" id="' + id + '-h">' + esc(opt.hint) + "</span>" : "") + ctl +
        (e ? '<span class="gn-err" id="' + id + '-e">' + esc(T("ntc.e_" + e)) + "</span>" : "") + "</div>";
    }
    function radios(k, items, legend, opt) {
      opt = opt || {};
      var f = st.f, e = st.fields[k];
      return '<fieldset id="gn-' + k + '"' + (e ? ' aria-describedby="gn-' + k + '-e"' : "") + "><legend>" + esc(legend) + "</legend>" + (opt.hint ? '<span class="gn-hint">' + esc(opt.hint) + "</span>" : "") +
        '<div class="' + (opt.cls || "") + '">' + items.map(function (it) {
          var id = "gn-" + k + "-" + String(it.v).replace(/[^A-Za-z0-9]/g, "_");
          return '<div class="gn-radio"><input type="radio" name="gn-' + k + '" id="' + id + '" value="' + esc(it.v) + '"' + (f[k] === it.v ? " checked" : "") + (it.disabled ? " disabled" : "") + '><label for="' + id + '">' + esc(it.label) + (it.sub ? '<span class="gn-sub">' + esc(it.sub) + "</span>" : "") + "</label></div>";
        }).join("") + "</div>" + (e ? '<span class="gn-err" id="gn-' + k + '-e">' + esc(T("ntc.e_" + e)) + "</span>" : "") + "</fieldset>";
    }
    // grieviq-56: the authority (sanction) letter.
    function letterNeeded() {
      var d = st.data, f = st.f; if (!d || !d.letters) return false;
      var o = officeOf(f.office) || (d.offices.length === 1 ? d.offices[0] : null);
      return !!((o && o.type === "DEPT") || (f.category && d.letterCategories.indexOf(f.category) >= 0));
    }
    function letterHtml() {
      var d = st.data; if (!d.letters) return "";
      var need = letterNeeded(), e = st.fields.letter;
      return '<fieldset class="gn-lang" id="gn-letter-box" aria-describedby="gn-letter-p"><legend>' + esc(T(need ? "ntc.letter_h_req" : "ntc.letter_h_opt")) + "</legend>" +
        '<p class="gn-hint" id="gn-letter-p">' + esc(T(need ? "ntc.letter_p_req" : "ntc.letter_p_opt")) + "</p>" +
        '<div class="gn-fld"><label for="gn-letter">' + esc(T("ntc.f_letter")) + '</label><span class="gn-hint" id="gn-letter-h">' + esc(T("ntc.letter_file_h", { n: d.letterMaxMb })) + "</span>" +
        '<input type="file" id="gn-letter" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" aria-describedby="gn-letter-h' + (st.file ? " gn-letter-c" : "") + (e ? " gn-letter-e" : "") + '"' + (e ? ' aria-invalid="true"' : "") + ">" +
        (st.file ? '<span class="gn-hint" id="gn-letter-c" role="status">' + esc(T("ntc.letter_chosen", { name: st.file.name, size: sizeText(st.file.size) })) + "</span>" : "") +
        (e ? '<span class="gn-err" id="gn-letter-e">' + esc(T("ntc.e_" + e)) + "</span>" : "") + "</div>" +
        fld("letterNo", "text", { max: 60, hint: T("ntc.letterNo_h") }) + fld("letterDate", "date", { maxd: d.today }) + fld("letterBy", "text", { max: 120, hint: T("ntc.letterBy_h") }) + "</fieldset>";
    }
    function previewHtml() {
      var f = st.f, o = officeOf(f.office), d = st.data;
      var plan = o ? o.plans.find(function (p) { return p.id === f.planId; }) : null;
      var has = f.titleEn || f.bodyEn || f.titleHi || f.bodyHi;
      if (!has || !window.GIQNoticeCard) return '<p class="gn-muted">' + esc(T("ntc.preview_empty")) + "</p>";
      return window.GIQNoticeCard.card({ ref: "preview", category: f.category || "CAMP", titleEn: f.titleEn, titleHi: f.titleHi, bodyEn: f.bodyEn, bodyHi: f.bodyHi, eventDate: f.eventDate, eventTime: f.eventTime, place: f.place,
        authority: f.letterNo && f.letterDate ? { no: f.letterNo, date: f.letterDate } : null,
        office: o ? o.name : "…", officeLabel: o ? o.label : ["", ""], until: plan && f.startOn ? addDays(f.startOn, plan.days - 1) : (d ? null : null) }, { h: h + 3, idp: "gnp-" });
    }
    function formHtml() {
      var d = st.data, f = st.f, keys = FIELDS.filter(function (k) { return st.fields[k]; });
      var offs = d.offices, o = officeOf(f.office);
      var plans = o ? o.plans : (offs[0] ? offs[0].plans : []);
      var cats = d.categories.map(function (c) { return { v: c, label: T("pn.cat_" + c), sub: T("ntc.cat_ex_" + c) }; });
      return '<form class="gn-form" id="gn-form" novalidate aria-labelledby="gn-form-h"><' + H2 + ' id="gn-form-h" tabindex="-1">' + esc(T("ntc.form_h")) + "</" + H2 + ">" +
        (keys.length ? '<div class="gn-errbox" id="gn-errs" tabindex="-1" role="alert"><' + H3 + ">" + esc(T("ntc.e_h", { n: keys.length })) + "</" + H3 + "><ul>" + keys.map(function (k) {
          return '<li><a href="#gn-' + k + '" data-go="' + k + '">' + esc(T("ntc.f_" + k)) + ": " + esc(T("ntc.e_" + st.fields[k])) + "</a></li>"; }).join("") + "</ul></div>" : "") +
        (offs.length > 1 ? radios("office", offs.map(function (x) { return { v: x.tier + "|" + x.id, label: officeLabel(x), disabled: x.vacant }; }), T("ntc.f_office")) : "") +
        radios("category", cats, T("ntc.f_category"), { cls: "gn-cats" }) +
        '<p class="gn-hint" id="gn-lang-h">' + esc(T("ntc.lang_h")) + "</p>" +
        '<fieldset class="gn-lang" aria-describedby="gn-lang-h"><legend>' + esc(T("ntc.in_en")) + "</legend>" + fld("titleEn", "text", { max: 80, lang: "en" }) + fld("bodyEn", "textarea", { max: 400, lang: "en", hint: T("ntc.body_h") }) + "</fieldset>" +
        '<fieldset class="gn-lang" aria-describedby="gn-lang-h"><legend>' + esc(T("ntc.in_hi")) + "</legend>" + fld("titleHi", "text", { max: 80, lang: "hi" }) + fld("bodyHi", "textarea", { max: 400, lang: "hi", hint: T("ntc.body_h") }) + "</fieldset>" +
        fld("eventDate", "date", { optional: true, min: d.today }) + fld("eventTime", "text", { optional: true, max: 40, hint: T("ntc.time_h") }) + fld("place", "text", { optional: true, max: 120, hint: T("ntc.place_h") }) +
        radios("planId", plans.map(function (p) { return { v: p.id, label: planText(p) }; }), T("ntc.f_planId"), { hint: T(o && o.reach === "WIDE" ? "ntc.plan_wide" : "ntc.plan_local") }) +
        fld("startOn", "date", { min: d.today, maxd: addDays(d.today, d.maxStartDays), hint: T("ntc.start_h", { n: d.maxStartDays }) }) +
        letterHtml() +
        "<" + H3 + ">" + esc(T("ntc.preview_h")) + '</' + H3 + '><div class="gn-preview" id="gn-preview">' + previewHtml() + "</div>" +
        '<p class="gn-hint">' + esc(T("ntc.send_h")) + "</p>" +
        '<button type="submit" class="gn-btn gn-primary" id="gn-send"' + (st.busy ? " disabled" : "") + ">" + esc(T("ntc.send")) + "</button>" +
        (d.notices.length ? '<button type="button" class="gn-btn" id="gn-cancel">' + esc(T("ntc.cancel")) + "</button>" : "") + "</form>";
    }
    function render(focusId) {
      var d = st.data;
      if (st.err) { el.innerHTML = "<" + H + ">" + esc(T("ntc.h")) + '</' + H + '><p class="gn-msg gn-bad" role="alert">' + esc(st.err) + "</p>"; return; }
      if (!d) { el.innerHTML = "<" + H + ">" + esc(T("ntc.h")) + '</' + H + '><p class="gn-muted" role="status">' + esc(T("ntc.loading")) + "</p>"; return; }
      var rules = '<div class="gn-rules"><p><b>' + esc(T("ntc.rules_ok_h")) + "</b></p><ul>" + ["ntc.rule_1", "ntc.rule_2", "ntc.rule_3"].map(function (k) { return "<li>" + esc(T(k)) + "</li>"; }).join("") + "</ul>" +
        (d.letters ? "<p>" + esc(T("ntc.rules_letter")) + "</p>" : "") +
        "<p><b>" + esc(T("ntc.rules_no_h")) + "</b> " + esc(T("ntc.rules_no")) + "</p><p>" + esc(T("ntc.rules_how")) + "</p></div>";
      var pauses = d.offices.filter(function (o) { return o.pauses.length; }).map(function (o) {
        return '<p class="gn-warn" role="note">' + esc(T(o.pausedNow ? "ntc.pause_now" : "ntc.pause_next", { office: officeLabel(o), list: o.pauses.map(function (p) { return p.label + " (" + dateText(p.from) + " – " + dateText(p.to) + ")"; }).join("; ") })) + (o.type === "DEPT" ? " " + esc(T("ntc.pause_dept")) : "") + "</p>";
      }).join("");
      var vacant = d.offices.filter(function (o) { return o.vacant; }).map(function (o) { return '<p class="gn-warn">' + esc(T("ntc.vacant", { office: officeLabel(o) })) + "</p>"; }).join("");
      var open = st.open || !d.notices.length;
      var html = "<" + H + ' id="gn-h" tabindex="-1">' + esc(T("ntc.h")) + "</" + H + "><p>" + esc(T("ntc.intro")) + "</p>" + rules +
        (st.msg ? '<p class="gn-msg' + (st.msg.bad ? " gn-bad" : "") + '" id="gn-msg" tabindex="-1" role="' + (st.msg.bad ? "alert" : "status") + '">' + esc(st.msg.text) + "</p>" : "") +
        pauses + vacant;
      if (!d.ready) html += '<p class="gn-muted">' + esc(T("ntc.not_ready")) + "</p>";
      else if (!d.enabled) html += '<p class="gn-warn">' + esc(T("ntc.off")) + "</p>";
      else if (open) { if (!st.f) st.f = blank(); html += formHtml(); }
      else html += '<button type="button" class="gn-btn gn-primary" id="gn-new">' + esc(T("ntc.new")) + "</button>";
      if (d.ready) html += "<" + H2 + ">" + esc(T("ntc.list_h", { n: d.notices.length })) + "</" + H2 + ">" + (d.notices.length ? d.notices.map(itemHtml).join("") : '<p class="gn-muted">' + esc(T("ntc.none")) + "</p>");
      el.innerHTML = html;
      wire();
      if (focusId) { var x = document.getElementById(focusId); if (x) x.focus(); }
    }
    function read() {
      if (!st.f) return;
      el.querySelectorAll("#gn-form [data-k]").forEach(function (x) { st.f[x.getAttribute("data-k")] = x.value; });
      ["office", "category", "planId"].forEach(function (k) { var r = el.querySelector('input[name="gn-' + k + '"]:checked'); if (r) st.f[k] = r.value; });
    }
    function wire() {
      var form = el.querySelector("#gn-form");
      if (form) {
        form.addEventListener("submit", send);
        form.querySelectorAll("[data-k]").forEach(function (x) { x.addEventListener("input", function () { read(); var pv = el.querySelector("#gn-preview"); if (pv) pv.innerHTML = previewHtml(); }); });
        form.querySelectorAll('input[name="gn-category"]').forEach(function (r) { r.addEventListener("change", function () { read(); render(r.id); }); });
        var lf = form.querySelector("#gn-letter");
        if (lf && st.file && window.DataTransfer) { try { var dt = new DataTransfer(); dt.items.add(st.file); lf.files = dt.files; } catch (x) { /* older browsers: the "Chosen" line still says which file */ } }
        if (lf) lf.addEventListener("change", function () { read(); st.file = lf.files && lf.files[0] ? lf.files[0] : null; if (st.fields.letter) delete st.fields.letter; render("gn-letter"); });
        form.querySelectorAll('input[name="gn-office"], input[name="gn-planId"]').forEach(function (r) { r.addEventListener("change", function () { read(); if (r.name === "gn-office") st.f.planId = ""; render(r.id); }); });
        form.querySelectorAll("a[data-go]").forEach(function (a) { a.addEventListener("click", function (e) {
          var k = a.getAttribute("data-go"), t = el.querySelector('input[name="gn-' + k + '"]') || document.getElementById("gn-" + k);
          if (t) { e.preventDefault(); t.focus(); }
        }); });
      }
      var nw = el.querySelector("#gn-new"); if (nw) nw.addEventListener("click", function () { st.open = true; st.f = blank(); st.fields = {}; st.msg = null; st.file = null; render("gn-form-h"); });
      var cc = el.querySelector("#gn-cancel"); if (cc) cc.addEventListener("click", function () { st.open = false; st.f = null; st.fields = {}; st.file = null; render("gn-new"); });
      el.querySelectorAll("form[data-rl]").forEach(function (fm) { fm.addEventListener("submit", function (e) { e.preventDefault(); sendLetter(fm); }); });
      el.querySelectorAll("[data-withdraw]").forEach(function (b) { b.addEventListener("click", function () { withdraw(b.getAttribute("data-withdraw")); }); });
      el.querySelectorAll("[data-bill]").forEach(function (b) { b.addEventListener("click", function () { if (opts.onBilling) opts.onBilling(); }); });
    }
    async function send(ev) {
      ev.preventDefault(); read();
      var f = st.f, parts = String(f.office || "").split("|");
      st.busy = true; st.msg = null;
      if (st.file && st.file.size > st.data.letterMaxMb * 1048576) { st.busy = false; st.fields = { letter: "TOO_BIG" }; render("gn-errs"); return; }
      var btn = el.querySelector("#gn-send"); if (btn) btn.disabled = true;
      try {
        var fd = new FormData();
        var vals = { action: "request", officeTier: parts[0] || "", officeId: parts[1] || "", category: f.category, titleEn: f.titleEn, bodyEn: f.bodyEn, titleHi: f.titleHi, bodyHi: f.bodyHi,
          eventDate: f.eventDate, eventTime: f.eventTime, place: f.place, planId: f.planId, startOn: f.startOn, letterNo: f.letterNo, letterDate: f.letterDate, letterBy: f.letterBy };
        Object.keys(vals).forEach(function (k) { fd.append(k, vals[k] == null ? "" : vals[k]); });
        if (st.file) fd.append("letter", st.file, st.file.name);
        var res = await fetch(opts.api, { method: "POST", credentials: "same-origin", body: fd });
        var d = await res.json().catch(function () { return {}; });
        st.busy = false;
        if (res.status === 400 && d.fields) { st.fields = d.fields; render("gn-errs"); return; }
        if (!res.ok) { st.msg = { bad: true, text: T(d.error === "LIMIT" ? "ntc.e_LIMIT" : d.error === "OFF" ? "ntc.off" : d.error === "VACANT" ? "ntc.e_VACANT" : "ntc.e_generic", { n: d.limit }) }; render("gn-msg"); return; }
        st.fields = {}; st.f = null; st.open = false; st.file = null;
        await load();
        st.msg = { text: T("ntc.sent", { ref: d.ref, total: rupees(d.total) }) };
        render("gn-msg");
      } catch (e) { st.busy = false; st.msg = { bad: true, text: T("ntc.e_net") }; render("gn-msg"); }
    }
    async function withdraw(id) {
      var n = st.data.notices.find(function (x) { return x.id === id; });
      if (!confirm(T("ntc.withdraw_q", { ref: n ? n.ref : "" }))) return;
      try {
        var res = await fetch(opts.api, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action: "withdraw", id: id }) });
        var d = await res.json().catch(function () { return {}; });
        if (!res.ok) { st.msg = { bad: true, text: T(d.error === "PAYMENT_REPORTED" ? "ntc.e_PAYMENT_REPORTED" : "ntc.e_generic") }; render("gn-msg"); return; }
        await load();
        st.msg = { text: T("ntc.withdrawn", { ref: n ? n.ref : "" }) };
        render("gn-msg");
      } catch (e) { st.msg = { bad: true, text: T("ntc.e_net") }; render("gn-msg"); }
    }
    async function load() {
      try {
        var res = await fetch(opts.api, { credentials: "same-origin", cache: "no-store" });
        var d = await res.json().catch(function () { return {}; });
        if (!res.ok) { st.err = T("ntc.e_load"); return; }
        st.err = null; st.data = d;
      } catch (e) { st.err = T("ntc.e_load"); }
    }
    render();
    load().then(function () { render(opts.focus ? "gn-h" : null); });
    return { reload: function () { return load().then(function () { render(); }); } };
  }
  window.GIQNotices = { mount: mount };
})();
