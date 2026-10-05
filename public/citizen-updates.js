// "Get updates on this phone" for citizens (approved Oct 2026): a card on
// the confirmation screen and on the Track page. Optional; emails continue
// as before. No account: the device is linked to one complaint only, and
// deleted when that complaint closes (see functions/_shared/citizen-push.js).
// WCAG 2.2 AA: real buttons (44 px), results announced politely, errors
// shown next to the button and announced.
(function () {
  'use strict';
  var T = function (k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
  var lang = function () { return window.GIQ && window.GIQ.lang === 'hi' ? 'hi' : 'en'; };
  var config = null, mounted = [];

  var css = document.createElement('style');
  css.textContent =
    '.cu-card{margin:16px 0 0;padding:14px 16px;border:1px solid var(--border,#E7E4DC);border-radius:12px;background:var(--teal-tint,#E9EEF7);text-align:left}' +
    '.cu-card h3{margin:0 0 6px;font-size:15px;color:var(--teal-dark,#13233F)}' +
    '.cu-card p{margin:0 0 8px;font-size:13.5px;line-height:1.5;color:var(--ink,#22201C)}' +
    '.cu-card .cu-small{font-size:12px;color:var(--ink-soft,#746E63)}' +
    '.cu-card ol{margin:4px 0 8px;padding-left:20px;font-size:13.5px;line-height:1.5}' +
    '.cu-btn{min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--teal,#1F4A8A);background:var(--teal,#1F4A8A);color:#fff;font:inherit;font-size:14px;font-weight:600;cursor:pointer}' +
    '.cu-btn[disabled]{opacity:.6;cursor:default}' +
    '.cu-link{min-height:44px;padding:0 6px;border:0;background:none;color:var(--teal,#1F4A8A);font:inherit;font-size:13.5px;text-decoration:underline;cursor:pointer}' +
    '.cu-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 6px}' +
    '.cu-msg{font-size:13px;margin:4px 0 0;min-height:0}.cu-msg:empty{display:none}.cu-msg.err{color:#B3261E;font-weight:600}';
  document.head.appendChild(css);

  function supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function isIos() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { return navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); }
  function b64ToBytes(s) { var t = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; var bin = atob(t); var u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function post(body) { return fetch('/api/citizen-updates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._ok = r.ok; return j; }); }); }
  async function loadConfig() {
    if (config) return config;
    try { config = await (await fetch('/api/citizen-updates', { cache: 'no-store' })).json(); } catch (e) { config = { configured: false }; }
    return config;
  }
  async function currentSub() {
    try { var reg = await navigator.serviceWorker.getRegistration('/status'); return reg ? await reg.pushManager.getSubscription() : null; } catch (e) { return null; }
  }

  async function draw(m, note) {
    var el = m.el;
    if (!el || !document.body.contains(el)) return;
    var cfg = await loadConfig();
    if (!cfg.configured || m.opts.closed) { el.innerHTML = ''; return; }
    var head = '<div class="cu-card" role="region" aria-labelledby="cu-h-' + m.id + '"><h3 id="cu-h-' + m.id + '">' + esc(T('cu.title')) + '</h3>';
    var privacy = '<p class="cu-small">' + esc(T('cu.privacy')) + '</p>';
    var msg = '<p class="cu-msg' + (note && note.err ? ' err' : '') + '" id="cu-m-' + m.id + '" role="' + (note && note.err ? 'alert' : 'status') + '">' + esc(note ? note.text : '') + '</p>';
    var body;
    if (isIos() && !standalone()) {
      body = m.opts.email || m.opts.hasEmail
        ? '<p><strong>' + esc(T('cu.ios_t')) + '</strong></p><ol><li>' + esc(T('cu.ios1')) + '</li><li>' + esc(T('cu.ios2')) + '</li><li>' + esc(T('cu.ios3')) + '</li></ol>'
        : '<p>' + esc(T('cu.ios_noemail')) + '</p>';
    } else if (!supported()) {
      body = '<p>' + esc(T('cu.unsupported')) + '</p>';
    } else if (Notification.permission === 'denied') {
      body = '<p>' + esc(T('cu.blocked')) + '</p>';
    } else {
      var on = false, sub = await currentSub();
      if (sub && Notification.permission === 'granted') {
        try { var st = await post({ action: 'status', ref: m.opts.ref, endpoint: sub.endpoint }); on = !!st.on; } catch (e) { on = false; }
      }
      body = on
        ? '<p><strong>' + esc(T('cu.on')) + '</strong></p><div class="cu-row"><button type="button" class="cu-link" id="cu-off-' + m.id + '">' + esc(T('cu.turn_off')) + '</button></div>'
        : '<p>' + esc(T('cu.why')) + '</p><div class="cu-row"><button type="button" class="cu-btn" id="cu-on-' + m.id + '">' + esc(T('cu.turn_on')) + '</button></div>' + privacy;
    }
    el.innerHTML = head + body + msg + '</div>';
    var b = document.getElementById('cu-on-' + m.id); if (b) b.addEventListener('click', function () { turnOn(m); });
    var o = document.getElementById('cu-off-' + m.id); if (o) o.addEventListener('click', function () { turnOff(m); });
  }

  function say(m, text, err) { var el = document.getElementById('cu-m-' + m.id); if (el) { el.textContent = text; el.className = 'cu-msg' + (err ? ' err' : ''); el.setAttribute('role', err ? 'alert' : 'status'); } }

  // Wait until this registration's worker is active. (navigator.serviceWorker.ready
  // only resolves for a page inside the worker's scope, so it never resolved on
  // the complaint form, whose address is outside /status.)
  function waitActive(reg) {
    return new Promise(function (resolve, reject) {
      if (reg.active) return resolve(reg);
      var w = reg.installing || reg.waiting;
      var timer = setTimeout(function () { reg.active ? resolve(reg) : reject(new Error('SW_TIMEOUT')); }, 15000);
      if (!w) { clearTimeout(timer); return reg.active ? resolve(reg) : reject(new Error('SW_MISSING')); }
      w.addEventListener('statechange', function () {
        if (w.state === 'activated') { clearTimeout(timer); resolve(reg); }
        else if (w.state === 'redundant') { clearTimeout(timer); reject(new Error('SW_REDUNDANT')); }
      });
    });
  }
  // Never let the button hang: give up after a while and say so.
  function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('TIMEOUT')); }, ms); })]); }
  var CODES = { CLOSED: 'cu.closed', TOO_MANY: 'cu.too_many', VERIFY: 'cu.verify', NOT_CONFIGURED: 'cu.unsupported' };
  async function turnOn(m) {
    var btn = document.getElementById('cu-on-' + m.id); if (btn) btn.disabled = true;
    try {
      var cfg = await loadConfig();
      var reg = await navigator.serviceWorker.register('/sw.js', { scope: '/status' });
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') { say(m, T('cu.denied'), true); if (btn) btn.disabled = false; return; }
      await waitActive(reg);
      var sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.key) }), 20000);
      var j = await post({ action: 'subscribe', ref: m.opts.ref, pass: m.opts.pass || undefined, email: m.opts.email || undefined, subscription: sub.toJSON(), lang: lang() });
      if (!j._ok) { say(m, T(CODES[j.code] || 'cu.failed'), true); if (btn) btn.disabled = false; return; }
      await draw(m, { text: T('cu.done') });
      var off = document.getElementById('cu-off-' + m.id); if (off) off.focus();
    } catch (e) { say(m, T('cu.failed'), true); if (btn) btn.disabled = false; }
  }
  async function turnOff(m) {
    var sub = await currentSub();
    if (sub) { try { await post({ action: 'unsubscribe', ref: m.opts.ref, endpoint: sub.endpoint }); } catch (e) {} }
    await draw(m, { text: T('cu.off_done') });
    var b = document.getElementById('cu-on-' + m.id); if (b) b.focus();
  }

  window.GIQU = {
    // opts: { ref, pass (right after filing) | email (Track page, verified), hasEmail, closed }
    mount: function (el, opts) {
      if (!el) return;
      mounted = mounted.filter(function (x) { return x.el !== el && document.body.contains(x.el); });
      var m = { el: el, opts: opts || {}, id: String(Math.random()).slice(2, 8) };
      mounted.push(m);
      draw(m);
    },
  };
  document.addEventListener('giq:lang', function () { mounted.forEach(function (m) { draw(m); }); });
})();
