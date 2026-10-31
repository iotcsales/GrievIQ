/*! Copyright (c) 2026 IOTC (Indus Overseas Trading Corporation). All rights reserved. GrievIQ: proprietary and confidential. Unauthorised copying, use or distribution is prohibited. See LICENSE.txt. */
// public/text-screen.js (grieviq-82): a gentle check as the citizen writes.
// If the complaint has abusive words or sounds like a threat, the form asks
// the citizen to change it before sending (they can still send it; GrievIQ
// staff then see a flag). The same lists are in functions/_shared/misuse.js
// (a test checks that they match). Kept short so ordinary complaints are
// never flagged.
(function () {
  "use strict";
  var ABUSIVE = ["fuck","fucking","motherfucker","bastard","bitch","asshole","madarchod","maderchod","bhenchod","behenchod","bhenchod","chutiya","chutiye","harami","haramzada","haramkhor","randi","gandu","kamina","kutte ki","suar ki","मादरचोद","बहनचोद","भेनचोद","चूतिया","चुतिया","हरामी","हरामज़ादा","हरामजादा","हरामखोर","रंडी","गांडू","कमीना","कुत्ते की","सूअर की"];
  var THREATS = ["kill you","i will kill","will kill you","shoot you","bomb you","jaan se maar","jaan se mar","maar dunga","maar denge","mar dunga","maar daalunga","maar dalunga","dekh lunga","जान से मार","मार दूंगा","मार दूँगा","मार देंगे","मार डालूंगा","मार डालूँगा","देख लूंगा","देख लूँगा"];
  function has(text, list) {
    var t = " " + String(text || "").toLowerCase().replace(/\s+/g, " ") + " ";
    return list.some(function (w) {
      return /[a-z]/.test(w)
        ? new RegExp("(^|[^a-z])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z]|$)").test(t)
        : t.indexOf(w) !== -1;
    });
  }
  function screen(text) {
    var flags = [];
    if (has(text, ABUSIVE)) flags.push("ABUSIVE");
    if (has(text, THREATS)) flags.push("THREAT");
    return flags;
  }
  window.GIQTextScreen = { screen: screen, ABUSIVE: ABUSIVE, THREATS: THREATS };
})();
