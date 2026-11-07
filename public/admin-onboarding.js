/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// Admin "Onboarding form" (grieviq-83): filled by sales staff when an office
// or a department office joins GrievIQ, one section at a time, on a phone.
// It saves itself; a sales manager who did not fill it checks it and sends
// it for setup (change requests for the office's contacts and localities,
// and a setup checklist). Also: a copy to print, and a blank form to print
// for places without a network. The questions come from the server
// (functions/_shared/onboarding.js), so page and server always agree.
// Practice mode (grieviq-84): ?practice=OFFICE|DEPARTMENT fills the same form
// for a made-up office, with "Why we ask this" notes; the server runs the
// same checks and stores nothing. ?practice=..&print=1 is the worked example.
(function () {
  "use strict";
  function T(k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; }
  function has(k) { var v = T(k); return v && v !== k; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function loc() { return window.GIQ && GIQ.locale ? GIQ.locale() : "en-IN"; }
  function day(s) { if (!s) return ""; var d = new Date(String(s).length === 10 ? s + "T00:00:00Z" : s); return isNaN(d) ? s : d.toLocaleDateString(loc(), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); }
  function when(s) { if (!s) return ""; var d = new Date(s); return isNaN(d) ? s : d.toLocaleString(loc(), { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); }
  function clock(d) { return d.toLocaleTimeString(loc(), { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); }

  var Q = new URLSearchParams(location.search);
  var S = {
    mode: Q.get("practice") ? (Q.get("print") ? "example" : "practice") : Q.get("blank") ? "blank" : Q.get("lead") ? (Q.get("print") ? "print" : "form") : "queue",
    lead: Q.get("lead") || "", d: null, err: null, step: 0, a: {}, fields: {}, version: 0,
    saveState: "idle", savedAt: null, dirty: false, timer: null, retry: null, conflict: false, missingShown: false,
    pick: {}, results: {}, msg: null,
    pkind: Q.get("practice") === "DEPARTMENT" ? "DEPARTMENT" : "OFFICE",
  };
  function isPr() { return S.mode === "practice" || S.mode === "example"; }
  // Free text that looks like an ID, card or mobile number is refused by the
  // server too (functions/_shared/onboarding.js personalIn).
  var ID_LIKE = /(^|[^\d])\d(?:[\s-]?\d){11,18}(?!\d)/, PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/i, MOBILE = /(^|[^\d])(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?!\d)/;
  function personalIn(s) { s = String(s || ""); if (ID_LIKE.test(s) || PAN.test(s)) return "ID"; if (MOBILE.test(s)) return "MOBILE"; return null; }

  function msg(text, bad) { S.msg = text ? { text: text, bad: !!bad } : null; var m = $("ob-msg"); if (!m) return; m.innerHTML = text ? '<p class="st-msg ' + (bad ? "error" : "success") + '">' + esc(text) + "</p>" : ""; if (text) m.focus(); }
  function api(body) {
    return fetch("/api/admin/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); });
  }
  function errText(j) {
    var k = { CODE_NOT_ACCEPTED: "adm.sc_needed", LOCKED: "ob.e_locked", CHANGED: "ob.e_changed", OWN_FORM: "ob.e_own", NOT_FOUND: "adm.sa_e_gone", ERASED: "adm.sa_erased", INSUFFICIENT_ROLE: "adm.no_access" }[j.error];
    return T(k || "adm.ss_e_generic");
  }

  // ---- loading ----
  function load() {
    var url = isPr() ? "/api/admin/onboarding?schema=" + S.pkind : S.mode === "blank" ? "/api/admin/onboarding?schema=" + (Q.get("blank") === "DEPARTMENT" ? "DEPARTMENT" : "OFFICE")
      : S.mode === "queue" ? "/api/admin/onboarding?queue=1" : "/api/admin/onboarding?lead=" + encodeURIComponent(S.lead);
    return fetch(url, { cache: "no-store" }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); }).then(function (x) {
      if (!x.r.ok) { S.err = x.j.error === "NOT_FOUND" ? "adm.sa_e_gone" : x.j.error === "INSUFFICIENT_ROLE" || x.j.error === "NOT_ADMIN" ? "adm.no_access" : "adm.ss_e_load"; render(); return; }
      S.d = x.j; S.err = null;
      if (isPr()) { practiceSetup(); render(); if (S.mode === "practice") { S.dirty = true; save(); } return; }
      if (S.mode === "form" || S.mode === "print") {
        S.a = x.j.form ? JSON.parse(JSON.stringify(x.j.form.answers || {})) : {};
        S.version = x.j.form ? x.j.form.version : 0;
        if (!x.j.form && x.j.can.edit) prefill();
        S.d.missingNow = x.j.missing || null;
        S.conflict = false;
      }
      render();
    }).catch(function () { S.err = "adm.ss_e_load"; render(); });
  }
  // A new form starts with what the lead already says.
  function prefill() {
    var l = S.d.lead;
    if (S.d.kind === "OFFICE") { if (l.state) S.a.o_state = l.state; S.a.o_title_area = l.officeName; }
    else { if (l.state) S.a.d_state = l.state; S.a.d_name = l.officeName; }
    S.a.v_date = S.d.today;
  }

  // ---- practice: a made-up office (grieviq-84) ----
  function hi() { return !!(window.GIQ && GIQ.lang === "hi"); }
  function addDays(iso, n) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  var PR_WARDS = [
    { type: "ward", id: "practice-12", label: ["Shiv Nagar (Ward 12), Rampur (invented)", "शिव नगर (वार्ड 12), रामपुर (काल्पनिक)"] },
    { type: "ward", id: "practice-13", label: ["Gandhi Nagar (Ward 13), Rampur (invented)", "गांधी नगर (वार्ड 13), रामपुर (काल्पनिक)"] },
    { type: "ward", id: "practice-14", label: ["Purana Bazar (Ward 14), Rampur (invented)", "पुराना बाज़ार (वार्ड 14), रामपुर (काल्पनिक)"] },
  ];
  function prWard(i) { var w = PR_WARDS[i]; return { type: w.type, id: w.id, label: w.label[hi() ? 1 : 0] }; }
  // Every name, email and phone here is made up (example.in is reserved for examples).
  function sample(full) {
    var L = hi() ? 1 : 0, x = function (en, h) { return L ? h : en; }, t = S.d.today, a = {};
    a.v_date = t; a.v_number = 1; a.v_source = "OUTREACH"; a.v_demo = ["REP", "CITIZEN"]; a.v_lang = L ? "HI" : "EN";
    if (S.pkind === "OFFICE") {
      a.v_attended = x("The councillor (invented) and her office manager", "पार्षद (काल्पनिक) और उनके कार्यालय प्रबंधक");
      a.o_holder = x("Meena Sharma (invented)", "मीना शर्मा (काल्पनिक)");
      a.o_title_area = x("Councillor, Ward 12 Shiv Nagar, Rampur (invented)", "पार्षद, वार्ड 12 शिव नगर, रामपुर (काल्पनिक)");
      a.o_record = prWard(0); a.o_district = x("Rampur", "रामपुर"); a.o_state = "09"; a.o_units_count = 1;
      a.o_address = x("Ward office, Station Road, Shiv Nagar, Rampur", "वार्ड कार्यालय, स्टेशन रोड, शिव नगर, रामपुर");
      a.o_email = "ward12.office@example.in"; a.o_phone = "0595 2350012"; a.o_decider = "HOLDER";
      a.o_setup_name = x("Anil Kumar (invented)", "अनिल कुमार (काल्पनिक)"); a.o_setup_email = "anil.office@example.in";
      if (!full) return a;
      a.loc_rows = [{ unit: prWard(0), localities: x("Shiv Nagar; Gandhi Colony; Purana Bazar", "शिव नगर; गांधी कॉलोनी; पुराना बाज़ार"), pins: "244901",
        landmarks: x("Railway line to the north, Station Road to the south", "उत्तर में रेलवे लाइन, दक्षिण में स्टेशन रोड"), block: x("Zone 2", "ज़ोन 2") }];
      a.loc_source = "OFFICE_LIST"; a.loc_copy = true; a.loc_changes = x("No change expected before the next ward count", "अगली वार्ड गणना से पहले कोई बदलाव अपेक्षित नहीं");
      a.t_month_count = 120; a.t_channels = ["VISIT", "PHONE", "WHATSAPP"]; a.t_record = ["REGISTER", "WHATSAPP"]; a.t_staff = 2; a.t_calls_day = 15;
      a.t_depts = ["WATER", "ROADS", "SANITATION", "STREETLIGHTS"];
      a.t_followup = x("The office manager phones the department every few days", "कार्यालय प्रबंधक हर कुछ दिन में विभाग को फ़ोन करते हैं");
      a.t_frustration = x("Residents come back again and again about the same drain, and no one can say whether it was passed on", "लोग एक ही नाली के लिए बार-बार आते हैं, और कोई नहीं बता पाता कि शिकायत आगे भेजी गई या नहीं");
      a.t_show_work = x("A monthly ward meeting", "हर महीने वार्ड बैठक");
      a.team_rows = [{ name: x("Anil Kumar (invented)", "अनिल कुमार (काल्पनिक)"), role: "OFFICE_MANAGER", areas: x("Whole ward", "पूरा वार्ड"), email: "anil.office@example.in", phone_type: "ANDROID" },
        { name: x("Pooja Singh (invented)", "पूजा सिंह (काल्पनिक)"), role: "FIELD_WORKER", areas: x("Gandhi Colony, Purana Bazar", "गांधी कॉलोनी, पुराना बाज़ार"), email: "pooja.field@example.in", phone_type: "ANDROID" }];
      a.dept_rows = [{ office: x("Jal Kal (water works), Zone 2", "जल कल (जल कार्य), ज़ोन 2"), contact: "KNOWN", intro: "YES" },
        { office: x("Municipal sanitation, Zone 2", "नगर सफ़ाई, ज़ोन 2"), contact: "TO_FIND", intro: "MAYBE" }];
      a.p_plan = "councillor"; a.p_start = "PILOT"; a.p_pilot_start = t; a.p_pilot_end = addDays(t, 60); a.p_billing = "MONTHLY"; a.p_paid_from = "OFFICE";
      a.p_invoice_name = x("Office of the Councillor, Ward 12 (invented)", "पार्षद कार्यालय, वार्ड 12 (काल्पनिक)"); a.p_pay_method = "UPI";
      ["a_dpa", "a_rules", "a_price", "a_neutral", "a_hidden", "a_moveup", "a_record", "tr_signed_in", "tr_alerts", "tr_test", "tr_page", "tr_support"].forEach(function (k) { a[k] = true; });
      a.tr_date = t;
    } else {
      a.v_attended = x("The Executive Engineer (invented) and the Assistant Engineer (invented)", "अधिशासी अभियंता (काल्पनिक) और सहायक अभियंता (काल्पनिक)");
      a.d_name = x("Jal Kal (water works), Zone 2, Rampur (invented)", "जल कल (जल कार्य), ज़ोन 2, रामपुर (काल्पनिक)"); a.d_level = "ZONE";
      a.d_district = x("Rampur", "रामपुर"); a.d_state = "09"; a.d_address = x("Zone 2 office, Civil Lines, Rampur", "ज़ोन 2 कार्यालय, सिविल लाइन्स, रामपुर");
      a.d_email = "jalkal.zone2@example.in"; a.d_phone = "0595 2350020";
      a.d_nodal_name = x("R. K. Verma (invented)", "आर. के. वर्मा (काल्पनिक)"); a.d_nodal_desig = x("Assistant Engineer", "सहायक अभियंता"); a.d_nodal_email = "ae.zone2@example.in";
      if (!full) return a;
      a.d_signer_name = x("S. P. Gupta (invented)", "एस. पी. गुप्ता (काल्पनिक)"); a.d_signer_desig = x("Executive Engineer", "अधिशासी अभियंता");
      a.loc_rows = [{ name: x("Zone 2 (wards 10 to 18)", "ज़ोन 2 (वार्ड 10 से 18)"), localities: x("Shiv Nagar; Gandhi Colony; Purana Bazar; Civil Lines", "शिव नगर; गांधी कॉलोनी; पुराना बाज़ार; सिविल लाइन्स"), pins: "244901",
        landmarks: x("Railway line to the north, the river to the east", "उत्तर में रेलवे लाइन, पूर्व में नदी"), block: x("Zone 2", "ज़ोन 2") }];
      a.loc_source = "NOTIFICATION"; a.loc_copy = true;
      a.dt_month_count = 300; a.dt_sources = ["REP", "IGRS", "WALKIN", "PHONE"]; a.dt_dupes = "OFTEN"; a.dt_no_location = "SOMETIMES"; a.dt_calls_week = 40;
      a.dt_record = x("A complaint register at the zone office", "ज़ोन कार्यालय में शिकायत रजिस्टर"); a.dt_reviews = x("A weekly review by the Executive Engineer", "अधिशासी अभियंता द्वारा साप्ताहिक समीक्षा");
      a.dt_frustration = x("The same leak is reported again and again by different people, often without the exact place", "एक ही लीकेज की शिकायत अलग-अलग लोग बार-बार करते हैं, अक्सर सही जगह बताए बिना");
      a.officer_rows = [{ name: x("R. K. Verma (invented)", "आर. के. वर्मा (काल्पनिक)"), desig: x("Assistant Engineer", "सहायक अभियंता"), areas: x("Whole zone", "पूरा ज़ोन"), email: "ae.zone2@example.in" },
        { name: x("M. Ali (invented)", "एम. अली (काल्पनिक)"), desig: x("Junior Engineer", "कनिष्ठ अभियंता"), areas: x("Wards 10 to 13", "वार्ड 10 से 13"), email: "je.zone2a@example.in" }];
      a.di_issues = x("Water supply, leaks, low pressure, dirty water", "पानी की आपूर्ति, लीकेज, कम दबाव, गंदा पानी"); a.di_not_issues = x("Electricity, roads", "बिजली, सड़कें");
      a.di_target_days = 14; a.di_shutdowns = x("Planned shutdowns are announced a day before", "नियोजित बंदी की सूचना एक दिन पहले दी जाती है");
      a.dp_pilot_start = t; a.dp_pilot_end = addDays(t, 90); a.dp_plan = "ONE_OFFICE"; a.dp_route = "DIRECT";
      a.dp_invoice_name = x("Executive Engineer, Jal Kal Zone 2 (invented)", "अधिशासी अभियंता, जल कल ज़ोन 2 (काल्पनिक)");
      ["da_agreement", "da_rules", "da_hidden", "da_report", "da_transfer", "da_training", "da_test"].forEach(function (k) { a[k] = true; });
    }
    a.x_outcome = "SIGNED_PILOT";
    a.x_questions = x("How quickly will departments see a new complaint?", "विभाग को नई शिकायत कितनी जल्दी दिखेगी?");
    a.x_liked = x("Seeing every complaint and where it stands, in one place", "हर शिकायत और उसकी स्थिति एक ही जगह दिखना");
    a.x_promised = x("Training for the field worker on the first day of the pilot", "पायलट के पहले दिन फ़ील्ड कर्मचारी का प्रशिक्षण");
    return a;
  }
  function practiceSetup() {
    var office = S.pkind === "OFFICE";
    S.d.practice = true;
    S.d.lead = { id: "", ref: T("ob.pr_ref"), officeKind: office ? "COUNCILLOR" : "DEPARTMENT", officeName: T(office ? "ob.pr_office_o" : "ob.pr_office_d"), state: "09" };
    S.d.officeType = office ? "ward" : null;
    S.d.form = { status: "DRAFT", answers: {}, version: 0, editors: [], checklist: [], setupNotes: [] };
    S.d.can = { edit: true, submit: true };
    S.d.missingNow = S.mode === "example" ? [] : null;
    S.a = sample(S.mode === "example"); S.fields = {}; S.step = 0; S.pick = {}; S.results = {}; S.prDone = false; S.missingShown = false;
  }
  function tipHtml(k) {
    if (!isPr() || !has("ob.tip_" + k + "_why")) return "";
    return '<div class="ob-tip" role="note"><b>' + esc(T("ob.tip_h")) + "</b>" + esc(T("ob.tip_" + k + "_why")) +
      (has("ob.tip_" + k + "_good") ? '<br><span class="ob-tip-k">' + esc(T("ob.tip_good")) + "</span> " + esc(T("ob.tip_" + k + "_good")) : "") +
      (has("ob.tip_" + k + "_avoid") ? '<br><span class="ob-tip-k">' + esc(T("ob.tip_avoid")) + "</span> " + esc(T("ob.tip_" + k + "_avoid")) : "") + "</div>";
  }
  // What submitting would do, for the answers given so far.
  function wouldList() {
    var a = S.a, o = a.x_outcome, signed = o === "SIGNED_PILOT" || o === "SIGNED_PAID", items = [];
    items.push(!o ? T("ob.pr_w_lead_NONE") : signed ? T("ob.pr_w_lead_WON", { outcome: optName("x_outcome", o) }) : o === "DECLINED" ? T("ob.pr_w_lead_LOST") : T("ob.pr_w_lead_LATER", { date: a.x_next_date ? day(a.x_next_date) : "—" }));
    items.push(T("ob.pr_w_lock"));
    if (signed) {
      items.push(T(S.pkind === "OFFICE" ? "ob.pr_w_changes_o" : "ob.pr_w_changes_d", { n: (a.loc_rows || []).length }));
      var tasks = S.pkind === "DEPARTMENT" ? ["DEPT_OFFICE", "AGREEMENT", "OFFICERS", "PILOT", "TRAINING", "TEST"] : ["TEAM", a.p_start === "PAID" ? "PLAN" : "PILOT", "TRAINING", "TEST", "PUBLIC_PAGE"];
      items.push(T("ob.pr_w_checklist", { list: tasks.map(function (k) { return T("ob.task_" + k); }).join("; ") }));
    } else if (o) items.push(T("ob.pr_w_close"));
    return items;
  }
  function prBand() {
    return '<div class="ob-prband" role="note" id="ob-prband"><b>' + esc(T("ob.pr_band")) + "</b><span>" + esc(T(S.mode === "example" ? "ob.pr_band_ex" : "ob.pr_band_sub", { name: T(S.pkind === "OFFICE" ? "ob.pr_office_o" : "ob.pr_office_d") })) + "</span>" +
      (S.mode === "practice" ? '<button type="button" data-restart="1">' + esc(T("ob.pr_restart")) + "</button>" : "") + "</div>";
  }
  function prHeader() {
    var l = S.d.lead;
    var h = '<div class="acts"><a class="btnlink" href="/admin-sales.html">' + esc(T("ob.back_sales")) + '</a><a class="btnlink" href="/admin-onboarding.html?practice=' + S.pkind + '&print=1">' + esc(T("ob.pr_example")) + "</a>" +
      '<a class="btnlink" href="/admin-onboarding.html?practice=' + (S.pkind === "OFFICE" ? "DEPARTMENT" : "OFFICE") + '">' + esc(T(S.pkind === "OFFICE" ? "ob.pr_try_d" : "ob.pr_try_o")) + "</a></div>";
    h += prBand() + '<h1 id="ob-h" tabindex="-1">' + esc(T("ob.pr_title")) + '</h1><p class="subtitle">' + esc(T(S.pkind === "OFFICE" ? "ob.pr_office_o" : "ob.pr_office_d")) + " · " + esc(T("adm.sa_k_" + l.officeKind)) + ' <span class="sa-badge">' + esc(T("ob.pr_badge")) + "</span></p>";
    h += '<div class="note ob-rule">' + esc(T("ob.never")) + "</div>";
    return h;
  }

  // ---- labels ----
  function secName(id) { return T("ob.s_" + id); }
  function lbl(k) { return T("ob.f_" + k); }
  function optName(k, o) {
    if (k === "x_reason") return T("adm.sa_lr_" + o);
    var key = "ob.o_" + k + "_" + o; if (has(key)) return T(key);
    return T("ob.o_" + o);
  }
  function fieldsOf(sec) { return S.d.fields.filter(function (f) { return f.s === sec; }); }
  function def(k) { return S.d.fields.find(function (f) { return f.k === k; }); }
  function stateName(c) { var s = (S.d.states || []).find(function (x) { return x.code === c; }); return s ? s.name : c; }
  function steps() { return S.d.sections.concat(["review"]); }
  function editable() { return !!(S.d && S.d.can && S.d.can.edit) && !S.conflict; }
  function reqWhen(f) {
    var o = S.a.x_outcome;
    var signed = o === "SIGNED_PILOT" || o === "SIGNED_PAID";
    return f.req === true || (f.req === "signed" && signed) || (f.req === "declined" && o === "DECLINED") || (f.req === "later" && (o === "FOLLOW_UP" || o === "NOT_NOW"));
  }

  // ---- field errors (from the server) and warnings (as typed) ----
  function errFor(path) {
    var c = S.fields[path]; if (!c) return "";
    return T("ob.e_" + c);
  }
  function describe(id, hint, err) { var d = [hint ? id + "-h" : "", err ? id + "-e" : ""].filter(Boolean).join(" "); return (err ? ' aria-invalid="true"' : "") + (d ? ' aria-describedby="' + d + '"' : ""); }

  // ---- one field ----
  // In practice, a "Why we ask this" note sits under the key questions (once, on the first row of a table).
  function control(f, id, val, path, ro) {
    var h = control0(f, id, val, path, ro);
    if (!isPr() || /\.[1-9]\d*\./.test(path)) return h;
    var tip = tipHtml(f.k);
    return tip ? h.replace(/<\/(div|fieldset)>$/, tip + "</$1>") : h;
  }
  function control0(f, id, val, path, ro) {
    var err = errFor(path), hintKey = "ob.h_" + f.k, hint = has(hintKey) ? T(hintKey) : "";
    var dis = ro ? " disabled" : "";
    var req = reqWhen(f) ? ' <span class="req">' + esc(T("ob.required")) + "</span>" : "";
    var head = '<label for="' + id + '">' + esc(lbl(f.k)) + req + "</label>" + (hint ? '<span class="hint" id="' + id + '-h">' + esc(hint) + "</span>" : "");
    var tail = err ? '<span class="ferr" id="' + id + '-e">' + esc(err) + "</span>" : "";
    var t = f.t, v = val == null ? "" : val, h;
    if (t === "text" || t === "gstin" || t === "pins") h = '<input type="text" id="' + id + '" data-p="' + esc(path) + '" maxlength="' + (t === "gstin" ? 15 : (f.max || 300)) + '" value="' + esc(v) + '"' + (t === "pins" ? ' inputmode="numeric"' : "") + (t === "gstin" ? ' autocapitalize="characters" spellcheck="false"' : "") + describe(id, hint, err) + dis + ">";
    else if (t === "area") h = '<textarea id="' + id + '" data-p="' + esc(path) + '" maxlength="' + (f.max || 300) + '" rows="3"' + describe(id, hint, err) + dis + ">" + esc(v) + "</textarea>";
    else if (t === "int") h = '<input type="number" id="' + id + '" data-p="' + esc(path) + '" inputmode="numeric" min="' + (f.min || 0) + '" max="' + (f.maxN || 100000) + '" step="1" value="' + esc(v) + '"' + describe(id, hint, err) + dis + ">";
    else if (t === "date") h = '<input type="date" id="' + id + '" data-p="' + esc(path) + '" value="' + esc(v) + '"' + describe(id, hint, err) + dis + ">";
    else if (t === "email") h = '<input type="email" id="' + id + '" data-p="' + esc(path) + '" maxlength="120" spellcheck="false" autocapitalize="off" value="' + esc(v) + '"' + describe(id, hint, err) + dis + ">";
    else if (t === "phone") h = '<input type="tel" id="' + id + '" data-p="' + esc(path) + '" inputmode="tel" maxlength="20" value="' + esc(v) + '"' + describe(id, hint, err) + dis + ">";
    else if (t === "state") h = '<select id="' + id + '" data-p="' + esc(path) + '"' + describe(id, hint, err) + dis + '><option value="">' + esc(T("adm.sa_state_pick")) + "</option>" + S.d.states.map(function (s) { return '<option value="' + s.code + '"' + (s.code === v ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select>";
    else if (t === "enum" && f.opts.length > 5) h = '<select id="' + id + '" data-p="' + esc(path) + '"' + describe(id, hint, err) + dis + '><option value="">' + esc(T("adm.sa_pick")) + "</option>" + f.opts.map(function (o) { return '<option value="' + o + '"' + (o === v ? " selected" : "") + ">" + esc(optName(f.k, o)) + "</option>"; }).join("") + "</select>";
    else if (t === "enum" || t === "multi") {
      var multi = t === "multi", list = multi ? (v || []) : [v];
      return '<fieldset class="rad ob-fs" id="' + id + '"' + describe(id, hint, err) + "><legend>" + esc(lbl(f.k)) + req + "</legend>" + (hint ? '<span class="hint" id="' + id + '-h">' + esc(hint) + "</span>" : "") + '<div class="ob-opts">' +
        f.opts.map(function (o, i) {
          var oid = id + "-" + i;
          return '<span class="ropt"><input type="' + (multi ? "checkbox" : "radio") + '" name="' + id + '" id="' + oid + '" value="' + o + '" data-p="' + esc(path) + '" data-t="' + t + '"' + (list.indexOf(o) >= 0 ? " checked" : "") + dis + '><label for="' + oid + '">' + esc(optName(f.k, o)) + "</label></span>";
        }).join("") + "</div>" + tail + "</fieldset>";
    }
    else if (t === "bool") return '<div class="chk ob-chk"><input type="checkbox" id="' + id + '" data-p="' + esc(path) + '" data-t="bool"' + (v === true ? " checked" : "") + describe(id, hint, err) + dis + '><label for="' + id + '">' + esc(lbl(f.k)) + req + "</label>" + (hint ? '<span class="hint" id="' + id + '-h">' + esc(hint) + "</span>" : "") + tail + "</div>";
    else if (t === "office") return picker(f, id, v, path, ro, head, tail);
    var warn = (t === "text" || t === "area") && personalIn(v) && !err ? '<span class="ob-warn" id="' + id + '-w" role="alert">' + esc(T("ob.warn_" + personalIn(v))) + "</span>" : "";
    return '<div class="fld' + (t === "area" ? " wide" : "") + '">' + head + h + warn + tail + "</div>";
  }
  // A GrievIQ record (the office, or a ward): search, pick, change.
  function picker(f, id, v, path, ro, head, tail) {
    var type = path.indexOf("loc_rows") === 0 ? "ward" : (S.d.officeType || "ward");
    var h = '<div class="fld wide ob-picker">' + head;
    if (v && v.id) {
      h += '<p class="ob-picked" id="' + id + '"><span class="sa-badge">' + esc(T("ob.picked")) + "</span> " + esc(v.label) + "</p>" + (ro ? "" : '<div class="acts"><button type="button" data-unpick="' + esc(path) + '">' + esc(T("ob.pick_change")) + "</button></div>");
      return h + tail + "</div>";
    }
    if (ro) return h + '<p class="muted" id="' + id + '">' + esc(T("ob.not_picked")) + "</p>" + tail + "</div>";
    var res = S.results[path];
    h += '<input type="search" id="' + id + '" data-find="' + esc(path) + '" data-type="' + type + '" maxlength="60" autocomplete="off" value="' + esc(S.pick[path] || "") + '" aria-describedby="' + id + '-r">' +
      '<div id="' + id + '-r" class="ob-results" role="status">' + (res ? (res.length ? '<ul class="ob-list">' + res.map(function (o, i) { return '<li><button type="button" data-pick="' + esc(path) + '" data-i="' + i + '">' + esc(o.label) + "</button></li>"; }).join("") + "</ul>" : '<span class="muted">' + esc(T("ob.find_none")) + "</span>") : "") + "</div>";
    return h + tail + "</div>";
  }
  function rowsBlock(f, ro) {
    var rows = S.a[f.k] || [], h = '<div class="ob-rows" id="ob-' + f.k + '">';
    var err = errFor(f.k);
    if (!rows.length) h += '<p class="muted">' + esc(T("ob.rows_none_" + f.k)) + "</p>";
    rows.forEach(function (r, i) {
      var rowErr = S.missingShown && (S.d.missingNow || []).some(function (m) { return m.k === f.k + "." + i; });
      h += '<fieldset class="card ob-row' + (rowErr ? " ob-row-bad" : "") + '" id="ob-' + f.k + "-" + i + '"><legend>' + esc(T("ob.row_" + f.k, { n: i + 1 })) + "</legend>" + (rowErr ? '<p class="ferr">' + esc(T("ob.row_incomplete_" + f.k)) + "</p>" : "") + '<div class="grid">' +
        f.cols.map(function (c) { return control(Object.assign({}, c, { k: f.k + "_" + c.k }), "ob-" + f.k + "-" + i + "-" + c.k, r[c.k], f.k + "." + i + "." + c.k, ro); }).join("") + "</div>" +
        (ro ? "" : '<div class="acts"><button type="button" class="danger" data-delrow="' + f.k + '" data-i="' + i + '">' + esc(T("ob.row_remove_" + f.k, { n: i + 1 })) + "</button></div>") + "</fieldset>";
    });
    if (!ro) {
      h += '<div class="acts"><button type="button" data-addrow="' + f.k + '"' + (rows.length >= f.maxRows ? " disabled" : "") + ">" + esc(T("ob.row_add_" + f.k)) + "</button>";
      var ownIn = S.a.o_record && S.a.o_record.type === "ward" && rows.some(function (r) { return r.unit && r.unit.id === S.a.o_record.id; });
      if (f.k === "loc_rows" && S.a.o_record && S.a.o_record.id && S.d.kind === "OFFICE" && !ownIn) h += '<button type="button" id="ob-add-units">' + esc(T(S.a.o_record.type === "ward" ? "ob.add_own_ward" : "ob.add_all_wards")) + "</button>";
      h += "</div>";
    }
    return h + (err ? '<p class="ferr">' + esc(err) + "</p>" : "") + "</div>";
  }
  function sectionHtml(sec, ro) {
    var intro = has("ob.i_" + sec) ? '<p class="note">' + esc(T("ob.i_" + sec)) + "</p>" : "";
    var plain = [], h = "";
    fieldsOf(sec).forEach(function (f) {
      if (f.t === "rows") { if (plain.length) { h += '<div class="grid">' + plain.join("") + "</div>"; plain = []; } h += '<h3 class="sub-h">' + esc(lbl(f.k)) + "</h3>" + rowsBlock(f, ro); return; }
      if (sec === "plan" && (f.k === "p_pilot_start" || f.k === "p_pilot_end") && S.a.p_start !== "PILOT") return;
      if (sec === "outcome" && (f.k === "x_reason" || f.k === "x_reason_words") && S.a.x_outcome !== "DECLINED") return;
      if (sec === "outcome" && (f.k === "x_next_step" || f.k === "x_next_date") && ["FOLLOW_UP", "NOT_NOW"].indexOf(S.a.x_outcome) < 0) return;
      if (sec === "office" && f.k === "o_seat" && !(S.a.o_record && S.a.o_record.type === "ward")) return;
      plain.push(control(f, "ob-" + f.k, S.a[f.k], f.k, ro));
    });
    if (plain.length) h += '<div class="grid">' + plain.join("") + "</div>";
    return intro + h;
  }

  // ---- the form, a section at a time ----
  function stepNav() {
    var st = steps();
    var wide = window.matchMedia && window.matchMedia("(min-width: 700px)").matches;
    return '<details class="ob-steps-d"' + (wide || S.navOpen ? " open" : "") + ' id="ob-steps-d"><summary>' + esc(T("ob.steps_all")) + '</summary><nav class="ob-steps" aria-label="' + esc(T("ob.steps")) + '"><ol>' + st.map(function (s, i) {
      return '<li><button type="button" data-step="' + i + '"' + (i === S.step ? ' aria-current="step"' : "") + ">" + (i + 1) + ". " + esc(s === "review" ? T("ob.s_review") : secName(s)) + "</button></li>";
    }).join("") + "</ol></nav></details>";
  }
  function saveLine() {
    if (isPr()) return '<p class="ob-save" id="ob-save" role="status">' + esc(T("ob.pr_save")) + "</p>" + (S.saveState === "offline" ? '<div class="ob-offline" role="alert" id="ob-offline"><b>' + esc(T("ob.offline_h")) + "</b> " + esc(T("ob.pr_offline")) + "</div>" : "");
    if (!editable()) return "";
    var t = S.saveState === "saving" ? T("ob.saving") : S.saveState === "offline" ? "" : S.saveState === "error" ? T("ob.save_failed") : S.savedAt ? T("ob.saved_at", { t: clock(S.savedAt) }) : S.d.form ? T("ob.saved_before") : T("ob.not_started");
    var h = '<p class="ob-save" id="ob-save" role="status">' + esc(t) + "</p>";
    if (S.saveState === "offline") h += '<div class="ob-offline" role="alert" id="ob-offline"><b>' + esc(T("ob.offline_h")) + "</b> " + esc(T("ob.offline")) + '</div>';
    return h;
  }
  function header() {
    var d = S.d, l = d.lead, f = d.form;
    var h = '<div class="acts"><a class="btnlink" href="/admin-sales.html#lead=' + encodeURIComponent(l.id) + '">' + esc(T("ob.back_lead")) + "</a>" +
      (f ? '<a class="btnlink" href="/admin-onboarding.html?lead=' + encodeURIComponent(l.id) + '&print=1">' + esc(T("ob.print_copy")) + "</a>" : "") +
      '<a class="btnlink" href="/admin-onboarding.html?blank=' + d.kind + '">' + esc(T("ob.print_blank")) + "</a></div>";
    h += '<h1 id="ob-h" tabindex="-1">' + esc(T("ob.title")) + '</h1><p class="subtitle"><span class="sa-ref">' + esc(l.ref) + "</span> · " + esc(l.officeName) + " · " + esc(T("adm.sa_k_" + l.officeKind)) +
      ' <span class="sa-badge">' + esc(T("ob.st_" + (f ? f.status : "NEW"))) + "</span></p>";
    if (d.auditor) h += '<p class="muted-note">' + esc(T("ob.auditor")) + "</p>";
    if (l.erased || (f && f.erased)) h += '<p class="ac-warn">' + esc(T("ob.erased")) + "</p>";
    if (f && f.status === "RETURNED" && f.returnNote) h += '<div class="ac-warn" role="note"><b>' + esc(T("ob.returned_h")) + "</b> " + esc(f.returnNote) + "</div>";
    if (S.conflict) h += '<div class="ob-offline" role="alert"><b>' + esc(T("ob.conflict_h")) + "</b> " + esc(T("ob.conflict")) + ' <button type="button" id="ob-reload">' + esc(T("ob.reload")) + "</button></div>";
    h += '<div class="note ob-rule">' + esc(T("ob.never")) + "</div>";
    return h;
  }
  function formView() {
    var st = steps(), cur = st[S.step], last = S.step === st.length - 1;
    var h = (isPr() ? prHeader() : header()) + saveLine() + '<p class="ob-progress-l" id="ob-progress-l">' + esc(T("ob.step_of", { n: S.step + 1, of: st.length, name: cur === "review" ? T("ob.s_review") : secName(cur) })) + "</p>" +
      '<progress class="ob-progress" max="' + st.length + '" value="' + (S.step + 1) + '" aria-labelledby="ob-progress-l"></progress>' + stepNav();
    h += '<section class="panel ob-sec" aria-labelledby="ob-sec-h"><h2 id="ob-sec-h" tabindex="-1">' + esc(cur === "review" ? T("ob.s_review") : secName(cur)) + "</h2>";
    h += cur === "review" ? reviewHtml() : sectionHtml(cur, !editable());
    h += '<div class="acts ob-nav">' + (S.step > 0 ? '<button type="button" id="ob-prev">' + esc(T("ob.prev")) + "</button>" : "") +
      (!last ? '<button type="button" class="primary" id="ob-next">' + esc(T("ob.next")) + "</button>" : "") + "</div></section>";
    return h;
  }
  function missingNow() { return S.d.missingNow || []; }
  function reviewHtml() {
    var miss = missingNow(), h = "";
    if (isPr() && S.prDone) {
      return '<p class="st-msg success" id="ob-prdone" tabindex="-1">' + esc(T("ob.pr_done")) + '</p><h3 class="sub-h">' + esc(T("ob.pr_would_h")) + '</h3><ul class="ob-would">' + wouldList().map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
        '<div class="acts"><button type="button" class="primary" data-restart="1">' + esc(T("ob.pr_restart")) + '</button><a class="btnlink" href="/admin-sales.html">' + esc(T("ob.back_sales")) + "</a></div>";
    }
    if (!S.d.form) h += '<p class="muted-note">' + esc(T("ob.fill_first")) + "</p>";
    else if (miss.length) {
      h += '<div class="ss-errors" id="ob-missing" tabindex="-1"><h3 class="sub-h">' + esc(T("ob.missing_h", { n: miss.length })) + "</h3><ul>" + miss.map(function (m) {
        var base = m.k.split(".")[0], f = def(base) || {}, sec = f.s;
        var text = m.k.indexOf(".") > 0 ? T("ob.row_incomplete_" + base) + " (" + T("ob.row_" + base, { n: +m.k.split(".")[1] + 1 }) + ")" : lbl(base) + ": " + T("ob.why_" + m.why);
        return '<li><a href="#" data-goto="' + esc(sec) + '" data-focus="' + esc(m.k) + '">' + esc(secName(sec)) + " · " + esc(text) + "</a></li>";
      }).join("") + "</ul></div>";
    } else h += '<p class="st-msg success">' + esc(T("ob.ready_submit")) + "</p>";
    if (S.saveState === "offline" || S.dirty) h += '<p class="muted-note">' + esc(T("ob.wait_save")) + "</p>";
    if (isPr()) {
      h += '<h3 class="sub-h">' + esc(T("ob.pr_would_h")) + '</h3><ul class="ob-would">' + wouldList().map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
      return h + '<div class="acts"><button type="button" class="primary" id="ob-submit"' + (miss.length || S.dirty || S.saveState === "offline" || !S.d.missingNow ? " disabled" : "") + ">" + esc(T("ob.pr_submit")) + '</button><button type="button" data-restart="1">' + esc(T("ob.pr_restart")) + "</button></div>";
    }
    h += '<p class="muted-note">' + esc(T("ob.submit_what")) + "</p>";
    h += '<div class="acts"><button type="button" class="primary" id="ob-submit"' + (!editable() || miss.length || S.dirty || S.saveState === "offline" || !S.d.form ? " disabled" : "") + ">" + esc(T("ob.submit")) + "</button></div>";
    return h;
  }

  // ---- read-only: the whole form, for checking, setup and printing ----
  function answerText(f, v) {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "";
    if (f.t === "enum") return optName(f.k, v);
    if (f.t === "multi") return v.map(function (o) { return optName(f.k, o); }).join(", ");
    if (f.t === "bool") return v ? T("ob.yes") : "";
    if (f.t === "state") return stateName(v);
    if (f.t === "date") return day(v);
    if (f.t === "office") return v.label || "";
    return String(v);
  }
  function summaryHtml(blank) {
    return S.d.sections.map(function (sec) {
      var h = '<section class="ob-print-sec"><h2>' + esc(secName(sec)) + "</h2>", plain = [];
      var ex = S.mode === "example";
      var flush = function () { if (plain.length) { h += '<table class="ac-t ob-qa"><thead><tr><th scope="col">' + esc(T("ob.q")) + '</th><th scope="col">' + esc(T("ob.ans")) + "</th>" + (ex ? '<th scope="col">' + esc(T("ob.pr_notes")) + "</th>" : "") + "</tr></thead><tbody>" + plain.join("") + "</tbody></table>"; plain = []; } };
      var note = function (k) { return has("ob.tip_" + k + "_why") ? T("ob.tip_" + k + "_why") + (has("ob.tip_" + k + "_good") ? " " + T("ob.tip_good") + " " + T("ob.tip_" + k + "_good") : "") : ""; };
      fieldsOf(sec).forEach(function (f) {
        if (f.t === "rows") {
          flush();
          var rows = blank ? [{}, {}, {}, {}] : (S.a[f.k] || []);
          h += '<h3 class="sub-h">' + esc(lbl(f.k)) + '</h3><div class="ac-table-wrap"><table class="ac-t ob-grid"><thead><tr>' + f.cols.map(function (c) { return '<th scope="col">' + esc(lbl(f.k + "_" + c.k)) + "</th>"; }).join("") + "</tr></thead><tbody>" +
            (rows.length ? rows.map(function (r) { return "<tr>" + f.cols.map(function (c) { return "<td>" + (blank ? "&nbsp;" : esc(answerText(Object.assign({}, c, { k: f.k + "_" + c.k }), r[c.k]))) + "</td>"; }).join("") + "</tr>"; }).join("")
              : '<tr><td colspan="' + f.cols.length + '" class="muted">' + esc(T("ob.none_given")) + "</td></tr>") + "</tbody></table></div>";
          if (ex) { var ns = f.cols.filter(function (c) { return note(f.k + "_" + c.k); }); if (ns.length) h += '<ul class="ob-notes">' + ns.map(function (c) { return "<li><b>" + esc(lbl(f.k + "_" + c.k)) + ":</b> " + esc(note(f.k + "_" + c.k)) + "</li>"; }).join("") + "</ul>"; }
          return;
        }
        var shown = blank ? (f.t === "bool" ? "☐" : f.t === "enum" || f.t === "multi" ? f.opts.map(function (o) { return "☐ " + optName(f.k, o); }).join("   ") : "") : answerText(f, S.a[f.k]);
        if (!blank && !shown) shown = "";
        if (ex && !shown) return;
        plain.push('<tr><th scope="row">' + esc(lbl(f.k)) + "</th><td>" + (shown ? esc(shown) : blank ? "&nbsp;" : '<span class="muted">—</span>') + "</td>" + (ex ? '<td class="ob-note">' + esc(note(f.k)) + "</td>" : "") + "</tr>");
      });
      flush();
      return h + "</section>";
    }).join("");
  }
  function signOff() {
    return '<section class="ob-print-sec"><h2>' + esc(T("ob.sign_h")) + '</h2><table class="ac-t ob-sign"><thead><tr><th scope="col"><span class="sr-only">' + esc(T("ob.sign_who")) + '</span></th><th scope="col">' + esc(T("ob.sign_name")) + '</th><th scope="col">' + esc(T("ob.sign_sig")) + '</th><th scope="col">' + esc(T("ob.sign_date")) + "</th></tr></thead><tbody>" +
      ["ob.sign_sales", "ob.sign_office", "ob.sign_manager"].map(function (k) { return '<tr><th scope="row">' + esc(T(k)) + "</th><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>"; }).join("") + "</tbody></table></section>";
  }
  function banner() {
    return '<div class="ob-banner"><span class="ob-logo" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M34.3 11.7A16 16 0 1 0 40 25H33"/><path d="M12.7 35.3 8 43l9.2-4.5z" fill="#fff"/><path d="M20 22l6 6 15-17" stroke="#E8B631"/></svg></span><span><b>GrievIQ</b><br><span class="ob-tag">' + esc(T("ob.tagline")) + '</span></span><span class="ob-site">grieviq.in</span></div>';
  }
  function exampleView() {
    var h = '<div class="acts no-print"><a class="btnlink" href="/admin-onboarding.html?practice=' + S.pkind + '">' + esc(T("ob.pr_back")) + '</a><a class="btnlink" href="/admin-onboarding.html?practice=' + (S.pkind === "OFFICE" ? "DEPARTMENT" : "OFFICE") + '&print=1">' + esc(T(S.pkind === "OFFICE" ? "ob.pr_ex_d" : "ob.pr_ex_o")) + "</a>" +
      '<button type="button" class="primary" id="ob-print">' + esc(T("ob.print")) + "</button></div>" + banner();
    h += '<h1 id="ob-h" tabindex="-1">' + esc(T(S.pkind === "OFFICE" ? "ob.pr_ex_title_o" : "ob.pr_ex_title_d")) + '</h1><p class="subtitle">' + esc(T(S.pkind === "OFFICE" ? "ob.pr_office_o" : "ob.pr_office_d")) + " · " + esc(T("adm.sa_k_" + S.d.lead.officeKind)) + "</p>" + prBand();
    return h + '<p>' + esc(T("ob.pr_ex_sub")) + '</p><div class="note ob-rule">' + esc(T("ob.never")) + "</div>" + summaryHtml(false);
  }
  function printView(blank) {
    var d = S.d, l = d.lead || null, f = d.form || null;
    var h = '<div class="acts no-print">' + (l ? '<a class="btnlink" href="/admin-onboarding.html?lead=' + encodeURIComponent(l.id) + '">' + esc(T("ob.back_form")) + "</a>" : '<a class="btnlink" href="/admin-sales.html">' + esc(T("ob.back_sales")) + "</a>") +
      '<button type="button" class="primary" id="ob-print">' + esc(T("ob.print")) + "</button></div>" + banner();
    h += '<h1 id="ob-h" tabindex="-1">' + esc(T(blank ? (d.kind === "DEPARTMENT" ? "ob.blank_title_d" : "ob.blank_title_o") : "ob.title")) + "</h1>";
    if (l) h += '<p class="subtitle">' + esc(l.ref) + " · " + esc(l.officeName) + " · " + esc(T("adm.sa_k_" + l.officeKind)) + (f ? " · " + esc(T("ob.st_" + f.status)) + " · " + esc(T("ob.printed_on", { d: day(d.today) })) : "") + "</p>";
    else h += '<p class="subtitle">' + esc(T("ob.blank_sub")) + "</p>";
    h += '<div class="note ob-rule">' + esc(T("ob.never")) + "</div>" + summaryHtml(blank) + signOff();
    return h;
  }
  function eventsHtml() {
    var ev = S.d.events || []; if (!ev.length) return "";
    return '<h3 class="sub-h">' + esc(T("ob.history")) + '</h3><ol class="hl-ev" reversed>' + ev.map(function (e) {
      var what = e.kind === "TASK_DONE" || e.kind === "TASK_UNDONE" ? T("ob.ev_" + e.kind, { task: T("ob.task_" + e.note) }) : e.kind === "SUBMITTED" ? T("ob.ev_SUBMITTED", { outcome: e.note ? T("ob.o_x_outcome_" + e.note) : "" }) : e.kind === "SENT" ? T("ob.ev_SENT", { n: e.note || 0 }) : T("ob.ev_" + e.kind);
      return "<li><b>" + esc(what) + "</b>" + (e.kind === "RETURNED" && e.note ? ": " + esc(e.note) : "") + ' <span class="muted">· ' + esc(when(e.at)) + " · " + esc(e.by === "system" ? T("adm.sa_system") : e.by) + "</span></li>";
    }).join("") + "</ol>";
  }
  // A change request's label is stored in English ("Ward representative — Aishbagh"): shown in the page language.
  function crLabel(lbl) {
    lbl = String(lbl || ""); var i = lbl.indexOf(" — "); if (i < 0) return lbl;
    var k = { "MP": "adm.c_lbl_mp", "MLA": "adm.c_lbl_mla", "Ward representative": "adm.c_lbl_ward", "Ward member": "adm.c_lbl_ward", "Mayor": "adm.c_lbl_mayor" }[lbl.slice(0, i)];
    return k && has(k) ? T(k) + " — " + lbl.slice(i + 3) : lbl;
  }
  var TASK_LINK = { PILOT: "/admin-subscriptions.html", PLAN: "/admin-subscriptions.html", DEPT_OFFICE: "/admin-departments.html", AGREEMENT: "/admin-departments.html", OFFICERS: "/admin-departments.html" };
  function setupHtml() {
    var d = S.d, f = d.form;
    var h = '<section class="panel" aria-labelledby="ob-setup-h"><h2 id="ob-setup-h">' + esc(T("ob.setup_h")) + "</h2>";
    h += '<h3 class="sub-h">' + esc(T("ob.changes_h")) + "</h3>";
    h += d.changes.length ? '<ul class="hl-ev">' + d.changes.map(function (c) { return "<li>" + esc(crLabel(c.label)) + ' · <span class="sa-badge">' + esc(T("adm.c_st_" + c.status)) + "</span>" + (c.note ? ' <span class="muted">' + esc(c.note) + "</span>" : "") + "</li>"; }).join("") + '</ul><p><a href="/admin-change-requests.html">' + esc(T("ob.changes_open")) + "</a></p>" : '<p class="muted">' + esc(T("ob.changes_none")) + "</p>";
    if (f.setupNotes.length) h += '<h3 class="sub-h">' + esc(T("ob.by_hand_h")) + '</h3><ul class="hl-ev">' + f.setupNotes.map(function (n) { return "<li>" + esc(T("ob.what_" + n.what.kind, { label: n.what.label })) + " — " + esc(T("ob.why_note_" + n.why)) + "</li>"; }).join("") + "</ul>";
    h += '<h3 class="sub-h">' + esc(T("ob.checklist_h")) + '</h3><div class="ob-tasks">' + f.checklist.map(function (t) {
      var id = "ob-task-" + t.k;
      return '<div class="chk"><input type="checkbox" id="' + id + '" data-task="' + t.k + '"' + (t.done ? " checked" : "") + (d.can.tick ? "" : " disabled") + '><label for="' + id + '">' + esc(T("ob.task_" + t.k)) + "</label>" +
        '<span class="hint">' + esc(T("ob.task_how_" + t.k)) + (TASK_LINK[t.k] ? ' <a href="' + TASK_LINK[t.k] + '">' + esc(T("ob.task_open")) + "</a>" : "") + (t.done ? " · " + esc(T("ob.task_done_by", { who: t.done.by, when: when(t.done.at) })) : "") + "</span></div>";
    }).join("") + "</div>";
    if (d.kind === "OFFICE" && (S.a.team_rows || []).length) h += '<p class="muted-note">' + esc(T("ob.team_note")) + "</p>";
    return h + "</section>";
  }
  function lockedView() {
    var d = S.d, f = d.form;
    var h = header();
    if (d.can.check) {
      var signed = f.outcome === "SIGNED_PILOT" || f.outcome === "SIGNED_PAID";
      h += '<section class="panel" aria-labelledby="ob-check-h"><h2 id="ob-check-h">' + esc(T("ob.check_h")) + "</h2><p>" + esc(T(signed ? "ob.check_p_signed" : "ob.check_p_other", { who: f.submittedBy, when: when(f.submittedAt) })) + "</p>" +
        '<div class="acts"><button type="button" class="primary" id="ob-check">' + esc(T(signed ? "ob.check_send" : "ob.check_close")) + "</button></div>" +
        '<form id="ob-return" class="hl-form" novalidate><div class="fld"><label for="ob-return-note">' + esc(T("ob.return_note")) + '</label><span class="hint" id="ob-return-note-h">' + esc(T("ob.return_hint")) + "</span><textarea id=\"ob-return-note\" maxlength=\"300\" rows=\"2\" aria-describedby=\"ob-return-note-h" + (S.retErr ? " ob-return-note-e" : "") + '"' + (S.retErr ? ' aria-invalid="true"' : "") + ">" + esc(S.retNote || "") + "</textarea>" +
        (S.retErr ? '<span class="ferr" id="ob-return-note-e">' + esc(T("ob.e_note")) + "</span>" : "") + '</div><div class="acts"><button type="submit">' + esc(T("ob.return_btn")) + "</button></div></form></section>";
    } else if (d.can.checkBlockedOwn) h += '<p class="ac-warn">' + esc(T("ob.check_own")) + "</p>";
    else if (f.status === "SUBMITTED") h += '<p class="muted-note">' + esc(T("ob.waiting_check", { when: when(f.submittedAt) })) + "</p>";
    if (f.status === "CHECKED") h += '<p class="st-msg success">' + esc(T("ob.checked_line", { who: f.checkedBy, when: when(f.checkedAt) })) + "</p>";
    if (f.status === "SENT") h += '<p class="st-msg success">' + esc(T("ob.sent_line", { who: f.checkedBy, when: when(f.checkedAt) })) + "</p>" + setupHtml();
    h += '<section class="panel"><h2 class="sub-h">' + esc(T("ob.answers_h")) + "</h2>" + summaryHtml(false) + "</section>" + eventsHtml();
    return h;
  }
  function queueView() {
    var d = S.d;
    var h = '<div class="acts"><a class="btnlink" href="/admin-sales.html">' + esc(T("ob.back_sales")) + '</a><a class="btnlink" href="/admin-onboarding.html?blank=OFFICE">' + esc(T("ob.print_blank_o")) + '</a><a class="btnlink" href="/admin-onboarding.html?blank=DEPARTMENT">' + esc(T("ob.print_blank_d")) + "</a></div>" +
      '<h1 id="ob-h" tabindex="-1">' + esc(T("ob.queue_h")) + '</h1><p class="subtitle">' + esc(T("ob.queue_sub")) + "</p>";
    if (!d.forms.length) return h + '<p class="muted">' + esc(T("ob.queue_none")) + "</p>";
    return h + '<div class="ac-table-wrap"><table class="ac-t"><caption class="sr-only">' + esc(T("ob.queue_h")) + '</caption><thead><tr><th scope="col">' + esc(T("adm.sa_c_lead")) + '</th><th scope="col">' + esc(T("ob.f_x_outcome")) + '</th><th scope="col">' + esc(T("ob.q_by")) + '</th><th scope="col"><span class="sr-only">' + esc(T("adm.sa_c_open")) + "</span></th></tr></thead><tbody>" +
      d.forms.map(function (f) {
        return '<tr><th scope="row"><span class="sa-ref">' + esc(f.ref) + "</span><br>" + esc(f.officeName) + "</th><td>" + esc(f.outcome ? T("ob.o_x_outcome_" + f.outcome) : "—") + "</td><td>" + esc(f.submittedBy) + '<br><span class="muted">' + esc(when(f.submittedAt)) + "</span>" + (f.mine ? '<br><span class="sa-badge">' + esc(T("ob.q_yours")) + "</span>" : "") + "</td>" +
          '<td><a class="btnlink" href="/admin-onboarding.html?lead=' + encodeURIComponent(f.lead) + '" aria-label="' + esc(T("ob.q_open", { ref: f.ref })) + '">' + esc(T("adm.sa_c_open")) + "</a></td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function render() {
    var app = $("ob-app");
    if (S.err) { app.innerHTML = '<p class="st-msg error">' + esc(T(S.err)) + '</p><p><a href="/admin-sales.html">' + esc(T("ob.back_sales")) + "</a></p>"; return; }
    var d = S.d; if (!d) return;
    if (!d.ready) { app.innerHTML = '<p class="ac-warn">' + esc(T("ob.not_ready")) + "</p>"; return; }
    var active = document.activeElement && document.activeElement.id, pos = null;
    try { if (active && document.activeElement.selectionStart != null) pos = document.activeElement.selectionStart; } catch (e) {}
    var h;
    if (S.mode === "queue") h = queueView();
    else if (S.mode === "example") h = exampleView();
    else if (S.mode === "practice") h = formView();
    else if (S.mode === "blank") h = printView(true);
    else if (S.mode === "print") h = printView(false);
    else if (d.form && ["SUBMITTED", "CHECKED", "SENT"].indexOf(d.form.status) >= 0) h = lockedView();
    else if (!d.can.edit && !d.form) h = header() + '<p class="muted">' + esc(T("ob.none_yet")) + "</p>";
    else if (!d.can.edit) h = lockedView();
    else h = formView();
    app.innerHTML = '<div id="ob-msg" class="hl-msg" role="status" aria-live="polite" tabindex="-1">' + (S.msg ? '<p class="st-msg ' + (S.msg.bad ? "error" : "success") + '">' + esc(S.msg.text) + "</p>" : "") + "</div>" + h;
    document.title = T(S.mode === "practice" ? "ob.pr_title" : S.mode === "example" ? (S.pkind === "OFFICE" ? "ob.pr_ex_title_o" : "ob.pr_ex_title_d") : "ob.page_title");
    wire();
    if (active && $(active)) { var el = $(active); el.focus(); if (pos != null) try { el.setSelectionRange(pos, pos); } catch (e) {} }
  }

  // ---- answers ----
  function setPath(path, value) {
    var p = path.split(".");
    if (p.length === 1) { if (value == null || value === "" || (Array.isArray(value) && !value.length)) delete S.a[p[0]]; else S.a[p[0]] = value; return; }
    var rows = S.a[p[0]] = S.a[p[0]] || [], row = rows[+p[1]] = rows[+p[1]] || {};
    if (value == null || value === "") delete row[p[2]]; else row[p[2]] = value;
  }
  function getPath(path) { var p = path.split("."); if (p.length === 1) return S.a[p[0]]; var r = (S.a[p[0]] || [])[+p[1]]; return r ? r[p[2]] : null; }
  function changed(rerender) {
    S.dirty = true; S.saveState = "pending";
    clearTimeout(S.timer); S.timer = setTimeout(save, 1200);
    if (rerender) render();
    else if (!isPr()) { var sv = $("ob-save"); if (sv) sv.textContent = T("ob.unsaved"); }
  }
  function save() {
    clearTimeout(S.timer);
    if (!S.dirty || !editable() || S.saving) return Promise.resolve();
    S.saving = true; S.saveState = "saving"; var sv = $("ob-save"); if (sv) sv.textContent = T("ob.saving");
    var sent = JSON.stringify(S.a);
    var body = isPr() ? { action: "practice", kind: S.pkind, answers: JSON.parse(sent) } : { action: "save", lead: S.lead, version: S.version, answers: JSON.parse(sent) };
    if (isPr()) { var sv2 = $("ob-save"); if (sv2) sv2.textContent = T("ob.pr_save"); }
    return api(body).then(function (x) {
      S.saving = false;
      if (isPr()) {
        if (!x.r.ok) { S.saveState = "error"; render(); msg(errText(x.j), true); return; }
        S.fields = x.j.fields || {}; S.d.missingNow = x.j.missing || [];
        S.dirty = JSON.stringify(S.a) !== sent; S.saveState = S.dirty ? "pending" : "saved";
        clearInterval(S.retry); S.retry = null;
        if (S.dirty) { clearTimeout(S.timer); S.timer = setTimeout(save, 800); }
        render();
        var bad = Object.keys(S.fields).length;
        if (bad && !S.errAnnounced) { S.errAnnounced = true; msg(T("ob.pr_refused"), true); }
        if (!bad) S.errAnnounced = false;
        return;
      }
      if (x.r.status === 409 && x.j.error === "CHANGED") { S.conflict = true; S.saveState = "error"; render(); return; }
      if (!x.r.ok) { S.saveState = "error"; render(); msg(errText(x.j), true); return; }
      S.version = x.j.version; S.fields = x.j.fields || {}; S.d.missingNow = x.j.missing || [];
      if (!S.d.form) S.d.form = { status: "DRAFT", answers: {}, version: S.version, editors: [S.d.me], checklist: [], setupNotes: [] };
      S.d.can.submit = true;
      S.dirty = JSON.stringify(S.a) !== sent; S.saveState = S.dirty ? "pending" : "saved"; S.savedAt = new Date();
      clearInterval(S.retry); S.retry = null;
      var hadErr = Object.keys(S.fields).length;
      if (S.dirty) { clearTimeout(S.timer); S.timer = setTimeout(save, 800); }
      render();
      if (hadErr && !S.errAnnounced) { S.errAnnounced = true; msg(T("ob.some_refused"), true); }
      if (!hadErr) S.errAnnounced = false;
    }).catch(function () {
      S.saving = false; S.saveState = "offline"; render();
      if (!S.retry) S.retry = setInterval(function () { if (navigator.onLine !== false) save(); }, 15000);
    });
  }
  window.addEventListener("online", function () { if (S.saveState === "offline") save(); });
  window.addEventListener("beforeunload", function (e) { if (S.dirty && editable() && !isPr()) { e.preventDefault(); e.returnValue = ""; } });

  function readControl(el) {
    var t = el.getAttribute("data-t"), path = el.getAttribute("data-p");
    if (t === "bool") return el.checked ? true : null;
    if (t === "multi") return Array.prototype.map.call(document.querySelectorAll('input[name="' + el.name + '"]:checked'), function (x) { return x.value; });
    if (el.type === "radio") return el.checked ? el.value : getPath(path);
    if (el.type === "number") return el.value === "" ? null : el.value;
    return el.value;
  }
  function goStep(i, focusId) {
    save();
    S.step = Math.max(0, Math.min(steps().length - 1, i));
    if (steps()[S.step] === "review") S.missingShown = true;
    S.navOpen = false;
    render();
    var el = focusId ? $(focusId) : $("ob-sec-h");
    // A group of choices or a block of rows: its first box takes the focus.
    if (el && /^(FIELDSET|DIV|P)$/.test(el.tagName)) el = el.querySelector("input:not([disabled]), select, textarea, button") || el;
    if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ block: "center" }); }
  }
  var findTimer = null;
  function wire() {
    var app = $("ob-app");
    app.querySelectorAll("[data-p]").forEach(function (el) {
      var ev = el.tagName === "SELECT" || el.type === "checkbox" || el.type === "radio" || el.type === "date" ? "change" : "input";
      el.addEventListener(ev, function () {
        var path = el.getAttribute("data-p"), v = readControl(el);
        setPath(path, v);
        delete S.fields[path];
        // Answers that show or hide other questions redraw the section.
        var re = ["p_start", "x_outcome"].indexOf(path) >= 0 || (el.tagName === "SELECT" && false);
        if ((el.type === "text" || el.tagName === "TEXTAREA") && el.getAttribute("data-p")) {
          var w = $(el.id + "-w"), p = personalIn(el.value);
          if (p && !w) { re = true; } else if (!p && w) { re = true; }
        }
        changed(re);
      });
    });
    app.querySelectorAll("[data-step]").forEach(function (b) { b.addEventListener("click", function () { goStep(+b.getAttribute("data-step")); }); });
    var sd = $("ob-steps-d"); if (sd) sd.addEventListener("toggle", function () { S.navOpen = sd.open; });
    var nx = $("ob-next"); if (nx) nx.addEventListener("click", function () { goStep(S.step + 1); });
    var pv = $("ob-prev"); if (pv) pv.addEventListener("click", function () { goStep(S.step - 1); });
    app.querySelectorAll("[data-goto]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var sec = a.getAttribute("data-goto"), k = a.getAttribute("data-focus"), parts = k.split(".");
        var id = parts.length > 1 ? "ob-" + parts[0] + "-" + parts[1] : (def(k) && def(k).t === "rows" ? "ob-" + k : "ob-" + k);
        goStep(S.d.sections.indexOf(sec), id);
      });
    });
    app.querySelectorAll("[data-addrow]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-addrow"); S.a[k] = (S.a[k] || []).concat([{}]);
        changed(true); var n = S.a[k].length - 1, f = def(k); var el = $("ob-" + k + "-" + n + "-" + f.cols[0].k); if (el) el.focus();
      });
    });
    app.querySelectorAll("[data-delrow]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-delrow"), i = +b.getAttribute("data-i");
        S.a[k] = (S.a[k] || []).filter(function (_, j) { return j !== i; }); if (!S.a[k].length) delete S.a[k];
        Object.keys(S.fields).forEach(function (p) { if (p.indexOf(k + ".") === 0) delete S.fields[p]; });
        changed(true); var add = document.querySelector('[data-addrow="' + k + '"]'); if (add) add.focus();
        msg(T("ob.row_removed"));
      });
    });
    app.querySelectorAll("[data-find]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var path = inp.getAttribute("data-find"), q = inp.value.trim(); S.pick[path] = inp.value;
        clearTimeout(findTimer);
        if (q.length < 2) { S.results[path] = null; var r0 = $(inp.id + "-r"); if (r0) r0.innerHTML = ""; return; }
        if (isPr()) {
          var ql = q.toLowerCase();
          S.results[path] = PR_WARDS.map(function (w, i) { return prWard(i); }).filter(function (w) { return w.label.toLowerCase().indexOf(ql) >= 0; });
          findTimer = setTimeout(render, 250); return;
        }
        findTimer = setTimeout(function () {
          fetch("/api/admin/onboarding?find=" + encodeURIComponent(q) + "&type=" + inp.getAttribute("data-type"), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { S.results[path] = j.results || []; render(); })
            .catch(function () { var r1 = $(inp.id + "-r"); if (r1) r1.textContent = T("ob.find_offline"); });
        }, 350);
      });
    });
    app.querySelectorAll("[data-pick]").forEach(function (b) {
      b.addEventListener("click", function () {
        var path = b.getAttribute("data-pick"), o = S.results[path][+b.getAttribute("data-i")];
        setPath(path, { type: o.type, id: o.id, label: o.label }); S.results[path] = null; S.pick[path] = "";
        changed(true); var id = "ob-" + path.split(".").join("-"); var el = document.querySelector('[data-unpick="' + path + '"]'); if (el) el.focus(); else if ($(id)) $(id).focus();
      });
    });
    app.querySelectorAll("[data-unpick]").forEach(function (b) {
      b.addEventListener("click", function () { var path = b.getAttribute("data-unpick"); setPath(path, null); changed(true); var el = $("ob-" + path.split(".").join("-")); if (el) el.focus(); });
    });
    var au = $("ob-add-units");
    if (au) au.addEventListener("click", function () {
      var rec = S.a.o_record;
      if (isPr()) {
        var haveP = (S.a.loc_rows || []).some(function (r) { return r.unit && r.unit.id === rec.id; });
        if (!haveP) S.a.loc_rows = (S.a.loc_rows || []).concat([{ unit: { type: rec.type, id: rec.id, label: rec.label } }]);
        changed(true); msg(T("ob.units_added", { n: haveP ? 0 : 1 })); return;
      }
      fetch("/api/admin/onboarding?units=" + rec.type + "&id=" + encodeURIComponent(rec.id), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
        var have = (S.a.loc_rows || []).map(function (r) { return r.unit && r.unit.id; }), added = 0;
        (j.results || []).forEach(function (u) { if (have.indexOf(u.id) < 0) { S.a.loc_rows = (S.a.loc_rows || []).concat([{ unit: u }]); added++; } });
        changed(true); msg(T("ob.units_added", { n: added }));
      }).catch(function () { msg(T("ob.find_offline"), true); });
    });
    var sb = $("ob-submit");
    if (sb && isPr()) sb.addEventListener("click", function () {
      if (S.d.missingNow && S.d.missingNow.length) { var m0 = $("ob-missing"); if (m0) m0.focus(); return; }
      S.prDone = true; render(); var dn = $("ob-prdone"); if (dn) dn.focus();
    });
    else if (sb) sb.addEventListener("click", function () {
      sb.disabled = true;
      api({ action: "submit", lead: S.lead, version: S.version }).then(function (x) {
        if (x.r.status === 400 && x.j.missing) { S.d.missingNow = x.j.missing; render(); var m = $("ob-missing"); if (m) m.focus(); return; }
        if (!x.r.ok) { sb.disabled = false; msg(errText(x.j), true); return; }
        S.dirty = false;
        return load().then(function () { msg(T("ob.done_submit")); var h = $("ob-h"); if (h) h.focus(); });
      }).catch(function () { sb.disabled = false; msg(T("adm.ss_e_net"), true); });
    });
    var ck = $("ob-check");
    if (ck) ck.addEventListener("click", function () {
      ck.disabled = true;
      api({ action: "check", lead: S.lead }).then(function (x) {
        if (!x.r.ok) { ck.disabled = false; msg(errText(x.j), true); return; }
        return load().then(function () { msg(T(x.j.status === "SENT" ? "ob.done_sent" : "ob.done_checked", { n: x.j.changeRequests || 0 })); });
      }).catch(function () { ck.disabled = false; msg(T("adm.ss_e_net"), true); });
    });
    var rf = $("ob-return");
    if (rf) {
      $("ob-return-note").addEventListener("input", function (e) { S.retNote = e.target.value; });
      rf.addEventListener("submit", function (e) {
        e.preventDefault();
        api({ action: "return", lead: S.lead, note: $("ob-return-note").value }).then(function (x) {
          if (x.r.status === 400) { S.retErr = true; render(); $("ob-return-note").focus(); return; }
          if (!x.r.ok) { msg(errText(x.j), true); return; }
          S.retErr = false; S.retNote = "";
          return load().then(function () { msg(T("ob.done_returned")); });
        }).catch(function () { msg(T("adm.ss_e_net"), true); });
      });
    }
    app.querySelectorAll("[data-task]").forEach(function (c) {
      c.addEventListener("change", function () {
        var k = c.getAttribute("data-task");
        api({ action: "task", lead: S.lead, task: k, done: c.checked }).then(function (x) {
          if (!x.r.ok) { c.checked = !c.checked; msg(errText(x.j), true); return; }
          var on = c.checked;
          return load().then(function () { msg(T(on ? "ob.done_task" : "ob.done_untask", { task: T("ob.task_" + k) })); var el = $("ob-task-" + k); if (el) el.focus(); });
        }).catch(function () { c.checked = !c.checked; msg(T("adm.ss_e_net"), true); });
      });
    });
    app.querySelectorAll("[data-restart]").forEach(function (b) {
      b.addEventListener("click", function () {
        clearTimeout(S.timer); practiceSetup(); S.dirty = true; S.msg = { text: T("ob.pr_restarted"), bad: false }; render(); save();
        var hh = $("ob-h"); if (hh) hh.focus();
      });
    });
    var pr = $("ob-print"); if (pr) pr.addEventListener("click", function () { window.print(); });
    var rl = $("ob-reload"); if (rl) rl.addEventListener("click", function () { S.dirty = false; clearTimeout(S.timer); load(); });
  }

  function applyTheme(theme) { document.documentElement.classList.toggle("light-theme", theme === "light"); var b = $("theme-toggle"); if (b) b.textContent = theme === "light" ? T("adm.theme_dark") : T("adm.theme_light"); }
  var saved = "dark"; try { saved = localStorage.getItem("griq-admin-theme") || "dark"; } catch (e) {}
  applyTheme(saved);
  var tt = $("theme-toggle");
  if (tt) tt.addEventListener("click", function () {
    var cur = "dark"; try { cur = localStorage.getItem("griq-admin-theme") || "dark"; } catch (e) {}
    var next = cur === "light" ? "dark" : "light"; try { localStorage.setItem("griq-admin-theme", next); } catch (e) {}
    applyTheme(next);
  });
  document.addEventListener("giq:lang", function () { var th = "dark"; try { th = localStorage.getItem("griq-admin-theme") || "dark"; } catch (e) {} applyTheme(th); if (S.mode === "example" && S.d && S.d.practice) practiceSetup(); render(); });
  load();
})();
