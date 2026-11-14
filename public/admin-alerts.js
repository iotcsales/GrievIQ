/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// public/admin-alerts.js   (grieviq-89) -- My alerts.
// What is open now, phone alerts on this device, which kinds of alert this
// person gets, how alerts work, and for the super admin GrievIQ's working
// hours and the last 30 days. The red bar itself is in admin-nav.js.
(function () {
  "use strict";
  var app = document.getElementById("al-app"), msg = document.getElementById("al-msg");
  var data = null, pushState = "unknown", SCOPE = "/admin", API = "/api/admin/alerts";
  function T(k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; }
  function hi() { return window.GIQ && window.GIQ.lang === "hi"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function when(s) { if (!s) return ""; var d = new Date(s); return isNaN(d) ? s : d.toLocaleString(hi() ? "hi-IN" : "en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); }
  function say(text, kind) { msg.className = "hl-msg st-msg " + (kind || ""); msg.textContent = text || ""; if (text) msg.focus(); }
  function post(body) {
    return fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); });
  }
  var DAYS = [1, 2, 3, 4, 5, 6, 0];

  function load() {
    return fetch(API, { cache: "no-store" }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (x) {
      if (!x.ok) { app.innerHTML = '<p class="st-warn" role="alert">' + esc(x.j.error || T("al.e_load")) + "</p>"; return; }
      data = x.j;
      return checkPush().then(render);
    }).catch(function () { app.innerHTML = '<p class="st-warn" role="alert">' + esc(T("al.e_load")) + "</p>"; });
  }

  // ---- phone alerts on this device ----
  function supported() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
  function isIos() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function standalone() { return navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches); }
  function b64ToBytes(s) { var t = String(s || "").replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "="; var bin = atob(t); var u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function device() { var u = navigator.userAgent; return (/Android/.test(u) ? "Android" : isIos() ? "iPhone/iPad" : /Windows/.test(u) ? "Windows" : /Mac/.test(u) ? "Mac" : "Computer") + " · " + (/Edg\//.test(u) ? "Edge" : /Chrome\//.test(u) ? "Chrome" : /Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "Browser"); }
  function currentSub() {
    if (!supported()) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration(SCOPE).then(function (reg) { return reg ? reg.pushManager.getSubscription() : null; }).catch(function () { return null; });
  }
  function checkPush() { return currentSub().then(function (sub) { pushState = sub && Notification.permission === "granted" ? "on" : "off"; }); }
  function waitActive(reg) {
    return new Promise(function (resolve, reject) {
      if (reg.active) return resolve(reg);
      var w = reg.installing || reg.waiting; if (!w) return reject(new Error("SW"));
      var timer = setTimeout(function () { reg.active ? resolve(reg) : reject(new Error("SW_TIMEOUT")); }, 15000);
      w.addEventListener("statechange", function () { if (w.state === "activated") { clearTimeout(timer); resolve(reg); } });
    });
  }
  function turnOn() {
    say("");
    var reg0;
    return navigator.serviceWorker.register("/sw.js", { scope: SCOPE }).then(function (reg) { reg0 = reg; return Notification.requestPermission(); })
      .then(function (perm) { if (perm !== "granted") throw new Error("DENIED"); return waitActive(reg0); })
      .then(function (reg) { return reg.pushManager.getSubscription().then(function (sub) { return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.push.key) }); }); })
      .then(function (sub) { return post({ action: "subscribe", subscription: sub.toJSON(), lang: hi() ? "hi" : "en", device: device() }); })
      .then(function (x) { if (!x.ok) throw new Error(x.j.error || "SAVE"); pushState = "on"; return load().then(function () { say(T("al.push_on_done"), "success"); }); })
      .catch(function (e) { say(e && e.message === "DENIED" ? T("al.push_denied") : T("al.push_failed"), "error"); });
  }
  function turnOff() {
    return currentSub().then(function (sub) {
      if (!sub) return null;
      return post({ action: "unsubscribe", endpoint: sub.endpoint }).then(function () { return sub.unsubscribe().catch(function () {}); });
    }).then(function () { pushState = "off"; return load().then(function () { say(T("al.push_off_done"), "success"); }); });
  }
  function test() {
    return post({ action: "test" }).then(function (x) { say(x.ok ? T("al.test_sent") : T("al.test_none"), x.ok ? "success" : "error"); });
  }

  // ---- drawing ----
  function waitText(m) { return m >= 60 ? T("al.waiting_h", { h: Math.floor(m / 60), m: m % 60 }) : T("al.waiting", { n: m }); }
  function openPanel() {
    var items = data.items || [];
    var rows = items.map(function (a) {
      var status = a.takenBy ? (a.mine ? T("al.you_took", { time: when(a.takenAt) }) : T("al.taken_by", { name: a.takenBy })) :
        a.waitsForHours ? T("al.out_of_hours", { time: when(a.releaseAt) }) : waitText(a.waitingMin);
      return "<tr><td>" + esc(T("al.k_" + a.kind)) + "</td><td>" + esc(a.where || "") + "</td><td>" + esc(when(a.arrivedAt)) + "</td><td>" + esc(status) + (a.superToo ? " · " + esc(T("al.super_too")) : "") +
        '</td><td><a href="' + esc(a.page) + '">' + esc(T("al.open")) + "</a></td></tr>";
    }).join("");
    return '<section class="panel" aria-labelledby="al-open-h"><h2 id="al-open-h">' + esc(T("al.open_h")) + "</h2>" +
      (items.length ? '<div class="table-wrap"><table><caption class="sr-only">' + esc(T("al.open_h")) + '</caption><thead><tr><th scope="col">' + esc(T("al.c_what")) + '</th><th scope="col">' + esc(T("al.c_where")) + '</th><th scope="col">' + esc(T("al.c_arrived")) + '</th><th scope="col">' + esc(T("al.c_status")) + '</th><th scope="col"><span class="sr-only">' + esc(T("al.open")) + "</span></th></tr></thead><tbody>" + rows + "</tbody></table></div>"
        : '<p class="muted">' + esc(T("al.open_none")) + "</p>") + "</section>";
  }
  function pushPanel() {
    var p = data.push || {};
    var body;
    if (!p.configured) body = "<p>" + esc(T("al.push_not_setup")) + "</p>";
    else if (!supported()) body = "<p>" + esc(isIos() && !standalone() ? T("al.push_ios") : T("al.push_unsupported")) + "</p>";
    else if (window.Notification && Notification.permission === "denied") body = "<p>" + esc(T("al.push_blocked")) + "</p>";
    else body = '<p id="al-push-state"><strong>' + esc(T(pushState === "on" ? "al.push_state_on" : "al.push_state_off")) + "</strong></p>" +
      '<p class="muted">' + esc(T("al.push_devices", { n: p.devices || 0 })) + "</p>" +
      '<p class="al-actions">' + (pushState === "on" ? '<button type="button" id="al-off">' + esc(T("al.push_turn_off")) + '</button> <button type="button" id="al-test">' + esc(T("al.test")) + "</button>"
        : '<button type="button" class="primary" id="al-on">' + esc(T("al.push_turn_on")) + "</button>") + "</p>";
    return '<section class="panel" aria-labelledby="al-push-h"><h2 id="al-push-h">' + esc(T("al.push_h")) + '</h2><p class="muted">' + esc(T("al.push_help")) + "</p>" + body +
      (p.configured && !p.devices ? '<p class="muted">' + esc(T("al.push_email_note")) + "</p>" : "") + "</section>";
  }
  function kindsPanel() {
    return '<section class="panel" aria-labelledby="al-kinds-h"><h2 id="al-kinds-h">' + esc(T("al.kinds_h")) + '</h2><p class="muted">' + esc(T("al.kinds_help")) + "</p><ul class=\"al-kinds\">" +
      data.kinds.map(function (k) {
        var id = "al-k-" + k.kind;
        return '<li><input type="checkbox" id="' + id + '" data-kind="' + esc(k.kind) + '"' + (k.on ? " checked" : "") + (k.locked ? " disabled aria-describedby=\"al-locked\"" : "") + '> <label for="' + id + '">' + esc(T("al.k_" + k.kind)) + "</label></li>";
      }).join("") + "</ul>" +
      (data.kinds.some(function (k) { return k.locked; }) ? '<p class="muted" id="al-locked">' + esc(T("al.locked")) + "</p>" : "") + "</section>";
  }
  function hoursText(h) {
    var all = h.days.length === 7, wk = h.days.length === 6 && h.days.indexOf(0) === -1;
    var days = all ? T("al.days_all") : wk ? T("al.days_monsat") : DAYS.filter(function (d) { return h.days.indexOf(d) !== -1; }).map(function (d) { return T("al.day_" + d); }).join(", ");
    return T("al.hours_text", { days: days, from: h.from, to: h.to });
  }
  function howPanel() {
    return '<section class="panel" aria-labelledby="al-how-h"><h2 id="al-how-h">' + esc(T("al.how_h")) + "</h2><ol class=\"al-how\">" +
      ["al.how_1", "al.how_2", "al.how_3", "al.how_4", "al.how_5"].map(function (k) { return "<li>" + esc(T(k)) + "</li>"; }).join("") + "</ol>" +
      "<p><strong>" + esc(T("al.hours_now")) + "</strong> " + esc(hoursText(data.hours)) + "</p>" +
      '<p class="muted">' + esc(T("al.hours_danger")) + "</p></section>";
  }
  function hoursPanel() {
    if (!data.canHours) return "";
    var h = data.hours;
    return '<section class="panel" aria-labelledby="al-hours-h"><h2 id="al-hours-h">' + esc(T("al.hours_h")) + '</h2><p class="muted">' + esc(T("al.hours_help")) + "</p>" +
      '<form id="al-hours"><fieldset><legend>' + esc(T("al.days")) + '</legend><div class="al-days">' +
      DAYS.map(function (d) { var id = "al-d-" + d; return '<span><input type="checkbox" id="' + id + '" value="' + d + '"' + (h.days.indexOf(d) !== -1 ? " checked" : "") + '> <label for="' + id + '">' + esc(T("al.day_" + d)) + "</label></span>"; }).join("") +
      '</div></fieldset><p class="al-times"><label for="al-from">' + esc(T("al.from")) + '</label> <input type="time" id="al-from" value="' + esc(h.from) + '" required> <label for="al-to">' + esc(T("al.to")) + '</label> <input type="time" id="al-to" value="' + esc(h.to) + '" required></p>' +
      '<p id="al-hours-err" class="st-warn" hidden></p><button type="submit" class="primary">' + esc(T("al.hours_save")) + "</button></form></section>";
  }
  function logPanel() {
    if (!data.log) return "";
    var L = data.log;
    return '<section class="panel" aria-labelledby="al-log-h"><h2 id="al-log-h">' + esc(T("al.log_h")) + '</h2><p class="muted">' + esc(T("al.log_help")) + "</p>" +
      '<div class="table-wrap"><table><caption class="sr-only">' + esc(T("al.log_h")) + '</caption><thead><tr><th scope="col">' + esc(T("al.c_what")) + '</th><th scope="col">' + esc(T("al.c_count")) + '</th><th scope="col">' + esc(T("al.c_typical")) + '</th><th scope="col">' + esc(T("al.c_missed")) + "</th></tr></thead><tbody>" +
      L.summary.map(function (r) { return "<tr><td>" + esc(T("al.k_" + r.kind)) + "</td><td>" + r.count + "</td><td>" + (r.typicalMin == null ? "—" : esc(T("al.n_min", { n: r.typicalMin }))) + "</td><td>" + r.missedHour + "</td></tr>"; }).join("") +
      "</tbody></table></div>" +
      (L.recent.length ? '<h3 class="al-h3">' + esc(T("al.recent_h")) + '</h3><div class="table-wrap"><table><caption class="sr-only">' + esc(T("al.recent_h")) + '</caption><thead><tr><th scope="col">' + esc(T("al.c_what")) + '</th><th scope="col">' + esc(T("al.c_arrived")) + '</th><th scope="col">' + esc(T("al.c_taken")) + '</th><th scope="col">' + esc(T("al.c_take_time")) + "</th></tr></thead><tbody>" +
        L.recent.map(function (r) { return "<tr><td>" + esc(T("al.k_" + r.kind)) + "</td><td>" + esc(when(r.arrivedAt)) + "</td><td>" + esc(r.takenBy || T(r.done ? "al.done_untaken" : "al.nobody")) + "</td><td>" + (r.takeMin == null ? "—" : esc(T("al.n_min", { n: r.takeMin }))) + (r.superToo ? " · " + esc(T("al.super_too")) : "") + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : "") + "</section>";
  }

  function render() {
    if (!data) return;
    if (data.ready === false) { app.innerHTML = '<p class="st-warn" role="alert">' + esc(T("al.not_ready")) + "</p>"; return; }
    app.innerHTML = openPanel() + pushPanel() + kindsPanel() + howPanel() + hoursPanel() + logPanel();
    var on = document.getElementById("al-on"), off = document.getElementById("al-off"), tst = document.getElementById("al-test");
    if (on) on.addEventListener("click", function () { on.disabled = true; turnOn().then(function () { var b = document.getElementById("al-off") || document.getElementById("al-on"); if (b) b.focus(); }); });
    if (off) off.addEventListener("click", function () { off.disabled = true; turnOff().then(function () { var b = document.getElementById("al-on"); if (b) b.focus(); }); });
    if (tst) tst.addEventListener("click", function () { test(); });
    app.querySelectorAll(".al-kinds input[data-kind]").forEach(function (box) {
      box.addEventListener("change", function () {
        var k = box.getAttribute("data-kind"), want = box.checked;
        post({ action: "pref", kind: k, on: want }).then(function (x) {
          if (!x.ok) { box.checked = !want; say(x.j.error || T("al.e_save"), "error"); return; }
          say(T(want ? "al.kind_on" : "al.kind_off", { what: T("al.k_" + k) }), "success");
          data.kinds.forEach(function (r) { if (r.kind === k) r.on = want; });
          box.focus();
        });
      });
    });
    var form = document.getElementById("al-hours");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var days = Array.prototype.filter.call(form.querySelectorAll(".al-days input"), function (b) { return b.checked; }).map(function (b) { return Number(b.value); });
      var from = document.getElementById("al-from").value, to = document.getElementById("al-to").value;
      var err = document.getElementById("al-hours-err");
      var problem = !days.length ? T("al.e_days") : !from || !to ? T("al.e_time") : from >= to ? T("al.e_order") : "";
      if (problem) { err.hidden = false; err.textContent = problem; err.setAttribute("role", "alert"); return; }
      post({ action: "hours", days: days, from: from, to: to }).then(function (x) {
        if (!x.ok) { err.hidden = false; err.textContent = x.j.fields && x.j.fields.to === "AFTER" ? T("al.e_order") : (x.j.error || T("al.e_save")); err.setAttribute("role", "alert"); return; }
        load().then(function () { say(T("al.hours_saved", { text: hoursText(x.j.hours) }), "success"); });
      });
    });
  }
  // The red bar on this page changes when something is taken or done.
  setInterval(function () { if (!document.hidden && data) fetch(API + "?bar=1", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.items) return;
    var before = JSON.stringify(data.items.map(function (a) { return [a.id, a.takenBy]; })), after = JSON.stringify(d.items.map(function (a) { return [a.id, a.takenBy]; }));
    data.items = d.items;
    if (before !== after && !(document.activeElement && app.contains(document.activeElement) && document.activeElement.tagName === "INPUT")) render();
  }).catch(function () {}); }, 30000);
  document.addEventListener("giq:lang", render);
  load();
})();
