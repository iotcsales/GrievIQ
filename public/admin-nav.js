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
    "adm.nav_menu": "Menu",
    "adm.nav_close": "Close",
    "adm.nav_g_daily": "Daily work",
    "adm.nav_g_data": "Areas & data",
    "adm.nav_g_people": "People & audit",
    "adm.nav_main": "Admin pages",
    "adm.nav_departments": "Departments",
    "adm.nav_ratings": "Ratings",
    "adm.nav_dept_perf": "Department performance",
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
    tidyGroups();
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
    tidyGroups();
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

  // ---- The menu, on every screen size (WCAG 2.2: 1.4.10 Reflow, 2.5.8 Target size) ----
  // The pages' own header markup lists every admin page in one row. Here it
  // is rebuilt into: Dashboard, three groups (Daily work / Areas & data /
  // People & audit) and Visitors. On a laptop (1024 px and wider) each group
  // opens a small list; on phones and tablets a single "Menu" button opens all
  // groups as large buttons. The links themselves are the page's own (moved,
  // not copied), so translations and the role rules above keep working.
  var GROUPS = [
    { id: "daily", key: "adm.nav_g_daily", pages: ["admin-cases", "admin-checks", "admin-exceptions", "admin-reviews", "admin-feedback", "admin-ratings", "admin-messages"] },
    { id: "data", key: "adm.nav_g_data", pages: ["admin-areas", "admin-departments", "admin-dept-performance", "admin-jurisdiction", "admin-import", "admin-import-wards", "admin-change-requests", "admin-issue-types"] },
    { id: "people", key: "adm.nav_g_people", pages: ["admin-staff", "admin-audit", "admin-retention", "admin-photos"] },
  ];
  var TOP = ["admin-dashboard"], TAIL = ["admin-visitors"];
  style.textContent +=
    "header.adm-nav2{display:flex!important;flex-direction:row!important;flex-wrap:wrap!important;align-items:center!important;justify-content:flex-start!important;gap:6px 14px!important;padding:10px 20px!important;position:relative}" +
    "header.adm-nav2 .brand{display:block;margin-right:6px;white-space:nowrap}header.adm-nav2 .brand .service-tag{display:block;font-size:12px;white-space:normal}" +
    "header.adm-nav2 .header-right{display:contents}" +
    "#adm-menu{display:flex;align-items:center;gap:2px;flex:1 1 auto;min-width:0}" +
    "#adm-menu a{margin:0!important;display:inline-flex;align-items:center;min-height:40px;padding:0 12px;border-radius:8px;text-decoration:none;white-space:nowrap}" +
    "#adm-menu a[aria-current=page],#adm-menu a.active{color:var(--admin-text,#fff);font-weight:600;background:rgba(127,127,127,.14)}" +
    ".adm-grp{position:relative}" +
    ".adm-grp>button{font:inherit;font-size:14px;min-height:40px;padding:0 12px;border-radius:8px;border:1px solid transparent;background:none;color:var(--admin-muted,#9aa4b2);cursor:pointer;white-space:nowrap}" +
    ".adm-grp>button::after{content:'';display:inline-block;margin-left:7px;border:4px solid transparent;border-top-color:currentColor;transform:translateY(2px)}" +
    ".adm-grp>button:hover,.adm-grp>button[aria-expanded=true],.adm-grp.has-active>button{color:var(--admin-text,#fff);background:rgba(127,127,127,.14)}" +
    ".adm-grp>button:focus-visible,#adm-menu a:focus-visible,#adm-menu-btn:focus-visible{outline:3px solid #FFDD00;outline-offset:1px}" +
    ".adm-drop{position:absolute;left:0;top:calc(100% + 6px);min-width:220px;z-index:50;display:none;flex-direction:column;gap:2px;padding:6px;border-radius:10px;border:1px solid var(--admin-border,#2c3543);background:var(--admin-panel,#1c222c);box-shadow:0 12px 28px rgba(0,0,0,.35)}" +
    "html.light-theme .adm-drop{background:#fff;box-shadow:0 12px 28px rgba(0,0,0,.12)}" +
    ".adm-grp>button[aria-expanded=true]+.adm-drop{display:flex}" +
    ".adm-drop a{width:100%;box-sizing:border-box;color:var(--admin-text,#e6e9ee)!important}" +
    ".adm-drop-h{display:none}" +
    "#adm-tools{display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap}" +
    "#adm-tools button{margin:0!important;min-height:36px}#adm-tools .adm-acct{margin-left:0}" +
    "#adm-menu-btn{display:none;margin-left:auto;font:inherit;font-size:14px;font-weight:600;min-height:44px;padding:0 14px;border-radius:10px;border:1px solid var(--admin-border,#2c3543);background:var(--admin-panel,#1c222c);color:var(--admin-text,#e6e9ee);cursor:pointer;align-items:center;gap:8px}" +
    "html.light-theme #adm-menu-btn{background:#eef0f3;color:#14181f}" +
    "#adm-menu-btn svg{width:18px;height:18px}" +
    // Phones and tablets: one Menu button; everything inside it.
    "@media (max-width:1023px){" +
      "header.adm-nav2{padding:8px 14px!important}" +
      "header.adm-nav2 .brand .service-tag{display:none}" +
      "#adm-menu-btn{display:inline-flex}" +
      "#adm-menu,#adm-tools{display:none;flex-basis:100%;width:100%}" +
      "header.adm-open #adm-menu{display:flex;flex-direction:column;align-items:stretch;gap:12px;padding:8px 0 4px}" +
      "header.adm-open #adm-tools{display:flex;gap:8px;padding:12px 0 6px;border-top:1px solid var(--admin-border,#2c3543);margin-left:0}" +
      "#adm-menu .adm-top{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}" +
      ".adm-grp>button{display:none}" +
      ".adm-drop{display:grid!important;position:static;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:0;border:0;background:none!important;box-shadow:none!important;min-width:0}" +
      ".adm-drop-h{display:block;grid-column:1/-1;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--admin-muted,#9aa4b2);margin:2px 0 0}" +
      "#adm-menu a{min-height:44px;background:rgba(127,127,127,.12);white-space:normal;line-height:1.25;padding:6px 12px}" +
      "#adm-menu a[aria-current=page],#adm-menu a.active{background:var(--admin-accent,#4c7cf0);color:#fff!important}" +
      "#adm-tools button{min-height:44px}#adm-tools .adm-acct{width:100%;justify-content:space-between;margin-top:0}" +
      "main{padding-left:14px!important;padding-right:14px!important}" +
    "}" +
    "@media (min-width:1024px){#adm-menu .adm-top{display:contents}}" +
    // Screen-reader-only text inside a scrolling table must not widen the page.
    ".table-wrap{position:relative}";
  function buildNav() {
    var header = document.querySelector("header");
    var nav = header && header.querySelector("nav");
    if (!header || !nav || document.getElementById("adm-menu")) return;
    addDepartmentsLink(nav);
    addRatingsLink(nav);
    addPerfLink(nav);
    var links = {};
    nav.querySelectorAll("a[href]").forEach(function (a) { var k = pageKey(a.getAttribute("href")); if (k) links[k] = a; if (a.classList.contains("active")) a.setAttribute("aria-current", "page"); });
    var tools = document.createElement("div"); tools.id = "adm-tools";
    nav.querySelectorAll("button").forEach(function (b) { tools.appendChild(b); });
    var menu = document.createElement("nav"); menu.id = "adm-menu";
    menu.setAttribute("aria-label", t("adm.nav_main"));
    var top = document.createElement("div"); top.className = "adm-top";
    TOP.forEach(function (k) { if (links[k]) top.appendChild(links[k]); });
    menu.appendChild(top);
    GROUPS.forEach(function (g) {
      var wrap = document.createElement("div"); wrap.className = "adm-grp"; wrap.dataset.grp = g.id;
      var btn = document.createElement("button"); btn.type = "button"; btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-controls", "adm-drop-" + g.id); btn.dataset.key = g.key; btn.textContent = t(g.key);
      var drop = document.createElement("div"); drop.className = "adm-drop"; drop.id = "adm-drop-" + g.id;
      var h = document.createElement("div"); h.className = "adm-drop-h"; h.dataset.key = g.key; h.textContent = t(g.key); h.setAttribute("aria-hidden", "true");
      drop.appendChild(h);
      g.pages.forEach(function (k) { if (links[k]) { drop.appendChild(links[k]); if (links[k].getAttribute("aria-current") === "page") wrap.classList.add("has-active"); } });
      wrap.appendChild(btn); wrap.appendChild(drop); menu.appendChild(wrap);
      btn.addEventListener("click", function () { var open = btn.getAttribute("aria-expanded") === "true"; closeDrops(); if (!open) btn.setAttribute("aria-expanded", "true"); });
    });
    var tail = document.createElement("div"); tail.className = "adm-top";
    TAIL.forEach(function (k) { if (links[k]) tail.appendChild(links[k]); });
    // Any page link not in a group (a future page) stays reachable.
    Object.keys(links).forEach(function (k) { if (!links[k].parentNode || links[k].parentNode === nav) tail.appendChild(links[k]); });
    menu.appendChild(tail);
    var mb = document.createElement("button"); mb.type = "button"; mb.id = "adm-menu-btn"; mb.setAttribute("aria-expanded", "false"); mb.setAttribute("aria-controls", "adm-menu");
    nav.parentNode.insertBefore(menu, nav);
    nav.parentNode.insertBefore(tools, nav);
    nav.remove();
    var brand = header.querySelector(".brand");
    if (brand && brand.nextSibling) header.insertBefore(mb, brand.nextSibling); else header.appendChild(mb);
    header.classList.add("adm-nav2");
    drawMenuBtn();
    mb.addEventListener("click", function () { var open = !header.classList.contains("adm-open"); header.classList.toggle("adm-open", open); drawMenuBtn(); });
    document.addEventListener("click", function (e) { if (!e.target.closest || !e.target.closest(".adm-grp")) closeDrops(); });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var openBtn = document.querySelector('.adm-grp>button[aria-expanded="true"]');
      if (openBtn) { closeDrops(); openBtn.focus(); }
      else if (header.classList.contains("adm-open")) { header.classList.remove("adm-open"); drawMenuBtn(); mb.focus(); }
    });
    menu.addEventListener("focusout", function (e) { var g = e.target.closest && e.target.closest(".adm-grp"); if (g && !g.contains(e.relatedTarget)) { var b = g.querySelector("button"); if (b) b.setAttribute("aria-expanded", "false"); } });
    tidyGroups();
  }
  // Departments (Oct 2026) is added here once, rather than in every page's
  // header markup: placed after Areas, with its own translation.
  function addDepartmentsLink(nav) {
    if (nav.querySelector('a[href*="admin-departments"]')) return;
    var a = document.createElement("a");
    a.href = "/admin-departments.html";
    a.setAttribute("data-i18n", "adm.nav_departments");
    a.textContent = t("adm.nav_departments");
    var areas = nav.querySelector('a[href*="admin-areas"]');
    if (areas && areas.nextSibling) nav.insertBefore(a, areas.nextSibling); else nav.appendChild(a);
    if (info) applyMenu();
  }
  // Department performance (grieviq-33), after Departments.
  function addPerfLink(nav) {
    if (nav.querySelector('a[href*="admin-dept-performance"]')) return;
    var a = document.createElement("a");
    a.href = "/admin-dept-performance.html";
    a.setAttribute("data-i18n", "adm.nav_dept_perf");
    a.textContent = t("adm.nav_dept_perf");
    var d = nav.querySelector('a[href*="admin-departments"]');
    if (d && d.nextSibling) nav.insertBefore(a, d.nextSibling); else nav.appendChild(a);
    if (info) applyMenu();
  }
  // Citizen ratings (grieviq-30): the Ratings page, after Feedback.
  function addRatingsLink(nav) {
    if (nav.querySelector('a[href*="admin-ratings"]')) return;
    var a = document.createElement("a");
    a.href = "/admin-ratings.html";
    a.setAttribute("data-i18n", "adm.nav_ratings");
    a.textContent = t("adm.nav_ratings");
    var fb = nav.querySelector('a[href*="admin-feedback"]');
    if (fb && fb.nextSibling) nav.insertBefore(a, fb.nextSibling); else nav.appendChild(a);
    if (info) applyMenu();
  }
  function closeDrops() { document.querySelectorAll('.adm-grp>button[aria-expanded="true"]').forEach(function (b) { b.setAttribute("aria-expanded", "false"); }); }
  function drawMenuBtn() {
    var mb = document.getElementById("adm-menu-btn"), header = document.querySelector("header");
    if (!mb) return;
    var open = header.classList.contains("adm-open");
    mb.setAttribute("aria-expanded", open ? "true" : "false");
    mb.innerHTML = (open ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>') + "<span></span>";
    mb.lastChild.textContent = t(open ? "adm.nav_close" : "adm.nav_menu");
  }
  // A group whose pages the role can't use disappears entirely.
  function tidyGroups() {
    document.querySelectorAll(".adm-grp").forEach(function (g) {
      var any = Array.prototype.some.call(g.querySelectorAll("a"), function (a) { return a.style.display !== "none" && !a.hidden; });
      g.style.display = any ? "" : "none";
    });
    document.querySelectorAll(".adm-grp>button, .adm-drop-h").forEach(function (el) { el.textContent = t(el.dataset.key); });
    var m = document.getElementById("adm-menu"); if (m) m.setAttribute("aria-label", t("adm.nav_main"));
    drawMenuBtn();
  }
  ready(buildNav);

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
      var tools = document.getElementById("adm-tools");
      var nav = document.querySelector("header nav");
      if (!tools && !nav) return;
      box = document.createElement("div"); box.id = "adm-acct"; box.className = "adm-acct";
      if (tools) tools.appendChild(box); else nav.parentNode.insertBefore(box, nav.nextSibling);
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

  document.addEventListener("giq:lang", function () { if (blocked) showBlocked(); if (info) { applyPage(); drawCovering(); } drawAccount(); drawSkip(); tidyGroups(); if (document.getElementById("adm-idle")) tick(); });
})();
