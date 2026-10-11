// public/pay.js (grieviq-41)
//
// Payment helpers shared by the admin "Payment details" tab and the offices'
// Billing screens (representative console, department dashboard):
//   GIQPay.upiUrl(method, amount, ref) -> "upi://pay?..." (NPCI UPI deep link:
//        pa = UPI ID, pn = payee name, am = amount, cu = INR, tn = note)
//   GIQPay.qrSvg(text, label)          -> an SVG QR code (dark on white, with
//        the quiet zone scanners need), drawn here from the UPI ID: GrievIQ
//        never shows an uploaded QR picture, which could not be checked.
// Needs /vendor/qrcode/qrcode.js (window.GIQQR) loaded first.
(function () {
  "use strict";
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function upiUrl(m, amount, ref) {
    var q = "pa=" + encodeURIComponent(m.upiId) + "&pn=" + encodeURIComponent(m.payeeName);
    if (amount != null && amount !== "") q += "&am=" + Number(amount).toFixed(2);
    q += "&cu=INR";
    if (ref) q += "&tn=" + encodeURIComponent(ref);
    return "upi://pay?" + q;
  }
  function qrSvg(text, label) {
    if (!window.GIQQR) return "";
    var m = window.GIQQR.matrix(text, window.GIQQR.M), n = m.length, q = 4, size = n + q * 2, d = "";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (m[r][c]) d += "M" + (c + q) + " " + (r + q) + "h1v1h-1z";
    return '<svg class="giq-qr" viewBox="0 0 ' + size + " " + size + '" role="img" aria-label="' + esc(label || "QR code") + '" shape-rendering="crispEdges" focusable="false">' +
      '<rect width="' + size + '" height="' + size + '" fill="#fff"/><path fill="#000" d="' + d + '"/></svg>';
  }
  // "₹1,179"
  function rupees(n) { return n == null || n === "" ? "—" : "₹" + Number(n).toLocaleString("en-IN"); }
  window.GIQPay = { upiUrl: upiUrl, qrSvg: qrSvg, rupees: rupees, esc: esc };
})();
