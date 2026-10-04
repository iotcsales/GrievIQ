// public/site.js
//
// Shared by the citizen-facing pages (readiness review, gaps 8 and 9):
//  - a "Skip to main content" link as the first thing a keyboard or screen
//    reader user reaches (WCAG 2.4.1 / IS 17802);
//  - clear keyboard focus and calmer motion for people who ask their device
//    for it (WCAG 2.4.7, 2.3.3);
//  - the same footer links on every page, as GIGW 3.0 expects (help and
//    contact, privacy, terms, accessibility statement, website policies,
//    sitemap), and the page's "last updated" date from
//    <meta name="last-updated" content="YYYY-MM-DD">;
//  - an anonymous visit count (see countVisit below and functions/api/visit.js).
// Load it with `defer` after i18n.js.
(function () {
  function t(key, fallback, vars) {
    var s = (window.GIQ && GIQ.t) ? GIQ.t(key, vars) : null;
    if (!s || s === key) {
      s = fallback;
      if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; });
    }
    return s;
  }
  var LINKS = [
    ["/about", "common.about", "About us"],
    ["/help", "common.help", "Help & contact"],
    ["/privacy", "common.privacy", "Privacy policy"],
    ["/terms", "common.terms", "Terms"],
    ["/accessibility", "common.accessibility", "Accessibility"],
    ["/policies", "common.policies", "Website policies"],
    ["/sitemap", "common.sitemap", "Sitemap"],
  ];

  var style = document.createElement("style");
  style.textContent =
    ".skip-link{position:absolute;left:12px;top:-60px;z-index:10000;background:#13233F;color:#fff;padding:10px 16px;border-radius:8px;font:600 14px/1.2 system-ui,sans-serif;text-decoration:none}" +
    ".skip-link:focus{top:10px;outline:3px solid #F2B705;outline-offset:2px}" +
    "a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible,[tabindex]:focus-visible{outline:3px solid #1F4A8A;outline-offset:2px}" +
    "header.brand .logo-mark{box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}" +
    "header.brand .brand-text{display:flex;flex-direction:column;line-height:1.15}" +
    "header.brand .brand-tag{font-size:11.5px;font-weight:500;color:var(--ink-soft,#746E63);font-family:inherit}" +
    ".footer-updated{font-size:10.5px;color:var(--ink-soft,#746E63);margin-top:6px}" +
    "@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}";
  document.head.appendChild(style);

  function mainTarget() {
    var m = document.querySelector("main") || document.querySelector(".app-card") || document.querySelector(".card-shell");
    if (m && !m.id) m.id = "main";
    if (m && !m.hasAttribute("tabindex")) m.setAttribute("tabindex", "-1");
    return m;
  }
  function dayText(d) {
    var x = new Date(d + "T00:00:00+05:30");
    var lc = (window.GIQ && GIQ.locale) ? GIQ.locale() : "en-IN";
    return isNaN(x) ? d : x.toLocaleDateString(lc, { day: "numeric", month: "long", year: "numeric" });
  }
  function draw() {
    var skip = document.getElementById("skip-link");
    var m = mainTarget();
    if (!skip && m) {
      skip = document.createElement("a");
      skip.id = "skip-link"; skip.className = "skip-link"; skip.href = "#" + m.id;
      skip.addEventListener("click", function (e) { e.preventDefault(); m.focus(); m.scrollIntoView(); });
      document.body.insertBefore(skip, document.body.firstChild);
    }
    if (skip) skip.textContent = t("common.skip", "Skip to main content");

    var here = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
    document.querySelectorAll(".footer-links").forEach(function (box) {
      box.innerHTML = "";
      LINKS.forEach(function (l) {
        var a = document.createElement("a");
        a.href = l[0];
        a.textContent = t(l[1], l[2]);
        if (here === l[0]) a.setAttribute("aria-current", "page");
        box.appendChild(a);
      });
      var meta = document.querySelector('meta[name="last-updated"]');
      var up = box.parentNode.querySelector(".footer-updated");
      if (meta) {
        if (!up) { up = document.createElement("div"); up.className = "footer-updated"; box.parentNode.appendChild(up); }
        up.textContent = t("common.last_updated", "Page last updated: {date}", { date: dayText(meta.getAttribute("content")) });
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", draw); else draw();

  // Visitor count for GrievIQ's admin map: one anonymous ping per page view,
  // no cookies, nothing stored on the device. Not sent at all if the
  // browser asks not to be tracked (Global Privacy Control / Do Not Track).
  (function countVisit() {
    try {
      if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
      if (/^\/(admin|rep)/.test(location.pathname)) return;
      var body = JSON.stringify({ path: location.pathname });
      if (navigator.sendBeacon) navigator.sendBeacon("/api/visit", new Blob([body], { type: "application/json" }));
      else fetch("/api/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true, credentials: "omit" });
    } catch (e) {}
  })();
  document.addEventListener("giq:lang", draw);
})();
