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
    "adm.nav_left_title": "Your access has ended",
    "adm.nav_left": "This account is marked as having left GrievIQ, so it can no longer use the admin panel.",
    "adm.nav_paused_title": "Your access is paused while you are on leave",
    "adm.nav_paused": "Welcome back on {date}. Your access starts again automatically after that date.",
    "adm.nav_covering": "You are covering for {name} ({role}) until {date}. What you do for them is recorded in your name, on their behalf.",
    "common.skip": "Skip to main content",
    "adm.nav_signed_in_as": "Signed in as {who}",
    "adm.nav_signout": "Sign out",
    "adm.idle_title": "Are you still there?",
    "adm.idle_text": "For security, you will be signed out in {time} because there has been no activity for almost an hour.",
    "adm.idle_stay": "Stay signed in",
    "adm.idle_signout": "Sign out now",
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

  // Item 10: a person who has left, or whose access is paused during leave,
  // gets a plain message instead of pages that would only show errors; a
  // person covering for a colleague sees a reminder on every page.
  var blocked = null;
  function dayText(d) {
    if (!d) return "";
    var x = new Date(d + "T00:00:00+05:30");
    var lc = (window.GIQ && GIQ.locale) ? GIQ.locale() : "en-IN";
    return isNaN(x) ? d : x.toLocaleDateString(lc, { day: "numeric", month: "short", year: "numeric" });
  }
  function showBlocked() {
    var main = document.querySelector("main");
    if (!main) return;
    var box = document.getElementById("adm-denied");
    if (!box) {
      box = document.createElement("section"); box.id = "adm-denied"; box.className = "adm-denied"; box.setAttribute("role", "alert");
      main.parentNode.insertBefore(box, main); main.hidden = true; main.style.display = "none";
    }
    var paused = blocked.error === "ACCESS_PAUSED";
    box.innerHTML = "<h1>" + esc(t(paused ? "adm.nav_paused_title" : "adm.nav_left_title")) + "</h1><p>" +
      esc(paused ? t("adm.nav_paused", { date: dayText(blocked.leaveUntil) }) : t("adm.nav_left")) + "</p><p>" + esc(t("adm.nav_denied_help")) + "</p>";
    document.querySelectorAll("nav a[href]").forEach(function (a) { a.style.display = "none"; });
  }
  function showCovering() {
    if (!info || !info.covering || !info.covering.length || document.getElementById("adm-covering")) return;
    var main = document.querySelector("main");
    if (!main) return;
    var bar = document.createElement("div"); bar.id = "adm-covering"; bar.className = "adm-covering"; bar.setAttribute("role", "note");
    main.insertBefore(bar, main.firstChild);
    drawCovering();
  }
  function drawCovering() {
    var bar = document.getElementById("adm-covering");
    if (!bar || !info) return;
    bar.textContent = info.covering.map(function (c) {
      return t("adm.nav_covering", { name: (c.name || c.email) + (c.employeeId ? " (" + c.employeeId + ")" : ""), role: roleName(c.role), date: dayText(c.until) });
    }).join(" ");
  }
  style.textContent += ".adm-covering{margin:0 0 18px;padding:10px 14px;border-radius:8px;border:1px solid var(--admin-border,#334);border-left:4px solid var(--admin-accent,#4c7cf0);background:var(--admin-panel,rgba(127,127,127,.06));font-size:14px}";

  // ---- Sign out, and automatic sign-out after an hour without activity ----
  // Signing out ends the Cloudflare Access session (for all GrievIQ admin
  // pages), so getting back in needs a new code. The idle limit follows the
  // owner's choice of 60 minutes; the warning comes 2 minutes before. Activity
  // in any open admin tab counts for all of them.
  var IDLE_MS = 60 * 60 * 1000, WARN_MS = 2 * 60 * 1000, KEY = "giq-admin-last-active";
  function signOut(reason) { location.href = "/signed-out.html" + (reason ? "?reason=" + reason : ""); }
  function drawAccount() {
    var box = document.getElementById("adm-acct");
    if (!box) {
      var nav = document.querySelector("header nav");
      if (!nav) return;
      box = document.createElement("div"); box.id = "adm-acct"; box.className = "adm-acct";
      nav.parentNode.insertBefore(box, nav.nextSibling);
    }
    var who = info ? (info.name ? info.name + (info.employeeId ? " (" + info.employeeId + ")" : "") : info.email) : "";
    box.innerHTML = (who ? '<span class="adm-who">' + esc(t("adm.nav_signed_in_as", { who: who })) + "</span> " : "") +
      '<button type="button" class="adm-signout" id="adm-signout">' + esc(t("adm.nav_signout")) + "</button>";
    document.getElementById("adm-signout").addEventListener("click", function () { signOut(""); });
  }
  style.textContent += ".adm-acct{display:inline-flex;align-items:center;gap:10px;margin-left:20px;font-size:13px;color:var(--admin-muted,#889);flex-shrink:0}" +
    ".adm-who{white-space:nowrap}.adm-signout{white-space:nowrap}" +
    "@media (max-width:760px){header{flex-wrap:wrap}.adm-acct{margin-left:0;margin-top:10px;width:100%;justify-content:space-between}.adm-who{white-space:normal}}" +
    ".adm-signout{background:none;border:1px solid var(--admin-border,#334);border-radius:6px;color:var(--admin-text,inherit);font:inherit;font-size:13px;padding:5px 10px;cursor:pointer;min-height:30px}" +
    ".adm-signout:hover,.adm-signout:focus-visible{border-color:var(--admin-text,#fff);outline:none}" +
    ".adm-idle{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}" +
    ".adm-idle-box{max-width:440px;width:100%;background:var(--admin-bg,#151922);color:var(--admin-text,#e6e8eb);border:1px solid var(--admin-border,#334);border-radius:10px;padding:22px 24px}" +
    "html.light-theme .adm-idle-box{background:#fff;color:#1b1f24}" +
    ".adm-idle-box h2{margin:0 0 10px;font-size:1.15rem}.adm-idle-box p{margin:0 0 16px;line-height:1.5}" +
    ".adm-idle-box button{font:inherit;padding:8px 14px;border-radius:6px;cursor:pointer;margin-right:8px;border:1px solid var(--admin-border,#334);background:none;color:inherit}" +
    ".adm-idle-box button.primary{background:var(--admin-accent,#3b6ff0);border-color:var(--admin-accent,#3b6ff0);color:#fff}";
  function getLast() { try { return Number(localStorage.getItem(KEY)) || 0; } catch (e) { return 0; } }
  var lastLocal = Date.now();
  function touch() {
    var now = Date.now();
    if (now - lastLocal < 5000 && document.getElementById("adm-idle") == null) return;   // at most every 5 s
    lastLocal = now;
    try { localStorage.setItem(KEY, String(now)); } catch (e) { /* storage off: this tab still counts */ }
  }
  function lastActive() { return Math.max(lastLocal, getLast()); }
  function hideIdle() { var d = document.getElementById("adm-idle"); if (d) { d.remove(); } }
  function showIdle(left) {
    var d = document.getElementById("adm-idle");
    var mins = Math.floor(left / 60000), secs = Math.max(0, Math.floor((left % 60000) / 1000));
    var time = mins + ":" + (secs < 10 ? "0" : "") + secs;
    if (!d) {
      d = document.createElement("div"); d.id = "adm-idle"; d.className = "adm-idle";
      d.innerHTML = '<div class="adm-idle-box" role="alertdialog" aria-modal="true" aria-labelledby="adm-idle-h" aria-describedby="adm-idle-p">' +
        '<h2 id="adm-idle-h"></h2><p id="adm-idle-p"></p><button type="button" class="primary" id="adm-idle-stay"></button><button type="button" id="adm-idle-out"></button></div>';
      document.body.appendChild(d);
      document.getElementById("adm-idle-stay").addEventListener("click", function () { lastLocal = 0; touch(); hideIdle(); });
      document.getElementById("adm-idle-out").addEventListener("click", function () { signOut(""); });
      document.getElementById("adm-idle-stay").focus();
    }
    document.getElementById("adm-idle-h").textContent = t("adm.idle_title");
    document.getElementById("adm-idle-p").textContent = t("adm.idle_text", { time: time });
    document.getElementById("adm-idle-stay").textContent = t("adm.idle_stay");
    document.getElementById("adm-idle-out").textContent = t("adm.idle_signout");
  }
  function tick() {
    var idle = Date.now() - lastActive();
    if (idle >= IDLE_MS) { signOut("idle"); return; }
    if (idle >= IDLE_MS - WARN_MS) showIdle(IDLE_MS - idle); else hideIdle();
  }
  ["keydown", "pointerdown", "wheel", "touchstart", "scroll"].forEach(function (ev) {
    window.addEventListener(ev, function () { if (!document.getElementById("adm-idle")) touch(); }, { passive: true, capture: true });
  });
  window.GIQ_IDLE = { tick: tick, IDLE_MS: IDLE_MS, WARN_MS: WARN_MS, KEY: KEY };   // for tests
  touch();
  setInterval(tick, 1000);
  ready(drawAccount);

  // "Skip to main content" for keyboard and screen reader users (WCAG 2.4.1).
  function drawSkip() {
    var a = document.getElementById("skip-link");
    if (!a) {
      a = document.createElement("a"); a.id = "skip-link"; a.className = "skip-link"; a.href = "#main";
      a.addEventListener("click", function (e) {
        var m = document.querySelector("main"); if (!m) return;
        e.preventDefault(); if (!m.id) m.id = "main"; m.setAttribute("tabindex", "-1"); m.focus(); m.scrollIntoView();
      });
      document.body.insertBefore(a, document.body.firstChild);
    }
    a.textContent = t("common.skip");
  }
  style.textContent += ".skip-link{position:absolute;left:12px;top:-60px;z-index:10000;background:var(--admin-accent,#3b6ff0);color:#fff;padding:10px 16px;border-radius:8px;font:600 14px/1.2 system-ui,sans-serif;text-decoration:none}.skip-link:focus{top:10px;outline:3px solid #fff;outline-offset:2px}";
  ready(drawSkip);

  fetch("/api/admin/whoami", { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : (r.status === 403 ? r.json().then(function (b) { return { blocked: b }; }) : null); })
    .then(function (d) {
      if (d && d.blocked && (d.blocked.error === "ACCOUNT_LEFT" || d.blocked.error === "ACCESS_PAUSED")) {
        blocked = d.blocked; clearTimeout(failSafe); root.classList.remove("adm-nav-pending"); ready(showBlocked); return;
      }
      if (!d || !d.pages) { root.classList.remove("adm-nav-pending"); return; }
      info = d;
      window.GIQ_ADMIN = d;
      ready(function () { run(); showCovering(); drawAccount(); });
    })
    .catch(function () { root.classList.remove("adm-nav-pending"); });

  document.addEventListener("giq:lang", function () { if (blocked) showBlocked(); if (info) { applyPage(); drawCovering(); } drawAccount(); drawSkip(); if (document.getElementById("adm-idle")) tick(); });
})();
