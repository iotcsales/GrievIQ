/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// Follow-up requests (grieviq-66): the screens, shared by the State and
// National Dashboards (gov-app.js) and the department dashboard (dept.html).
//   GIQFU.mount(el, cfg)   list, one request (thread) or the "ask" form
//   cfg: { api: "/api/gov/followups" | "/api/dept/followups", side: "gov" | "dept",
//          view: "list" | "thread" | "form", id, preset: { kind, id }, up: bool,
//          data: the GET answer (already loaded), selfName: { nameEn, nameHi },
//          demo: bool, preview(body) -> snapshot (demo only), onBack(), onChange(data) }
// Everything shown is escaped. No citizen details are ever in a request.
(function () {
  function T(k, v) { return window.GIQ ? GIQ.t(k, v) : k; }
  function loc() { return window.GIQ ? GIQ.locale() : "en-IN"; }
  function hi() { return window.GIQ && GIQ.lang === "hi"; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  function nm(x) { return !x ? "" : hi() && x.nameHi ? x.nameHi : (x.nameEn || x.name || ""); }
  async function api(url, opts) {
    try { var r = await fetch(url, Object.assign({ credentials: "same-origin", cache: "no-store" }, opts || {})); var b = await r.json().catch(function () { return {}; }); return { ok: r.ok, status: r.status, body: b }; }
    catch (e) { return { ok: false, status: 0, body: {} }; }
  }
  function day(d) { if (!d) return ""; var x = new Date(String(d).length === 10 ? d + "T00:00:00+05:30" : d); return isNaN(x) ? d : x.toLocaleDateString(loc(), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); }
  function dayTime(d) { var x = new Date(d); return isNaN(x) ? "" : x.toLocaleString(loc(), { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); }
  function todayIst() { return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); }
  function addDays(d, n) { var x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

  var PLACE_FIGURES = ["OVER30", "PENDING", "WITHIN", "RECEIVED"], DEPT_FIGURES = ["LATE_NOW", "WITH_NOW", "ON_TIME", "FIXED_FIRST"], DAYS = [7, 15, 30];
  var NOTE_MIN = 20, NOTE_MAX = 1000, REASON_MIN = 10;

  // A figure's value, as the dashboard shows it (the small-number rule is the server's).
  function value(s) {
    if (!s || s.missing) return T("fu.not_measured");
    var v = s.value;
    if (v === "<10") return T("gv.lt10");
    if (v == null) return T("fu.not_enough");
    var n = Number(v).toLocaleString(loc(), { maximumFractionDigits: 1 });
    return s.unit === "percent" ? n + "%" : n;
  }
  function figName(code) { return T("fu.fig_" + code); }
  function statusOf(x) {
    if (x.status === "CLOSED") return { text: T(x.closedAs === "DONE" ? "fu.st_closed_done" : "fu.st_closed_not"), cls: "" };
    if (x.status === "OVERDUE") return { text: T("fu.st_overdue"), cls: "late" };
    if (x.status === "REPLIED") return { text: T("fu.st_replied"), cls: "ok" };
    if (x.status === "ACKNOWLEDGED") return { text: T("fu.st_ack"), cls: "" };
    return { text: T("fu.st_open"), cls: "" };
  }
  function needsYou(F, x) { return x.side === "RECIPIENT" && x.status !== "CLOSED" && x.status !== "REPLIED"; }
  function otherEnd(x) {
    if (x.side === "SENDER") return T("fu.to_x", { p: nm(x.to) + (x.to.kind === "DEPT" ? "" : " · " + T("fu.kind_" + x.to.kind)) });
    return T("fu.from_x", { p: nm(x.from) + " · " + T("fu.kind_" + x.from.level) });
  }
  var FIELD = {
    TOO_SHORT: "fu.e_short", TOO_LONG: "fu.e_long", NO_CONTACTS: "fu.e_contacts", NO_CASES: "fu.e_cases", NO_LINKS: "fu.e_links",
    FORMAT: "fu.e_ref_format", REQUIRED: "fu.e_ref_needed", DATE: "fu.e_date", CHOOSE: "fu.e_choose", NOT_ALLOWED: "fu.e_not_allowed",
  };
  function topError(r) {
    var c = r.body && r.body.error;
    if (r.status === 0) return T("dd.e_network");
    return T({ NOT_ON: "fu.e_not_on", NOT_ALLOWED: "fu.e_not_allowed", NO_ONE: "fu.e_no_one", TOO_MANY_OPEN: "fu.e_too_many", CLOSED: "fu.e_closed", NOT_YOURS: "fu.e_not_yours", NOT_FOUND: "fu.e_gone", TRY_AGAIN: "fu.e_try_again", CHECK_FIELDS: "fu.e_check" }[c] || "dd.e_generic", { n: 20 });
  }
  // The same checks as the server, so most mistakes are caught before sending.
  function textProblem(s, min) {
    s = String(s || "").trim();
    if (s.length < min) return "TOO_SHORT";
    if (s.length > NOTE_MAX) return "TOO_LONG";
    if (/https?:\/\/|www\./i.test(s)) return "NO_LINKS";
    if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(s)) return "NO_CONTACTS";
    if (/(\+?91[\s-]?)?[6-9](\D?\d){9}\b/.test(s) || /\d{10,}/.test(s.replace(/[\s-]/g, ""))) return "NO_CONTACTS";
    if (/\bGRV[\s-]?[A-Z0-9]{3,}/i.test(s)) return "NO_CASES";
    return null;
  }
  function errText(code, min) { return code ? T(FIELD[code] || "fu.e_check", { n: min || NOTE_MIN, max: NOTE_MAX.toLocaleString(loc()) }) : ""; }

  function mount(el, cfg) {
    var F = { el: el, cfg: cfg, data: cfg.data || { items: [], counts: null, on: false, options: null }, view: cfg.view || "list", item: null,
      filter: cfg.side === "dept" ? ((cfg.data && (cfg.data.items || []).some(function (x) { return x.status !== "CLOSED" && x.status !== "REPLIED"; })) ? "MINE" : "ALL") : "ALL_OPEN", msg: null, busy: false, form: null, act: null, errs: {} };
    if (F.view === "thread" && cfg.id) openThread(F, cfg.id, true);
    else if (F.view === "form") openForm(F, cfg.preset, cfg.up);
    else { setHash(F, "#fu"); render(F, "fu-h"); }
    return {
      refresh: function () { render(F); },
    };
  }
  function setHash(F, h) {
    var base = location.pathname + location.search;
    try { history.replaceState(null, "", base + (h || "")); } catch (e) { /* not important */ }
  }
  async function reload(F) {
    if (F.cfg.demo) return;
    var r = await api(F.cfg.api);
    if (r.ok) { F.data = r.body; if (F.cfg.onChange) F.cfg.onChange(r.body); }
  }
  function msgHtml(F) { return F.msg ? '<div class="msg ' + (F.msg.bad ? "bad" : "ok") + '" id="fu-msg" tabindex="-1" role="' + (F.msg.bad ? "alert" : "status") + '">' + esc(F.msg.text) + "</div>" : ""; }
  function notice() { return '<p class="fu-notice"><b>' + esc(T("fu.notice_b")) + "</b> " + esc(T("fu.notice")) + "</p>"; }
  function render(F, focusId) {
    var h = F.view === "thread" ? renderThread(F) : F.view === "form" ? renderForm(F) : renderList(F);
    F.el.innerHTML = '<div class="fu">' + h + "</div>";
    wire(F);
    var e = focusId && document.getElementById(focusId);
    if (e) e.focus();
  }

  // ---------------------------------------------------------------- the list
  function filtered(F) {
    var f = F.filter;
    return (F.data.items || []).filter(function (x) {
      if (f === "MINE") return needsYou(F, x);
      if (f === "SENT") return x.side === "SENDER" && x.status !== "CLOSED";
      if (f === "OVERDUE") return x.status === "OVERDUE";
      if (f === "CLOSED") return x.status === "CLOSED";
      if (f === "ALL") return true;
      return x.status !== "CLOSED";
    });
  }
  function itemHtml(F, x) {
    var st = statusOf(x), you = needsYou(F, x);
    var vals = T("fu.when_asked", { v: value(x.snapshot) }) + (x.result ? " → " + T("fu.on_date", { v: value(x.result) }) : "");
    return '<li class="fu-item' + (x.status === "OVERDUE" ? " late" : x.status === "CLOSED" ? " closed" : "") + '"><h3><a href="#fu=' + esc(x.id) + '" data-fu-open="' + esc(x.id) + '">' + esc(x.ref) + " · " + esc(figName(x.figure)) + "</a></h3>" +
      '<p class="meta">' + esc(otherEnd(x)) + " · " + esc(x.direction === "UP" ? T("fu.dir_up") : T("fu.dir_down")) + "</p>" +
      '<p class="fu-pills"><span class="fu-pill ' + st.cls + '">' + esc(st.text) + "</span>" + (you ? '<span class="fu-pill gold">' + esc(T("fu.needs_you")) + "</span>" : "") +
      (x.status !== "CLOSED" ? '<span class="meta">' + esc(T("fu.reply_by", { d: day(x.replyBy) })) + "</span>" : "") + "</p>" +
      '<p class="fu-val">' + esc(vals) + "</p></li>";
  }
  function renderList(F) {
    var d = F.data, c = d.counts || { open: 0, overdue: 0, replied: 0, waitingOnUs: 0 }, gov = F.cfg.side === "gov", o = d.options || {};
    var tile = function (n, l, cls) { return '<li class="tile' + (cls && n ? " " + cls : "") + '"><div class="n">' + esc(Number(n || 0).toLocaleString(loc())) + '</div><div class="l">' + esc(l) + "</div></li>"; };
    var h = '<p><button type="button" class="linkish" id="fu-back">' + esc(T(gov ? "fu.back_dash" : "dd.back")) + "</button></p>" +
      '<h1 id="fu-h" tabindex="-1">' + esc(T("fu.h")) + "</h1>" + (F.cfg.demo ? '<p class="fu-demo" role="note">' + esc(T("fu.demo_note")) + "</p>" : "") +
      '<p class="lede">' + esc(T(gov ? "fu.lede_gov" : "fu.lede_dept")) + "</p>" + notice() + msgHtml(F) +
      '<ul class="tiles fu-tiles" aria-label="' + esc(T("fu.counts")) + '">' + tile(c.waitingOnUs, T("fu.c_you"), "gold") + tile(c.open, T("fu.c_open")) + tile(c.overdue, T("fu.c_overdue"), "late") + tile(c.replied, T("fu.c_replied")) + "</ul>";
    if (gov && d.on) {
      h += '<div class="row fu-acts">' + (o.down && o.down.length ? '<button type="button" class="primary" id="fu-new">' + esc(T("fu.ask")) + "</button>" : "") +
        (o.up ? '<button type="button" id="fu-up">' + esc(T("fu.raise", { p: nm(o.up) })) + "</button>" : "") + "</div>";
      if (!(o.down && o.down.length) && !o.up) h += '<p class="hint">' + esc(T("fu.nobody")) + "</p>";
    } else if (gov) h += '<p class="note-box">' + esc(T("fu.off")) + "</p>";
    var filters = gov ? ["ALL_OPEN", "MINE", "SENT", "OVERDUE", "CLOSED", "ALL"] : ["MINE", "ALL_OPEN", "OVERDUE", "CLOSED", "ALL"];
    h += '<div class="fu-filter"><label for="fu-filter">' + esc(T("fu.show")) + '</label><select id="fu-filter">' +
      filters.map(function (k) { return '<option value="' + k + '"' + (F.filter === k ? " selected" : "") + ">" + esc(T("fu.f_" + k)) + "</option>"; }).join("") + "</select></div>";
    var list = filtered(F);
    h += list.length ? '<ul class="fu-list">' + list.map(function (x) { return itemHtml(F, x); }).join("") + "</ul>" :
      '<p class="empty" role="status">' + esc(T((d.items || []).length ? "fu.none_here" : "fu.none_yet")) + "</p>";
    return h;
  }

  // ---------------------------------------------------------------- one request
  async function openThread(F, id, first) {
    F.view = "thread"; F.act = { ack: false, text: "", ref: "", as: "", reason: "", again: false, note: "", days: 15 }; F.errs = {};
    if (F.cfg.demo) {
      F.item = (F.data.items || []).filter(function (x) { return x.id === id; })[0] || null;
      if (!F.item) { F.view = "list"; F.msg = { bad: true, text: T("fu.e_gone") }; render(F, "fu-msg"); return; }
      setHash(F, "#fu=" + id); render(F, "fu-h"); return;
    }
    F.el.innerHTML = '<p class="empty">' + esc(T("gv.loading")) + "</p>";
    var r = await api(F.cfg.api + "?id=" + encodeURIComponent(id));
    if (!r.ok) { F.view = "list"; F.msg = { bad: true, text: topError(r) }; setHash(F, "#fu"); render(F, "fu-msg"); return; }
    F.item = r.body.item; setHash(F, "#fu=" + id);
    render(F, "fu-h");
  }
  var EVK = { CREATED: "fu.ev_created", SEEN: "fu.ev_seen", ACKNOWLEDGED: "fu.ev_ack", REPLIED: "fu.ev_replied", REMINDED: "fu.ev_reminded", OVERDUE: "fu.ev_overdue", MEASURED: "fu.ev_measured", CLOSED: "fu.ev_closed" };
  function stepsHtml(x) {
    return '<ol class="fu-steps">' + (x.events || []).map(function (e) {
      var what = T(EVK[e.kind] || "fu.ev_other"), extra = "";
      if (e.kind === "CLOSED" && e.data && e.data.as) what = T(e.data.as === "DONE" ? "fu.ev_closed_done" : "fu.ev_closed_not");
      if (e.kind === "MEASURED") extra = e.data && e.data.missing ? T("fu.not_measured") : T("fu.measured_line", { a: value(x.snapshot), b: value(x.result) });
      if (e.kind === "REMINDED" || e.kind === "OVERDUE") extra = T("fu.reply_by", { d: day(x.replyBy) });
      return '<li class="' + (e.kind === "OVERDUE" ? "late" : e.kind === "REPLIED" ? "reply" : "") + '"><span class="w">' + esc(dayTime(e.at)) + "</span><b>" + esc(what) + "</b>" +
        (e.by ? '<span class="by">' + esc(e.by) + (e.byPlace ? " · " + esc(e.byPlace) : "") + "</span>" : '<span class="by">' + esc(T("fu.by_system")) + "</span>") +
        (e.text ? '<span class="t">' + esc(e.text) + "</span>" : "") + (e.letterRef ? '<span class="by">' + esc(T("fu.letter_x", { r: e.letterRef })) + "</span>" : "") +
        (extra ? '<span class="by">' + esc(extra) + "</span>" : "") + "</li>";
    }).join("") + "</ol>";
  }
  function fieldErr(F, k, min) { var c = F.errs[k]; return '<div class="err" id="' + k + '-err" role="alert">' + esc(errText(c, min)) + "</div>"; }
  function inv(F, k) { return F.errs[k] ? ' aria-invalid="true"' : ""; }
  function renderThread(F) {
    var x = F.item, st = statusOf(x), a = F.act, gov = F.cfg.side === "gov";
    var acked = (x.events || []).some(function (e) { return e.kind === "ACKNOWLEDGED"; });
    var h = '<p><button type="button" class="linkish" id="fu-to-list">' + esc(T("fu.back_list")) + "</button></p>" +
      '<h1 id="fu-h" tabindex="-1">' + esc(x.ref) + "</h1>" + (F.cfg.demo ? '<p class="fu-demo" role="note">' + esc(T("fu.demo_note")) + "</p>" : "") +
      '<p class="fu-pills"><span class="fu-pill ' + st.cls + '">' + esc(st.text) + "</span>" + (needsYou(F, x) ? '<span class="fu-pill gold">' + esc(T("fu.needs_you")) + "</span>" : "") +
      (x.wasOverdue && x.status !== "OVERDUE" ? '<span class="fu-pill late">' + esc(T("fu.was_late")) + "</span>" : "") + "</p>" + notice() + msgHtml(F);
    var subj = x.snapshot && x.snapshot.subject;
    h += '<div class="card"><dl class="fu-facts">' +
      "<dt>" + esc(T("fu.l_from")) + "</dt><dd>" + esc(nm(x.from) + " · " + T("fu.kind_" + x.from.level)) + "</dd>" +
      "<dt>" + esc(T("fu.l_to")) + "</dt><dd>" + esc(nm(x.to) + (x.to.kind === "DEPT" ? " · " + T("fu.kind_DEPT") : " · " + T("fu.kind_" + x.to.kind))) + "</dd>" +
      "<dt>" + esc(T("fu.l_figure")) + "</dt><dd><b>" + esc(figName(x.figure)) + "</b>" + (subj && (subj.nameEn || subj.nameHi) ? '<span class="sub">' + esc(T("fu.about_x", { p: nm(subj) })) + "</span>" : "") + "</dd>" +
      "<dt>" + esc(T("fu.l_then")) + '</dt><dd><span class="fu-big">' + esc(value(x.snapshot)) + '</span> <span class="sub">' + esc(T("fu.as_of", { d: day(x.snapshotAt) })) + "</span></dd>" +
      "<dt>" + esc(T("fu.l_now")) + "</dt><dd>" + (x.result ? '<span class="fu-big">' + esc(value(x.result)) + '</span> <span class="sub">' + esc(T("fu.as_of", { d: day(x.measuredAt) })) + "</span>" : esc(T("fu.measured_on", { d: day(x.replyBy) }))) + "</dd>" +
      "<dt>" + esc(T("fu.l_reply_by")) + "</dt><dd>" + esc(day(x.replyBy)) + "</dd>" +
      (x.letterRef ? "<dt>" + esc(T("fu.l_letter")) + "</dt><dd>" + esc(x.letterRef) + (x.letterDate ? " · " + esc(day(x.letterDate)) : "") + "</dd>" : "") +
      "</dl><h2>" + esc(T("fu.l_note")) + '</h2><p class="fu-text">' + esc(x.note) + "</p></div>";
    h += '<section class="card" aria-labelledby="fu-steps-h"><h2 id="fu-steps-h">' + esc(T("fu.steps_h")) + "</h2>" + stepsHtml(x) + "</section>";
    if (x.status === "CLOSED") return h + (x.closedReason ? '<p class="hint">' + esc(T("fu.closed_why", { r: x.closedReason })) + "</p>" : "");
    if (x.side === "RECIPIENT") {
      h += '<section class="card" aria-labelledby="fu-reply-h"><h2 id="fu-reply-h">' + esc(T(x.status === "REPLIED" ? "fu.reply_more_h" : "fu.reply_h")) + "</h2>" +
        (!acked ? '<p class="hint">' + esc(T("fu.ack_p")) + '</p><div class="row" style="margin-top:0"><button type="button" id="fu-ack"' + (F.busy ? " disabled" : "") + ">" + esc(T("fu.ack")) + "</button></div>" : "") +
        '<form id="fu-reply" novalidate><label for="fu-text">' + esc(T("fu.reply_l")) + '</label><p class="hint" id="fu-text-hint">' + esc(T("fu.reply_hint")) + "</p>" +
        '<textarea id="fu-text" maxlength="1000" aria-describedby="fu-text-hint fu-text-count text-err"' + inv(F, "text") + ">" + esc(a.text) + "</textarea>" +
        '<p class="hint fu-count" id="fu-text-count" aria-live="polite">' + esc(T("fu.count", { n: a.text.length, max: NOTE_MAX.toLocaleString(loc()) })) + "</p>" + fieldErr(F, "text") +
        '<label for="fu-ref">' + esc(T("fu.ref_l")) + '</label><p class="hint" id="fu-ref-hint">' + esc(T("fu.ref_hint")) + '</p><input type="text" id="fu-ref" maxlength="80" autocomplete="off" value="' + esc(a.ref) + '" aria-describedby="fu-ref-hint letterRef-err"' + inv(F, "letterRef") + ">" + fieldErr(F, "letterRef") +
        '<div class="row"><button type="submit" class="primary" id="fu-send-reply"' + (F.busy ? " disabled" : "") + ">" + esc(T("fu.send_reply")) + "</button></div></form></section>";
    } else if (x.side === "SENDER" && gov) {
      h += '<section class="card" aria-labelledby="fu-close-h"><h2 id="fu-close-h">' + esc(T("fu.close_h")) + '</h2><p class="hint">' + esc(T("fu.close_p")) + "</p>" +
        '<form id="fu-close" novalidate><fieldset><legend>' + esc(T("fu.close_as")) + "</legend>" +
        ["DONE", "NOT_RESOLVED"].map(function (k) { return '<label class="fu-opt"><input type="radio" name="fu-as" value="' + k + '"' + (a.as === k ? " checked" : "") + "> " + esc(T("fu.as_" + k)) + "</label>"; }).join("") + fieldErr(F, "as") + "</fieldset>" +
        '<label for="fu-reason">' + esc(T("fu.reason_l")) + '</label><textarea id="fu-reason" maxlength="500" aria-describedby="reason-err"' + inv(F, "reason") + ">" + esc(a.reason) + "</textarea>" + fieldErr(F, "reason", REASON_MIN) +
        (a.as === "NOT_RESOLVED" ? '<label class="fu-chk"><input type="checkbox" id="fu-again"' + (a.again ? " checked" : "") + "> " + esc(T("fu.again")) + "</label>" +
          (a.again ? '<label for="fu-again-note">' + esc(T("fu.note_l")) + '</label><textarea id="fu-again-note" maxlength="1000" aria-describedby="note-err"' + inv(F, "note") + ">" + esc(a.note) + "</textarea>" + fieldErr(F, "note") + daysHtml(F, a.days, "fu-again-days") : "") : "") +
        '<div class="row"><button type="submit" class="primary" id="fu-send-close"' + (F.busy ? " disabled" : "") + ">" + esc(T("fu.close_btn")) + "</button></div></form></section>";
    }
    return h;
  }
  function daysHtml(F, cur, name) {
    return '<fieldset><legend>' + esc(T("fu.days_l")) + "</legend>" + DAYS.map(function (n) {
      return '<label class="fu-opt"><input type="radio" name="' + name + '" value="' + n + '"' + (Number(cur) === n ? " checked" : "") + "> " + esc(T("fu.days_n", { n: n, d: day(addDays(todayIst(), n)) })) + "</label>";
    }).join("") + fieldErr(F, "days") + "</fieldset>";
  }
  function readAct(F) {
    var g = function (id) { var e = document.getElementById(id); return e ? e.value : null; }, a = F.act;
    if (g("fu-text") != null) a.text = g("fu-text");
    if (g("fu-ref") != null) a.ref = g("fu-ref");
    if (g("fu-reason") != null) a.reason = g("fu-reason");
    if (g("fu-again-note") != null) a.note = g("fu-again-note");
    var as = F.el.querySelector('input[name="fu-as"]:checked'); if (as) a.as = as.value;
    var ag = document.getElementById("fu-again"); if (ag) a.again = ag.checked;
    var dd = F.el.querySelector('input[name="fu-again-days"]:checked'); if (dd) a.days = Number(dd.value);
  }
  function demoDone(F, focus) { F.busy = false; F.msg = { text: T("fu.demo_done") }; render(F, focus || "fu-msg"); }
  async function post(F, body) {
    F.busy = true; render(F);
    var r = await api(F.cfg.api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    F.busy = false;
    return r;
  }
  async function doAck(F) {
    readAct(F);
    if (F.cfg.demo) return demoDone(F);
    var r = await post(F, { action: "acknowledge", id: F.item.id });
    if (!r.ok) { F.msg = { bad: true, text: topError(r) }; render(F, "fu-msg"); return; }
    F.msg = { text: T("fu.ack_done") }; await reload(F); await openThreadKeep(F);
  }
  async function openThreadKeep(F) {
    var msg = F.msg, act = F.act;
    var r = await api(F.cfg.api + "?id=" + encodeURIComponent(F.item.id));
    if (r.ok) F.item = r.body.item;
    F.msg = msg; F.act = act; render(F, "fu-msg");
  }
  async function doReply(F, ev) {
    ev.preventDefault(); readAct(F); var a = F.act; F.errs = {};
    var p = textProblem(a.text, NOTE_MIN); if (p) F.errs.text = p;
    if (a.ref && !/^[\p{L}\p{M}0-9 .,\/()&:#\-]{3,80}$/u.test(a.ref.trim())) F.errs.letterRef = "FORMAT";
    if (Object.keys(F.errs).length) { F.msg = null; render(F, F.errs.text ? "fu-text" : "fu-ref"); return; }
    if (F.cfg.demo) return demoDone(F);
    var r = await post(F, { action: "reply", id: F.item.id, text: a.text.trim(), letterRef: a.ref.trim() });
    if (r.status === 400 && r.body.fields) { F.errs = r.body.fields; F.msg = null; render(F, "fu-text"); return; }
    if (!r.ok) { F.msg = { bad: true, text: topError(r) }; render(F, "fu-msg"); return; }
    F.act.text = ""; F.act.ref = ""; F.msg = { text: T("fu.reply_done") }; await reload(F); await openThreadKeep(F);
  }
  async function doClose(F, ev) {
    ev.preventDefault(); readAct(F); var a = F.act; F.errs = {};
    if (!a.as) F.errs.as = "CHOOSE";
    var p = textProblem(a.reason, REASON_MIN); if (p) F.errs.reason = p;
    if (a.as === "NOT_RESOLVED" && a.again) { var q = textProblem(a.note, NOTE_MIN); if (q) F.errs.note = q; }
    if (Object.keys(F.errs).length) { F.msg = null; render(F); var fe = F.errs.as ? F.el.querySelector('input[name="fu-as"]') : document.getElementById(F.errs.reason ? "fu-reason" : "fu-again-note"); if (fe) fe.focus(); return; }
    if (F.cfg.demo) return demoDone(F);
    var r = await post(F, { action: "close", id: F.item.id, as: a.as, reason: a.reason.trim(), again: a.as === "NOT_RESOLVED" && a.again, note: a.note.trim(), days: a.days });
    if (r.status === 400 && r.body.fields) { F.errs = r.body.fields; F.msg = null; render(F); return; }
    if (!r.ok) { F.msg = { bad: true, text: topError(r) }; render(F, "fu-msg"); return; }
    var again = r.body.again;
    F.msg = { text: again && again.ref ? T("fu.closed_again", { r: again.ref }) : T("fu.closed_done") };
    if (again && again.error) F.msg = { bad: true, text: T("fu.closed_again_failed") + " " + topError({ status: 409, body: again }) };
    await reload(F); await openThreadKeep(F);
  }

  // ---------------------------------------------------------------- the form
  function openForm(F, preset, up) {
    var o = F.data.options || {};
    var to = up ? (o.up ? o.up.kind + ":" + (o.up.id || "") : "") : preset ? preset.kind + ":" + preset.id : "";
    F.view = "form"; F.errs = {}; F.msg = null;
    F.form = { up: !!up, to: to, subject: "SELF", office: "", figure: "", note: "", ref: "", date: "", days: 15, preview: null, previewBusy: false };
    setHash(F, "#fu");
    render(F, "fu-h");
    if (F.form.to) loadPreview(F);
  }
  function subjectKind(F) {
    var fm = F.form;
    if (!fm.up) return fm.to.indexOf("DEPT:") === 0 ? "DEPT" : "PLACE";
    return fm.subject === "DEPT" ? "DEPT" : "PLACE";
  }
  function renderForm(F) {
    var fm = F.form, o = F.data.options || {}, kinds = subjectKind(F) === "DEPT" ? DEPT_FIGURES : PLACE_FIGURES;
    var targets = fm.up ? (o.up ? [o.up] : []) : (o.down || []);
    var h = '<p><button type="button" class="linkish" id="fu-cancel-top">' + esc(T("fu.back_list")) + "</button></p>" +
      '<h1 id="fu-h" tabindex="-1">' + esc(T(fm.up ? "fu.form_up_h" : "fu.form_h")) + "</h1>" + (F.cfg.demo ? '<p class="fu-demo" role="note">' + esc(T("fu.demo_note")) + "</p>" : "") +
      '<p class="lede">' + esc(T(fm.up ? "fu.form_up_p" : "fu.form_p")) + "</p>" + notice() + msgHtml(F) + '<form id="fu-form" class="card" novalidate>';
    if (fm.up) h += "<p><b>" + esc(T("fu.l_to")) + ":</b> " + esc(nm(o.up)) + "</p>";
    else {
      var grp = function (kind, label) {
        var list = targets.filter(function (t) { return t.kind === kind; });
        return list.length ? '<optgroup label="' + esc(label) + '">' + list.map(function (t) { var v = t.kind + ":" + t.id; return '<option value="' + esc(v) + '"' + (fm.to === v ? " selected" : "") + ">" + esc(nm(t)) + "</option>"; }).join("") + "</optgroup>" : "";
      };
      h += '<label for="fu-to">' + esc(T("fu.to_l")) + '</label><select id="fu-to" aria-describedby="to-err"' + inv(F, "to") + '><option value="">' + esc(T("fu.choose")) + "</option>" +
        grp("STATE", T("fu.g_states")) + grp("DISTRICT", T("fu.g_districts")) + grp("DEPT", T("fu.g_offices")) + "</select>" + fieldErr(F, "to");
    }
    if (fm.up) {
      var offs = o.offices || [];
      h += '<fieldset><legend>' + esc(T("fu.about_l")) + "</legend>" +
        '<label class="fu-opt"><input type="radio" name="fu-subj" value="SELF"' + (fm.subject !== "DEPT" ? " checked" : "") + "> " + esc(T("fu.about_self", { p: nm(F.cfg.selfName) })) + "</label>" +
        (offs.length ? '<label class="fu-opt"><input type="radio" name="fu-subj" value="DEPT"' + (fm.subject === "DEPT" ? " checked" : "") + "> " + esc(T("fu.about_office")) + "</label>" : "") + "</fieldset>";
      if (fm.subject === "DEPT") h += '<label for="fu-office">' + esc(T("fu.office_l")) + '</label><select id="fu-office" aria-describedby="subjectOfficeId-err"' + inv(F, "subjectOfficeId") + '><option value="">' + esc(T("fu.choose")) + "</option>" +
        offs.map(function (t) { return '<option value="' + esc(t.id) + '"' + (String(fm.office) === String(t.id) ? " selected" : "") + ">" + esc(nm(t)) + "</option>"; }).join("") + "</select>" + fieldErr(F, "subjectOfficeId");
    }
    h += '<fieldset><legend>' + esc(T("fu.fig_l")) + "</legend>" + kinds.map(function (k) {
      return '<label class="fu-opt"><input type="radio" name="fu-fig" value="' + k + '"' + (fm.figure === k ? " checked" : "") + "> <span>" + esc(figName(k)) + '<span class="sub">' + esc(T("fu.fig_" + k + "_d")) + "</span></span></label>";
    }).join("") + fieldErr(F, "figure") + "</fieldset>";
    h += '<div class="fu-preview" id="fu-preview" aria-live="polite">' + previewText(F) + "</div>";
    h += '<label for="fu-note">' + esc(T("fu.note_l")) + '</label><p class="hint" id="fu-note-hint">' + esc(T("fu.note_hint")) + "</p>" +
      '<textarea id="fu-note" maxlength="1000" aria-describedby="fu-note-hint fu-note-count note-err"' + inv(F, "note") + ">" + esc(fm.note) + "</textarea>" +
      '<p class="hint fu-count" id="fu-note-count" aria-live="polite">' + esc(T("fu.count", { n: fm.note.length, max: NOTE_MAX.toLocaleString(loc()) })) + "</p>" + fieldErr(F, "note");
    h += '<label for="fu-ref">' + esc(T("fu.ref_l")) + '</label><p class="hint" id="fu-ref-hint">' + esc(T("fu.ref_hint")) + '</p><input type="text" id="fu-ref" maxlength="80" autocomplete="off" value="' + esc(fm.ref) + '" aria-describedby="fu-ref-hint letterRef-err"' + inv(F, "letterRef") + ">" + fieldErr(F, "letterRef") +
      '<label for="fu-date">' + esc(T("fu.date_l")) + '</label><input type="date" id="fu-date" max="' + todayIst() + '" value="' + esc(fm.date) + '" aria-describedby="letterDate-err"' + inv(F, "letterDate") + ">" + fieldErr(F, "letterDate");
    h += daysHtml(F, fm.days, "fu-days");
    h += '<div class="row"><button type="submit" class="primary" id="fu-send"' + (F.busy ? " disabled" : "") + ">" + esc(T(fm.up ? "fu.send_up" : "fu.send")) + '</button><button type="button" id="fu-cancel">' + esc(T("fu.cancel")) + "</button></div></form>";
    return h;
  }
  function previewText(F) {
    var fm = F.form;
    if (!fm.figure || (!fm.up && !fm.to) || (fm.up && fm.subject === "DEPT" && !fm.office)) return '<p class="hint">' + esc(T("fu.preview_wait")) + "</p>";
    if (fm.previewBusy) return '<p class="hint">' + esc(T("gv.loading")) + "</p>";
    if (!fm.preview) return '<p class="hint">' + esc(T("fu.preview_none")) + "</p>";
    return "<p>" + esc(T("fu.preview", { f: figName(fm.figure), p: nm(fm.preview.subject) })) + ' <b class="fu-big">' + esc(value(fm.preview)) + "</b></p>" +
      '<p class="hint">' + esc(T("fu.preview_p")) + "</p>";
  }
  function readForm(F) {
    var fm = F.form, g = function (id) { var e = document.getElementById(id); return e ? e.value : null; };
    if (g("fu-to") != null) fm.to = g("fu-to");
    if (g("fu-office") != null) fm.office = g("fu-office");
    if (g("fu-note") != null) fm.note = g("fu-note");
    if (g("fu-ref") != null) fm.ref = g("fu-ref");
    if (g("fu-date") != null) fm.date = g("fu-date");
    var s = F.el.querySelector('input[name="fu-subj"]:checked'); if (s) fm.subject = s.value;
    var f = F.el.querySelector('input[name="fu-fig"]:checked'); fm.figure = f ? f.value : "";
    var d = F.el.querySelector('input[name="fu-days"]:checked'); if (d) fm.days = Number(d.value);
  }
  function body(F) {
    var fm = F.form, o = F.data.options || {}, to = fm.up ? (o.up ? { kind: o.up.kind, id: o.up.id || null } : { kind: "", id: null }) : { kind: fm.to.split(":")[0], id: fm.to.split(":").slice(1).join(":") };
    return { toKind: to.kind, toId: to.id, subject: fm.up ? fm.subject : undefined, subjectOfficeId: fm.up && fm.subject === "DEPT" ? fm.office : undefined, figure: fm.figure,
      note: fm.note.trim(), letterRef: fm.ref.trim(), letterDate: fm.date, days: fm.days };
  }
  async function loadPreview(F) {
    var fm = F.form, b = body(F);
    if (!fm.figure || !b.toKind || (fm.up && fm.subject === "DEPT" && !fm.office)) { var pv0 = document.getElementById("fu-preview"); if (pv0) pv0.innerHTML = previewText(F); return; }
    if (F.cfg.demo) { fm.preview = F.cfg.preview ? F.cfg.preview(b) : null; var pd = document.getElementById("fu-preview"); if (pd) pd.innerHTML = previewText(F); return; }
    fm.previewBusy = true; var pv = document.getElementById("fu-preview"); if (pv) pv.innerHTML = previewText(F);
    var q = new URLSearchParams({ preview: "1", toKind: b.toKind, toId: b.toId || "", figure: b.figure });
    if (b.subject) q.set("subject", b.subject); if (b.subjectOfficeId) q.set("subjectOfficeId", b.subjectOfficeId);
    var key = q.toString(); fm.previewKey = key;
    var r = await api(F.cfg.api + "?" + key);
    if (fm.previewKey !== key) return;
    fm.previewBusy = false; fm.preview = r.ok && r.body.snapshot ? r.body.snapshot : null;
    var pv2 = document.getElementById("fu-preview"); if (pv2) pv2.innerHTML = previewText(F);
  }
  async function send(F, ev) {
    ev.preventDefault(); readForm(F); var fm = F.form; F.errs = {};
    if (!fm.up && !fm.to) F.errs.to = "CHOOSE";
    if (fm.up && fm.subject === "DEPT" && !fm.office) F.errs.subjectOfficeId = "CHOOSE";
    if (!fm.figure) F.errs.figure = "CHOOSE";
    var p = textProblem(fm.note, NOTE_MIN); if (p) F.errs.note = p;
    if (fm.ref && !/^[\p{L}\p{M}0-9 .,\/()&:#\-]{3,80}$/u.test(fm.ref.trim())) F.errs.letterRef = "FORMAT";
    if (fm.date && !fm.ref.trim()) F.errs.letterRef = "REQUIRED";
    if (fm.date && fm.date > todayIst()) F.errs.letterDate = "DATE";
    if (Object.keys(F.errs).length) { F.msg = { bad: true, text: T("fu.e_check") }; render(F, "fu-msg"); return; }
    if (F.cfg.demo) return demoDone(F);
    var r = await post(F, Object.assign({ action: "create" }, body(F)));
    if (r.status === 400 && r.body.fields) { F.errs = r.body.fields; F.msg = { bad: true, text: T("fu.e_check") }; render(F, "fu-msg"); return; }
    if (!r.ok) { F.msg = { bad: true, text: topError(r) }; render(F, "fu-msg"); return; }
    await reload(F);
    F.msg = { text: T("fu.sent", { r: r.body.ref, d: day(r.body.replyBy) }) };
    var keep = F.msg; await openThread(F, r.body.id); F.msg = keep; render(F, "fu-msg");
  }

  // ---------------------------------------------------------------- events
  function wire(F) {
    var on = function (id, ev, fn) { var e = document.getElementById(id); if (e) e.addEventListener(ev, fn); };
    on("fu-back", "click", function () { setHash(F, ""); if (F.cfg.onBack) F.cfg.onBack(); });
    var toList = function () { F.view = "list"; F.msg = null; F.errs = {}; setHash(F, "#fu"); render(F, "fu-h"); };
    on("fu-to-list", "click", toList); on("fu-cancel", "click", toList); on("fu-cancel-top", "click", toList);
    on("fu-filter", "change", function (e) { F.filter = e.target.value; F.msg = null; render(F, "fu-filter"); });
    on("fu-new", "click", function () { openForm(F, null, false); });
    on("fu-up", "click", function () { openForm(F, null, true); });
    F.el.querySelectorAll("[data-fu-open]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); F.msg = null; openThread(F, a.getAttribute("data-fu-open")); }); });
    on("fu-ack", "click", function () { doAck(F); });
    on("fu-reply", "submit", function (e) { doReply(F, e); });
    on("fu-close", "submit", function (e) { doClose(F, e); });
    on("fu-form", "submit", function (e) { send(F, e); });
    // Live: the character counts, and the parts of the form that change with a choice.
    var counter = function (id, cid) { var t = document.getElementById(id), c = document.getElementById(cid); if (t && c) t.addEventListener("input", function () { c.textContent = T("fu.count", { n: t.value.length, max: NOTE_MAX.toLocaleString(loc()) }); }); };
    counter("fu-text", "fu-text-count"); counter("fu-note", "fu-note-count");
    if (F.view === "form") {
      var rerender = function (focusSel) { readForm(F); F.form.preview = null; render(F); var e = F.el.querySelector(focusSel); if (e) e.focus(); loadPreview(F); };
      on("fu-to", "change", function () { var was = subjectKind(F); readForm(F); if (subjectKind(F) !== was) F.form.figure = ""; rerender("#fu-to"); });
      on("fu-office", "change", function () { rerender("#fu-office"); });
      F.el.querySelectorAll('input[name="fu-subj"]').forEach(function (r) { r.addEventListener("change", function () { F.form.figure = ""; rerender('input[name="fu-subj"][value="' + r.value + '"]'); }); });
      F.el.querySelectorAll('input[name="fu-fig"]').forEach(function (r) { r.addEventListener("change", function () { readForm(F); F.form.preview = null; loadPreview(F); }); });
    }
    if (F.view === "thread") {
      F.el.querySelectorAll('input[name="fu-as"]').forEach(function (r) { r.addEventListener("change", function () { readAct(F); render(F); var e = F.el.querySelector('input[name="fu-as"][value="' + r.value + '"]'); if (e) e.focus(); }); });
      on("fu-again", "change", function () { readAct(F); render(F, "fu-again"); });
    }
  }

  // ---------------------------------------------------------------- the dashboard card
  // A short card for the State and National Dashboards.
  function card(data, opts) {
    var c = (data && data.counts) || { open: 0, overdue: 0, replied: 0, waitingOnUs: 0 };
    var parts = [T("fu.c_you") + ": " + Number(c.waitingOnUs || 0).toLocaleString(loc()), T("fu.c_open") + ": " + Number(c.open || 0).toLocaleString(loc()),
      T("fu.c_overdue") + ": " + Number(c.overdue || 0).toLocaleString(loc()), T("fu.c_replied") + ": " + Number(c.replied || 0).toLocaleString(loc())];
    return '<section class="sec card fu-card" aria-labelledby="fu-card-h"><h2 id="fu-card-h">' + esc(T("fu.h")) + "</h2>" +
      (opts && opts.demo ? '<p class="fu-demo" role="note">' + esc(T("fu.demo_card")) + "</p>" : "") +
      '<p class="lede">' + esc(T("fu.card_p")) + '</p><ul class="fu-counts">' + parts.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>" +
      '<div class="row"><button type="button" id="fu-open-list">' + esc(T("fu.open_list")) + "</button>" +
      (data && data.on && data.options && data.options.down && data.options.down.length ? '<button type="button" class="primary" id="fu-open-new">' + esc(T("fu.ask")) + "</button>" : "") + "</div></section>";
  }

  window.GIQFU = { mount: mount, card: card, value: value, figName: figName, PLACE_FIGURES: PLACE_FIGURES, DEPT_FIGURES: DEPT_FIGURES };
})();
