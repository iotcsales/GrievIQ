// Notifications in the rep console (approved Oct 2026): the bell with an
// unread count, the list of notices, turning phone notifications on/off,
// and messages from GrievIQ with the office's replies.
//
// Accessibility (WCAG 2.2 AA): the bell is a disclosure button with
// aria-expanded and a spoken unread count; Esc closes the panel and the
// message window and returns focus; targets are at least 44 px; new
// counts are announced politely; the message window traps focus.
(function () {
  'use strict';
  var T = function (k, v) { return window.GIQ ? window.GIQ.t(k, v) : k; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
  var lang = function () { return window.GIQ && window.GIQ.lang === 'hi' ? 'hi' : 'en'; };
  var data = { unread: 0, items: [], push: { configured: false, key: null, devices: 0 } };
  var open = false, timer = null, pushState = 'unknown', lastUnread = null;

  var MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MON_HI = ['जन॰', 'फ़र॰', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुल॰', 'अग॰', 'सित॰', 'अक्तू॰', 'नव॰', 'दिस॰'];
  function ms(iso) { if (!iso) return NaN; var s = String(iso); if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s = s.replace(' ', 'T') + 'Z'; return Date.parse(s); }
  function when(iso) {
    var t = ms(iso); if (isNaN(t)) return '';
    var d = new Date(t + 5.5 * 3600000), h = d.getUTCHours(), mi = ('0' + d.getUTCMinutes()).slice(-2), day = d.getUTCDate(), m = d.getUTCMonth();
    if (lang() === 'hi') return day + ' ' + MON_HI[m] + ', ' + ('0' + h).slice(-2) + ':' + mi;
    return day + ' ' + MON_EN[m] + ', ' + ((h % 12) || 12) + ':' + mi + ' ' + (h < 12 ? 'am' : 'pm');
  }

  // ---- text of a notice (same wording as the phone notification) ----
  function text(n) {
    var d = n.data || {};
    var type = n.catId && window.GIQ ? window.GIQ.category(n.catId, n.catName) : (n.catName || '');
    var wt = [n.ward, type].filter(Boolean).join(' · ');
    var due = n.dueAt ? when(n.dueAt) : '', ack = d.ackDue ? when(d.ackDue) : '';
    switch (n.kind) {
      case 'NEW_CASE': return { t: T('rn.k_new_t', { ref: n.ref }), b: wt + ' · ' + (due ? T('rn.k_new_b', { ack: ack, due: due }) : T('rn.k_new_legal')) };
      case 'MOVED_UP': return { t: T('rn.k_up_t', { ref: n.ref }), b: wt + ' · ' + T(d.reason === 'REOPENED' ? 'rn.k_up_reopened' : 'rn.k_up_time') + (due ? ' ' + T('rn.k_act_by', { due: due }) : '') };
      case 'DAILY': {
        var p = [];
        if (d.overdue) p.push(T('rn.k_day_overdue', { n: d.overdue }));
        if (d.dueToday) p.push(T('rn.k_day_today', { n: d.dueToday }));
        if (d.waitingAck) p.push(T('rn.k_day_ack', { n: d.waitingAck }));
        return { t: T(d.total === 1 ? 'rn.k_day_t1' : 'rn.k_day_t', { n: d.total }), b: (d.officeName ? d.officeName + ' · ' : '') + p.join(' · ') };
      }
      case 'ASSIGNED': return { t: T('rn.k_asg_t', { ref: n.ref }), b: wt + (due ? ' · ' + T('rn.k_act_by', { due: due }) : '') };
      case 'FIX_REPORT': return { t: T('rn.k_fix_t', { ref: n.ref }), b: wt + ' · ' + T('rn.k_fix_b') };
      case 'OBSERVATION': return { t: T('rn.k_obs_t'), b: T('rn.k_obs_b') };
      case 'NUDGE': return { t: T('rn.k_nudge_t', { ref: n.ref }), b: wt + ' · ' + T('rn.k_nudge_b') };
      case 'ANNOUNCEMENT': return { t: T('rn.k_msg_t'), b: d.title || '' };
      case 'REPLY': return { t: T('rn.k_reply_t'), b: d.title || '' };
      default: return { t: 'GrievIQ', b: '' };
    }
  }

  // ---- styles ----
  var css = document.createElement('style');
  css.textContent =
    '.rn-wrap{position:relative;display:inline-block;vertical-align:middle}' +
    '.rn-bell{position:relative;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--line);background:var(--card);border-radius:10px;cursor:pointer;color:var(--ink);font:inherit;font-size:13px;padding:0 10px}' +
    '.rn-bell:hover{background:var(--paper)}.rn-bell svg{width:20px;height:20px}' +
    '.rn-badge{position:absolute;top:-6px;right:-6px;min-width:20px;height:20px;border-radius:10px;background:var(--red);color:#fff;font-size:11.5px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;border:2px solid var(--card)}' +
    '.rn-panel{position:absolute;right:0;top:calc(100% + 8px);width:min(400px,calc(100vw - 24px));max-height:min(70vh,620px);overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 32px rgba(20,24,29,.18);z-index:900;text-align:left}' +
    '.rn-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--card)}' +
    '.rn-head h2{margin:0;font-size:15px;font-family:"Source Serif 4",serif}' +
    '.rn-link{background:none;border:0;color:var(--brand);font:inherit;font-size:13px;cursor:pointer;min-height:44px;padding:0 6px;text-decoration:underline}' +
    '.rn-push{margin:10px 14px;padding:10px 12px;border-radius:10px;background:var(--brand-tint);font-size:13px;line-height:1.45;color:var(--ink)}' +
    '.rn-push p{margin:0 0 8px}.rn-push p:last-child{margin-bottom:0}.rn-push ol{margin:4px 0 0;padding-left:18px}' +
    '.rn-btn{min-height:44px;padding:0 14px;border-radius:9px;border:1px solid var(--brand);background:var(--brand);color:#fff;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}' +
    '.rn-btn.sec{background:var(--card);color:var(--brand)}' +
    '.rn-btns{display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
    '.rn-list{list-style:none;margin:0;padding:0}' +
    '.rn-item{border-top:1px solid var(--line)}' +
    '.rn-item button{display:block;width:100%;text-align:left;background:none;border:0;padding:11px 14px 11px 30px;font:inherit;cursor:pointer;position:relative;color:var(--ink);min-height:44px}' +
    '.rn-item button:hover{background:var(--paper)}' +
    '.rn-item.unread button::before{content:"";position:absolute;left:12px;top:17px;width:9px;height:9px;border-radius:50%;background:var(--brand)}' +
    '.rn-t{display:block;font-size:13.5px;font-weight:600;line-height:1.35}.rn-item:not(.unread) .rn-t{font-weight:500}' +
    '.rn-b{display:block;font-size:12.5px;color:var(--steel-2);margin-top:2px;line-height:1.4}' +
    '.rn-w{display:block;font-size:11.5px;color:var(--steel-2);margin-top:3px}' +
    '.rn-empty{padding:18px 14px;font-size:13px;color:var(--steel-2)}' +
    '.rn-status{font-size:12.5px;margin-top:6px}.rn-status.err{color:var(--red)}' +
    '.rn-dlg-back{position:fixed;inset:0;background:rgba(20,24,29,.45);z-index:950;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}' +
    '.rn-dlg{background:var(--card);border-radius:14px;max-width:640px;width:100%;padding:18px 18px 20px;box-shadow:0 18px 40px rgba(0,0,0,.25)}' +
    '.rn-dlg h2{margin:0 0 4px;font-family:"Source Serif 4",serif;font-size:19px}' +
    '.rn-dlg .rn-meta{font-size:12.5px;color:var(--steel-2);margin:0 0 12px}' +
    '.rn-body{white-space:pre-wrap;font-size:14.5px;line-height:1.55;background:var(--paper);border-radius:10px;padding:12px 14px;margin:0 0 14px;overflow-wrap:anywhere}' +
    '.rn-thread h3{font-size:14px;margin:14px 0 8px}' +
    '.rn-rep{border:1px solid var(--line);border-radius:10px;padding:9px 12px;margin:0 0 8px;font-size:13.5px;line-height:1.5}' +
    '.rn-rep.giq{background:var(--brand-tint);border-color:#c9d9ee}' +
    '.rn-rep .who{font-size:12px;color:var(--steel-2);margin-bottom:3px}.rn-rep .txt{white-space:pre-wrap;overflow-wrap:anywhere}' +
    '.rn-dlg label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px}' +
    '.rn-dlg textarea{width:100%;min-height:90px;font:inherit;font-size:14.5px;padding:9px 10px;border:1px solid var(--line);border-radius:8px;box-sizing:border-box}' +
    '.rn-dlg textarea[aria-invalid=true]{border-color:var(--red)}' +
    '.rn-err{color:var(--red);font-size:12.5px;margin:4px 0 0}' +
    '.rn-close{float:right;min-width:44px;min-height:44px;border:0;background:none;font-size:22px;cursor:pointer;color:var(--steel)}' +
    '@media (max-width:600px){.rn-panel{position:fixed;left:12px;right:12px;top:64px;width:auto}}';
  document.head.appendChild(css);

  var BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';

  function slot() { return document.getElementById('notif-slot'); }

  function drawBell() {
    var s = slot(); if (!s) return;
    var n = data.unread || 0;
    s.innerHTML = '<span class="rn-wrap no-print"><button type="button" class="rn-bell" id="rn-bell" aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="rn-panel">' + BELL +
      '<span class="visually-hidden">' + esc(n ? T('rn.bell_n', { n: n }) : T('rn.bell')) + '</span>' +
      (n ? '<span class="rn-badge" aria-hidden="true">' + (n > 99 ? '99+' : n) + '</span>' : '') + '</button>' +
      '<span class="visually-hidden" aria-live="polite" id="rn-live"></span>' +
      (open ? '<div class="rn-panel" id="rn-panel" role="region" aria-labelledby="rn-h">' + panelHtml() + '</div>' : '') + '</span>';
    document.getElementById('rn-bell').addEventListener('click', function () { open ? close(true) : show(); });
    if (open) attachPanel();
  }

  function panelHtml() {
    var items = data.items || [];
    return '<div class="rn-head"><h2 id="rn-h" tabindex="-1">' + esc(T('rn.title')) + '</h2>' +
      (data.unread ? '<button type="button" class="rn-link" id="rn-all">' + esc(T('rn.mark_all')) + '</button>' : '') + '</div>' +
      pushHtml() +
      (items.length ? '<ul class="rn-list">' + items.map(function (n) {
        var x = text(n);
        return '<li class="rn-item' + (n.read ? '' : ' unread') + '"><button type="button" data-n="' + esc(n.id) + '">' +
          (n.read ? '' : '<span class="visually-hidden">' + esc(T('rn.unread')) + ' </span>') +
          '<span class="rn-t">' + esc(x.t) + '</span><span class="rn-b">' + esc(x.b) + '</span><span class="rn-w">' + esc(when(n.at)) + '</span></button></li>';
      }).join('') + '</ul>' : '<p class="rn-empty">' + esc(T('rn.empty')) + '</p>');
  }

  // ---- phone notifications ----
  function supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function isIos() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { return navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); }
  function pushHtml() {
    if (!data.push || !data.push.configured) return '<div class="rn-push"><p>' + esc(T('rn.push_soon')) + '</p></div>';
    if (pushState === 'on') return '<div class="rn-push"><p><strong>' + esc(T('rn.push_on')) + '</strong></p><div class="rn-btns">' +
      '<button type="button" class="rn-btn sec" id="rn-test">' + esc(T('rn.push_test')) + '</button>' +
      '<button type="button" class="rn-link" id="rn-off">' + esc(T('rn.push_off')) + '</button></div><p class="rn-status" id="rn-pstat" role="status"></p></div>';
    if (isIos() && !standalone()) return '<div class="rn-push"><p><strong>' + esc(T('rn.push_ios_t')) + '</strong></p><ol><li>' + esc(T('rn.push_ios1')) + '</li><li>' + esc(T('rn.push_ios2')) + '</li><li>' + esc(T('rn.push_ios3')) + '</li></ol></div>';
    if (!supported()) return '<div class="rn-push"><p>' + esc(T('rn.push_unsupported')) + '</p></div>';
    if (Notification.permission === 'denied') return '<div class="rn-push"><p>' + esc(T('rn.push_blocked')) + '</p></div>';
    return '<div class="rn-push"><p>' + esc(T('rn.push_why')) + '</p><div class="rn-btns"><button type="button" class="rn-btn" id="rn-on">' + esc(T('rn.push_turn_on')) + '</button></div><p class="rn-status" id="rn-pstat" role="status"></p></div>';
  }
  function b64ToBytes(s) { var t = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; var bin = atob(t); var u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function device() { var u = navigator.userAgent; return (/Android/.test(u) ? 'Android' : isIos() ? 'iPhone/iPad' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : 'Computer') + ' · ' + (/Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'Browser'); }
  async function currentSub() {
    if (!supported()) return null;
    try { var reg = await navigator.serviceWorker.getRegistration('/rep'); return reg ? await reg.pushManager.getSubscription() : null; } catch (e) { return null; }
  }
  async function checkPush() {
    var sub = await currentSub();
    pushState = sub && Notification.permission === 'granted' ? 'on' : 'off';
  }
  function pstat(msg, err) { var el = document.getElementById('rn-pstat'); if (el) { el.textContent = msg || ''; el.className = 'rn-status' + (err ? ' err' : ''); } }
  async function turnOn() {
    var btn = document.getElementById('rn-on'); if (btn) btn.disabled = true;
    try {
      var reg = await navigator.serviceWorker.register('/sw.js', { scope: '/rep' });
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') { pstat(T('rn.push_denied'), true); if (btn) btn.disabled = false; return; }
      await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.push.key) });
      var res = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'subscribe', subscription: sub.toJSON(), lang: lang(), device: device() }) });
      if (!res.ok) { var j = {}; try { j = await res.json(); } catch (e) {} pstat(j.error || T('rn.push_failed'), true); if (btn) btn.disabled = false; return; }
      pushState = 'on'; redraw(); pstat(T('rn.push_done'));
      var f = document.getElementById('rn-test'); if (f) f.focus();
    } catch (e) { pstat(T('rn.push_failed'), true); if (btn) btn.disabled = false; }
  }
  async function turnOff() {
    var sub = await currentSub();
    if (sub) { try { await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unsubscribe', endpoint: sub.endpoint }) }); } catch (e) {} try { await sub.unsubscribe(); } catch (e) {} }
    pushState = 'off'; redraw(); var b = document.getElementById('rn-on'); if (b) b.focus();
  }
  async function test() {
    pstat(T('rn.push_testing'));
    try { var r = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test' }) }); var j = await r.json(); pstat(j.ok ? T('rn.push_tested') : T('rn.push_failed'), !j.ok); } catch (e) { pstat(T('rn.push_failed'), true); }
  }

  // ---- panel behaviour ----
  function attachPanel() {
    var all = document.getElementById('rn-all');
    if (all) all.addEventListener('click', function () { markRead(null, true); });
    var on = document.getElementById('rn-on'); if (on) on.addEventListener('click', turnOn);
    var off = document.getElementById('rn-off'); if (off) off.addEventListener('click', turnOff);
    var te = document.getElementById('rn-test'); if (te) te.addEventListener('click', test);
    document.querySelectorAll('#rn-panel [data-n]').forEach(function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-n')); });
    });
  }
  function redraw() { var had = document.activeElement && document.activeElement.id; drawBell(); if (had && document.getElementById(had)) document.getElementById(had).focus(); }
  function show() { open = true; drawBell(); var h = document.getElementById('rn-h'); if (h) h.focus(); load(); }
  function close(focusBell) { if (!open) return; open = false; drawBell(); if (focusBell) { var b = document.getElementById('rn-bell'); if (b) b.focus(); } }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.rn-dlg-back')) { closeDialog(); return; }
    if (open) close(true);
  });
  document.addEventListener('click', function (e) { if (open && e.target.closest && !e.target.closest('.rn-wrap')) close(false); });

  function markRead(ids, all) {
    var body = all ? { action: 'read', all: true } : { action: 'read', ids: ids };
    (data.items || []).forEach(function (n) { if (all || ids.indexOf(n.id) !== -1) n.read = true; });
    data.unread = all ? 0 : (data.items || []).filter(function (n) { return !n.read; }).length;
    redraw();
    fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(function () {});
  }

  function go(id) {
    var n = (data.items || []).filter(function (x) { return x.id === id; })[0];
    if (!n) return;
    if (!n.read) markRead([n.id]);
    close(false);
    if (n.kind === 'ANNOUNCEMENT' || n.kind === 'REPLY') return openMessage(n.data && n.data.aid);
    if (n.kind === 'OBSERVATION') { location.hash = '#audit=' + encodeURIComponent((n.data && n.data.obsId) || ''); location.reload(); return; }
    if (n.kind === 'DAILY') { if (window.GIQ_REP && window.GIQ_REP.showCases) window.GIQ_REP.showCases(); return; }
    if (n.caseId && window.GIQ_REP && window.GIQ_REP.showCase) window.GIQ_REP.showCase(n.caseId);
  }

  // ---- data ----
  async function load() {
    try {
      var r = await fetch('/api/notifications', { cache: 'no-store' });
      if (!r.ok) return;
      var j = await r.json();
      data = j;
      if (lastUnread !== null && j.unread > lastUnread) { var live = document.getElementById('rn-live'); if (live) live.textContent = T('rn.new_arrived', { n: j.unread }); }
      lastUnread = j.unread;
      await checkPush();
      redraw();
    } catch (e) { /* try again next time */ }
  }

  // ---- messages from GrievIQ ----
  var lastFocus = null;
  function closeDialog() {
    var b = document.querySelector('.rn-dlg-back'); if (b) b.remove();
    if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus(); else { var bell = document.getElementById('rn-bell'); if (bell) bell.focus(); }
  }
  async function openMessage(aid) {
    if (!aid) return;
    lastFocus = document.activeElement;
    var r, j;
    try { r = await fetch('/api/messages?id=' + encodeURIComponent(aid), { cache: 'no-store' }); j = await r.json(); } catch (e) { j = { error: T('rn.msg_missing') }; }
    drawDialog(r && r.ok ? j : { error: T('rn.msg_missing') });
    load();
  }
  function drawDialog(d, focusId, errs) {
    var old = document.querySelector('.rn-dlg-back'); if (old) old.remove();
    var back = document.createElement('div');
    back.className = 'rn-dlg-back';
    var html = '<div class="rn-dlg" role="dialog" aria-modal="true" aria-labelledby="rn-dlg-h"><button type="button" class="rn-close" id="rn-dlg-x" aria-label="' + esc(T('rn.close')) + '">×</button>';
    if (d.error) html += '<h2 id="rn-dlg-h" tabindex="-1">' + esc(T('rn.k_msg_t')) + '</h2><p>' + esc(d.error) + '</p>';
    else {
      html += '<h2 id="rn-dlg-h" tabindex="-1">' + esc(d.message.title) + '</h2><p class="rn-meta">' + esc(T('rn.msg_from', { when: when(d.message.at) })) + '</p>' +
        '<div class="rn-body">' + esc(d.message.body) + '</div>';
      d.offices.forEach(function (o, i) {
        var e = errs && errs[o.office];
        html += '<div class="rn-thread"><h3>' + esc(d.offices.length > 1 ? T('rn.thread_office', { office: (window.GIQ ? window.GIQ.level(o.label) : o.label) + ' – ' + o.name }) : T('rn.thread')) + '</h3>' +
          (o.replies.length ? o.replies.map(function (x) {
            return '<div class="rn-rep' + (x.side === 'GRIEVIQ' ? ' giq' : '') + '"><div class="who">' + esc(x.side === 'GRIEVIQ' ? T('rn.giq_team') : (x.mine ? T('rn.you') : x.author)) + ' · ' + esc(when(x.at)) + '</div><div class="txt">' + esc(x.body) + '</div></div>';
          }).join('') : '<p class="rn-meta">' + esc(T('rn.no_replies')) + '</p>') +
          (o.canReply ? '<label for="rn-r' + i + '">' + esc(T('rn.reply_label')) + '</label><textarea id="rn-r' + i + '" maxlength="2000" data-office="' + esc(o.office) + '"' + (e ? ' aria-invalid="true" aria-describedby="rn-e' + i + '"' : '') + '></textarea>' +
            (e ? '<p class="rn-err" id="rn-e' + i + '">' + esc(e) + '</p>' : '') +
            '<div class="rn-btns" style="margin-top:8px"><button type="button" class="rn-btn" data-send="' + i + '">' + esc(T('rn.reply_send')) + '</button></div>'
            : '<p class="rn-meta">' + esc(T('rn.reply_view_only')) + '</p>') + '</div>';
      });
    }
    html += '</div>';
    back.innerHTML = html;
    document.body.appendChild(back);
    back.addEventListener('click', function (e) { if (e.target === back) closeDialog(); });
    document.getElementById('rn-dlg-x').addEventListener('click', closeDialog);
    back.querySelectorAll('[data-send]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var ta = document.getElementById('rn-r' + b.getAttribute('data-send'));
        var office = ta.getAttribute('data-office'), val = ta.value.trim();
        if (val.length < 2) { var er = {}; er[office] = T('rn.reply_need'); drawDialog(d, ta.id, er); return; }
        b.disabled = true;
        try {
          var r = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.message.id, office: office, body: val }) });
          var j = await r.json();
          if (!r.ok) { var e2 = {}; e2[office] = j.error || T('rn.reply_failed'); drawDialog(d, ta.id, e2); return; }
          drawDialog(j, ta.id);
          var live = document.getElementById('rn-dlg-live'); if (live) live.textContent = T('rn.reply_sent');
        } catch (x) { var e3 = {}; e3[office] = T('rn.reply_failed'); drawDialog(d, ta.id, e3); }
      });
    });
    // Keep focus inside the window (WCAG 2.4.3).
    back.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = back.querySelectorAll('button,textarea,[href]'); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    var live = document.createElement('p'); live.className = 'visually-hidden'; live.id = 'rn-dlg-live'; live.setAttribute('role', 'status'); back.querySelector('.rn-dlg').appendChild(live);
    var target = (focusId && document.getElementById(focusId)) || document.getElementById('rn-dlg-h');
    if (target) target.focus();
  }

  // ---- start ----
  window.GIQN = {
    mount: function () {
      drawBell();
      if (!timer) {
        load();
        timer = setInterval(function () { if (document.visibilityState === 'visible') load(); }, 60000);
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') load(); });
        if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'giq-push') load(); });
      }
    },
    openMessage: openMessage,
    markRead: function (id) { if (id) fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read', ids: [id] }) }).then(load).catch(function () {}); },
    _text: text,
  };
  // The phone notification follows the language chosen in the console.
  document.addEventListener('giq:lang', function () {
    currentSub().then(function (sub) { if (sub) fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lang', lang: lang(), endpoint: sub.endpoint }) }).catch(function () {}); });
  });
})();
