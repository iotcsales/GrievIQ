/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// public/admin-assisted.js   (grieviq-88) -- Assisted cases (pilot).
// Cases: forward to the councillor's office and the department, record
// follow-ups and replies, ask the citizen to confirm a fix.
// Pilots and wards: the super admin starts a pilot, chooses its wards and
// records each office's official email; staff hand cases over when an
// office joins and make the office's private area-report link.
(function () {
  "use strict";
  var app = document.getElementById("as-app"), msg = document.getElementById("as-msg");
  var data = null, tab = "cases", filter = "work", openId = null, detail = null, detailFor = null, areaWards = null, lastLink = null;
  function T(k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; }
  function hi() { return window.GIQ && window.GIQ.lang === "hi"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function when(s) { if (!s) return ""; var d = new Date(s.length === 10 ? s + "T00:00:00+05:30" : s); return isNaN(d) ? s : d.toLocaleString(hi() ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric", hour: s.length === 10 ? undefined : "numeric", minute: s.length === 10 ? undefined : "2-digit", timeZone: "Asia/Kolkata" }); }
  function day(s) { if (!s) return ""; var d = new Date(s.length === 10 ? s + "T00:00:00+05:30" : s); return isNaN(d) ? s : d.toLocaleDateString(hi() ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); }
  function say(text, kind) { msg.className = "hl-msg st-msg " + (kind || ""); msg.textContent = text || ""; if (text) msg.focus(); }
  function api(method, body, q) {
    return fetch("/api/admin/assisted" + (q || ""), { method: method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); });
  }
  function dept(k) { return window.GIQ && GIQ.dept ? GIQ.dept(k) : k; }
  var ID = 0; function uid(p) { ID++; return p + ID; }

  function load(keepOpen) {
    return api("GET").then(function (x) {
      if (!x.ok) { app.innerHTML = '<p class="st-warn" role="alert">' + esc(x.j.error || T("as.e_load")) + "</p>"; return; }
      data = x.j;
      if (!keepOpen) { openId = null; detail = null; }
      render();
      if (keepOpen && openId) openCase(openId, true);
    }).catch(function () { app.innerHTML = '<p class="st-warn" role="alert">' + esc(T("as.e_load")) + "</p>"; });
  }

  var STATE_KEYS = ["NEW", "REPLY", "DUE", "JOINED", "WAITING", "DONE", "HANDED"];
  function render() {
    if (!data) return;
    var s = data.stats, perms = data.perms;
    var live = data.pilots.filter(function (p) { return p.state === "OPEN"; });
    var capText = live.length ? live.map(function (p) { return p.today + " / " + p.dailyCap; }).join(", ") : "—";
    var h = '<div class="as-tiles">' +
      tile(s.open, T("as.t_open")) + tile(capText, T("as.t_today")) + tile(s.due, T("as.t_due")) +
      tile(s.avgMinutes == null ? "—" : T("as.min", { n: s.avgMinutes }), T("as.t_avg", { n: s.casesTimed })) + "</div>";
    h += '<div class="ac-tabs" role="tablist" aria-label="' + esc(T("adm.nav_assisted")) + '">' +
      tabBtn("cases", T("as.tab_cases")) + tabBtn("pilots", T("as.tab_pilots")) + "</div>";
    h += '<div id="as-panel" role="tabpanel" tabindex="-1" aria-labelledby="as-tab-' + tab + '">' + (tab === "cases" ? casesHtml() : pilotsHtml(perms)) + "</div>";
    app.innerHTML = h;
    wire();
  }
  function tile(v, l) { return '<div class="as-tile"><div class="v">' + esc(v) + '</div><div class="l">' + esc(l) + "</div></div>"; }
  function tabBtn(id, label) { return '<button type="button" role="tab" id="as-tab-' + id + '" aria-selected="' + (tab === id) + '" data-tab="' + id + '">' + esc(label) + "</button>"; }

  // ---- Cases ----
  var FILTERS = { work: ["NEW", "REPLY", "DUE", "JOINED"], waiting: ["WAITING"], all: null, closed: ["DONE", "HANDED"] };
  function casesHtml() {
    var list = data.cases.filter(function (c) {
      var f = FILTERS[filter];
      if (c.id === openId) return true;   // the case being worked on stays open after its state changes
      if (f) return f.indexOf(c.state) !== -1;
      return c.state !== "DONE" && c.state !== "HANDED";
    });
    var h = '<div class="as-filter" role="group" aria-label="' + esc(T("as.show")) + '">' +
      ["work", "waiting", "all", "closed"].map(function (f) {
        var n = data.cases.filter(function (c) { var x = FILTERS[f]; return x ? x.indexOf(c.state) !== -1 : (c.state !== "DONE" && c.state !== "HANDED"); }).length;
        return '<button type="button" data-filter="' + f + '" aria-pressed="' + (filter === f) + '">' + esc(T("as.f_" + f)) + " (" + n + ")</button>";
      }).join("") + "</div>";
    if (!list.length) return h + '<p class="muted">' + esc(T(filter === "work" ? "as.none_work" : "as.none")) + "</p>";
    return h + list.map(caseCard).join("");
  }
  function caseCard(c) {
    var last = c.last ? stepLine(c.last) : T("as.not_forwarded");
    var h = '<article class="as-case st-' + esc(c.state) + '" aria-labelledby="as-c-' + esc(c.id) + '">' +
      '<h3 id="as-c-' + esc(c.id) + '"><span class="as-ref">' + esc(c.ref) + "</span>" +
      (c.priority ? '<span class="as-tag hot">' + esc(T("as.priority")) + "</span>" : "") +
      '<span class="as-tag' + (["NEW", "REPLY", "DUE", "JOINED"].indexOf(c.state) !== -1 ? " hot" : "") + '">' + esc(T("as.s_" + c.state)) + "</span></h3>" +
      '<p class="as-meta">' + esc(GIQ.category ? GIQ.category(c.categoryId, c.category) : c.category) + " · " + esc(c.ward) + " · " + esc(T("as.filed", { d: when(c.createdAt) })) + "</p>" +
      '<p class="as-meta">' + esc(last) + (c.nextFollowUp && c.state !== "DONE" ? " · " + esc(T("as.next_fu", { d: day(c.nextFollowUp) })) : "") +
      (c.minutes ? " · " + esc(T("as.min_spent", { n: c.minutes })) : "") + "</p>" +
      '<div class="as-open"><button type="button" data-open="' + esc(c.id) + '" aria-expanded="' + (openId === c.id) + '">' + esc(T(openId === c.id ? "as.close" : "as.open")) + "</button></div>" +
      (openId === c.id ? '<div class="as-detail" id="as-d-' + esc(c.id) + '">' + (detail ? detailHtml() : '<p class="muted">' + esc(T("adm.it_loading")) + "</p>") + "</div>" : "") +
      "</article>";
    return h;
  }
  function stepLine(s) {
    var to = GIQ.officeName ? GIQ.officeName(s.targetName) : (s.targetName || "");
    if (s.kind === "FORWARD") return T("as.l_forward", { to: to });
    if (s.kind === "FOLLOWUP") return T("as.l_followup", { to: to });
    if (s.kind === "REPLY") return T("as.l_reply", { to: to, kind: T("as.rk_" + s.replyKind) });
    if (s.kind === "HANDOVER") return T("as.l_handover");
    return T("as.l_note");
  }

  function openCase(id, quiet) {
    openId = id; detail = null; detailFor = id;
    render();
    return api("GET", null, "?case=" + encodeURIComponent(id)).then(function (x) {
      if (detailFor !== id) return;
      if (!x.ok) { detail = { error: x.j.error || T("as.e_load") }; } else detail = x.j;
      render();
      if (!quiet) { var d = document.getElementById("as-d-" + id); if (d) { d.setAttribute("tabindex", "-1"); d.focus(); } }
    });
  }

  function detailHtml() {
    if (detail.error) return '<p class="st-warn" role="alert">' + esc(detail.error) + "</p>";
    var c = detail.case, can = detail.perms.work && !c.handedAt && (c.status === "OPEN" || c.status === "ACKNOWLEDGED");
    var h = '<h4 class="sub-h">' + esc(T("as.d_what")) + '</h4><div class="mu-text">' + esc(c.description) + "</div>" +
      (c.locationDetail ? '<p class="as-meta"><b>' + esc(T("as.d_place")) + "</b> " + esc(c.locationDetail) + "</p>" : "") +
      (c.pin ? '<p class="as-meta"><b>' + esc(T("as.d_pin")) + "</b> " + esc(c.pin.lat.toFixed(5) + ", " + c.pin.lng.toFixed(5)) + "</p>" : "") +
      (c.priority ? '<p class="hl-flag">' + esc(T("as.d_priority", { kind: T("ct.pk_" + c.priority) })) + "</p>" : "") +
      (c.photos && c.photos.length ? '<div class="as-photos">' + c.photos.filter(function (p) { return p.url && !p.removed; }).map(function (p, i) {
        return '<a href="' + esc(p.url) + '" target="_blank" rel="noopener"><img src="' + esc(p.thumbUrl || p.url) + '" alt="' + esc(T("as.d_photo", { n: i + 1 })) + '"></a>'; }).join("") + "</div>" : "") +
      '<p class="as-meta">' + esc(T(c.hasEmail ? "as.d_has_email" : "as.d_no_email")) + "</p>";
    h += '<h4 class="sub-h">' + esc(T("as.d_hist")) + "</h4>";
    var items = c.steps.map(function (s) {
      return "<li><b>" + esc(when(s.at)) + ":</b> " + esc(stepLine(s)) +
        (s.channel ? " (" + esc(T("as.ch_" + s.channel)) + ")" : "") +
        (s.expectedBy ? " · " + esc(T("as.expected", { d: day(s.expectedBy) })) : "") +
        (s.text ? "<q>" + esc(s.text) + "</q>" : "") +
        '<span class="who">' + esc(s.by ? T("as.by", { who: s.by }) : (s.repliedBy ? T("as.by_link", { who: s.repliedBy }) : "")) + (s.minutes ? " · " + esc(T("as.min_spent", { n: s.minutes })) : "") + "</span></li>";
    });
    (c.deptSteps || []).filter(function (s) { return s.kind !== "FORWARDED"; }).forEach(function (s) {
      items.push("<li><b>" + esc(when(s.at)) + ":</b> " + esc(T("as.dept_step", { dept: dept(s.department || ""), kind: T("as.ds_" + s.kind) })) + (s.note ? "<q>" + esc(s.note) + "</q>" : "") + "</li>");
    });
    h += items.length ? '<ul class="as-hist">' + items.join("") + "</ul>" : '<p class="muted">' + esc(T("as.d_nohist")) + "</p>";
    if (c.links && c.links.length) {
      h += '<p class="as-meta">' + c.links.map(function (l) { return esc(T("as.d_link", { to: GIQ.officeName(l.targetName), n: l.replies, d: day(l.expiresAt) })) + (l.revoked ? " " + esc(T("as.d_link_off")) : ""); }).join("<br>") + "</p>";
    }
    if (c.officeJoined && !c.handedAt) h += '<p class="ac-warn">' + esc(T("as.d_joined")) + "</p>";
    if (!can) return h;
    h += forwardForm(c) + followForm(c) + replyForm(c) + fixedForm(c) + noteForm(c);
    return h;
  }

  function sel(id, label, opts, hint, req) {
    return '<div class="fld"><label for="' + id + '">' + esc(label) + (req ? ' <span class="req" aria-hidden="true">*</span>' : "") + "</label>" + (hint ? '<span class="hint" id="' + id + '-h">' + esc(hint) + "</span>" : "") +
      '<select id="' + id + '"' + (hint ? ' aria-describedby="' + id + '-h"' : "") + (req ? ' aria-required="true"' : "") + ">" +
      opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[2] ? " disabled" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></div>";
  }
  function inp(id, label, type, hint, req, extra) {
    return '<div class="fld' + (type === "textarea" ? " wide" : "") + '"><label for="' + id + '">' + esc(label) + (req ? ' <span class="req" aria-hidden="true">*</span>' : "") + "</label>" + (hint ? '<span class="hint" id="' + id + '-h">' + esc(hint) + "</span>" : "") +
      (type === "textarea" ? '<textarea id="' + id + '"' + (hint ? ' aria-describedby="' + id + '-h"' : "") + (req ? ' aria-required="true"' : "") + ' maxlength="1000"></textarea>'
        : '<input id="' + id + '" type="' + type + '"' + (hint ? ' aria-describedby="' + id + '-h"' : "") + (req ? ' aria-required="true"' : "") + (extra || "") + ">") + "</div>";
  }
  function minutesField(id) { return inp(id, T("as.minutes"), "number", T("as.minutes_h"), false, ' min="0" max="240" inputmode="numeric"'); }
  var RECORD = ["LETTER", "CALL", "VISIT"];
  function targetOpts() { return [["OFFICE", T("as.tg_OFFICE")], ["DEPT", T("as.tg_DEPT")]]; }

  function forwardForm(c) {
    var forwarded = c.steps.some(function (s) { return s.kind === "FORWARD"; });
    var depts = (detail.activeDepartments || []).map(function (k) { return [k, dept(k)]; });
    var offOpts = [["EMAIL", T("as.ch_EMAIL_LINK") + (c.officeEmail ? "" : " — " + T("as.no_office_email")), !c.officeEmail]].concat(RECORD.map(function (k) { return [k, T("as.ch_" + k)]; }));
    return '<details class="as-form"' + (forwarded ? "" : " open") + "><summary>" + esc(T(forwarded ? "as.fw_again" : "as.fw")) + "</summary>" +
      '<form data-form="forward" novalidate>' +
      '<fieldset class="as-target"><legend><label class="chk" style="display:inline-grid"><input type="checkbox" id="fw-o" checked> <span>' + esc(T("as.fw_office", { ward: c.ward })) + "</span></label></legend>" +
      '<div class="grid">' + sel("fw-o-ch", T("as.how"), offOpts, c.officeEmail ? T("as.fw_office_h", { email: c.officeEmail }) : T("as.fw_office_none")) + "</div></fieldset>" +
      '<fieldset class="as-target"><legend><label class="chk" style="display:inline-grid"><input type="checkbox" id="fw-d"> <span>' + esc(T("as.fw_dept")) + "</span></label></legend>" +
      '<div class="grid">' + sel("fw-d-k", T("as.dept"), [["", T("as.choose")]].concat(depts)) + sel("fw-d-o", T("as.dept_office"), [["", T("as.choose_dept_first")]], T("as.dept_office_h")) +
      sel("fw-d-ch", T("as.how"), [["", T("as.choose_office_first")]].concat(RECORD.map(function (k) { return [k, T("as.ch_" + k)]; }))) + "</div></fieldset>" +
      '<div class="grid">' + minutesField("fw-min") + "</div>" +
      '<p class="hint">' + esc(T("as.fw_note")) + "</p>" +
      '<div class="acts"><button type="submit" class="primary">' + esc(T("as.fw_go")) + "</button></div></form></details>";
  }
  function followForm(c) {
    if (!c.steps.some(function (s) { return s.kind === "FORWARD"; })) return "";
    return '<details class="as-form"' + (c.state === "DUE" ? " open" : "") + "><summary>" + esc(T("as.fu")) + (c.nextFollowUp ? " · " + esc(T("as.next_fu", { d: day(c.nextFollowUp) })) : "") + "</summary>" +
      '<form data-form="followup" novalidate><div class="grid">' + sel("fu-t", T("as.who"), targetOpts(), null, true) +
      sel("fu-ch", T("as.how"), ["CALL", "VISIT", "LETTER", "EMAIL"].map(function (k) { return [k, T("as.ch_" + k)]; }), null, true) +
      inp("fu-text", T("as.fu_text"), "textarea", T("as.fu_text_h")) + minutesField("fu-min") + "</div>" +
      '<div class="acts"><button type="submit" class="primary">' + esc(T("as.fu_go")) + "</button></div></form></details>";
  }
  function replyForm(c) {
    return '<details class="as-form"><summary>' + esc(T("as.rp")) + "</summary>" +
      '<form data-form="reply" novalidate><div class="grid">' + sel("rp-t", T("as.who"), targetOpts(), null, true) +
      inp("rp-name", T("as.rp_name"), "text", T("as.rp_name_h"), false, ' maxlength="120"') +
      sel("rp-k", T("as.rp_kind"), [["", T("as.choose")]].concat(["PLANNED", "IN_PROGRESS", "DONE", "NOT_OURS", "CANT_DO", "OTHER"].map(function (k) { return [k, T("as.rk_" + k)]; })), null, true) +
      sel("rp-ch", T("as.rp_how"), ["CALL", "VISIT", "LETTER", "EMAIL"].map(function (k) { return [k, T("as.ch_" + k)]; }), null, true) +
      inp("rp-text", T("as.rp_text"), "textarea", T("as.rp_text_h"), true) + inp("rp-date", T("as.rp_date"), "date", T("as.rp_date_h")) + minutesField("rp-min") + "</div>" +
      '<div class="acts"><button type="submit" class="primary">' + esc(T("as.rp_go")) + "</button></div></form></details>";
  }
  function fixedForm(c) {
    if (!c.steps.some(function (s) { return s.kind === "FORWARD"; })) return "";
    return '<details class="as-form"><summary>' + esc(T("as.fx")) + "</summary>" +
      '<form data-form="ask_confirm" novalidate><p class="hint">' + esc(T(c.hasEmail ? "as.fx_h" : "as.fx_h_noemail")) + '</p><div class="grid">' +
      inp("fx-text", T("as.fx_text"), "textarea", T("as.fx_text_h"), true) + minutesField("fx-min") + "</div>" +
      '<div class="acts"><button type="submit" class="primary">' + esc(T("as.fx_go")) + "</button></div></form></details>";
  }
  function noteForm() {
    return '<details class="as-form"><summary>' + esc(T("as.nt")) + "</summary>" +
      '<form data-form="note" novalidate><div class="grid">' + inp("nt-text", T("as.nt_text"), "textarea", T("as.nt_text_h"), true) + minutesField("nt-min") + "</div>" +
      '<div class="acts"><button type="submit" class="primary">' + esc(T("as.nt_go")) + "</button></div></form></details>";
  }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ""; }
  function deptOfficeUpdate() {
    var k = val("fw-d-k"), oSel = document.getElementById("fw-d-o"), chSel = document.getElementById("fw-d-ch");
    if (!oSel) return;
    var offices = (detail.offices || []).filter(function (o) { return k && o.departments.indexOf(k) !== -1; });
    oSel.innerHTML = '<option value="">' + esc(T(k ? (offices.length ? "as.none_office" : "as.no_offices") : "as.choose_dept_first")) + "</option>" +
      offices.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.name) + (o.dashboard ? " · " + esc(T("as.uses_giq")) : "") + "</option>"; }).join("");
    if (k) document.getElementById("fw-d").checked = true;
    chUpdate();
  }
  function chUpdate() {
    var chSel = document.getElementById("fw-d-ch"); if (!chSel) return;
    var o = (detail.offices || []).find(function (x) { return x.id === val("fw-d-o"); });
    var opts = [];
    if (o && o.dashboard) opts.push(["DASHBOARD", T("as.ch_DASHBOARD")]);
    if (o && o.hasEmail) opts.push(["EMAIL", T("as.ch_EMAIL_LINK")]);
    opts = opts.concat(RECORD.map(function (k) { return [k, T("as.ch_" + k)]; }));
    chSel.innerHTML = opts.map(function (x) { return '<option value="' + x[0] + '">' + esc(x[1]) + "</option>"; }).join("");
  }

  var FIELD_MAP = { minutes: ["fw-min", "fu-min", "rp-min", "fx-min", "nt-min"], text: ["fu-text", "rp-text", "fx-text", "nt-text"], replyKind: ["rp-k"], expectedBy: ["rp-date"],
    officeChannel: ["fw-o-ch"], department: ["fw-d-k"], deptOffice: ["fw-d-o"], deptChannel: ["fw-d-ch"], target: ["fw-o", "fu-t", "rp-t"], channel: ["fu-ch", "rp-ch"] };
  function showFields(form, fields) {
    form.querySelectorAll("[aria-invalid]").forEach(function (e) { e.removeAttribute("aria-invalid"); });
    form.querySelectorAll(".ferr").forEach(function (e) { e.remove(); });
    var first = null;
    Object.keys(fields || {}).forEach(function (f) {
      (FIELD_MAP[f] || []).forEach(function (id) {
        var e = form.querySelector("#" + id); if (!e) return;
        e.setAttribute("aria-invalid", "true");
        var m = document.createElement("span"); m.className = "ferr"; m.id = id + "-err"; m.textContent = T("as.e_" + f + "_" + fields[f]) !== "as.e_" + f + "_" + fields[f] ? T("as.e_" + f + "_" + fields[f]) : T("as.e_" + f);
        e.setAttribute("aria-describedby", ((e.getAttribute("aria-describedby") || "").replace(/\S+-err/g, "") + " " + m.id).trim());
        // A tick box in a group's heading: the message goes under the heading.
        var lg = e.type === "checkbox" && e.closest("legend");
        if (lg) { m.style.display = "block"; m.style.margin = "4px 0 8px"; lg.parentNode.insertBefore(m, lg.nextSibling); } else e.parentNode.appendChild(m);
        if (!first) first = e;
      });
    });
    if (first) first.focus();
  }
  function submitCase(form) {
    var kind = form.getAttribute("data-form"), c = detail.case, body = { action: kind, id: c.id };
    if (kind === "forward") {
      body.minutes = val("fw-min");
      if (document.getElementById("fw-o").checked) body.office = { channel: val("fw-o-ch") };
      if (document.getElementById("fw-d").checked) body.dept = { department: val("fw-d-k"), officeId: val("fw-d-o") || null, channel: val("fw-d-ch") };
    } else if (kind === "followup") { body.target = val("fu-t"); body.channel = val("fu-ch"); body.text = val("fu-text"); body.minutes = val("fu-min"); }
    else if (kind === "reply") { body.target = val("rp-t"); body.targetName = val("rp-name"); body.replyKind = val("rp-k"); body.channel = val("rp-ch"); body.text = val("rp-text"); body.expectedBy = val("rp-date") || null; body.minutes = val("rp-min"); }
    else if (kind === "ask_confirm") { body.text = val("fx-text"); body.minutes = val("fx-min"); }
    else if (kind === "note") { body.text = val("nt-text"); body.minutes = val("nt-min"); }
    var btn = form.querySelector("button[type=submit]"); btn.disabled = true;
    api("POST", body).then(function (x) {
      btn.disabled = false;
      if (!x.ok) { say(x.j.error || T("as.e_save"), "error"); if (x.j.fields) showFields(form, x.j.fields); return; }
      say(T("as.ok_" + kind, { to: (x.j.sentTo || []).join(", ") }), "success");
      load(true);
    }).catch(function () { btn.disabled = false; say(T("as.e_save"), "error"); });
  }

  // ---- Pilots and wards ----
  function pilotsHtml(perms) {
    var h = "";
    if (perms.manage) h += '<details class="as-form"' + (data.pilots.length ? "" : " open") + "><summary>" + esc(T("as.p_new")) + "</summary>" + pilotForm(null) + "</details>";
    if (!data.pilots.length) return h + '<p class="muted">' + esc(T("as.p_none")) + "</p>";
    data.pilots.forEach(function (p) {
      h += '<section class="as-pilot" aria-labelledby="as-p-' + esc(p.id) + '"><h3 id="as-p-' + esc(p.id) + '">' + esc(p.name) + ' <span class="as-tag">' + esc(T("as.ps_" + p.state)) + "</span></h3>" +
        '<p class="as-meta">' + esc(T("as.p_dates", { from: day(p.startsOn), to: day(p.endsOn) })) + " · " + esc(T("as.p_cap", { n: p.dailyCap })) +
        (p.state === "OPEN" ? " · " + esc(T("as.p_today", { n: p.today, cap: p.dailyCap })) : "") + " · " + esc(T("as.p_filed", { n: p.filed })) + "</p>" +
        '<p class="hint">' + esc(T("as.p_after")) + "</p>";
      if (perms.manage && p.state !== "STOPPED") {
        h += '<div class="acts"><button type="button" data-stop="' + esc(p.id) + '" class="danger">' + esc(T("as.p_stop")) + "</button></div>" +
          '<details class="as-form"><summary>' + esc(T("as.p_edit")) + "</summary>" + pilotForm(p) + "</details>" +
          '<details class="as-form" data-addwards="' + esc(p.id) + '"><summary>' + esc(T("as.w_add")) + "</summary>" + addWardsHtml(p) + "</details>";
      }
      h += '<div class="ac-table-wrap"><table class="ac-t as-wards"><caption class="vh">' + esc(T("as.w_cap", { name: p.name })) + "</caption><thead><tr>" +
        '<th scope="col">' + esc(T("as.w_ward")) + '</th><th scope="col">' + esc(T("as.w_email")) + '</th><th scope="col">' + esc(T("as.w_cases")) + '</th><th scope="col">' + esc(T("as.w_report")) + "</th></tr></thead><tbody>" +
        (p.wards.length ? p.wards.map(function (w) { return wardRow(p, w, perms); }).join("") : '<tr><td colspan="4" class="muted">' + esc(T("as.w_none")) + "</td></tr>") + "</tbody></table></div>";
      h += "</section>";
    });
    return h;
  }
  function pilotForm(p) {
    var k = p ? p.id : "new";
    return '<form data-pilot="' + esc(k) + '" novalidate><div class="grid">' +
      inp("pf-name-" + k, T("as.pf_name"), "text", T("as.pf_name_h"), true, ' maxlength="80" value="' + esc(p ? p.name : "") + '"') +
      inp("pf-start-" + k, T("as.pf_start"), "date", T("as.pf_start_h"), true, ' value="' + esc(p ? p.startsOn : "") + '"') +
      inp("pf-end-" + k, T("as.pf_end"), "date", T("as.pf_end_h"), true, ' value="' + esc(p ? p.endsOn : "") + '"') +
      inp("pf-cap-" + k, T("as.pf_cap"), "number", T("as.pf_cap_h"), true, ' min="1" max="200" inputmode="numeric" value="' + esc(p ? p.dailyCap : "") + '"') +
      '</div><div class="acts"><button type="submit" class="primary">' + esc(T(p ? "as.pf_save" : "as.pf_start_go")) + "</button></div></form>";
  }
  function addWardsHtml(p) {
    var areas = data.areas || [];
    return '<div class="grid">' + sel("aw-area-" + p.id, T("as.aw_area"), [["", T("as.choose")]].concat(areas.map(function (a) { return [a.id, a.name + (a.state ? ", " + a.state : "")]; }))) + "</div>" +
      '<div id="aw-list-' + esc(p.id) + '" aria-live="polite"></div>';
  }
  function wardListHtml(p) {
    if (!areaWards) return "";
    var rows = areaWards.wards;
    if (!rows.length) return '<p class="muted">' + esc(T("as.aw_none")) + "</p>";
    return '<fieldset class="rad"><legend>' + esc(T("as.aw_pick")) + '</legend><div class="as-wardlist">' + rows.map(function (w, i) {
      var id = "aw-" + p.id + "-" + i;
      return '<div class="chk"><input type="checkbox" id="' + id + '" value="' + esc(w.id) + '"' + (w.can ? "" : " disabled") + '><label for="' + id + '">' + esc(w.name) +
        (w.why ? ' <span class="why">(' + esc(T("as.aw_why_" + w.why)) + ")</span>" : "") + "</label></div>";
    }).join("") + '</div></fieldset><div class="acts"><button type="button" class="primary" data-addgo="' + esc(p.id) + '">' + esc(T("as.aw_go")) + "</button></div>";
  }
  function wardRow(p, w, perms) {
    var em = w.officeEmail ? esc(w.officeEmail) + '<span class="sub">' + esc(T("as.w_source", { s: w.emailSource || "" })) + "</span>" : '<span class="dept-none">' + esc(T("as.w_no_email")) + "</span>";
    var emailEdit = perms.manage && p.state !== "STOPPED" ? '<details class="as-form"><summary>' + esc(T(w.officeEmail ? "as.w_email_change" : "as.w_email_add")) + "</summary>" +
      '<form data-wemail="' + esc(w.row) + '" novalidate><div class="grid">' + inp("we-" + w.row, T("as.w_email_l"), "email", T("as.w_email_h"), false, ' maxlength="120" value="' + esc(w.officeEmail || "") + '"') +
      inp("ws-" + w.row, T("as.w_source_l"), "text", T("as.w_source_h"), false, ' maxlength="200" value="' + esc(w.emailSource || "") + '"') +
      '</div><div class="acts"><button type="submit" class="primary">' + esc(T("as.save")) + '</button></div></form></details>' +
      '<div class="acts"><button type="button" class="danger" data-wremove="' + esc(w.row) + '">' + esc(T("as.w_remove")) + "</button></div>" : "";
    var cases = esc(T("as.w_open", { n: w.openCases })) + (w.joined ? '<br><b>' + esc(T("as.w_joined")) + "</b>" + (perms.work && w.openCases ? '<div class="acts"><button type="button" class="primary" data-handover="' + esc(w.unitId) + '">' + esc(T("as.w_handover", { n: w.openCases })) + "</button></div>" : "") : "");
    var live = (w.reports || []).filter(function (r) { return r.live; });
    var rep = (live.length ? '<span class="sub">' + esc(T("as.r_live", { n: live.length, d: day(live[0].expiresAt) })) + "</span>" : "") +
      (perms.work ? '<div class="acts"><button type="button" data-replink="' + esc(w.unitId) + '">' + esc(T("as.r_make")) + "</button>" +
        (w.officeEmail ? '<button type="button" data-repsend="' + esc(w.unitId) + '">' + esc(T("as.r_send")) + "</button>" : "") + "</div>" : "") +
      (perms.work ? live.map(function (r) { return '<div class="acts"><button type="button" class="link-btn" data-represoke="' + esc(r.id) + '">' + esc(T("as.r_revoke", { d: day(r.at) })) + "</button></div>"; }).join("") : "") +
      (lastLink && lastLink.unitId === w.unitId ? '<div class="as-link"><label class="vh" for="rl-' + esc(w.row) + '">' + esc(T("as.r_link")) + '</label><input id="rl-' + esc(w.row) + '" readonly value="' + esc(lastLink.link) + '">' +
        '<button type="button" data-copy="rl-' + esc(w.row) + '">' + esc(T("as.copy")) + '</button><a class="btnlink" target="_blank" rel="noopener" href="' + esc(lastLink.link) + '">' + esc(T("as.r_open")) + "</a></div>" : "");
    return '<tr><th scope="row">' + esc(w.name) + (w.area ? '<span class="sub">' + esc(w.area) + "</span>" : "") + "</th><td>" + em + emailEdit + "</td><td>" + cases + "</td><td>" + rep + "</td></tr>";
  }

  function wire() {
    app.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { tab = b.getAttribute("data-tab"); render(); document.getElementById("as-tab-" + tab).focus(); }); });
    app.querySelectorAll("[data-filter]").forEach(function (b) { b.addEventListener("click", function () { filter = b.getAttribute("data-filter"); openId = null; render(); app.querySelector('[data-filter="' + filter + '"]').focus(); }); });
    app.querySelectorAll("[data-open]").forEach(function (b) { b.addEventListener("click", function () {
      var id = b.getAttribute("data-open");
      if (openId === id) { openId = null; detail = null; render(); var x = app.querySelector('[data-open="' + id + '"]'); if (x) x.focus(); } else openCase(id);
    }); });
    app.querySelectorAll("form[data-form]").forEach(function (f) { f.addEventListener("submit", function (e) { e.preventDefault(); submitCase(f); }); });
    var dk = document.getElementById("fw-d-k"); if (dk) dk.addEventListener("change", deptOfficeUpdate);
    var dofc = document.getElementById("fw-d-o"); if (dofc) dofc.addEventListener("change", chUpdate);
    app.querySelectorAll("form[data-pilot]").forEach(function (f) { f.addEventListener("submit", function (e) {
      e.preventDefault();
      var k = f.getAttribute("data-pilot");
      var body = { action: "pilot_save", id: k === "new" ? null : k, name: val("pf-name-" + k), startsOn: val("pf-start-" + k), endsOn: val("pf-end-" + k), dailyCap: Number(val("pf-cap-" + k)) };
      api("POST", body).then(function (x) {
        if (!x.ok) {
          say(x.j.error || T("as.e_save"), "error");
          f.querySelectorAll("[aria-invalid]").forEach(function (e2) { e2.removeAttribute("aria-invalid"); }); f.querySelectorAll(".ferr").forEach(function (e2) { e2.remove(); });
          var map = { name: "pf-name-", startsOn: "pf-start-", endsOn: "pf-end-", dailyCap: "pf-cap-" }, first = null;
          Object.keys(x.j.fields || {}).forEach(function (fk) { var el = document.getElementById(map[fk] + k); if (!el) return; el.setAttribute("aria-invalid", "true");
            var m = document.createElement("span"); m.className = "ferr"; m.id = map[fk] + k + "-err"; m.textContent = T("as.e_p_" + fk + "_" + x.j.fields[fk]); el.setAttribute("aria-describedby", (map[fk] + k + "-h " + m.id)); el.parentNode.appendChild(m); if (!first) first = el; });
          if (first) first.focus();
          return;
        }
        say(T(k === "new" ? "as.ok_pilot" : "as.ok_pilot_saved"), "success"); tab = "pilots"; load();
      });
    }); });
    app.querySelectorAll("[data-stop]").forEach(function (b) { b.addEventListener("click", function () {
      if (b.getAttribute("data-sure") !== "1") { b.setAttribute("data-sure", "1"); b.textContent = T("as.p_stop_sure"); return; }
      api("POST", { action: "pilot_stop", id: b.getAttribute("data-stop") }).then(function (x) { say(x.ok ? T("as.ok_stopped") : (x.j.error || T("as.e_save")), x.ok ? "success" : "error"); load(); });
    }); });
    app.querySelectorAll("[id^=aw-area-]").forEach(function (s) { s.addEventListener("change", function () {
      var pid = s.id.replace("aw-area-", ""), box = document.getElementById("aw-list-" + pid);
      areaWards = null; box.innerHTML = s.value ? '<p class="muted">' + esc(T("adm.it_loading")) + "</p>" : "";
      if (!s.value) return;
      api("GET", null, "?wards=" + encodeURIComponent(s.value)).then(function (x) {
        areaWards = x.ok ? x.j : { wards: [] };
        var p = data.pilots.find(function (y) { return y.id === pid; });
        box.innerHTML = wardListHtml(p);
        var go = box.querySelector("[data-addgo]");
        if (go) go.addEventListener("click", function () {
          var ids = Array.prototype.map.call(box.querySelectorAll("input[type=checkbox]:checked"), function (c) { return c.value; });
          if (!ids.length) { say(T("as.e_unitIds"), "error"); return; }
          api("POST", { action: "ward_add", pilotId: pid, unitIds: ids }).then(function (r) {
            if (!r.ok) { say(r.j.error || T("as.e_save"), "error"); return; }
            say(T("as.ok_wards", { n: r.j.added.length }) + (r.j.refused.length ? " " + T("as.ok_wards_refused", { n: r.j.refused.length }) : ""), "success"); tab = "pilots"; load();
          });
        });
      });
    }); });
    app.querySelectorAll("form[data-wemail]").forEach(function (f) { f.addEventListener("submit", function (e) {
      e.preventDefault(); var r = f.getAttribute("data-wemail");
      api("POST", { action: "ward_email", wardRow: r, officeEmail: val("we-" + r), emailSource: val("ws-" + r) }).then(function (x) {
        if (!x.ok) { say(x.j.error || T("as.e_save"), "error");
          f.querySelectorAll(".ferr").forEach(function (e2) { e2.remove(); });
          Object.keys(x.j.fields || {}).forEach(function (fk) { var el = document.getElementById((fk === "officeEmail" ? "we-" : "ws-") + r); if (!el) return; el.setAttribute("aria-invalid", "true");
            var m = document.createElement("span"); m.className = "ferr"; m.textContent = T("as.e_w_" + fk); el.parentNode.appendChild(m); el.focus(); });
          return; }
        say(T("as.ok_email"), "success"); load();
      });
    }); });
    app.querySelectorAll("[data-wremove]").forEach(function (b) { b.addEventListener("click", function () {
      if (b.getAttribute("data-sure") !== "1") { b.setAttribute("data-sure", "1"); b.textContent = T("as.w_remove_sure"); return; }
      api("POST", { action: "ward_remove", wardRow: b.getAttribute("data-wremove") }).then(function (x) { say(x.ok ? T("as.ok_removed") : (x.j.error || T("as.e_save")), x.ok ? "success" : "error"); load(); });
    }); });
    app.querySelectorAll("[data-handover]").forEach(function (b) { b.addEventListener("click", function () {
      if (b.getAttribute("data-sure") !== "1") { b.setAttribute("data-sure", "1"); b.textContent = T("as.w_handover_sure"); return; }
      api("POST", { action: "handover", unitId: b.getAttribute("data-handover") }).then(function (x) { say(x.ok ? T("as.ok_handover", { n: x.j.handedOver }) : (x.j.error || T("as.e_save")), x.ok ? "success" : "error"); load(); });
    }); });
    app.querySelectorAll("[data-replink],[data-repsend]").forEach(function (b) { b.addEventListener("click", function () {
      var send = b.hasAttribute("data-repsend"), unit = b.getAttribute(send ? "data-repsend" : "data-replink");
      api("POST", { action: "report_link", unitId: unit, send: send }).then(function (x) {
        if (!x.ok) { say(x.j.error || T("as.e_save"), "error"); return; }
        lastLink = { unitId: unit, link: x.j.link };
        say(T(send ? "as.ok_rep_sent" : "as.ok_rep", { email: x.j.sentTo || "" }), "success"); load();
      });
    }); });
    app.querySelectorAll("[data-represoke]").forEach(function (b) { b.addEventListener("click", function () {
      api("POST", { action: "report_revoke", reportId: b.getAttribute("data-represoke") }).then(function (x) { say(x.ok ? T("as.ok_revoked") : (x.j.error || T("as.e_save")), x.ok ? "success" : "error"); lastLink = null; load(); });
    }); });
    app.querySelectorAll("[data-copy]").forEach(function (b) { b.addEventListener("click", function () {
      var i = document.getElementById(b.getAttribute("data-copy"));
      try { navigator.clipboard.writeText(i.value).then(function () { say(T("as.copied"), "success"); }); } catch (e) { i.select(); }
    }); });
  }

  document.addEventListener("giq:lang", render);
  load();
})();
