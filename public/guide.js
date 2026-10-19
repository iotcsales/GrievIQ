/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// public/guide.js (grieviq-40)
//
// Draws the step-by-step guides in public/guide-content.js, in the language
// the reader has chosen (English or Hindi), in two ways:
//   GIQGuide.render(kind, opts)  -> HTML for a page (the citizen /guide page)
//   GIQGuide.open(kind, opts)    -> a "Help" panel over the app, opts.focus = an SOP id
// Any element with data-guide="rep" (and optionally data-guide-focus="forward")
// opens the panel when clicked, so apps only add markup.
// GIQGuide.setRoles(kind, roles) limits the panel to the SOPs for those roles
// (a field worker sees sign-in and field check only).
//
// Accessibility (WCAG 2.2 AA): the panel is a modal dialog (aria-modal, the
// rest of the page made inert), focus moves into it and is kept there, Esc
// closes it and focus goes back to the button that opened it. Text is real
// text (not images); the journey is an ordered list drawn as a flow, so it
// reflows at 320 px and is read in order. Colours are its own, checked at
// 4.5:1 in light and dark; light or dark follows the page behind it.
// "Print / save as PDF" prints only the guide, in light colours.
(function () {
  "use strict";
  var G = function () { return window.GIQ_GUIDES || {}; };
  var roleMap = {};
  function L() { return (window.GIQ && window.GIQ.lang === "hi") ? 1 : 0; }
  function t(k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pick(pair) { return pair ? (pair[L()] || pair[0]) : ""; }
  // Escape first, then turn **x** into bold: guide text can never inject markup.
  function md(pair) { return esc(pick(pair)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); }

  // The journey of a complaint, as each audience sees it.
  var JOURNEYS = {
    citizen: [
      ["You report the problem", "आप समस्या दर्ज करते हैं"],
      ["Your representative's office acknowledges it", "जनप्रतिनिधि कार्यालय पावती देता है"],
      ["Work is assigned or forwarded to the department", "काम सौंपा जाता है या विभाग को भेजा जाता है"],
      ["The fix is checked on the spot, with photos", "मौके पर फ़ोटो सहित जाँच"],
      ["You confirm it is fixed and rate the service", "आप समाधान की पुष्टि करते हैं और सेवा को रेट करते हैं"],
    ],
    rep: [
      ["A citizen's complaint arrives", "नागरिक की शिकायत आती है"],
      ["Acknowledge it within the time limit", "समय-सीमा में पावती दें"],
      ["Assign a field worker or forward to the department", "फ़ील्ड कर्मी को सौंपें या विभाग को भेजें"],
      ["Field check with photos", "फ़ोटो सहित फ़ील्ड जाँच"],
      ["Mark resolved; the citizen confirms", "निस्तारित करें; नागरिक पुष्टि करता है"],
    ],
    dept: [
      ["A representative's office forwards a complaint", "जनप्रतिनिधि कार्यालय शिकायत भेजता है"],
      ["Read it on your dashboard", "अपने डैशबोर्ड पर पढ़ें"],
      ["Reply: scheduled, in progress or done, with a photo", "उत्तर दें: निर्धारित, प्रगति पर या पूर्ण, फ़ोटो सहित"],
      ["The representative's team checks on the ground", "जनप्रतिनिधि की टीम धरातल पर जाँचती है"],
      ["Your office's record builds up in the performance report", "प्रदर्शन रिपोर्ट में कार्यालय का रिकॉर्ड बनता है"],
    ],
  };

  // grieviq-57: an SOP with `needs` (e.g. "MULTI_SEAT") shows only when the
  // roles given include it (the console adds it for members of wards with
  // several members). Without roles (the public guide page) everything shows.
  function allowed(sop, roles) {
    if (sop.needs && roles && roles.length && roles.indexOf(sop.needs) < 0) return false;
    if (!sop.roles || !roles || !roles.length) return true;
    for (var i = 0; i < roles.length; i++) if (sop.roles.indexOf(roles[i]) >= 0) return true;
    return false;
  }
  function sopsFor(g, roles) {
    var list = (g.sops || []).filter(function (s) { return allowed(s, roles); });
    return list.length ? list : (g.sops || []);
  }

  // opts: { roles, h (heading level for parts, default 2), prefix (id prefix), title (bool: include the title) }
  function render(kind, opts) {
    opts = opts || {};
    var g = G()[kind];
    if (!g) return "";
    var h = opts.h || 2, h2 = "h" + h, h3 = "h" + (h + 1);
    var p = opts.prefix || "gq-";
    var sops = sopsFor(g, opts.roles);
    var out = [];
    if (opts.title) out.push("<h" + (h - 1) + ' class="gq-title">' + md(g.title) + "</h" + (h - 1) + ">");
    out.push('<p class="gq-intro">' + md(g.intro) + "</p>");
    var steps = JOURNEYS[g.journey];
    if (steps) {
      out.push('<figure class="gq-journey"><figcaption id="' + p + 'jcap">' + esc(t("guide.journey")) + "</figcaption>" +
        '<ol class="gq-flow" aria-labelledby="' + p + 'jcap">' +
        steps.map(function (s, i) { return '<li><span class="gq-n" aria-hidden="true">' + (i + 1) + "</span><span>" + md(s) + "</span></li>"; }).join("") +
        "</ol></figure>");
    }
    if (g.rules && g.rules.length) {
      out.push('<section class="gq-rules" aria-labelledby="' + p + 'rules"><' + h2 + ' id="' + p + 'rules">' + esc(t("guide.rules")) + "</" + h2 + "><ul>" +
        g.rules.map(function (r) { return "<li>" + md(r) + "</li>"; }).join("") + "</ul></section>");
    }
    if (sops.length > 1) {
      out.push('<nav class="gq-toc" aria-labelledby="' + p + 'toc"><' + h2 + ' id="' + p + 'toc">' + esc(t("guide.contents")) + "</" + h2 + "><ol>" +
        sops.map(function (s) { return '<li><a href="#' + p + esc(s.id) + '" data-gq-jump="' + esc(s.id) + '">' + md(s.title) + "</a></li>"; }).join("") +
        "</ol></nav>");
    }
    sops.forEach(function (s, i) {
      var who = s.who ? '<p class="gq-who"><strong>' + esc(t("guide.who")) + "</strong> " + md(s.who) + "</p>" : "";
      var what = s.what ? '<p class="gq-who"><strong>' + esc(t("guide.what")) + "</strong> " + md(s.what) + "</p>" : "";
      var check = (s.check && s.check.length) ? "<" + h3 + ">" + esc(t("guide.check")) + "</" + h3 + '><ul class="gq-check">' +
        s.check.map(function (c) { return "<li>" + md(c) + "</li>"; }).join("") + "</ul>" : "";
      var note = (s.note || []).map(function (n) { return '<p class="gq-note">' + md(n) + "</p>"; }).join("");
      out.push('<section class="gq-sop" id="' + p + esc(s.id) + '" tabindex="-1" aria-labelledby="' + p + esc(s.id) + '-h">' +
        "<" + h2 + ' id="' + p + esc(s.id) + '-h"><span class="gq-sn">' + (i + 1) + ".</span> " + md(s.title) + "</" + h2 + ">" +
        what + who + "<" + h3 + ">" + esc(t("guide.steps")) + "</" + h3 + '><ol class="gq-steps">' +
        s.steps.map(function (st) { return "<li>" + md(st) + "</li>"; }).join("") + "</ol>" + check + note + "</section>");
    });
    if (g.problems && g.problems.length) {
      out.push('<section class="gq-problems" aria-labelledby="' + p + 'prob"><' + h2 + ' id="' + p + 'prob">' + esc(t("guide.problems")) + "</" + h2 + "><dl>" +
        g.problems.map(function (pr) { return "<dt>" + md(pr[0]) + "</dt><dd>" + md(pr[1]) + "</dd>"; }).join("") + "</dl></section>");
    }
    if (g.contacts) out.push('<p class="gq-contacts">' + md(g.contacts) + "</p>");
    return out.join("");
  }

  // ---- colours: light or dark, following the page behind ----
  function bgOf(el) {
    while (el) {
      var c = getComputedStyle(el).backgroundColor;
      var m = c && c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
      if (m && (m[4] == null || Number(m[4]) > 0.5)) return [Number(m[1]), Number(m[2]), Number(m[3])];
      el = el.parentElement;
    }
    return null;
  }
  function isDark() {
    var rgb = bgOf(document.body) || bgOf(document.documentElement);
    if (!rgb) return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var lum = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2] < 0.2;
  }
  function paint(el) { if (el) el.classList.toggle("gq-dark", isDark()); }

  var CSS =
    ".gq-root{--gq-bg:#fff;--gq-fg:#1b1f24;--gq-muted:#4a5360;--gq-border:#c3cad3;--gq-card:#f3f5f8;--gq-link:#1a4fb0;--gq-accent:#1f4a8a;--gq-on-accent:#fff;--gq-note-bg:#fff6e0;--gq-note-fg:#5b4100;--gq-focus:#1a4fb0;" +
    "color:var(--gq-fg);font-size:15px;line-height:1.6}" +
    ".gq-root.gq-dark{--gq-bg:#171c23;--gq-fg:#e7eaee;--gq-muted:#b3bcc7;--gq-border:#465263;--gq-card:#212833;--gq-link:#9fc0ff;--gq-accent:#9fc0ff;--gq-on-accent:#0f1720;--gq-note-bg:#2e2716;--gq-note-fg:#f3dc9c;--gq-focus:#9fc0ff}" +
    ".gq-root a{color:var(--gq-link)}.gq-root a:focus-visible,.gq-root button:focus-visible,.gq-root [tabindex]:focus-visible{outline:3px solid var(--gq-focus);outline-offset:2px}" +
    ".gq-root .gq-sop:focus{outline:none}.gq-root .gq-sop:focus-visible{outline:3px solid var(--gq-focus);outline-offset:4px;border-radius:6px}" +
    ".gq-root h1,.gq-root h2,.gq-root h3,.gq-root h4{color:var(--gq-fg);line-height:1.3}" +
    ".gq-root .gq-intro{color:var(--gq-fg);margin:0 0 14px}" +
    ".gq-root figure.gq-journey{margin:0 0 18px;padding:14px;border:1px solid var(--gq-border);border-radius:12px;background:var(--gq-card)}" +
    ".gq-root figcaption{font-weight:600;margin:0 0 10px}" +
    ".gq-root ol.gq-flow{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:10px 22px}" +
    ".gq-root ol.gq-flow li{position:relative;flex:1 1 140px;display:flex;gap:8px;align-items:flex-start;font-size:14px;line-height:1.45;min-width:0}" +
    ".gq-root ol.gq-flow li:not(:last-child)::after{content:'';position:absolute;right:-15px;top:8px;width:8px;height:8px;border-top:2px solid var(--gq-muted);border-right:2px solid var(--gq-muted);transform:rotate(45deg)}" +
    ".gq-root .gq-n{flex:0 0 26px;height:26px;border-radius:50%;background:var(--gq-accent);color:var(--gq-on-accent);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:13px}" +
    "@media (max-width:560px){.gq-root ol.gq-flow{flex-direction:column}.gq-root ol.gq-flow li{flex:1 1 auto}.gq-root ol.gq-flow li:not(:last-child)::after{right:auto;left:9px;top:auto;bottom:-9px;transform:rotate(135deg)}}" +
    ".gq-root .gq-rules{border-left:4px solid var(--gq-accent);background:var(--gq-card);border-radius:0 10px 10px 0;padding:4px 14px 4px;margin:0 0 18px}" +
    ".gq-root .gq-rules ul,.gq-root .gq-check{margin:0 0 10px;padding-left:20px}.gq-root li{margin:0 0 6px}" +
    ".gq-root .gq-toc ol{margin:0 0 14px;padding-left:22px}.gq-root .gq-toc li{margin:0 0 2px}" +
    // (pages style "nav a" for their menus; the guide's contents must still look like links)
    ".gq-root nav.gq-toc a,.gq-root nav.gq-toc a:hover{display:inline-block;padding:4px 0;min-height:24px;color:var(--gq-link);text-decoration:underline;background:none;border:0;border-radius:0;font-size:inherit;font-weight:400}" +
    ".gq-root .gq-sop{border-top:1px solid var(--gq-border);padding-top:6px;margin-top:14px;scroll-margin-top:12px}" +
    ".gq-root .gq-sn{color:var(--gq-muted)}.gq-root .gq-who{margin:0 0 8px;color:var(--gq-fg)}.gq-root .gq-who strong{font-weight:600}" +
    ".gq-root ol.gq-steps{padding-left:22px;margin:0 0 10px}.gq-root ol.gq-steps li{padding-left:2px}" +
    ".gq-root .gq-note{background:var(--gq-note-bg);color:var(--gq-note-fg);border-radius:8px;padding:9px 12px;margin:6px 0 10px;font-size:14px}" +
    ".gq-root .gq-problems dt{font-weight:600;margin-top:10px}.gq-root .gq-problems dd{margin:2px 0 0 0;color:var(--gq-fg)}" +
    ".gq-root .gq-contacts{margin-top:18px;padding-top:12px;border-top:1px solid var(--gq-border);font-size:14px;overflow-wrap:anywhere}" +
    ".gq-root strong{font-weight:600}" +
    // ---- the panel ----
    ".gq-ov{position:fixed;inset:0;z-index:10000;background:rgba(10,14,20,.55);display:flex;justify-content:flex-end}" +
    ".gq-drawer{background:var(--gq-bg);width:min(640px,100%);height:100%;display:flex;flex-direction:column;box-shadow:-8px 0 30px rgba(0,0,0,.3);font-family:inherit;text-align:left}" +
    ".gq-dhead{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--gq-border);flex-wrap:wrap}" +
    ".gq-dhead h2{flex:1 1 200px;margin:0;font-size:18px}.gq-dhead h2:focus{outline:none}.gq-dhead h2:focus-visible{outline:3px solid var(--gq-focus)}" +
    ".gq-btn{font:inherit;font-size:14px;min-height:44px;min-width:44px;padding:8px 14px;border-radius:8px;border:1px solid var(--gq-border);background:var(--gq-bg);color:var(--gq-fg);cursor:pointer}" +
    ".gq-btn:hover{border-color:var(--gq-fg)}.gq-btn.gq-primary{background:var(--gq-accent);border-color:var(--gq-accent);color:var(--gq-on-accent)}" +
    ".gq-dbody{overflow-y:auto;padding:14px 18px 40px;flex:1;overscroll-behavior:contain}" +
    ".gq-dbody h3{font-size:16.5px;margin:16px 0 8px}.gq-dbody h4{font-size:14.5px;margin:12px 0 6px}" +
    ".gq-link{background:none;border:none;padding:4px 2px;min-height:24px;font:inherit;font-size:13.5px;color:var(--gq-link,#1a4fb0);text-decoration:underline;cursor:pointer}" +
    // ---- print: only the guide, light colours ----
    "@media print{html.gq-print body>*:not(.gq-ov){display:none!important}html.gq-print .gq-ov{position:static;background:none;display:block}" +
    "html.gq-print .gq-drawer{width:auto;height:auto;box-shadow:none;display:block}html.gq-print .gq-dbody{overflow:visible;padding:0}" +
    ".gq-dhead button,.gq-noprint{display:none!important}" +
    ".gq-root,.gq-root.gq-dark{--gq-bg:#fff;--gq-fg:#000;--gq-muted:#333;--gq-border:#999;--gq-card:#fff;--gq-link:#000;--gq-accent:#000;--gq-on-accent:#fff;--gq-note-bg:#fff;--gq-note-fg:#000}" +
    ".gq-root .gq-sop{break-inside:avoid-page}.gq-root .gq-toc{display:none}}";
  function addCss() {
    if (document.getElementById("gq-css")) return;
    var st = document.createElement("style"); st.id = "gq-css"; st.textContent = CSS;
    document.head.appendChild(st);
  }

  // In the panel only the panel is printed; on the /guide page the page's own print styles apply.
  function printGuide() {
    var root = document.documentElement;
    if (!state) { window.print(); return; }
    root.classList.add("gq-print");
    var done = function () { root.classList.remove("gq-print"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    try { window.print(); } finally { setTimeout(done, 1000); }
  }

  // ---- the Help panel ----
  var state = null;   // { ov, kind, opts, opener, inerted }
  function focusables(el) {
    return Array.prototype.filter.call(el.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"]),input,select,textarea'),
      function (x) { return x.offsetParent !== null || x === document.activeElement; });
  }
  function jumpTo(id, container, prefix) {
    var sec = container.querySelector('[id="' + prefix + String(id).replace(/[^\w-]/g, "") + '"]');
    if (!sec) return false;
    sec.scrollIntoView({ block: "start" });
    sec.focus({ preventScroll: true });
    return true;
  }
  function fill() {
    var s = state; if (!s) return;
    var g = G()[s.kind] || {};
    s.ov.querySelector(".gq-dhead h2").innerHTML = md(g.title);
    s.ov.querySelector("[data-gq-print]").textContent = t("guide.print");
    var close = s.ov.querySelector("[data-gq-close]");
    close.textContent = t("guide.close");
    s.ov.querySelector(".gq-dbody").innerHTML = render(s.kind, { roles: s.opts.roles || roleMap[s.kind], h: 3, prefix: "gqd-" });
    paint(s.ov);
  }
  function onKey(e) {
    if (!state) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    var f = focusables(state.ov.querySelector(".gq-drawer"));
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1], a = document.activeElement, i = f.indexOf(a);
    // (the title and a section heading can hold focus without being in the list)
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (a === last || !state.ov.contains(a))) { e.preventDefault(); first.focus(); }
  }
  function onLang() { if (state) { fill(); state.ov.querySelector(".gq-dhead h2").focus(); } }
  function open(kind, opts) {
    if (!G()[kind]) return;
    addCss();
    if (state) close(true);
    opts = opts || {};
    var ov = document.createElement("div");
    ov.className = "gq-ov gq-root";
    ov.innerHTML = '<div class="gq-drawer" role="dialog" aria-modal="true" aria-labelledby="gq-dtitle">' +
      '<div class="gq-dhead"><h2 id="gq-dtitle" tabindex="-1"></h2>' +
      '<button type="button" class="gq-btn" data-gq-print></button><button type="button" class="gq-btn gq-primary" data-gq-close></button></div>' +
      '<div class="gq-dbody"></div></div>';
    var inerted = [];
    Array.prototype.forEach.call(document.body.children, function (c) {
      if (c.tagName === "SCRIPT" || c.tagName === "STYLE" || c.inert) return;
      c.inert = true; c.setAttribute("aria-hidden", "true"); inerted.push(c);
    });
    document.body.appendChild(ov);
    state = { ov: ov, kind: kind, opts: opts, opener: opts.opener || document.activeElement, inerted: inerted, overflow: document.body.style.overflow };
    document.body.style.overflow = "hidden";
    fill();
    ov.addEventListener("click", function (e) {
      if (e.target === ov) { close(); return; }
      if (e.target.closest("[data-gq-close]")) { close(); return; }
      if (e.target.closest("[data-gq-print]")) { printGuide(); return; }
      var j = e.target.closest("[data-gq-jump]");
      if (j) { e.preventDefault(); jumpTo(j.getAttribute("data-gq-jump"), ov, "gqd-"); }
    });
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("giq:lang", onLang);
    if (!(opts.focus && jumpTo(opts.focus, ov, "gqd-"))) ov.querySelector(".gq-dhead h2").focus();
  }
  function close(silent) {
    var s = state; if (!s) return;
    state = null;
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("giq:lang", onLang);
    s.inerted.forEach(function (c) { c.inert = false; c.removeAttribute("aria-hidden"); });
    document.body.style.overflow = s.overflow || "";
    s.ov.remove();
    if (!silent && s.opener && s.opener.focus && document.contains(s.opener)) s.opener.focus();
  }

  // Any [data-guide] element opens the panel.
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-guide]");
    if (!b || (state && state.ov.contains(b))) return;
    e.preventDefault();
    open(b.getAttribute("data-guide"), { focus: b.getAttribute("data-guide-focus") || "", opener: b });
  });

  // Re-colour when the reader switches light / dark.
  document.addEventListener("giq:theme", function () {
    setTimeout(function () { if (state) paint(state.ov); document.querySelectorAll(".gq-page").forEach(paint); }, 30);
  });
  if (window.MutationObserver) {
    new MutationObserver(function () { if (state) paint(state.ov); document.querySelectorAll(".gq-page").forEach(paint); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  }
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var re = function () { setTimeout(function () { if (state) paint(state.ov); document.querySelectorAll(".gq-page").forEach(paint); }, 30); };
    if (mq.addEventListener) mq.addEventListener("change", re);
  }

  window.GIQGuide = {
    render: render, open: open, close: close, print: printGuide, addCss: addCss, paint: paint,
    setRoles: function (kind, roles) { roleMap[kind] = roles || null; },
    isOpen: function () { return !!state; },
    journeys: JOURNEYS,
  };
})();
