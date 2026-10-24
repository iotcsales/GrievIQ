/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// public/site-info.js (grieviq-39)
//
// Fills in the company details that the super admin keeps in "Prices &
// site details" (Grievance Officer, registered address, contact emails)
// wherever a page marks them:
//   <span data-site="goName">        -> the value as text
//   <a data-site-mail="goEmail">     -> a mailto: link with the address
// The page's own text stays as a fallback if the details can't be loaded.
// Load with `defer` after i18n.js; filled again after a language switch.
(function () {
  var info = null;
  function fill() {
    if (!info || !info.company) return;
    var c = info.company;
    document.querySelectorAll("[data-site]").forEach(function (el) {
      var v = c[el.getAttribute("data-site")];
      if (v) el.textContent = v;
    });
    document.querySelectorAll("[data-site-mail]").forEach(function (a) {
      var v = c[a.getAttribute("data-site-mail")];
      if (v && /^[^\s@<>"']+@[^\s@<>"']+$/.test(v)) { a.setAttribute("href", "mailto:" + v); a.textContent = v; }
    });
  }
  function ready(fn) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }
  fetch("/api/site-info").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    info = j;
    ready(function () { setTimeout(fill, 0); });
  }).catch(function () {});
  document.addEventListener("giq:lang", function () { setTimeout(fill, 0); });
  window.GIQ_SITE = function () { return info; };
})();
