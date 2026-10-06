// Light / dark display for citizens and representatives (approved Oct 2026).
//
// Research summary (Apple HIG, Material Design, UK National Archives design
// system, WCAG 2.2): follow the phone's own setting by default, and offer a
// clear override. GrievIQ offers three plainly named choices -- "Same as my
// phone" (default), Light, Dark -- because a two-state toggle can't tell
// "follow the phone" from "always light" when a phone switches to dark at
// night by itself. The choice is remembered on this device only
// (localStorage "griq-theme"); no account is needed.
//
// Loaded in <head> before the page draws, so there's no white flash. Sets
// <html data-theme="light|dark"> (no attribute = follow the phone); the
// colours themselves are in /theme.css.
//
// The switch sits next to the हिन्दी/English button in the top bar of every
// page (including bars drawn later by script, like the rep console's).
// WCAG 2.2 AA: a real button with a name that says the current setting,
// aria-expanded; the three choices are buttons with aria-pressed; Esc closes
// and returns focus; 44 px tall choices; works with keyboard and screen readers.
(function () {
  'use strict';
  var KEY = 'griq-theme';
  var root = document.documentElement;
  function saved() { try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch (e) { return 'auto'; } }
  function systemDark() { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  function effective(m) { return m === 'auto' ? (systemDark() ? 'dark' : 'light') : m; }
  var meta = null;
  function applyMode(m) {
    if (m === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', m);
    if (!meta) meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effective(m) === 'dark' ? '#0E0F11' : (meta.getAttribute('data-light') || '#13233F'));
  }
  var mode = saved();
  applyMode(mode);

  var T = function (k, en) { return window.GIQ && window.GIQ.has && window.GIQ.has(k) ? window.GIQ.t(k) : en; };
  var ICON = {
    light: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></g></svg>',
    dark: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"/></svg>',
    auto: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><rect x="6.5" y="2.5" width="11" height="19" rx="2.4" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M12 7.5a4.5 4.5 0 0 0 0 9z"/></svg>'
  };
  var LABEL = { auto: ['theme.auto', 'Same as my phone'], light: ['theme.light', 'Light'], dark: ['theme.dark', 'Dark'] };

  var css = document.createElement('style');
  css.textContent =
    '.giq-tools{display:inline-flex;align-items:center;gap:8px;flex-shrink:0;margin-left:8px}.giq-theme{position:relative;display:inline-flex;vertical-align:middle}' +
    '.giq-theme-btn{display:inline-flex;align-items:center;justify-content:center;min-width:32px;min-height:28px;padding:2px 8px;border:1px solid rgba(255,255,255,0.35);border-radius:6px;background:none;color:inherit;cursor:pointer;font:inherit}' +
    '.giq-theme-btn:hover,.giq-theme-btn:focus-visible{border-color:#fff;color:#fff;outline:none}' +
    '.giq-theme-btn:focus-visible{box-shadow:0 0 0 2px #fff}' +
    '.giq-theme-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:1000;min-width:210px;margin:0;padding:6px;list-style:none;background:#FFFFFF;color:#22201C;border:1px solid #D8D3C6;border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,0.25);text-align:left}' +
    '.giq-theme-menu[hidden]{display:none}' +
    '.giq-theme-menu p{margin:4px 8px 6px;font-size:12px;font-weight:600;color:#5F594F}' +
    '.giq-theme-menu button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:8px 10px;border:0;border-radius:8px;background:none;color:inherit;font:inherit;font-size:14px;cursor:pointer;text-align:left}' +
    '.giq-theme-menu button:hover{background:#EEF1F6}' +
    '.giq-theme-menu button:focus-visible{outline:3px solid #1F4A8A;outline-offset:-3px}' +
    '.giq-theme-menu button[aria-pressed="true"]{font-weight:700;background:#E9EEF7}' +
    '.giq-theme-menu .tick{margin-left:auto;font-weight:700}' +
    ':root[data-theme="dark"] .giq-theme-menu{background:#22262B;color:#ECEAE4;border-color:#3A4048}' +
    ':root[data-theme="dark"] .giq-theme-menu p{color:#B4B2AA}' +
    ':root[data-theme="dark"] .giq-theme-menu button:hover{background:#2D333B}' +
    ':root[data-theme="dark"] .giq-theme-menu button[aria-pressed="true"]{background:#1E3352}' +
    ':root[data-theme="dark"] .giq-theme-menu button:focus-visible{outline-color:#8DB4F0}' +
    '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .giq-theme-menu{background:#22262B;color:#ECEAE4;border-color:#3A4048}' +
    ':root:not([data-theme="light"]) .giq-theme-menu p{color:#B4B2AA}' +
    ':root:not([data-theme="light"]) .giq-theme-menu button:hover{background:#2D333B}' +
    ':root:not([data-theme="light"]) .giq-theme-menu button[aria-pressed="true"]{background:#1E3352}' +
    ':root:not([data-theme="light"]) .giq-theme-menu button:focus-visible{outline-color:#8DB4F0}}' +
    '@media (forced-colors: active){.giq-theme-menu{border:1px solid CanvasText}.giq-theme-menu button[aria-pressed="true"]{outline:2px solid Highlight}}';

  var widgets = [], uid = 0;
  function btnName() {
    return T('theme.button', 'Display') + ': ' + T(LABEL[mode][0], LABEL[mode][1]);
  }
  function draw(w) {
    w.btn.innerHTML = ICON[mode === 'auto' ? 'auto' : mode];
    w.btn.setAttribute('aria-label', btnName());
    w.btn.title = btnName();
    var h = '<p id="' + w.id + '-h">' + T('theme.title', 'Display') + '</p>';
    ['auto', 'light', 'dark'].forEach(function (m) {
      h += '<li><button type="button" data-mode="' + m + '" aria-pressed="' + (m === mode) + '">' + ICON[m] +
        '<span>' + T(LABEL[m][0], LABEL[m][1]) + '</span>' + (m === mode ? '<span class="tick" aria-hidden="true">✓</span>' : '') + '</button></li>';
    });
    w.menu.innerHTML = h;
    w.menu.setAttribute('aria-labelledby', w.id + '-h');
  }
  function close(w, focusBtn) {
    if (w.menu.hidden) return;
    w.menu.hidden = true; w.btn.setAttribute('aria-expanded', 'false');
    if (focusBtn) w.btn.focus();
  }
  function choose(m) {
    mode = m;
    try { if (m === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, m); } catch (e) {}
    applyMode(m);
    widgets.forEach(draw);
    document.dispatchEvent(new CustomEvent('giq:theme', { detail: { mode: m, effective: effective(m) } }));
  }
  function mount(toggle) {
    if (!toggle || toggle.getAttribute('data-theme-done')) return;
    toggle.setAttribute('data-theme-done', '1');
    var wrap = document.createElement('span');
    wrap.className = 'giq-theme';
    var id = 'giq-theme-' + (++uid);
    wrap.innerHTML = '<button type="button" class="giq-theme-btn" aria-expanded="false" aria-controls="' + id + '"></button>' +
      '<ul class="giq-theme-menu" id="' + id + '" hidden></ul>';
    // Keep the two buttons together (top bars spread their children apart).
    var tools = document.createElement('span');
    tools.className = 'giq-tools';
    toggle.parentNode.insertBefore(tools, toggle);
    tools.appendChild(wrap);
    tools.appendChild(toggle);
    var w = { wrap: wrap, btn: wrap.firstChild, menu: wrap.lastChild, id: id };
    widgets.push(w);
    draw(w);
    w.btn.addEventListener('click', function () {
      var open = w.menu.hidden;
      widgets.forEach(function (o) { close(o, false); });
      if (open) {
        w.menu.hidden = false; w.btn.setAttribute('aria-expanded', 'true');
        var cur = w.menu.querySelector('button[aria-pressed="true"]'); if (cur) cur.focus();
      }
    });
    w.menu.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (!b) return;
      choose(b.getAttribute('data-mode'));
      close(w, true);
    });
    w.menu.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(w.menu.querySelectorAll('button[data-mode]'));
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      }
    });
    wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(w, true); } });
    wrap.addEventListener('focusout', function (e) { if (!wrap.contains(e.relatedTarget) && e.relatedTarget) close(w, false); });
  }
  function scan() { document.querySelectorAll('[data-lang-toggle]').forEach(mount); }
  function start() {
    document.head.appendChild(css);
    scan();
    // Bars drawn later by script (the rep console's top strip).
    if (window.MutationObserver) new MutationObserver(function () { scan(); }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', function (e) { widgets.forEach(function (w) { if (!w.wrap.contains(e.target)) close(w, false); }); });
    document.addEventListener('giq:lang', function () { widgets.forEach(draw); });
    // "Same as my phone": follow the phone if it changes while the page is open.
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () { if (mode === 'auto') applyMode('auto'); };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    }
    // Another tab changed it: follow.
    window.addEventListener('storage', function (e) { if (e.key === KEY) { mode = saved(); applyMode(mode); widgets.forEach(draw); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.GIQTheme = { get: function () { return mode; }, effective: function () { return effective(mode); }, set: choose };
})();
