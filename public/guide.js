/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// public/guide.js (grieviq-40; grieviq-59: department journey uses the real reply wording;
// grieviq-79: citizens and representatives' offices see "The life of a complaint" diagram;
// grieviq-80: symbols on boxes, numbered steps, "Who does what" (replaces the contents list for
// offices and staff) and "What happens when" for departments, government officials and staff)
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
// grieviq-61: a search box at the top finds the steps for a question.
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
  // grieviq-79: the life of a complaint, drawn as a diagram in the citizen and
  // representative guides (and in the printed SOP book, which reads this).
  // Real text in an ordered list: who acts is a labelled chip, and "If late" /
  // "If not fixed" are words, so nothing depends on colour or shape alone.
  var LIFE = {
    title: ["The life of a complaint", "शिकायत का पूरा सफ़र"],
    lanes: { cit: ["Citizen", "नागरिक"], off: ["Representative's office", "जनप्रतिनिधि कार्यालय"], dep: ["Department", "विभाग"] },
    stages: [
      { t: ["Filed", "दर्ज"], lanes: ["cit"],
        d: ["The citizen (or a community helper for them) files it and gets a reference number. Time limits start now.", "नागरिक (या उनके लिए सामुदायिक सहायक) शिकायत दर्ज करता है और संदर्भ संख्या पाता है। समय-सीमा अभी से शुरू होती है।"] },
      { t: ["Acknowledged", "पावती"], lanes: ["off"],
        d: ["The representative's office acknowledges it by the date shown on the complaint.", "जनप्रतिनिधि कार्यालय शिकायत पर दिखाई गई तारीख़ तक पावती देता है।"],
        br: [["If late", "देर होने पर"], ["It is marked overdue and GrievIQ staff follow it up.", "यह विलंबित चिह्नित होती है और GrievIQ स्टाफ़ इस पर अनुवर्ती कार्रवाई करता है।"]] },
      { t: ["Assigned or forwarded", "सौंपी या भेजी गई"], lanes: ["off", "dep"],
        d: ["The office gives it to a field worker, or forwards it to the department responsible (its target is usually 7 days).", "कार्यालय इसे फ़ील्ड कर्मी को सौंपता है, या ज़िम्मेदार विभाग को भेजता है (उसका लक्ष्य आमतौर पर 7 दिन)।"],
        br: [["If late", "देर होने पर"], ["The case shows the days late, and government dashboards count late cases by department.", "मामले पर देरी के दिन दिखते हैं, और सरकारी डैशबोर्ड विभागवार देर वाले मामले गिनते हैं।"]] },
      { t: ["Work done and checked on site", "काम पूरा और मौके पर जाँच"], lanes: ["dep", "off"],
        d: ["The department reports the work with site photos, and the office's team checks it on the spot, with photos.", "विभाग साइट फ़ोटो के साथ काम की जानकारी देता है, और कार्यालय की टीम मौके पर फ़ोटो सहित जाँचती है।"],
        br: [["If not fixed", "ठीक न होने पर"], ["It is sent back to the department, and its target time starts again.", "यह विभाग को वापस भेजी जाती है, और उसका लक्ष्य समय फिर से शुरू होता है।"]] },
      { t: ["Marked resolved", "निस्तारित"], lanes: ["off"],
        d: ["The office approves the fix report and marks it resolved. Nobody approves their own report.", "कार्यालय समाधान रिपोर्ट स्वीकृत करके इसे निस्तारित करता है। कोई अपनी ही रिपोर्ट स्वीकृत नहीं करता।"] },
      { t: ["Confirmed by the citizen", "नागरिक द्वारा पुष्टि"], lanes: ["cit"],
        d: ["The citizen confirms the fix and rates the service. With no reply in 7 days, it closes as resolved, marked \"not confirmed\".", "नागरिक समाधान की पुष्टि करता है और सेवा को रेट करता है। 7 दिन में उत्तर न मिलने पर यह निस्तारित के रूप में बंद होती है, \"पुष्टि नहीं\" चिह्न के साथ।"],
        br: [["If not fixed", "ठीक न होने पर"], ["It goes back to the office or up a level. After closing, the citizen can reopen it once within 30 days; it then goes to the next level up with a fresh time limit.", "यह कार्यालय को वापस या एक स्तर ऊपर जाती है। बंद होने के बाद नागरिक 30 दिन में एक बार इसे दोबारा खोल सकता है; तब यह नई समय-सीमा के साथ अगले स्तर पर जाती है।"]] },
    ],
    rail: [["At every level", "हर स्तर पर"], ["If it is not resolved within that level's time limit, it moves up to the next level by itself, for example from the ward councillor to the MLA, then the MP. A few types, such as land disputes, have no time limit and are reviewed by GrievIQ staff instead.", "यदि उस स्तर की समय-सीमा में समाधान न हो, तो यह अपने-आप अगले स्तर पर जाती है, जैसे वार्ड पार्षद से विधायक, फिर सांसद। कुछ प्रकार, जैसे भूमि विवाद, की समय-सीमा नहीं होती; उनकी समीक्षा GrievIQ स्टाफ़ करता है।"]],
  };
  var LANE_ICON = {
    cit: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6"/>',
    off: '<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6M3 20h18"/>',
    dep: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z"/>',
  };
  function laneIcon(k) {
    return '<svg class="gq-ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + LANE_ICON[k] + "</svg>";
  }
  function lifeHtml(p) {
    return '<figure class="gq-life"><figcaption id="' + p + 'lcap">' + md(LIFE.title) + "</figcaption>" +
      '<ol class="gq-lc" aria-labelledby="' + p + 'lcap">' +
      LIFE.stages.map(function (s, i) {
        return '<li><span class="gq-n" aria-hidden="true">' + (i + 1) + '</span><div class="gq-lcb"><p class="gq-lct"><strong>' + md(s.t) + "</strong> " +
          s.lanes.map(function (k) { return '<span class="gq-chip">' + laneIcon(k) + md(LIFE.lanes[k]) + "</span>"; }).join(" ") + "</p>" +
          '<p class="gq-lcd">' + md(s.d) + "</p>" +
          (s.br ? '<p class="gq-br"><span aria-hidden="true">&#8627; </span><strong>' + md(s.br[0]) + ":</strong> " + md(s.br[1]) + "</p>" : "") +
          "</div></li>";
      }).join("") + "</ol>" +
      '<p class="gq-rail"><strong>' + md(LIFE.rail[0]) + ":</strong> " + md(LIFE.rail[1]) + "</p></figure>";
  }

  // grieviq-80: who does what (offices and staff) and what happens when
  // (departments, government officials, staff). The printed SOP book reads
  // these too, so each fact is written once.
  var ROLE_NAMES = {
    REPRESENTATIVE: ["Representative", "जनप्रतिनिधि"], OFFICE_MANAGER: ["Office manager", "कार्यालय प्रबंधक"], FIELD_WORKER: ["Field worker", "फ़ील्ड कर्मी"], OFFICE_ASSISTANT: ["Office assistant", "कार्यालय सहायक"],
    super_admin: ["Super admin", "सुपर एडमिन"], operations_admin: ["Operations admin", "संचालन एडमिन"], data_moderator: ["Data moderator", "डेटा मॉडरेटर"], data_entry_operator: ["Data entry operator", "डेटा एंट्री ऑपरेटर"],
    auditor: ["Auditor", "ऑडिटर"], accounts_executive: ["Accounts executive", "अकाउंट्स एग्ज़िक्यूटिव"], accounts_manager: ["Accounts manager", "अकाउंट्स मैनेजर"], support_executive: ["Support executive", "सपोर्ट एग्ज़िक्यूटिव"],
    sales_executive: ["Sales executive", "सेल्स एग्ज़िक्यूटिव"], sales_manager: ["Sales manager", "सेल्स मैनेजर"], management_viewer: ["Management (view only)", "प्रबंधन (केवल देखें)"],
    helper_checker: ["Helper checker (duty)", "सहायक जाँचकर्ता (दायित्व)"], helper_approver: ["Helper approver (duty)", "सहायक स्वीकर्ता (दायित्व)"],
  };
  var ROLE_COLS = {
    rep: ["REPRESENTATIVE", "OFFICE_MANAGER", "FIELD_WORKER", "OFFICE_ASSISTANT"],
    admin: ["super_admin", "operations_admin", "data_moderator", "data_entry_operator", "auditor", "accounts_executive", "accounts_manager", "support_executive", "sales_executive", "sales_manager", "management_viewer", "helper_checker", "helper_approver"],
  };
  var ROLE_ABBR = { super_admin: "SA", operations_admin: "OA", data_moderator: "DM", data_entry_operator: "DE", auditor: "AU", accounts_executive: "AE", accounts_manager: "AM", support_executive: "SE", sales_executive: "SX", sales_manager: "SM", management_viewer: "MV", helper_checker: "HC", helper_approver: "HA" };
  var WORDS = {
    who: ["Who does what", "कौन क्या करता है"], guide: ["Guide", "मार्गदर्शिका"], yes: ["yes", "हाँ"],
    key: ["● = this role follows the guide. Tap a guide to open it.", "● = यह भूमिका इस मार्गदर्शिका का पालन करती है। खोलने के लिए मार्गदर्शिका दबाएँ।"],
    codes: ["Codes:", "कोड:"],
    when: ["What happens when", "कब क्या होता है"],
  };
  var CODE10 = { id: "code", g: "access", w: ["10 minutes", "10 मिनट"], d: ["A sign-in code works once and expires after 10 minutes. GrievIQ never asks for a code by phone, chat or email.", "साइन-इन कोड एक बार काम करता है और 10 मिनट में समाप्त होता है। GrievIQ कभी फ़ोन, चैट या ईमेल पर कोड नहीं माँगता।"] };
  var TIMES = {
    dept: [
      { id: "target", g: "work", life: true, w: ["Target date", "लक्ष्य तिथि"], d: ["Reply on a forwarded case by the target date shown on it (usually 7 days). It starts again when the case is sent back after the check on site.", "भेजे गए मामले पर उस पर दिखाई गई लक्ष्य तिथि (आमतौर पर 7 दिन) तक उत्तर दें। मौके की जाँच के बाद वापस भेजने पर यह फिर शुरू होती है।"] },
      { id: "fu", g: "work", w: ["Reply-by date", "उत्तर-तिथि"], d: ["Answer a follow-up request by the date it gives; GrievIQ reminds you 2 days before. On that date the same figure is measured again and shown to the sender.", "अनुवर्ती अनुरोध का उत्तर उसकी दी गई तिथि तक दें; GrievIQ 2 दिन पहले याद दिलाता है। उस दिन वही आँकड़ा फिर मापा जाता है और भेजने वाले को दिखाया जाता है।"] },
      { id: "officer", g: "work", w: ["3 working days", "3 कार्य दिवस"], d: ["Tell support@grieviq.in when an officer leaves or is transferred. GrievIQ removes their access within 1 working day.", "कोई अधिकारी जाए या स्थानांतरित हो तो support@grieviq.in को बताएँ। GrievIQ 1 कार्य दिवस में उनकी पहुँच हटाता है।"] },
      CODE10,
    ],
    gov: [
      CODE10,
      { id: "session", g: "access", w: ["1 hour, 8 hours", "1 घंटा, 8 घंटे"], d: ["You are signed out after 1 hour without activity, or 8 hours after signing in.", "1 घंटे तक कोई गतिविधि न होने पर, या साइन इन के 8 घंटे बाद, आप साइन आउट हो जाते हैं।"] },
      { id: "fu", g: "work", w: ["Reply-by date", "उत्तर-तिथि"], d: ["You choose 7, 15 or 30 days when you send a follow-up request. The office is reminded 2 days before; on the date, the figure is measured again for you to close the request or ask again.", "अनुवर्ती अनुरोध भेजते समय आप 7, 15 या 30 दिन चुनते हैं। कार्यालय को 2 दिन पहले याद दिलाया जाता है; उस दिन आँकड़ा फिर मापा जाता है, ताकि आप अनुरोध बंद करें या फिर से पूछें।"] },
      { id: "govyear", g: "access", w: ["Every year", "हर साल"], d: ["Your department confirms you still need access. If this is more than 30 days late, sign-in stops until it is confirmed.", "आपका विभाग पुष्टि करता है कि आपको अभी भी पहुँच चाहिए। इसमें 30 दिन से अधिक देर होने पर पुष्टि होने तक साइन इन रुक जाता है।"] },
    ],
    admin: [
      CODE10,
      { id: "cert", g: "access", w: ["6 hours", "6 घंटे"], d: ["CERT-In expects some security incidents to be reported within 6 hours: tell the Security contact at once.", "CERT-In कुछ सुरक्षा घटनाओं की सूचना 6 घंटे में चाहता है: सुरक्षा संपर्क को तुरंत बताएँ।"] },
      { id: "policy", g: "access", w: ["Every year", "हर साल"], d: ["Every staff member accepts the staff policies again, and again whenever a policy changes.", "हर स्टाफ़ सदस्य स्टाफ़ नीतियाँ फिर से स्वीकार करता है, और हर बार जब कोई नीति बदले।"] },
      { id: "contract", g: "staff", w: ["14 and 3 days before", "14 और 3 दिन पहले"], d: ["The manager and super admins are reminded that a contract ends. After its last day, access pauses.", "प्रबंधक और सुपर एडमिन को अनुबंध समाप्ति की याद दिलाई जाती है। अंतिम दिन के बाद पहुँच रुक जाती है।"] },
      { id: "idle", g: "staff", w: ["45 and 90 days", "45 और 90 दिन"], d: ["With no sign-in, an account is flagged at 45 days and its access pauses at 90 (never a super admin's).", "साइन इन न होने पर खाता 45 दिन पर चिह्नित होता है और 90 दिन पर उसकी पहुँच रुकती है (सुपर एडमिन की कभी नहीं)।"] },
      { id: "review", g: "staff", w: ["Every quarter", "हर तिमाही"], d: ["Access review: someone else decides keep, change or remove for each person.", "पहुँच समीक्षा: हर व्यक्ति के लिए कोई दूसरा तय करता है कि रखें, बदलें या हटाएँ।"] },
      { id: "hmonth", g: "helpers", w: ["5 days before", "5 दिन पहले"], d: ["A community helper is reminded that their month ends. After 3 days' grace, the role pauses until they pay.", "सामुदायिक सहायक को महीना समाप्त होने की याद दिलाई जाती है। 3 दिन की छूट के बाद भुगतान तक भूमिका रुक जाती है।"] },
      { id: "hphoto", g: "helpers", w: ["30 days", "30 दिन"], d: ["A helper's ID photos are deleted 30 days after the decision on their application, and their card photo as soon as they stop being a helper.", "सहायक की पहचान फ़ोटो आवेदन पर निर्णय के 30 दिन बाद, और कार्ड फ़ोटो उनके सहायक न रहने पर तुरंत हटा दी जाती है।"] },
      { id: "hyear", g: "helpers", w: ["Every year", "हर साल"], d: ["Each community helper's identity is checked again.", "हर सामुदायिक सहायक की पहचान फिर से जाँची जाती है।"] },
    ],
  };
  var GI = {
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    warn: '<path d="M12 3.5L2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17v.01"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.6c2.6.3 4.5 2.2 4.5 5"/>',
  };
  function gi(k) {
    return '<svg class="gq-ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + GI[k] + "</svg>";
  }
  function whoHtml(kind, sops, p, h2) {
    var cols = ROLE_COLS[kind], abbr = kind === "admin";
    var head = cols.map(function (c) {
      return '<th scope="col">' + (abbr ? '<abbr title="' + esc(pick(ROLE_NAMES[c])) + '">' + ROLE_ABBR[c] + "</abbr>" : md(ROLE_NAMES[c])) + "</th>";
    }).join("");
    var rows = sops.map(function (s) {
      var rs = s.roles || cols;
      return '<tr><th scope="row"><a href="#' + p + esc(s.id) + '" data-gq-jump="' + esc(s.id) + '">' + md(s.title) + "</a></th>" +
        cols.map(function (c) { return rs.indexOf(c) >= 0 ? '<td><span aria-hidden="true">●</span><span class="gq-vh">' + esc(pick(WORDS.yes)) + "</span></td>" : "<td></td>"; }).join("") + "</tr>";
    }).join("");
    var key = '<p class="gq-mkey">' + esc(pick(WORDS.key)) + (abbr ? " " + esc(pick(WORDS.codes)) + " " + cols.map(function (c) { return "<strong>" + ROLE_ABBR[c] + "</strong> " + md(ROLE_NAMES[c]); }).join(" · ") : "") + "</p>";
    return '<nav class="gq-toc gq-whot" aria-labelledby="' + p + 'toc"><' + h2 + ' id="' + p + 'toc">' + gi("people") + esc(pick(WORDS.who)) + "</" + h2 + ">" +
      '<div class="gq-mxw" role="region" tabindex="0" aria-labelledby="' + p + 'toc"><table class="gq-mx' + (abbr ? " gq-mx-s" : "") + '"><thead><tr><th scope="col">' + esc(pick(WORDS.guide)) + "</th>" + head + "</tr></thead><tbody>" + rows + "</tbody></table></div>" + key + "</nav>";
  }
  function timesHtml(kind, p, h2) {
    var list = TIMES[kind];
    if (!list) return "";
    return '<section class="gq-when" aria-labelledby="' + p + 'when"><' + h2 + ' id="' + p + 'when">' + gi("clock") + esc(pick(WORDS.when)) + "</" + h2 + '><ul class="gq-tl">' +
      list.map(function (it) { return '<li><span class="gq-pill">' + md(it.w) + '</span><span class="gq-tx">' + md(it.d) + "</span></li>"; }).join("") + "</ul></section>";
  }

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
      ["Reply with the position: a date fixed, work started or work done, with photos", "स्थिति बताएँ: तारीख़ तय, काम शुरू या काम पूरा, फ़ोटो सहित"],
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

  // ---- grieviq-61: search the guide ----
  // A question typed in the box finds the matching steps at once, in English
  // or Hindi, using the guide's own words plus everyday words (UTR -> bills,
  // leave -> staff leave, ...). It runs in the browser on the guide text only:
  // nothing typed is sent anywhere or stored.
  var STOP = ("a an the to of in on for and or is are am be do does did i my me we our you your it its this that these those how what when where which who why can could should would will shall may please there here with from by at as about into get give make want need tell show find someone somebody anyone going go new old just now also any some all one " +
    "kaise kaisa kese kya kab kahan kaun kyon kyu mera meri mere hum hamara aap apna apni ka ki ke ko se me mein par hai hain tha thi kare karen karein karna karu kar aur ya bhi to ye yeh wo woh ek liye sath chahiye sakta sakte hota hoti " +
    "कैसे क्या कब कहाँ कौन क्यों मैं मेरा मेरी मेरे हम हमारा आप आपका आपकी आपके का की के को से में पर है हैं था थी थे हो होता होती करें करना करूँ करते कर और या भी तो यह वह ये वे एक लिए साथ बारे चाहिए सकता सकती सकते").split(" ");
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });
  // Words that mean the same thing to the reader, in either language.
  var SYN = [
    "pay payment paid bill bills invoice upi utr bank money fee fees refund bhugtan भुगतान बिल पैसा राशि",
    "price prices plan plans cost charge charges rate pricing subscription शुल्क मूल्य योजना कीमत सदस्यता",
    "sign signin login log logout code otp password reset access साइन लॉगिन कोड पासवर्ड पहुँच",
    "staff employee employees user users member members person people team colleague स्टाफ़ कर्मचारी टीम सदस्य व्यक्ति",
    "leave holiday absent absence vacation cover अवकाश छुट्टी",
    "remove delete left leaving quit resign resigned हटाएँ हटाना छोड़",
    "transfer transferred move posting स्थानांतरण",
    "complaint complaints case cases grievance issue problem shikayat shikayaten samasya शिकायत शिकायतें मामला मामले समस्या",
    "department departments dept office offices officer officers विभाग कार्यालय अधिकारी",
    "forward forwarded refer send sent inform intimate अग्रेषित भेजें भेजना",
    "photo photos picture pictures image images pic फ़ोटो तस्वीर",
    "notice notices announcement advertisement advert सूचना सूचनाएँ",
    "election elections mcc vote votes poll चुनाव आचार संहिता",
    "ward wards area areas city district village वार्ड क्षेत्र शहर ज़िला गाँव",
    "rating ratings rate rated feedback review stars satisfaction रेटिंग फ़ीडबैक",
    "reopen reopened again दोबारा",
    "track tracking status progress स्थिति ट्रैक",
    "alert alerts notification notifications notify bell push घंटी अपडेट",
    "report reports pdf excel download export csv print रिपोर्ट डाउनलोड प्रिंट",
    "privacy personal data erase consent गोपनीयता डेटा सहमति",
    "late overdue delay delayed pending slow stuck nudge remind reminder exception escalated unresponsive responding देर लंबित अटका अनुस्मारक",
    "limit limits deadline deadlines timeline समय-सीमा अवधि",
    "suspend pause paused stop block disable deactivate रोकें रोक",
    "copy copies copied clone नक़ल प्रति",
    "representative representatives corporator councillor councilor pradhan sarpanch mla mp mayor पार्षद जनप्रतिनिधि विधायक सांसद प्रधान महापौर",
    "change update edit modify correct badle badlein बदलें बदलना सुधारें",
    "pilot trial पायलट",
    "location gps geotag map pin स्थान लोकेशन नक़्शा",
    "add adding create insert enter register put onboard jode jodna jodein जोड़ें जोड़ना जोड़ जोड़े",
    "government state official officials ministry सरकार सरकारी राज्य मंत्रालय",
    "check verify confirm confirmed approve approval जाँच पुष्टि स्वीकृत",
    "resolve resolved fix fixed done solve solved निस्तारित समाधान ठीक",
    "email mail ईमेल",
    "phone mobile number call फ़ोन मोबाइल नंबर",
  ].map(function (g) { return g.split(" ").map(normWord); });
  function normWord(w) {
    w = String(w || "").toLowerCase().replace(/़/g, "").replace(/ँ/g, "ं");
    if (/^[a-z]+$/.test(w)) {
      if (w.length > 4 && /ies$/.test(w)) w = w.slice(0, -3) + "y";
      else if (w.length > 5 && /ing$/.test(w)) w = w.slice(0, -3);
      else if (w.length > 4 && /ed$/.test(w)) w = w.slice(0, -2);
      else if (w.length > 4 && /es$/.test(w)) w = w.slice(0, -2);
      else if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
    }
    return w;
  }
  function words(text) {
    return String(text || "").replace(/\*\*/g, "").toLowerCase().split(/[^\p{L}\p{M}\p{N}@]+/u).filter(Boolean).map(normWord);
  }
  function same(a, b) {   // b is a word of the guide
    if (a === b) return true;
    return a.length >= 5 && b.length >= 5 && (b.indexOf(a) === 0 || a.indexOf(b) === 0);
  }
  // Each word of the question becomes a "concept": the word and its synonyms.
  function concepts(q) {
    var out = [];
    words(q).forEach(function (w) {
      if (!w || STOPSET[w] || (w.length < 2)) return;
      var set = [w];
      SYN.forEach(function (g) { if (g.some(function (x) { return same(w, x) || same(x, w); })) set = set.concat(g); });
      out.push(set);
    });
    return out;
  }
  // A word of the question found as typed counts 1; found only through a
  // word that means the same counts 0.6, so the closest guide comes first.
  // A word found in many parts of the guide ("add", "member") tells less
  // than a rare one ("staff", "UTR"), so each word is weighted by rarity.
  function hits(cs, ws) {
    var n = 0;
    cs.forEach(function (set) {
      var wt = set.weight || 1;
      if (ws.some(function (w) { return same(set[0], w); })) n += wt;
      else if (ws.some(function (w) { return set.some(function (x) { return same(x, w); }); })) n += 0.6 * wt;
    });
    return n;
  }
  function weigh(cs, docs) {
    cs.forEach(function (set) {
      var df = docs.filter(function (ws) { return ws.some(function (w) { return same(set[0], w); }); }).length;
      set.weight = df <= 2 ? 1 : df <= 5 ? 0.75 : 0.5;
    });
  }
  // Search reads both languages, so a question typed in English finds the
  // answer while Help is in Hindi, and the other way round.
  function both(pair) { return pair ? (pair[0] || "") + " " + (pair[1] || "") : ""; }
  function askOf(pair) {
    return pair ? (pair[0] + ";" + (pair[1] || "")).split(";").map(function (x) { return x.trim(); }).filter(Boolean) : [];
  }
  function search(kind, roles, q) {
    var g = G()[kind]; if (!g) return [];
    var cs = concepts(q); if (!cs.length) return [];
    var qs = words(q).join(" ");
    var qk = " " + words(q).filter(function (w) { return !STOPSET[w]; }).join(" ") + " ";
    // A typical question ("ask"): its words, plus a bonus when it holds every
    // word asked, and more when it holds the question word for word.
    function askScore(phrase, extra) {
      var pw = words(phrase), n = hits(cs, pw.concat(extra));
      if (n > 0 && cs.every(function (set) { return pw.some(function (w) { return set.some(function (x) { return same(x, w); }); }); })) n += 0.4;
      if (qs.indexOf(" ") > 0 && (" " + pw.join(" ") + " ").indexOf(" " + qs + " ") >= 0) return n + 1;
      var pk = " " + pw.filter(function (w) { return !STOPSET[w]; }).join(" ") + " ";
      if (pk === qk) n += 1;
      else if (qk.split(" ").length > 3 && pk.length > 3 && (pk.indexOf(qk) >= 0 || qk.indexOf(pk) >= 0)) n += 0.6;
      return n;
    }
    var sops = sopsFor(g, roles);
    weigh(cs, sops.map(function (sop) {
      return words([both(sop.title)].concat([].concat(sop.what ? [sop.what] : [], sop.steps || [], sop.check || [], sop.note || []).map(both)).join(" ") + " " + askOf(sop.ask).join(" "));
    }));
    var need = Math.max(0.3, Math.ceil(cs.length / 2) * 0.3);
    var found = [];
    sops.forEach(function (sop) {
      var tw = words(both(sop.title));
      var titleHits = hits(cs, tw);
      var best = null, near = null;   // near: the step closest to the question, even if weak
      var parts = [].concat(sop.what ? [sop.what] : [], sop.steps || [], sop.check || [], sop.note || []);
      parts.forEach(function (pair) {
        var ww = words(both(pair)).concat(tw);
        var n = hits(cs, ww);
        if (n > 0 && (!near || n > near.n)) near = { n: n, pair: pair };
        if (n >= need && (!best || n > best.n)) best = { n: n, pair: pair };
      });
      // The typical questions this part answers ("how do I add a field worker",
      // "staff kaise add kare"), in both languages, so a question finds it
      // whichever language the person types in.
      askOf(sop.ask).forEach(function (phrase) {
        var n = askScore(phrase, tw);
        if (n >= need && (!best || n > best.n)) best = { n: n, pair: near ? near.pair : (sop.steps || [])[0] };
      });
      if (!best && titleHits >= need) best = { n: titleHits, pair: (sop.steps || [])[0] };
      if (best) found.push({ sop: sop, n: best.n + titleHits * 0.8, pair: best.pair, cs: cs });
    });
    (g.problems || []).forEach(function (pr) {
      var n = Math.max.apply(null, [hits(cs, words(both(pr[0]) + " " + both(pr[1])))].concat(askOf(pr[2]).map(function (ph) { return askScore(ph, words(both(pr[0]))); })));
      // Scored like a guide part: its heading counts a little extra.
      if (n >= need) found.push({ problem: pr, n: n + hits(cs, words(both(pr[0]))) * 0.2, cs: cs });
    });
    found.sort(function (a, b) { return b.n - a.n; });
    // Only results close to the best one: weak matches only add noise.
    var top = found.length ? found[0].n : 0;
    return found.filter(function (r) { return r.n >= top * 0.5; }).slice(0, 5);
  }
  // The step's text, escaped, with the matching words marked.
  function marked(pair, cs) {
    var text = pick(pair).replace(/\*\*/g, "");
    return text.split(/([^\p{L}\p{M}\p{N}@]+)/u).map(function (part) {
      var w = normWord(part);
      var hit = w && !STOPSET[w] && cs.some(function (set) { return set.some(function (x) { return same(x, w); }); });
      return hit ? "<mark>" + esc(part) + "</mark>" : esc(part);
    }).join("");
  }
  function resultsHtml(kind, roles, q) {
    q = String(q || "").trim();
    if (!q) return { html: "", status: "" };
    var list = search(kind, roles, q);
    if (!list.length) return { html: '<p class="gq-snone">' + esc(t("guide.search_none")) + "</p>", status: t("guide.search_none") };
    var html = '<ol class="gq-sres-list">' + list.map(function (r) {
      if (r.problem) return '<li><span class="gq-stitle">' + marked(r.problem[0], r.cs) + '</span><span class="gq-ssnip">' + marked(r.problem[1], r.cs) + "</span></li>";
      var si = (r.sop.steps || []).indexOf(r.pair);
      return '<li><a href="#" class="gq-stitle" data-gq-jump="' + esc(r.sop.id) + '"' + (si >= 0 ? ' data-gq-step="' + si + '"' : "") + ">" + esc(pick(r.sop.title)) + '</a>' +
        (r.pair ? '<span class="gq-ssnip">' + marked(r.pair, r.cs) + "</span>" : "") + "</li>";
    }).join("") + "</ol>";
    return { html: html, status: t(list.length === 1 ? "guide.search_one" : "guide.search_n", { n: list.length }) };
  }
  var LENS = '<svg class="gq-lens" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  function searchHtml(kind, roles, p, q) {
    var r = resultsHtml(kind, roles, q);
    return '<div class="gq-search gq-noprint" role="search" data-gq-kind="' + esc(kind) + '" data-gq-roles="' + esc(JSON.stringify(roles || [])) + '">' +
      '<label for="' + p + 'q">' + esc(t("guide.search_label")) + "</label>" +
      '<div class="gq-sbox">' + LENS + '<input type="search" id="' + p + 'q" data-gq-q autocomplete="off" spellcheck="false" enterkeyhint="search" aria-describedby="' + p + 'shint" placeholder="' + esc(t("guide.search_ph")) + '" value="' + esc(q || "") + '"></div>' +
      '<p class="gq-shint" id="' + p + 'shint">' + esc(t("guide.search_hint")) + "</p>" +
      '<p class="gq-vh" role="status" data-gq-status>' + esc(r.status) + "</p>" +
      '<div class="gq-sres" data-gq-results>' + r.html + "</div></div>";
  }
  function runSearch(input) {
    var box = input.closest(".gq-search"); if (!box) return;
    var roles = []; try { roles = JSON.parse(box.getAttribute("data-gq-roles") || "[]"); } catch (e) { roles = []; }
    var r = resultsHtml(box.getAttribute("data-gq-kind"), roles, input.value);
    box.querySelector("[data-gq-results]").innerHTML = r.html;
    var st = box.querySelector("[data-gq-status]");
    clearTimeout(runSearch.timer);
    // Announce the count once typing pauses, not on every key.
    runSearch.timer = setTimeout(function () { st.textContent = r.status; }, 600);
  }
  document.addEventListener("input", function (e) { if (e.target && e.target.matches && e.target.matches("[data-gq-q]")) runSearch(e.target); });
  // Enter jumps to the first result.
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || !e.target || !e.target.matches || !e.target.matches("[data-gq-q]")) return;
    e.preventDefault();
    var first = e.target.closest(".gq-search").querySelector("[data-gq-results] [data-gq-jump]");
    if (first) first.click();
  });
  function currentQuery(container) { var i = container && container.querySelector("[data-gq-q]"); return i ? i.value : ""; }

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
    if (opts.search !== false) out.push(searchHtml(kind, opts.roles, p, opts.query));
    out.push('<p class="gq-intro">' + md(g.intro) + "</p>");
    var steps = JOURNEYS[g.journey];
    if (g.life) out.push(lifeHtml(p));
    else if (steps) {
      out.push('<figure class="gq-journey"><figcaption id="' + p + 'jcap">' + esc(t("guide.journey")) + "</figcaption>" +
        '<ol class="gq-flow" aria-labelledby="' + p + 'jcap">' +
        steps.map(function (s, i) { return '<li><span class="gq-n" aria-hidden="true">' + (i + 1) + "</span><span>" + md(s) + "</span></li>"; }).join("") +
        "</ol></figure>");
    }
    if (g.rules && g.rules.length) {
      out.push('<section class="gq-rules" aria-labelledby="' + p + 'rules"><' + h2 + ' id="' + p + 'rules">' + gi("shield") + esc(t("guide.rules")) + "</" + h2 + "><ul>" +
        g.rules.map(function (r) { return "<li>" + md(r) + "</li>"; }).join("") + "</ul></section>");
    }
    out.push(timesHtml(kind, p, h2));
    if (ROLE_COLS[kind] && sops.length > 1) out.push(whoHtml(kind, sops, p, h2));
    else if (sops.length > 1) {
      out.push('<nav class="gq-toc" aria-labelledby="' + p + 'toc"><' + h2 + ' id="' + p + 'toc">' + esc(t("guide.contents")) + "</" + h2 + "><ol>" +
        sops.map(function (s) { return '<li><a href="#' + p + esc(s.id) + '" data-gq-jump="' + esc(s.id) + '">' + md(s.title) + "</a></li>"; }).join("") +
        "</ol></nav>");
    }
    sops.forEach(function (s, i) {
      var who = s.who ? '<p class="gq-who"><strong>' + esc(t("guide.who")) + "</strong> " + md(s.who) + "</p>" : "";
      var what = s.what ? '<p class="gq-who"><strong>' + esc(t("guide.what")) + "</strong> " + md(s.what) + "</p>" : "";
      var check = (s.check && s.check.length) ? "<" + h3 + ' class="gq-ich">' + gi("check") + esc(t("guide.check")) + "</" + h3 + '><ul class="gq-check">' +
        s.check.map(function (c) { return "<li>" + md(c) + "</li>"; }).join("") + "</ul>" : "";
      var note = (s.note || []).map(function (n) { return '<p class="gq-note">' + gi("info") + "<span>" + md(n) + "</span></p>"; }).join("");
      out.push('<section class="gq-sop" id="' + p + esc(s.id) + '" tabindex="-1" aria-labelledby="' + p + esc(s.id) + '-h">' +
        "<" + h2 + ' id="' + p + esc(s.id) + '-h"><span class="gq-sn">' + (i + 1) + ".</span> " + md(s.title) + "</" + h2 + ">" +
        what + who + "<" + h3 + ">" + esc(t("guide.steps")) + "</" + h3 + '><ol class="gq-steps">' +
        s.steps.map(function (st, i) { return '<li data-gq-i="' + i + '">' + md(st) + "</li>"; }).join("") + "</ol>" + check + note + "</section>");
    });
    if (g.problems && g.problems.length) {
      out.push('<section class="gq-problems" aria-labelledby="' + p + 'prob"><' + h2 + ' id="' + p + 'prob">' + gi("warn") + esc(t("guide.problems")) + "</" + h2 + "><dl>" +
        g.problems.map(function (pr) { return "<dt>" + md(pr[0]) + "</dt><dd>" + md(pr[1]) + "</dd>"; }).join("") + "</dl></section>");
    }
    if (g.contacts) out.push('<p class="gq-contacts">' + gi("phone") + "<span>" + md(g.contacts) + "</span></p>");
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
    // grieviq-79: the life of a complaint
    ".gq-root figure.gq-life{margin:0 0 18px;padding:14px;border:1px solid var(--gq-border);border-radius:12px;background:var(--gq-card)}" +
    ".gq-root ol.gq-lc{list-style:none;margin:0;padding:0}" +
    ".gq-root ol.gq-lc>li{position:relative;display:flex;gap:10px;margin:0;padding:0 0 12px}" +
    ".gq-root ol.gq-lc>li:not(:last-child)::before{content:'';position:absolute;left:12px;top:28px;bottom:2px;border-left:2px solid var(--gq-muted)}" +
    ".gq-root .gq-lcb{flex:1;min-width:0}.gq-root .gq-lct{margin:2px 0 2px;line-height:1.5}.gq-root .gq-lcd{margin:0;font-size:14px;line-height:1.45;color:var(--gq-fg)}" +
    ".gq-root .gq-chip{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;line-height:1.3;padding:1px 8px;margin:2px 0;border:1px solid var(--gq-border);border-radius:999px;background:var(--gq-bg);color:var(--gq-fg);white-space:nowrap}" +
    ".gq-root .gq-ic{flex:0 0 auto}" +
    ".gq-root .gq-br{margin:6px 0 0;padding:4px 0 4px 10px;border-left:3px dashed var(--gq-accent);font-size:13.5px;line-height:1.45;color:var(--gq-fg)}" +
    ".gq-root .gq-rail{margin:4px 0 0;padding:9px 12px;border-radius:8px;background:var(--gq-note-bg);color:var(--gq-note-fg);font-size:14px;line-height:1.45}" +
    // grieviq-80: symbols, numbered steps, who does what, what happens when
    ".gq-root .gq-ic{flex:0 0 auto;vertical-align:-3px;margin-right:6px}" +
    ".gq-root .gq-rules h2,.gq-root .gq-rules h3,.gq-root .gq-problems>h2,.gq-root .gq-problems>h3,.gq-root .gq-ich,.gq-root .gq-whot>h2,.gq-root .gq-whot>h3,.gq-root .gq-when>h2,.gq-root .gq-when>h3{display:flex;align-items:center}" +
    ".gq-root .gq-note,.gq-root .gq-contacts{display:flex;gap:2px;align-items:flex-start}.gq-root .gq-note .gq-ic,.gq-root .gq-contacts .gq-ic{margin-top:1px}" +
    ".gq-root ol.gq-steps{list-style:none;counter-reset:gqs;padding-left:0}" +
    ".gq-root ol.gq-steps>li{counter-increment:gqs;position:relative;padding:1px 0 1px 34px;min-height:26px}" +
    ".gq-root ol.gq-steps>li::before{content:counter(gqs);position:absolute;left:0;top:1px;width:24px;height:24px;border-radius:50%;background:var(--gq-accent);color:var(--gq-on-accent);font-weight:700;font-size:12.5px;display:flex;align-items:center;justify-content:center;line-height:1}" +
    ".gq-root .gq-mxw{overflow-x:auto;margin:0 0 6px;border:1px solid var(--gq-border);border-radius:10px}.gq-root .gq-mxw:focus-visible{outline:3px solid var(--gq-focus);outline-offset:2px}" +
    ".gq-root table.gq-mx{border-collapse:collapse;width:100%;font-size:13.5px;line-height:1.35}" +
    ".gq-root .gq-mx th,.gq-root .gq-mx td{border-bottom:1px solid var(--gq-border);padding:6px 8px;text-align:center;vertical-align:middle}" +
    ".gq-root .gq-mx thead th{background:var(--gq-card);color:var(--gq-fg);font-weight:600;font-size:12.5px}" +
    ".gq-root .gq-mx tbody th{text-align:left;font-weight:400;min-width:150px}.gq-root .gq-mx tbody tr:last-child>*{border-bottom:0}" +
    ".gq-root .gq-mx td{color:var(--gq-fg);font-size:14px}.gq-root .gq-mx-s th,.gq-root .gq-mx-s td{padding:5px 4px}.gq-root .gq-mx-s tbody th{padding-left:8px}" +
    ".gq-root .gq-mx abbr{text-decoration:none;cursor:help}" +
    ".gq-root nav.gq-whot .gq-mx a,.gq-root nav.gq-whot .gq-mx a:hover{display:inline-block;padding:3px 0;min-height:24px;color:var(--gq-link);text-decoration:underline;background:none;border:0;border-radius:0;font-size:inherit;font-weight:400}" +
    ".gq-root .gq-mkey{font-size:13px;color:var(--gq-muted);margin:0 0 16px}" +
    ".gq-root .gq-when{margin:0 0 18px}.gq-root ul.gq-tl{list-style:none;margin:6px 0 0;padding:0 0 0 6px}" +
    ".gq-root ul.gq-tl>li{position:relative;margin:0;padding:0 0 12px 18px;border-left:2px solid var(--gq-muted)}.gq-root ul.gq-tl>li:last-child{border-left-color:transparent;padding-bottom:2px}" +
    ".gq-root ul.gq-tl>li::before{content:'';position:absolute;left:-7px;top:3px;width:10px;height:10px;border-radius:50%;background:var(--gq-bg);border:2px solid var(--gq-accent)}" +
    ".gq-root .gq-pill{display:inline-block;font-weight:600;font-size:13px;padding:1px 9px;border-radius:999px;border:1px solid var(--gq-border);background:var(--gq-card);color:var(--gq-fg);margin-bottom:3px}.gq-root .gq-tx{display:block;font-size:14px;line-height:1.45;color:var(--gq-fg)}" +
    ".gq-root .gq-rules{border-left:4px solid var(--gq-accent);background:var(--gq-card);border-radius:0 10px 10px 0;padding:4px 14px 4px;margin:0 0 18px}" +
    ".gq-root .gq-rules ul,.gq-root .gq-check{margin:0 0 10px;padding-left:20px}.gq-root li{margin:0 0 6px}" +
    ".gq-root .gq-toc ol{margin:0 0 14px;padding-left:22px}.gq-root .gq-toc li{margin:0 0 2px}" +
    // (pages style "nav a" for their menus; the guide's contents must still look like links)
    ".gq-root nav.gq-toc a,.gq-root nav.gq-toc a:hover{display:inline-block;padding:4px 0;min-height:24px;color:var(--gq-link);text-decoration:underline;background:none;border:0;border-radius:0;font-size:inherit;font-weight:400}" +
    ".gq-root .gq-sop{border-top:1px solid var(--gq-border);padding-top:6px;margin-top:14px;scroll-margin-top:12px}" +
    ".gq-root .gq-sn{color:var(--gq-muted)}.gq-root .gq-who{margin:0 0 8px;color:var(--gq-fg)}.gq-root .gq-who strong{font-weight:600}" +
    ".gq-root ol.gq-steps{margin:0 0 10px}.gq-root ol.gq-steps li{border-radius:4px;transition:background-color .3s}" +
    ".gq-root ol.gq-steps li.gq-hit{background:var(--gq-note-bg);color:var(--gq-note-fg);outline:2px solid var(--gq-focus);outline-offset:2px}" +
    ".gq-root .gq-note{background:var(--gq-note-bg);color:var(--gq-note-fg);border-radius:8px;padding:9px 12px;margin:6px 0 10px;font-size:14px}" +
    ".gq-root .gq-problems dt{font-weight:600;margin-top:10px}.gq-root .gq-problems dd{margin:2px 0 0 0;color:var(--gq-fg)}" +
    ".gq-root .gq-contacts{margin-top:18px;padding-top:12px;border-top:1px solid var(--gq-border);font-size:14px;overflow-wrap:anywhere}" +
    ".gq-root strong{font-weight:600}" +
    // grieviq-61: the search box (44 px, label always visible, AA in light and dark)
    ".gq-root .gq-search{margin:0 0 16px}.gq-root .gq-search label{display:block;font-weight:600;margin:0 0 6px}" +
    ".gq-root .gq-sbox{position:relative}.gq-root .gq-lens{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--gq-muted);pointer-events:none}" +
    ".gq-root input[type=search]{box-sizing:border-box;width:100%;min-height:44px;padding:8px 12px 8px 42px;font:inherit;font-size:16px;color:var(--gq-fg);background:var(--gq-bg);border:1.5px solid var(--gq-muted);border-radius:10px}" +
    ".gq-root input[type=search]::placeholder{color:var(--gq-muted);opacity:1}" +
    ".gq-root input[type=search]:focus-visible{outline:3px solid var(--gq-focus);outline-offset:2px}" +
    ".gq-root .gq-shint{margin:6px 0 0;font-size:13px;color:var(--gq-muted)}" +
    ".gq-root .gq-vh{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}" +
    ".gq-root .gq-sres-list{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}" +
    ".gq-root .gq-sres-list li{border:1px solid var(--gq-border);border-radius:10px;padding:10px 12px;background:var(--gq-card);margin:0}" +
    ".gq-root .gq-stitle{display:inline-block;font-weight:600;min-height:24px;padding:2px 0}.gq-root a.gq-stitle{color:var(--gq-link);text-decoration:underline}" +
    ".gq-root .gq-ssnip{display:block;font-size:14px;margin-top:2px;color:var(--gq-fg);overflow-wrap:anywhere}" +
    ".gq-root mark{background:var(--gq-note-bg);color:var(--gq-note-fg);border-radius:3px;padding:0 2px}" +
    ".gq-root .gq-snone{margin:10px 0 0;color:var(--gq-fg)}" +
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
  // Opens a part of the guide; from a search result, also shows the step that
  // answers the question, marked for a few seconds.
  function jumpTo(id, container, prefix, step) {
    var sec = container.querySelector('[id="' + prefix + String(id).replace(/[^\w-]/g, "") + '"]');
    if (!sec) return false;
    var li = step != null && step !== "" ? sec.querySelector('li[data-gq-i="' + String(step).replace(/\D/g, "") + '"]') : null;
    sec.scrollIntoView({ block: "start" });
    sec.focus({ preventScroll: true });
    if (li) {
      li.scrollIntoView({ block: "center" });
      Array.prototype.forEach.call(container.querySelectorAll(".gq-hit"), function (x) { x.classList.remove("gq-hit"); });
      li.classList.add("gq-hit");
      setTimeout(function () { li.classList.remove("gq-hit"); }, 4000);
    }
    return true;
  }
  function fill() {
    var s = state; if (!s) return;
    var g = G()[s.kind] || {};
    s.ov.querySelector(".gq-dhead h2").innerHTML = md(g.title);
    s.ov.querySelector("[data-gq-print]").textContent = t("guide.print");
    var close = s.ov.querySelector("[data-gq-close]");
    close.textContent = t("guide.close");
    s.ov.querySelector(".gq-dbody").innerHTML = render(s.kind, { roles: s.opts.roles || roleMap[s.kind], h: 3, prefix: "gqd-", query: currentQuery(s.ov) });
    paint(s.ov);
  }
  function onKey(e) {
    if (!state) return;
    if (e.key === "Escape") {
      var a0 = document.activeElement;
      if (a0 && a0.matches && a0.matches("[data-gq-q]") && a0.value) { e.preventDefault(); e.stopPropagation(); a0.value = ""; runSearch(a0); return; }
      e.preventDefault(); e.stopPropagation(); close(); return;
    }
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
      if (j) { e.preventDefault(); jumpTo(j.getAttribute("data-gq-jump"), ov, "gqd-", j.getAttribute("data-gq-step")); }
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
    jump: jumpTo,
    // What the search box would list for a question (ids; "P:" + English heading
    // for a common problem). Used by the tests' question bank.
    find: function (kind, roles, q) { return search(kind, roles, q).map(function (r) { return r.sop ? r.sop.id : "P:" + r.problem[0][0]; }); },
    journeys: JOURNEYS,
    life: LIFE,
    times: TIMES, roleNames: ROLE_NAMES, roleCols: ROLE_COLS, roleAbbr: ROLE_ABBR,
  };
})();
