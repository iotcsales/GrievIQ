/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// Government dashboards (grieviq-49..52): one app, three front doors.
//   /state     State Dashboard (state and district officials)
//   /national  National Dashboard (Union ministry officials)
//   /gov       chooser; a signed-in official is sent to their own dashboard
// The page says which in <meta name="giq-gov-mode">.
(function () {
  function T(k, v) { return window.GIQ ? GIQ.t(k, v) : k; }
  function loc() { return window.GIQ ? GIQ.locale() : "en-IN"; }
  function hi() { return window.GIQ && GIQ.lang === "hi"; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  async function api(url, opts) {
    try { var r = await fetch(url, Object.assign({ credentials: "same-origin", cache: "no-store" }, opts || {})); var b = await r.json().catch(function () { return {}; }); return { ok: r.ok, status: r.status, body: b }; }
    catch (e) { return { ok: false, status: 0, body: {} }; }
  }
  var main = document.getElementById("main");
  var params = new URLSearchParams(location.search);
  var DEMO = params.get("demo") === "1";
  // grieviq-52: which front door: "state", "national" or "gov" (the chooser).
  var MODE = (document.querySelector('meta[name="giq-gov-mode"]') || {}).content || "gov";
  var HOME = { state: "/state", national: "/national" };
  var S = { screen: "loading", email: "", emailErr: "", codeErr: "", msg: null, busy: false, me: null, data: null,
    month: params.get("month") || "", state: params.get("state") || "", district: params.get("district") || "", dept: params.get("dept") || "", sort: { key: null, dir: -1 }, q: "", loadErr: "" };

  // ---- numbers (the small-number rule is applied by the server) ----
  function num(v) { return v === "<10" ? T("gv.lt10") : v == null ? "—" : Number(v).toLocaleString(loc()); }
  function pct(v) { return v == null ? null : Number(v).toLocaleString(loc(), { maximumFractionDigits: 1 }) + "%"; }
  function days(v) { return v == null ? null : T("gv.n_days", { n: Number(v).toLocaleString(loc(), { maximumFractionDigits: 1 }) }); }
  function sortVal(v) { return v === "<10" ? 5 : v == null ? -1 : Number(v); }
  function nm(x) { return x ? (hi() && x.nameHi ? x.nameHi : x.nameEn) : ""; }
  function monthName(mo, long) { return new Date(mo + "-01T00:00:00+05:30").toLocaleDateString(loc(), { month: long === false ? "short" : "long", year: "numeric", timeZone: "Asia/Kolkata" }); }
  function themeName(t) { return t === "OTHER" ? T("gv.theme_other") : T("theme." + t); }

  // ---- address bar keeps the view (back button works) ----
  function url() {
    var p = new URLSearchParams();
    if (DEMO) p.set("demo", "1");
    if (S.state) p.set("state", S.state);
    if (S.district) p.set("district", S.district);
    if (S.dept) p.set("dept", S.dept);
    if (S.month) p.set("month", S.month);
    var q = p.toString(); return location.pathname + (q ? "?" + q : "");
  }
  window.addEventListener("popstate", function () {
    var p = new URLSearchParams(location.search);
    S.state = p.get("state") || ""; S.district = p.get("district") || ""; S.dept = p.get("dept") || ""; S.month = p.get("month") || "";
    if (S.me) loadStats("h1", true);
  });

  function setWho() {
    var w = document.getElementById("who"), bar = document.getElementById("demo-bar");
    bar.hidden = !DEMO;
    if (DEMO) bar.innerHTML = "<b>" + esc(T("gv.demo_bar_b")) + "</b> " + esc(T("gv.demo_bar")) + ' <a href="/gov">' + esc(T("gv.demo_leave")) + "</a>";
    if (!S.me || DEMO) { w.hidden = true; return; }
    w.hidden = false;
    var u = S.me.user;
    w.innerHTML = "<b>" + esc(u.name) + "</b> · " + esc(u.designation) + "<br>" + esc(scopeLabel()) +
      ' · <button type="button" class="linkish" id="sign-out">' + esc(T("gv.sign_out")) + "</button>";
    document.getElementById("sign-out").addEventListener("click", signOut);
  }
  function scopeLabel() {
    var me = S.me; if (!me) return "";
    if (me.user.level === "NATIONAL") return T("gv.scope_country", { c: nm(me.country) });
    return me.user.level === "DISTRICT" && me.district ? T("gv.scope_district", { d: nm(me.district), s: nm(me.state) }) : T("gv.scope_state", { s: nm(me.state) });
  }
  // The level now shown: "country", "state" or "district" (from the server's answer).
  function level() { var pl = S.data && S.data.place; return !pl ? "country" : pl.district ? "district" : pl.state ? "state" : "country"; }
  function msgHtml() { return S.msg ? '<div class="msg ' + (S.msg.bad ? "bad" : "ok") + '" id="msg" tabindex="-1" role="' + (S.msg.bad ? "alert" : "status") + '">' + esc(S.msg.text) + "</div>" : ""; }
  function show(focusId) {
    setWho();
    if (S.screen === "email") main.innerHTML = renderEmail();
    else if (S.screen === "code") main.innerHTML = renderCode();
    else if (S.screen === "dash") main.innerHTML = renderDash();
    else if (S.screen === "chooser") main.innerHTML = renderChooser();
    else if (S.screen === "error") main.innerHTML = '<div class="card"><p class="msg bad" role="alert">' + esc(S.loadErr) + '</p><button type="button" id="retry">' + esc(T("gv.retry")) + "</button></div>";
    else main.innerHTML = '<p class="empty">' + esc(T("gv.loading")) + "</p>";
    wire();
    if (S.screen === "dash" && window.GIQC) GIQC.attach(main, { loc: loc(), received: T(S.dept ? "gv.t_forwarded" : "gv.t_received"), resolved: T(S.dept ? "gv.t_done" : "gv.t_resolved") });
    var el = focusId && document.getElementById(focusId);
    if (el) el.focus();
  }

  // ---------------- sign in ----------------
  function renderEmail() {
    return '<div class="card"><h1 id="h" tabindex="-1">' + esc(T(MODE === "national" ? "gv.signin_h_national" : "gv.signin_h_state")) + '</h1><p class="lede">' + esc(T(MODE === "national" ? "gv.signin_lede_national" : "gv.signin_lede_state")) + "</p>" + msgHtml() +
      '<form id="f-email" novalidate><label for="email">' + esc(T("gv.email")) + '</label><p class="hint" id="email-hint">' + esc(T("gv.email_hint")) + "</p>" +
      '<input type="email" id="email" autocomplete="email" maxlength="200" value="' + esc(S.email) + '" aria-describedby="email-hint email-err"' + (S.emailErr ? ' aria-invalid="true"' : "") + ">" +
      '<div class="err" id="email-err" role="alert">' + esc(S.emailErr) + "</div>" +
      '<div class="row"><button type="submit" class="primary" id="send"' + (S.busy ? " disabled" : "") + ">" + esc(T("dd.send_code")) + "</button></div></form>" +
      '<p class="note-box">' + esc(T("gv.signin_note")) + "</p>" +
      '<p class="demo-link"><a href="' + HOME[MODE] + '?demo=1">' + esc(T("gv.demo_link")) + "</a></p>" +
      '<p class="other-door">' + esc(T(MODE === "national" ? "gv.door_to_state" : "gv.door_to_national")) + ' <a href="' + (MODE === "national" ? "/state" : "/national") + '">' + esc(T(MODE === "national" ? "gv.door_state" : "gv.door_national")) + "</a></p></div>";
  }
  function renderCode() {
    return '<div class="card"><h1 id="h" tabindex="-1">' + esc(T("dd.code_h")) + '</h1><p class="lede">' + esc(T("dd.code_lede", { email: S.email })) + "</p>" + msgHtml() +
      '<form id="f-code" novalidate><label for="code">' + esc(T("dd.code")) + '</label><input type="text" id="code" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-describedby="code-err"' + (S.codeErr ? ' aria-invalid="true"' : "") + ">" +
      '<div class="err" id="code-err" role="alert">' + esc(S.codeErr) + "</div>" +
      '<div class="row"><button type="submit" class="primary" id="verify"' + (S.busy ? " disabled" : "") + ">" + esc(T("dd.sign_in")) + '</button><button type="button" id="again">' + esc(T("dd.new_code")) + '</button><button type="button" class="linkish" id="other-email">' + esc(T("dd.other_email")) + "</button></div></form></div>";
  }
  async function sendCode(ev) {
    if (ev) ev.preventDefault();
    var e = document.getElementById("email"); if (e) S.email = e.value.trim();
    S.emailErr = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(S.email) ? "" : T("dd.e_email");
    if (S.emailErr) { show("email"); return; }
    S.busy = true; show();
    var r = await api("/api/gov/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: S.email, dash: MODE }) });
    S.busy = false;
    if (r.status === 429) { S.msg = { bad: true, text: T("dd.e_too_many", { n: r.body.minutes || 15 }) }; show("msg"); return; }
    if (!r.ok) { S.msg = { bad: true, text: r.status === 0 ? T("dd.e_network") : T("dd.e_generic") }; show("msg"); return; }
    S.msg = { text: T("dd.code_sent") }; S.codeErr = ""; S.screen = "code"; show("code");
  }
  async function verify(ev) {
    ev.preventDefault();
    var code = (document.getElementById("code").value || "").replace(/\D/g, "");
    if (code.length !== 6) { S.codeErr = T("dd.e_code_format"); S.msg = null; show("code"); return; }
    S.busy = true; show();
    var r = await api("/api/gov/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: S.email, code: code }) });
    S.busy = false;
    if (!r.ok) {
      var c = r.body.error; S.msg = null;
      S.codeErr = r.status === 0 ? T("dd.e_network") : c === "INCORRECT" ? T("dd.e_code_wrong", { n: r.body.triesLeft }) : c === "TOO_MANY_TRIES" ? T("dd.e_code_tries") : T("dd.e_code_expired");
      show("code"); return;
    }
    S.msg = null; await start("h1");
  }
  async function signOut() {
    await api("/api/gov/signout", { method: "POST" });
    S.me = null; S.data = null; S.state = ""; S.district = ""; S.dept = ""; S.month = ""; S.screen = "email"; S.msg = { text: T("gv.signed_out") };
    history.replaceState(null, "", location.pathname); show("msg");
  }

  // ---------------- the dashboard ----------------
  // /gov: two doors, and the two demos.
  function renderChooser() {
    var door = function (k, href) {
      return '<li class="door door-' + k + '"><h2>' + esc(T("gv.door_" + k)) + '</h2><p>' + esc(T("gv.door_" + k + "_p")) + '</p><div class="row">' +
        '<a class="btn primary" href="' + href + '">' + esc(T("gv.door_signin")) + '</a><a class="btn" href="' + href + '?demo=1">' + esc(T("gv.door_demo")) + "</a></div></li>";
    };
    return '<h1 id="h" tabindex="-1">' + esc(T("gv.door_h")) + '</h1><p class="lede">' + esc(T("gv.door_p")) + '</p><ul class="doors">' + door("state", "/state") + door("national", "/national") + "</ul>";
  }
  async function start(focusId) {
    if (MODE === "gov") {
      // The chooser. A signed-in official goes straight to their own dashboard.
      if (!DEMO) {
        var who = await api("/api/gov/me");
        if (who.ok && who.body.user) { location.replace((who.body.user.level === "NATIONAL" ? "/national" : "/state") + location.search); return; }
      }
      S.screen = "chooser"; show("h"); return;
    }
    var r = await api("/api/gov/me" + (DEMO ? "?demo=1&mode=" + MODE : ""));
    if (r.status === 401) { S.screen = "email"; show(); return; }
    if (!r.ok) { S.screen = "error"; S.loadErr = r.status === 0 ? T("dd.e_network") : T("gv.e_load"); show(); return; }
    // The right door for this official: national access on /national, the rest on /state.
    var want = r.body.user.level === "NATIONAL" ? "national" : "state";
    if (!DEMO && want !== MODE) { location.replace(HOME[want] + "?moved=1"); return; }
    if (params.get("moved") === "1") S.notice = T(want === "national" ? "gv.moved_national" : "gv.moved_state");
    if (DEMO && MODE === "state" && !S.state) S.state = r.body.home && r.body.home.state ? r.body.home.state.id : "";
    S.me = r.body;
    if (!DEMO) { var pr = await api("/api/gov/prefs"); S.prefs = pr.ok ? pr.body : null; }
    await loadStats(focusId, true);
  }
  async function loadStats(focusId, noPush) {
    var q = new URLSearchParams();
    if (DEMO) q.set("demo", "1");
    if (S.month) q.set("month", S.month);
    if (S.state) q.set("state", S.state);
    if (S.district) q.set("district", S.district);
    if (S.dept) q.set("dept", S.dept);
    var r = await api("/api/gov/stats?" + q.toString());
    if (r.status === 401) { S.me = null; S.screen = "email"; S.msg = { text: T("gv.signed_out") }; show("msg"); return; }
    if (!r.ok) { S.screen = "error"; S.loadErr = r.status === 0 ? T("dd.e_network") : r.status === 403 ? T("gv.e_not_yours") : T("gv.e_load"); show(); return; }
    S.data = r.body; S.month = r.body.month; S.screen = "dash";
    if (!noPush) history.pushState(null, "", url()); else history.replaceState(null, "", url());
    document.title = T(MODE === "national" ? "gv.page_title_national" : "gv.page_title_state");
    show(focusId);
  }
  function go(state, district, dept) { S.state = state || ""; S.district = district || ""; S.dept = dept || ""; S.sort = { key: null, dir: -1 }; S.q = ""; loadStats("h1"); }

  // Country › State › District › Department, starting at the official's own level.
  function crumbs() {
    var me = S.me, d = S.data, pl = d.place || {}, items = [], lv = me.user.level;
    var link = function (go, text, current) { return current ? '<li aria-current="page">' + esc(text) + "</li>" : '<li><a href="#" data-go="' + go + '">' + esc(text) + "</a></li>"; };
    if (lv === "NATIONAL") items.push(link("country", nm(pl.country || me.country), !pl.state && !S.dept));
    if (pl.state && lv !== "DISTRICT") items.push(link("state", nm(pl.state), !pl.district && !S.dept));
    if (pl.district) items.push(link("district", T("gv.district_n", { d: nm(pl.district) }), !S.dept));
    if (S.dept && d.dept) items.push('<li aria-current="page">' + esc(nm(d.dept)) + "</li>");
    if (items.length < 2) return "";   // already at the top: the heading says where
    return '<nav class="crumbs" aria-label="' + esc(T("gv.crumbs")) + '"><ol>' + items.join("") + "</ol></nav>";
  }
  function tile(label, value, compare, small) {
    if (value === T("gv.lt10")) small = true;
    return '<li class="tile"><div class="n' + (small ? " small" : "") + '">' + esc(value) + '</div><div class="l">' + esc(label) + "</div>" + (compare ? '<div class="c">' + esc(compare) + "</div>" : "") + "</li>";
  }
  function changeText(c) {
    if (c == null) return null;
    if (c === 0) return T("gv.same_as_last");
    return T(c > 0 ? "gv.up_from_last" : "gv.down_from_last", { p: Math.abs(c).toLocaleString(loc(), { maximumFractionDigits: 1 }) });
  }
  function pctTile(label, v, prev) {
    return v == null ? tile(label, T("gv.not_enough"), null, true) : tile(label, pct(v), prev == null ? null : T("gv.last_month_was", { v: pct(prev) }));
  }
  function renderDash() {
    var d = S.data, me = S.me, t = d.tiles, b = d.before;
    var pl = d.place || {}, dist = pl.district, st = pl.state;
    var title = S.dept && d.dept ? nm(d.dept) : dist ? T("gv.district_n", { d: nm(dist) }) : st ? nm(st) : nm(pl.country || me.country);
    var sub = S.dept && d.dept ? T("gv.dept_sub", { dep: window.GIQ && GIQ.dept ? GIQ.dept(d.dept.department) : d.dept.department }) :
      dist ? (dist.lgd ? T("gv.lgd", { c: dist.lgd }) : "") : st ? (st.lgd ? T("gv.lgd", { c: st.lgd }) : "") : T("gv.country_sub");
    var h = (S.notice ? '<p class="msg ok" role="status">' + esc(S.notice) + "</p>" : "") + crumbs() + '<h1 id="h1" tabindex="-1">' + esc(title) + "</h1>" + (sub ? '<p class="scope-sub">' + esc(sub) + "</p>" : "") +
      '<div class="controls"><div><label for="month">' + esc(T("gv.month")) + '</label><select id="month">' +
      d.months.map(function (m) { return '<option value="' + esc(m) + '"' + (m === d.month ? " selected" : "") + ">" + esc(monthName(m)) + "</option>"; }).join("") + "</select></div>" +
      (S.dept ? "" : '<div class="to-reports"><a href="#reports" id="to-reports">' + esc(T("gv.rp_jump")) + "</a></div>") + "</div>";
    if (S.dept) return h + (d.dept ? renderDept(d.dept) : '<p class="empty">' + esc(T("gv.e_load")) + "</p>") + about();
    h += '<p class="summary" id="summary">' + esc(summaryText()) + "</p>";
    h += '<h2 class="sr-only">' + esc(T("gv.key_figures")) + '</h2><ul class="tiles" aria-label="' + esc(T("gv.key_figures")) + '">' +
      tile(T("gv.t_received"), num(t.received), changeText(d.change.received)) +
      tile(T("gv.t_resolved"), num(t.resolved), changeText(d.change.resolved)) +
      tile(T("gv.t_pending"), num(t.pending), changeText(d.change.pending)) +
      tile(T("gv.t_over30"), num(t.over30), null) +
      pctTile(T("gv.t_within"), t.within, b.within) +
      (t.avgDays == null ? tile(T("gv.t_avg_days"), T("gv.not_enough"), null, true) : tile(T("gv.t_avg_days"), days(t.avgDays), b.avgDays == null ? null : T("gv.last_month_was", { v: days(b.avgDays) }))) +
      pctTile(T("gv.t_reopened"), t.reopened, b.reopened) +
      pctTile(T("gv.t_satisfied"), t.satisfied, b.satisfied) +
      pctTile(T("gv.t_moved_up"), t.movedUp, b.movedUp) +
      pctTile(T("gv.t_dept_on_time"), t.deptOnTime, b.deptOnTime) +
      pctTile(T("gv.t_located"), t.located, b.located) + "</ul>";
    h += '<div class="grid2"><section class="sec card" aria-labelledby="ages-h">' + agesHtml(t.ages) + "</section>" +
      '<section class="sec card" aria-labelledby="themes-h">' + themesHtml(d.themes) + "</section></div>";
    h += '<section class="sec" aria-labelledby="rows-h">' + rowsHtml(d.rows) + "</section>";
    h += '<section class="sec" aria-labelledby="depts-h">' + deptsHtml(d.depts) + "</section>";
    h += '<section class="sec card" aria-labelledby="trend-h">' + trendHtml(d.trend, "trend-h", "gv.trend_h", "gv.t_received", "gv.t_resolved") + "</section>";
    h += '<div class="grid2"><section class="sec card" aria-labelledby="hot-h">' + hotHtml(d.hotspots) + "</section>" +
      '<section class="sec card" aria-labelledby="reps-h">' + repsHtml(d.shared) + "</section></div>";
    h += reportsHtml();
    return h + about();
  }
  // grieviq-50: the six MIS reports (PDF and Excel) and the report emails.
  var REPORTS = ["summary", "districts", "departments", "pending30", "themes", "reps"];
  function reportUrl(r, x) {
    var p = new URLSearchParams(); p.set("r", r); p.set("dash", MODE); if (DEMO) p.set("demo", "1"); if (S.state) p.set("state", S.state); if (S.district) p.set("district", S.district); if (S.data && S.data.month) p.set("month", S.data.month); if (x) p.set("x", "xlsx");
    return "/gov-report?" + p.toString();
  }
  function reportsHtml() {
    var h = '<section class="sec card" id="reports" aria-labelledby="reports-h" tabindex="-1"><h2 id="reports-h">' + esc(T("gv.rp_h")) + '</h2><p class="lede">' + esc(T("gv.rp_p", { m: monthName(S.data.month) })) + "</p>" +
      '<ul class="reports">' + REPORTS.map(function (r) {
        var lvl = level(), title = T(r === "districts" ? (lvl === "district" ? "gv.rp_areas" : lvl === "country" ? "gv.rp_states" : "gv.rp_districts") : "gv.rp_" + r);
        return '<li><div><b>' + esc(title) + '</b><span class="lt">' + esc(T("gv.rp_" + r + "_d")) + '</span></div><div class="rp-links">' +
          '<a href="' + esc(reportUrl(r)) + '" aria-label="' + esc(T("gv.rp_open_for", { r: title })) + '">' + esc(T("gv.rp_open")) + "</a>" +
          '<a href="' + esc(reportUrl(r, true)) + '" aria-label="' + esc(T("gv.rp_excel_for", { r: title })) + '">' + esc(T("gv.rp_excel")) + "</a></div></li>";
      }).join("") + "</ul>";
    if (!DEMO && S.prefs && S.prefs.ready) {
      h += '<fieldset class="rp-mail"><legend>' + esc(T("gv.rp_mail_h")) + '</legend><p class="hint">' + esc(T("gv.rp_mail_p")) + "</p>" +
        '<label class="chk"><input type="checkbox" id="mail-monthly"' + (S.prefs.monthly ? " checked" : "") + "> " + esc(T("gv.rp_mail_monthly")) + "</label>" +
        '<label class="chk"><input type="checkbox" id="mail-weekly"' + (S.prefs.weekly ? " checked" : "") + "> " + esc(T("gv.rp_mail_weekly")) + "</label>" +
        '<p class="hint" id="mail-msg" role="status" aria-live="polite">' + esc(S.prefsMsg || "") + "</p></fieldset>";
    }
    return h + "</section>";
  }
  async function savePrefs() {
    var m = document.getElementById("mail-monthly"), w = document.getElementById("mail-weekly");
    var r = await api("/api/gov/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthly: m.checked, weekly: w.checked }) });
    if (r.ok) { S.prefs.monthly = r.body.monthly; S.prefs.weekly = r.body.weekly; S.prefsMsg = T("gv.rp_mail_saved"); }
    else S.prefsMsg = T("gv.e_load");
    document.getElementById("mail-msg").textContent = S.prefsMsg;
  }
  function summaryText() {
    var d = S.data, t = d.tiles, mo = monthName(d.month);
    var s = T("gv.sum_1", { m: mo, r: num(t.received), f: num(t.resolved) }) + " " + T("gv.sum_2", { p: num(t.pending), o: num(t.over30) });
    if (d.change.pending != null && d.change.pending !== 0) s += " " + T(d.change.pending > 0 ? "gv.sum_pend_up" : "gv.sum_pend_down", { p: Math.abs(d.change.pending).toLocaleString(loc(), { maximumFractionDigits: 1 }) });
    if (d.themes.length && d.themes[0].received !== "<10") s += " " + T("gv.sum_theme", { t: themeName(d.themes[0].theme) });
    return s;
  }
  function agesHtml(ages) {
    var labels = [T("gv.age_1"), T("gv.age_2"), T("gv.age_3"), T("gv.age_4")];
    var head = '<h2 id="ages-h">' + esc(T("gv.ages_h")) + "</h2>";
    if (ages.some(function (a) { return a === "<10"; }) || !window.GIQC) {
      return head + '<ul class="plain">' + ages.map(function (a, i) { return "<li><span>" + esc(labels[i]) + "</span><b>" + esc(num(a)) + "</b></li>"; }).join("") + "</ul>";
    }
    return GIQC.stack({ title: "", summary: T("gv.ages_sum", { n: num(ages[3]) }), parts: ages.map(function (a, i) { return { label: labels[i], value: a }; }), empty: T("gv.none_pending"),
      nameCol: T("gv.ages_col"), valueCol: T("gv.t_pending"), tableLabel: T("gv.as_table"), loc: loc() }).replace('<h3 class="gc-h"></h3>', head);
  }
  function themesHtml(list) {
    var head = '<h2 id="themes-h">' + esc(T("gv.themes_h")) + '</h2><p class="hint">' + esc(T("gv.themes_p")) + "</p>";
    if (!list.length) return head + '<p class="empty">' + esc(T("gv.none_received")) + "</p>";
    var big = list.filter(function (x) { return x.received !== "<10"; }), small = list.filter(function (x) { return x.received === "<10"; });
    var out = head;
    if (big.length && window.GIQC) out += GIQC.bars({ title: "", rows: big.map(function (x) { return { name: themeName(x.theme), value: x.received }; }), top: 8, nameCol: T("gv.theme_col"), valueCol: T("gv.t_received"), tableLabel: T("gv.as_table"), loc: loc(), empty: "" }).replace('<h3 class="gc-h"></h3>', "");
    if (small.length) out += '<p class="hint">' + esc(T("gv.themes_small", { list: small.map(function (x) { return themeName(x.theme); }).join(", ") })) + "</p>";
    return out;
  }
  // Sortable table. cols: [{ key, label, type: "num"|"pct" }]
  function sortedRows(rows, cols) {
    var k = S.sort.key; if (!k) return rows;
    var dir = S.sort.dir;
    return rows.slice().sort(function (a, b) {
      if (k === "name") return dir * String(nm(a) || "").localeCompare(String(nm(b) || ""));
      return dir * (sortVal(a[k]) - sortVal(b[k]));
    });
  }
  function th(key, label) {
    var s = S.sort.key === key ? (S.sort.dir > 0 ? "ascending" : "descending") : null;
    return '<th scope="col"' + (s ? ' aria-sort="' + s + '"' : "") + '><button type="button" data-sort="' + key + '">' + esc(label) + "</button></th>";
  }
  function cell(v, type) {
    if (type === "pct") return v == null ? '<td><span class="lt">' + esc(T("gv.too_few")) + "</span></td>" : "<td>" + esc(pct(v)) + "</td>";
    if (type === "days") return v == null ? '<td><span class="lt">' + esc(T("gv.too_few")) + "</span></td>" : "<td>" + esc(Number(v).toLocaleString(loc(), { maximumFractionDigits: 1 })) + "</td>";
    return v === "<10" ? '<td><span class="lt">' + esc(T("gv.lt10")) + "</span></td>" : "<td>" + esc(num(v)) + "</td>";
  }
  function rowsHtml(rows) {
    var lvl = level(), isState = lvl === "state", isCountry = lvl === "country";
    var K = function (k) { return isCountry ? { h: "gv.states_h", p: "gv.states_p", none: "gv.no_states", find: "gv.find_state", col: "gv.col_state" }[k] : isState ? { h: "gv.districts_h", p: "gv.districts_p", none: "gv.no_districts", find: "gv.find_district", col: "gv.col_district" }[k] : { h: "gv.areas_h", p: "gv.areas_p", none: "gv.no_areas", find: "gv.find_area", col: "gv.col_area" }[k]; };
    var hk = K("h");
    var q = S.q.trim().toLowerCase();
    var list = sortedRows(rows.filter(function (r) { return !q || (r.unplaced ? T("gv.unplaced") : nm(r) + " " + (r.lgd || "")).toLowerCase().indexOf(q) >= 0; }));
    var h = '<h2 id="rows-h">' + esc(T(hk, { n: rows.length })) + '</h2><p class="lede">' + esc(T(K("p"))) + "</p>";
    if (!rows.length) return h + '<p class="empty">' + esc(T(K("none"))) + "</p>";
    h += '<div class="tbl-tools"><div><label for="rows-q">' + esc(T(K("find"))) + '</label><input type="search" id="rows-q" autocomplete="off" value="' + esc(S.q) + '"></div></div>';
    h += '<div class="tbl-wrap"><table class="data"><caption>' + esc(T("gv.table_cap", { m: monthName(S.data.month) })) + "</caption><thead><tr>" +
      th("name", T(K("col"))) + th("received", T("gv.t_received")) + th("resolved", T("gv.t_resolved")) + th("pending", T("gv.t_pending")) +
      th("over30", T("gv.col_over30")) + th("within", T("gv.col_within")) + th("satisfied", T("gv.col_satisfied")) + "</tr></thead><tbody>" +
      list.map(function (r) {
        var name = r.unplaced ? esc(T("gv.unplaced")) + '<span class="sub">' + esc(T("gv.unplaced_sub")) + "</span>" :
          isCountry ? '<a href="#" data-state="' + esc(r.id) + '">' + esc(nm(r)) + "</a>" + (r.lgd ? '<span class="sub">' + esc(T("gv.lgd", { c: r.lgd })) + "</span>" : "") :
          isState ? '<a href="#" data-district="' + esc(r.id) + '">' + esc(nm(r)) + "</a>" + (r.lgd ? '<span class="sub">' + esc(T("gv.lgd", { c: r.lgd })) + "</span>" : "") :
          esc(r.nameEn) + '<span class="sub">' + esc(T(r.kind === "DISTRICT" ? "gv.kind_district" : "gv.kind_city")) + (r.lgd ? " · " + esc(T("gv.lgd", { c: r.lgd })) : "") + "</span>";
        return '<tr><th scope="row">' + name + "</th>" + cell(r.received) + cell(r.resolved) + cell(r.pending) + cell(r.over30) + cell(r.within, "pct") + cell(r.satisfied, "pct") + "</tr>";
      }).join("") + "</tbody></table></div>" + (q && !list.length ? '<p class="empty" role="status">' + esc(T("gv.no_match")) + "</p>" : "");
    return h;
  }
  function deptsHtml(list) {
    var h = '<h2 id="depts-h">' + esc(T("gv.depts_h")) + '</h2><p class="lede">' + esc(T("gv.depts_p")) + "</p>";
    if (!list.length) return h + '<p class="empty">' + esc(T("gv.no_depts")) + "</p>";
    return h + '<div class="tbl-wrap"><table class="data"><caption>' + esc(T("gv.depts_cap", { m: monthName(S.data.month) })) + '</caption><thead><tr><th scope="col">' + esc(T("gv.col_office")) + '</th><th scope="col">' + esc(T("gv.col_forwarded")) +
      '</th><th scope="col">' + esc(T("gv.col_with_now")) + '</th><th scope="col">' + esc(T("gv.col_late_now")) + '</th><th scope="col">' + esc(T("gv.col_on_time")) + '</th><th scope="col">' + esc(T("gv.col_first_reply")) + '</th><th scope="col">' + esc(T("gv.col_satisfied")) + "</th></tr></thead><tbody>" +
      list.map(function (r, i) {
        return '<tr><th scope="row">' + esc(i + 1) + '. <a href="#" data-dept="' + esc(r.key) + '">' + esc(nm(r)) + '</a><span class="sub">' + esc(window.GIQ && GIQ.dept ? GIQ.dept(r.department) : r.department) + "</span></th>" +
          cell(r.forwarded) + cell(r.withNow) + cell(r.overdueNow) + cell(r.onTime, "pct") + cell(r.firstReplyDays, "days") + cell(r.rating, "pct") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }
  function trendHtml(data, id, titleKey, aKey, bKey, sumKey) {
    var head = '<h2 id="' + id + '">' + esc(T(titleKey)) + "</h2>";
    var small = data.some(function (m) { return m.received === "<10" || m.resolved === "<10"; });
    if (!small && window.GIQC) {
      var last = data[data.length - 1];
      return head + GIQC.trend({ id: id + "-c", title: "", summary: T(sumKey || "gv.trend_sum", { m: monthName(last.month), a: num(last.received), b: num(last.resolved) }), data: data,
        received: T(aKey), resolved: T(bKey), monthCol: T("gv.month"), tableLabel: T("gv.as_table"), keysHint: T("gv.keys_hint"), loc: loc() }).replace('<h3 class="gc-h"></h3>', "");
    }
    return head + '<p class="hint">' + esc(T("gv.trend_small")) + '</p><div class="tbl-wrap"><table class="data"><thead><tr><th scope="col">' + esc(T("gv.month")) + '</th><th scope="col">' + esc(T(aKey)) + '</th><th scope="col">' + esc(T(bKey)) + "</th></tr></thead><tbody>" +
      data.map(function (m) { return '<tr><th scope="row">' + esc(monthName(m.month)) + "</th>" + cell(m.received) + cell(m.resolved) + "</tr>"; }).join("") + "</tbody></table></div>";
  }
  function hotHtml(list) {
    var h = '<h2 id="hot-h">' + esc(T("gv.hot_h")) + '</h2><p class="hint">' + esc(T("gv.hot_p")) + "</p>";
    if (!list.length) return h + '<p class="empty">' + esc(T("gv.hot_none")) + "</p>";
    return h + '<ol class="plain">' + list.map(function (x) { return "<li><span>" + esc(x.name) + (x.area ? ' <span class="lt">· ' + esc(x.area) + "</span>" : "") + "</span><b>" + esc(T("gv.n_pending", { n: num(x.pending) })) + "</b></li>"; }).join("") + "</ol>";
  }
  function repsHtml(list) {
    var h = '<h2 id="reps-h">' + esc(T("gv.reps_h")) + '</h2><p class="hint">' + esc(T("gv.reps_p")) + "</p>";
    if (!list.length) return h + '<p class="empty">' + esc(T("gv.reps_none")) + "</p>";
    return h + '<ul class="plain">' + list.map(function (o) {
      return "<li><span><b>" + esc(o.name) + '</b><span class="shared-tag">' + esc(T("gv.shared_tag")) + '</span><br><span class="lt">' +
        esc(T("gv.reps_line", { r: num(o.received), f: num(o.resolved), p: num(o.pending) })) + (o.within != null ? " · " + esc(T("gv.reps_within", { v: pct(o.within) })) : "") + "</span></span></li>";
    }).join("") + "</ul>";
  }
  function renderDept(x) {
    var h = '<p class="summary">' + esc(T("gv.dept_sum", { m: monthName(S.data.month), f: num(x.forwarded), w: num(x.withNow), l: num(x.overdueNow) })) + "</p>";
    h += '<ul class="tiles" aria-label="' + esc(T("gv.key_figures")) + '">' +
      tile(T("gv.col_forwarded"), num(x.forwarded)) + tile(T("gv.col_with_now"), num(x.withNow)) + tile(T("gv.col_late_now"), num(x.overdueNow)) +
      pctTile(T("gv.col_on_time"), x.onTime, x.prevOnTime) +
      (x.firstReplyDays == null ? tile(T("gv.t_first_reply"), T("gv.not_enough"), null, true) : tile(T("gv.t_first_reply"), days(x.firstReplyDays))) +
      pctTile(T("gv.t_fixed_first"), x.fixedFirst) + pctTile(T("gv.t_reopened"), x.reopened) + pctTile(T("gv.col_satisfied"), x.rating) +
      tile(T("gv.t_not_ours"), num(x.notOurs)) + "</ul>";
    h += '<section class="sec card" aria-labelledby="dtrend-h">' + trendHtml(x.trend, "dtrend-h", "gv.dtrend_h", "gv.t_forwarded", "gv.t_done", "gv.dtrend_sum") + "</section>";
    return h;
  }
  function about() {
    var items = ["received", "resolved", "pending", "ages", "within", "avg", "reopened", "satisfied", "moved", "dept", "located", "small", "reps", "lgd"];
    return '<details class="about" id="about"><summary>' + esc(T("gv.about_h")) + "</summary><dl>" +
      items.map(function (k) { return "<dt>" + esc(T("gv.ab_" + k + "_t")) + "</dt><dd>" + esc(T("gv.ab_" + k)) + "</dd>"; }).join("") + "</dl></details>";
  }

  function wire() {
    var f = document.getElementById("f-email"); if (f) f.addEventListener("submit", sendCode);
    var fc = document.getElementById("f-code"); if (fc) fc.addEventListener("submit", verify);
    var ag = document.getElementById("again"); if (ag) ag.addEventListener("click", function () { sendCode(); });
    var oe = document.getElementById("other-email"); if (oe) oe.addEventListener("click", function () { S.screen = "email"; S.msg = null; show("email"); });
    var rt = document.getElementById("retry"); if (rt) rt.addEventListener("click", function () { start("h1"); });
    var m = document.getElementById("month"); if (m) m.addEventListener("change", function () { S.month = m.value; loadStats("month"); });
    var pl = (S.data && S.data.place) || {};
    var stId = pl.state ? pl.state.id : "", dId = pl.district ? pl.district.id : "";
    main.querySelectorAll("[data-go]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); var g = a.getAttribute("data-go"); go(g === "country" ? "" : stId, g === "district" ? dId : "", ""); }); });
    main.querySelectorAll("[data-state]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); go(a.getAttribute("data-state"), "", ""); }); });
    main.querySelectorAll("[data-district]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); go(stId, a.getAttribute("data-district"), ""); }); });
    main.querySelectorAll("[data-dept]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); go(stId, dId, a.getAttribute("data-dept")); }); });
    main.querySelectorAll("[data-sort]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-sort");
        S.sort = S.sort.key === k ? { key: k, dir: -S.sort.dir } : { key: k, dir: k === "name" ? 1 : -1 };
        var y = window.scrollY; show(); window.scrollTo(0, y);
        var nb = main.querySelector('[data-sort="' + k + '"]'); if (nb) nb.focus();
      });
    });
    ["mail-monthly", "mail-weekly"].forEach(function (id) { var c = document.getElementById(id); if (c) c.addEventListener("change", savePrefs); });
    var tr = document.getElementById("to-reports"); if (tr) tr.addEventListener("click", function (e) { e.preventDefault(); var r = document.getElementById("reports"); r.scrollIntoView(); r.focus({ preventScroll: true }); });
    var rq = document.getElementById("rows-q");
    if (rq) rq.addEventListener("input", function () {
      S.q = rq.value; var pos = rq.selectionStart, y = window.scrollY; show(); window.scrollTo(0, y);
      var n = document.getElementById("rows-q"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {}
    });
  }
  document.addEventListener("giq:lang", function () { show(); });
  start();
})();
