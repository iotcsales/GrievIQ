/*! Copyright (c) 2026 IOTC (Indus Overseas Tech. Corp.). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// public/notice-card.js (grieviq-55)
//
// A paid public notice as citizens see it, used on the ward or village page
// (index.html) and for the office's preview before it asks.
//   GIQNoticeCard.box(element, { notices, maxShown }, { h: 3 })  the "Public notices here" box
//   GIQNoticeCard.card(notice, { h: 4, idp })                    one notice (HTML string)
// Every notice says "Paid notice" and who published and paid for it
// (ASCI: advertising must be clearly recognisable as such). Text only.
// WCAG 2.2 AA: a real heading per notice, the language of each text marked,
// a "Show all" button that says how many and whether it is open, own colours
// checked in light and dark.
(function () {
  "use strict";
  function T(k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; }
  function hi() { return window.GIQ && window.GIQ.lang === "hi"; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  function dateText(s) {
    if (!s) return "";
    var d = new Date(s + "T00:00:00+05:30");
    return isNaN(d) ? s : d.toLocaleDateString(hi() ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  }
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
    ".pn-wrap{--pn-fg:#1b1f24;--pn-muted:#4a5360;--pn-border:#b9c1cb;--pn-card:#fff;--pn-tag-bg:#fff3d6;--pn-tag-fg:#5b4100;--pn-accent:#1f4a8a;--pn-focus:#1a4fb0;color:var(--pn-fg)}" +
    ".pn-wrap.pn-dark{--pn-fg:#e7eaee;--pn-muted:#b3bcc7;--pn-border:#4a5666;--pn-card:#1d232c;--pn-tag-bg:#3a3018;--pn-tag-fg:#f3dc9c;--pn-accent:#9fc0ff;--pn-focus:#9fc0ff}" +
    ".pn-box{margin:16px 0 0;padding-top:12px;border-top:1px solid var(--pn-border)}" +
    ".pn-box .pn-h{font-size:16px;margin:0 0 4px;color:var(--pn-fg)}" +
    ".pn-box .pn-intro{font-size:13.5px;color:var(--pn-muted);margin:0 0 10px}" +
    ".pn{background:var(--pn-card);border:1px solid var(--pn-border);border-left:4px solid #c98a00;border-radius:10px;padding:10px 14px;margin:0 0 10px;text-align:left}" +
    ".pn .pn-tag{margin:0 0 4px;font-size:12.5px;color:var(--pn-muted)}" +
    ".pn .pn-paid{display:inline-block;background:var(--pn-tag-bg);color:var(--pn-tag-fg);font-weight:700;border-radius:4px;padding:1px 8px;margin-right:6px;letter-spacing:.02em}" +
    ".pn .pn-title{font-size:16px;line-height:1.35;margin:2px 0 4px;color:var(--pn-fg)}" +
    ".pn .pn-body{margin:0 0 6px;white-space:pre-line;font-size:14.5px;line-height:1.55;overflow-wrap:anywhere}" +
    ".pn dl.pn-meta{display:grid;grid-template-columns:max-content 1fr;gap:2px 10px;margin:0 0 6px;font-size:14px}.pn dl.pn-meta dt{color:var(--pn-muted)}.pn dl.pn-meta dd{margin:0;overflow-wrap:anywhere}" +
    ".pn .pn-by{font-size:13px;color:var(--pn-muted);margin:0;border-top:1px dashed var(--pn-border);padding-top:6px}" +
    ".pn-box .pn-more{font:inherit;font-size:14px;font-weight:600;min-height:44px;padding:6px 14px;border-radius:8px;border:1px solid var(--pn-border);background:var(--pn-card);color:var(--pn-accent);cursor:pointer}" +
    ".pn-box details{font-size:13.5px;color:var(--pn-fg);margin:2px 0 10px}.pn-box summary{cursor:pointer;color:var(--pn-accent);font-weight:600;min-height:32px;display:inline-flex;align-items:center}" +
    ".pn-box details p{margin:6px 0 0;color:var(--pn-fg)}" +
    ".pn-wrap button:focus-visible,.pn-wrap summary:focus-visible{outline:3px solid var(--pn-focus);outline-offset:2px}";
  function addCss() { if (document.getElementById("pn-css")) return; var st = document.createElement("style"); st.id = "pn-css"; st.textContent = CSS; document.head.appendChild(st); }
  function theme(el) { el.classList.add("pn-wrap"); el.classList.toggle("pn-dark", isDark(el)); }

  // The text in the page's language when there is one, else the other.
  function pick(n, k) {
    var want = hi() ? "Hi" : "En", other = hi() ? "En" : "Hi";
    if (n["title" + want] || n["body" + want]) return { text: n[k + want] || "", lang: want === "Hi" ? "hi" : "en" };
    return { text: n[k + other] || "", lang: other === "Hi" ? "hi" : "en" };
  }
  function officeLabel(n) { var l = n.officeLabel; return Array.isArray(l) ? (hi() ? l[1] : l[0]) : (l || ""); }
  function card(n, o) {
    addCss();
    o = o || {};
    var hn = "h" + (o.h || 4), id = (o.idp || "pn-") + String(n.ref || "x").replace(/[^A-Za-z0-9]/g, "");
    var t = pick(n, "title"), b = pick(n, "body");
    var when = [n.eventDate ? dateText(n.eventDate) : "", n.eventTime || ""].filter(Boolean).join(", ");
    var page = hi() ? "hi" : "en";
    return '<article class="pn" aria-labelledby="' + id + '-h">' +
      '<p class="pn-tag"><span class="pn-paid">' + esc(T("pn.paid")) + "</span>" + esc(T("pn.cat_" + n.category)) + "</p>" +
      "<" + hn + ' class="pn-title" id="' + id + '-h"' + (t.lang !== page ? ' lang="' + t.lang + '"' : "") + ">" + esc(t.text) + "</" + hn + ">" +
      '<p class="pn-body"' + (b.lang !== page ? ' lang="' + b.lang + '"' : "") + ">" + esc(b.text) + "</p>" +
      (when || n.place ? '<dl class="pn-meta">' + (when ? "<dt>" + esc(T("pn.when")) + "</dt><dd>" + esc(when) + "</dd>" : "") + (n.place ? "<dt>" + esc(T("pn.where")) + "</dt><dd>" + esc(n.place) + "</dd>" : "") + "</dl>" : "") +
      '<p class="pn-by">' + esc(T("pn.by", { office: officeLabel(n) + ", " + (n.office || "") })) + (n.until ? " · " + esc(T("pn.until", { date: dateText(n.until) })) : "") + "</p></article>";
  }
  function box(el, data, o) {
    addCss(); o = o || {};
    var list = (data && data.notices) || [], max = (data && data.maxShown) || 3;
    if (!list.length) { el.innerHTML = ""; el.hidden = true; return; }
    el.hidden = false;
    theme(el);
    var hn = "h" + (o.h || 3), open = !!el.getAttribute("data-open");
    var first = list.slice(0, max), rest = list.slice(max);
    el.innerHTML = '<section class="pn-box" aria-labelledby="pn-box-h"><' + hn + ' class="pn-h" id="pn-box-h">' + esc(T("pn.box_h")) + "</" + hn + ">" +
      '<p class="pn-intro">' + esc(T("pn.box_p")) + "</p>" +
      "<details><summary>" + esc(T("pn.about_h")) + "</summary><p>" + esc(T("pn.about_p")) + "</p></details>" +
      first.map(function (n) { return card(n, { h: (o.h || 3) + 1 }); }).join("") +
      (rest.length ? '<div id="pn-rest"' + (open ? "" : " hidden") + ">" + rest.map(function (n) { return card(n, { h: (o.h || 3) + 1 }); }).join("") + "</div>" +
        '<button type="button" class="pn-more" aria-expanded="' + open + '" aria-controls="pn-rest">' + esc(T(open ? "pn.fewer" : "pn.more", { n: list.length })) + "</button>" : "") +
      "</section>";
    var btn = el.querySelector(".pn-more");
    if (btn) btn.addEventListener("click", function () {
      if (open) el.removeAttribute("data-open"); else el.setAttribute("data-open", "1");
      box(el, data, o);
      var h = !open && el.querySelector("#pn-rest .pn-title"), again = el.querySelector(".pn-more");
      if (h) { h.setAttribute("tabindex", "-1"); h.focus(); } else if (again) again.focus();
    });
  }
  window.GIQNoticeCard = { card: card, box: box, css: addCss, theme: theme, isDark: isDark };
})();
