// public/admin-nav.js
//
// The admin menu follows the signed-in person's role: it shows only the
// pages that role can use (least privilege, and no dead ends). If someone
// opens a page their role can't use (an old bookmark, a typed address), the
// page is replaced by a plain message saying why and whose page it is,
// with a link back to a page they can use.
//
// This is only for clarity. The server checks every request itself
// (functions/_shared/get-verified-admin.js), so hiding a link never grants
// or removes access.
//
// Load it in <head> (not deferred): it hides the menu links until the role
// is known, so people never see links flash and disappear.
(function () {
  var EN = {
    "adm.nav_denied_title": "This page isn't part of your role",
    "adm.nav_denied": "Your role ({role}) can't use this page. It is for: {roles}.",
    "adm.nav_denied_help": "If you need it for your work, ask a super admin.",
    "adm.nav_denied_go": "Go to {page}",
    "adm.role_super_admin": "Super admin",
    "adm.role_operations_admin": "Operations admin",
    "adm.role_data_moderator": "Data moderator",
    "adm.role_auditor": "Auditor",
    "adm.role_data_entry_operator": "Data entry operator",
  };
  var PAGE_NAMES = {
    "admin-dashboard": "Dashboard", "admin-cases": "Cases", "admin-checks": "Checks", "admin-audit": "Audit",
    "admin-jurisdiction": "Jurisdiction", "admin-issue-types": "Issue types",
  };
  function t(key, vars) {
    var s = (window.GIQ && GIQ.t) ? GIQ.t(key, vars) : null;
    if (!s || s === key) {
      s = EN[key] || key;
      if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; });
    }
    return s;
  }
  function roleName(r) { return t("adm.role_" + r); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // "/admin-staff.html?x#y" or "/admin-staff" -> "admin-staff"
  function pageKey(href) {
    var p = String(href || "").split(/[?#]/)[0];
    p = p.substring(p.lastIndexOf("/") + 1).replace(/\.html$/, "");
    return /^admin-/.test(p) ? p : null;
  }

  var root = document.documentElement;
  root.classList.add("adm-nav-pending");
  var style = document.createElement("style");
  style.textContent =
    "html.adm-nav-pending nav a[href*='admin-']{visibility:hidden}" +
    ".adm-denied{max-width:640px;margin:48px auto;padding:24px 28px;border:1px solid var(--admin-border,#334);border-radius:10px;background:var(--admin-panel,rgba(127,127,127,.06));color:var(--admin-text,inherit)}" +
    ".adm-denied h1{font-size:1.3rem;margin:0 0 12px}.adm-denied p{margin:0 0 10px;line-height:1.5}" +
    ".adm-denied a.adm-go{display:inline-block;margin-top:8px;padding:8px 14px;border-radius:6px;border:1px solid var(--admin-accent,#2563eb);color:var(--admin-accent,#2563eb);text-decoration:none;font-weight:600}.adm-denied a.adm-go:focus-visible{outline:2px solid var(--admin-accent,#2563eb);outline-offset:2px}";
  (document.head || root).appendChild(style);

  var info = null;
  var failSafe = setTimeout(function () { root.classList.remove("adm-nav-pending"); }, 6000);

  function applyMenu() {
    var pages = info.pages || {};
    document.querySelectorAll("nav a[href]").forEach(function (a) {
      var k = pageKey(a.getAttribute("href"));
      if (k && pages[k] && !pages[k].allowed) {
        a.hidden = true;
        a.style.display = "none";
        a.setAttribute("aria-hidden", "true");
      }
    });
    // Text nodes between links (spaces) are fine; nothing else to tidy.
  }

  function firstAllowed() {
    var order = ["admin-dashboard", "admin-cases", "admin-checks", "admin-audit"];
    for (var i = 0; i < order.length; i++) if (info.pages[order[i]] && info.pages[order[i]].allowed) return order[i];
    return "admin-audit";
  }

  function applyPage() {
    var here = pageKey(location.pathname);
    var p = here && info.pages ? info.pages[here] : null;
    var main = document.querySelector("main");
    var box = document.getElementById("adm-denied");
    if (!p || p.allowed || !main) return;
    var roles = (p.roles || []).map(roleName).join(", ");
    var go = firstAllowed();
    var goName = t(go === "admin-audit" ? "adm.nav_audit" : "adm.nav_" + go.replace("admin-", ""));
    if (!goName || /^adm\./.test(goName)) goName = PAGE_NAMES[go] || go;
    var html =
      "<h1>" + esc(t("adm.nav_denied_title")) + "</h1>" +
      "<p>" + esc(t("adm.nav_denied", { role: roleName(info.role), roles: roles })) + "</p>" +
      "<p>" + esc(t("adm.nav_denied_help")) + "</p>" +
      '<a class="adm-go" href="/' + esc(go) + '.html">' + esc(t("adm.nav_denied_go", { page: goName })) + "</a>";
    if (!box) {
      box = document.createElement("section");
      box.id = "adm-denied";
      box.className = "adm-denied";
      box.setAttribute("role", "alert");
      main.parentNode.insertBefore(box, main);
      main.hidden = true;
      main.style.display = "none";
    }
    box.innerHTML = html;
  }

  function run() {
    if (!info) return;
    applyMenu();
    applyPage();
    clearTimeout(failSafe);
    root.classList.remove("adm-nav-pending");
  }

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  fetch("/api/admin/whoami", { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.pages) { root.classList.remove("adm-nav-pending"); return; }
      info = d;
      window.GIQ_ADMIN = d;
      ready(run);
    })
    .catch(function () { root.classList.remove("adm-nav-pending"); });

  document.addEventListener("giq:lang", function () { if (info) applyPage(); });
})();
