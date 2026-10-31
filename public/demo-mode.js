/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// public/demo-mode.js (grieviq-81): the public demos of the representative's console
// (grieviq.in/rep?demo=1) and the department dashboard (grieviq.in/dept?demo=1).
//
// Does nothing unless the address has demo=1. Then, before the page's own scripts run, it:
//   - answers every request the page makes to /api/ from a recording of invented data
//     (public/demo/*.json, made by dev-tests/demo-build.mjs on a separate test database).
//     Dates are moved forward by the time since recording, so "filed 2 hours ago" stays true.
//   - never lets anything reach GrievIQ's servers: every save is answered "this is the demo,
//     so nothing was saved", downloads and payments are stopped, no alerts are set up, and
//     no visit is counted. No sign-in is needed and no real complaint or person is ever shown.
//   - shows a bar on every screen saying it is the demo, with "Show me as" (Ward Councillor,
//     Gram Pradhan, Mayor, MLA, MP) on the console, in English or Hindi.
// Accessibility: the bar is a labelled region; messages are spoken (role="status"); colours
// meet WCAG 2.2 AA (dark text on a pale yellow bar in light and dark themes); 44 px controls.
(function () {
  "use strict";
  var qs;
  try { qs = new URLSearchParams(location.search); } catch (e) { return; }
  if (qs.get("demo") !== "1") return;

  var PAGE = location.pathname.indexOf("/dept") === 0 ? "dept" : "rep";
  var ROLES = ["councillor", "pradhan", "mayor", "mla", "mp"];
  var AS = PAGE === "dept" ? "dept" : (ROLES.indexOf(qs.get("as")) >= 0 ? qs.get("as") : "councillor");
  var FILE = PAGE === "dept" ? "dept" : "rep-" + AS;
  window.GIQ_DEMO = { page: PAGE, as: AS };
  document.documentElement.classList.add("giq-demo");
  var robots = document.createElement("meta"); robots.name = "robots"; robots.content = "noindex, nofollow"; document.head.appendChild(robots);

  var W = {
    tag: ["Demo", "डेमो"],
    bar: ["Invented places, people and complaints. Nothing you do is sent or saved.", "काल्पनिक स्थान, लोग और शिकायतें। आप जो भी करें, वह भेजा या सहेजा नहीं जाता।"],
    as: ["Show me as", "मुझे इस रूप में दिखाएँ"],
    roles: { councillor: ["Ward Councillor", "वार्ड पार्षद"], pradhan: ["Gram Pradhan", "ग्राम प्रधान"], mayor: ["Mayor", "महापौर"], mla: ["MLA", "विधायक"], mp: ["MP", "सांसद"] },
    other: { rep: ["Department dashboard demo", "विभाग डैशबोर्ड डेमो"], dept: ["Representative's console demo", "जनप्रतिनिधि कंसोल डेमो"] },
    leave: ["Leave the demo", "डेमो से बाहर"],
    saved: ["This is the demo, so nothing was saved. On the real console this would go through.", "यह डेमो है, इसलिए कुछ भी सहेजा नहीं गया। असली कंसोल पर यह हो जाता।"],
    savedDept: ["This is the demo, so nothing was sent. On the real dashboard this would go through.", "यह डेमो है, इसलिए कुछ भी भेजा नहीं गया। असली डैशबोर्ड पर यह हो जाता।"],
    blocked: ["Not in the demo: downloads, payments and phone alerts work on the real console.", "डेमो में नहीं: डाउनलोड, भुगतान और फ़ोन सूचनाएँ असली कंसोल पर काम करती हैं।"],
    missing: ["This part isn't in the demo.", "यह हिस्सा डेमो में नहीं है।"],
  };
  function lang() {
    try { if (window.GIQ && window.GIQ.lang) return window.GIQ.lang === "hi" ? 1 : 0; } catch (e) { /* ignore */ }
    try { return localStorage.getItem("griq-lang") === "hi" ? 1 : 0; } catch (e) { return 0; }
  }
  function w(pair) { return pair[lang()]; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // ---- the recording, with every date moved forward ----
  var realFetch = window.fetch.bind(window);
  var DAY = 86400000;
  var ready = realFetch("/demo/" + FILE + ".json?v=82", { credentials: "omit", cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (rec) {
    var delta = Date.now() - rec.recordedAt, days = Math.round(delta / DAY);
    var text = JSON.stringify(rec.responses)
      .replace(/"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)"/g, function (m, t) { return '"' + new Date(Date.parse(t) + delta).toISOString() + '"'; })
      .replace(/"(\d{4}-\d\d-\d\d)"/g, function (m, d) { return '"' + new Date(Date.parse(d + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10) + '"'; });
    return JSON.parse(text);
  }).catch(function () { return {}; });

  var VOLATILE = { from: 1, to: 1, _: 1, t: 1, ts: 1, e: 1, s: 1, v: 1 };
  function keyOf(url) {
    var q = [];
    url.searchParams.forEach(function (v, k) { if (!VOLATILE[k]) q.push([k, v]); });
    q.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    return url.pathname + (q.length ? "?" + q.map(function (p) { return p[0] + "=" + p[1]; }).join("&") : "");
  }
  function lookup(map, url) {
    var k = keyOf(url);
    if (map[k]) return map[k];
    // the same address with other settings: the closest recorded one
    var best = null, score = -1;
    Object.keys(map).forEach(function (key) {
      if (key.split("?")[0] !== url.pathname) return;
      var s = 0; url.searchParams.forEach(function (v, n) { if (key.indexOf(n + "=" + v) >= 0) s++; });
      if (s > score) { score = s; best = map[key]; }
    });
    return best;
  }
  function json(status, body) { return new Response(JSON.stringify(body), { status: status, headers: { "content-type": "application/json" } }); }

  window.fetch = function (input, init) {
    var url;
    try { url = new URL(typeof input === "string" ? input : input.url, location.href); } catch (e) { return realFetch(input, init); }
    if (url.origin !== location.origin || url.pathname.indexOf("/api/") !== 0) return realFetch(input, init);
    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (method !== "GET") {
      if (/\/signout$/.test(url.pathname)) { setTimeout(function () { location.href = "/for-offices"; }, 0); return Promise.resolve(json(200, { ok: true })); }
      toast(w(PAGE === "dept" ? W.savedDept : W.saved));
      return Promise.resolve(json(409, { error: w(PAGE === "dept" ? W.savedDept : W.saved), code: "DEMO" }));
    }
    return ready.then(function (map) {
      var hit = lookup(map, url);
      if (!hit) return json(404, { error: w(W.missing), code: "DEMO" });
      return json(hit.status, hit.body);
    });
  };
  try { navigator.sendBeacon = function () { return true; }; } catch (e) { /* read-only in some browsers */ }
  try { if (navigator.serviceWorker) navigator.serviceWorker.register = function () { return Promise.reject(new Error("DEMO")); }; } catch (e) { /* ignore */ }

  // Downloads, payments and phone alerts leave the page or the browser: stop them and say why.
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a[href^="/api/"], a[download], #rn-on, #rn-test, .pay-btn, [data-pay], #plan-pay, a[href*="razorpay"]') : null;
    if (!el) return;
    e.preventDefault(); e.stopImmediatePropagation();
    toast(w(W.blocked));
  }, true);

  // ---- the bar ----
  var css = document.createElement("style");
  css.textContent =
    ".giq-demo-bar{position:sticky;top:0;z-index:9000;display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:8px 16px;background:#FFF1C9;color:#2B2100;border-bottom:3px solid #B78400;font:14px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif}" +
    ".giq-demo-bar .gd-tag{display:inline-block;background:#2B2100;color:#FFF1C9;font-weight:700;border-radius:6px;padding:2px 8px;letter-spacing:.04em;text-transform:uppercase;font-size:12.5px}" +
    ".giq-demo-bar .gd-txt{flex:1 1 260px;min-width:0}" +
    ".giq-demo-bar label{font-weight:600;margin-right:6px}" +
    ".giq-demo-bar select{min-height:44px;font:inherit;font-size:15px;padding:6px 10px;border:1.5px solid #6B5200;border-radius:8px;background:#fff;color:#2B2100}" +
    ".giq-demo-bar a{color:#2B2100;font-weight:600;text-decoration:underline;display:inline-flex;align-items:center;min-height:44px}" +
    ".giq-demo-bar :focus-visible{outline:3px solid #1A4FB0;outline-offset:2px}" +
    "@media (max-width:700px){.giq-demo-bar{position:static}}" +
    ".giq-demo-toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:10001;max-width:min(560px,calc(100% - 32px));background:#2B2100;color:#FFF7DD;padding:12px 16px;border-radius:10px;font:14.5px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3)}" +
    ".giq-demo-toast[hidden]{display:none}";
  document.head.appendChild(css);
  var bar, toastEl, toastTimer;
  function drawBar() {
    if (!document.body) return;
    if (!bar) { bar = document.createElement("div"); bar.className = "giq-demo-bar"; bar.setAttribute("role", "region"); document.body.insertBefore(bar, document.body.firstChild); }
    bar.setAttribute("aria-label", w(W.tag));
    var html = '<span class="gd-tag">' + esc(w(W.tag)) + '</span><span class="gd-txt">' + esc(w(W.bar)) + "</span>";
    if (PAGE === "rep") {
      html += '<span><label for="gd-as">' + esc(w(W.as)) + '</label><select id="gd-as">' +
        ROLES.map(function (r) { return '<option value="' + r + '"' + (r === AS ? " selected" : "") + ">" + esc(w(W.roles[r])) + "</option>"; }).join("") + "</select></span>";
    }
    html += '<a href="' + (PAGE === "rep" ? "/dept?demo=1" : "/rep?demo=1") + '">' + esc(w(W.other[PAGE])) + "</a>";
    html += '<a href="/for-offices">' + esc(w(W.leave)) + "</a>";
    bar.innerHTML = html;
    var sel = document.getElementById("gd-as");
    if (sel) sel.addEventListener("change", function () { location.href = "/rep?demo=1&as=" + encodeURIComponent(sel.value); });
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "giq-demo-toast"; toastEl.setAttribute("role", "status"); toastEl.hidden = true; document.body.appendChild(toastEl); }
  }
  function toast(msg) {
    if (!toastEl) drawBar();
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true; }, 6000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", drawBar); else drawBar();
  // Redraw in the reader's language when they switch it.
  try { new MutationObserver(function () { drawBar(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] }); } catch (e) { /* old browser */ }
  window.GIQDemo = { toast: toast };
})();
