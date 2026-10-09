// public/giq-charts.js  (grieviq-31, approved 9 Oct 2026)
//
// GrievIQ's own small charts, shared by the representative's Overview tab
// and the admin dashboard. No outside library: nothing extra loads, nothing
// is sent anywhere.
//
// Follows the UK Government Analysis Function chart guidance and the
// Scottish Government design system: a line for change over time; sorted
// horizontal bars to compare places or types; at most one stacked bar; no
// pie charts; values written next to the marks (never colour alone); the
// same numbers always available as a table; a one-line summary in words.
// WCAG 2.2: marks are 3:1 against the surface or carry their numbers; the
// line chart can be read with the keyboard (arrow keys) as well as the
// mouse or a tap.
//
// The page supplies colours as CSS variables (light and dark):
//   --gc-ink, --gc-muted, --gc-line, --gc-card, --gc-s1, --gc-s2 (lines),
//   --gc-bar (bars), --gc-a1..--gc-a4 (age bar, newest to oldest).
// Text is passed in already translated; every value is escaped here.
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var css =
    '.gc-h{font-size:15px;font-weight:700;margin:18px 0 4px;color:var(--gc-ink)}' +
    '.gc-sum{font-size:13.5px;color:var(--gc-ink);margin:0 0 8px;line-height:1.45}' +
    '.gc-note{font-size:12.5px;color:var(--gc-muted);margin:4px 0 0}' +
    '.gc-box{position:relative;background:var(--gc-card);border:1px solid var(--gc-line);border-radius:6px;padding:10px 12px;margin-bottom:6px}' +
    // horizontal bars
    '.gc-bars{list-style:none;margin:0;padding:0;display:grid;gap:8px}' +
    '.gc-bar{display:grid;grid-template-columns:minmax(90px,34%) 1fr auto;gap:10px;align-items:center;font-size:13.5px;color:var(--gc-ink)}' +
    '.gc-bar .gc-name{overflow-wrap:anywhere;line-height:1.3}' +
    '.gc-track{height:14px;display:block}' +
    '.gc-fill{display:block;height:14px;min-width:3px;background:var(--gc-bar);border-radius:0 4px 4px 0}' +
    '.gc-val{font-variant-numeric:tabular-nums;font-weight:700;min-width:2ch;text-align:right}' +
    '@media (max-width:520px){.gc-bar{grid-template-columns:1fr auto}.gc-bar .gc-name{grid-column:1/-1;margin-bottom:-4px}}' +
    // stacked bar
    '.gc-stack{display:flex;gap:2px;height:28px;margin:4px 0 10px}' +
    '.gc-seg{display:block;height:100%;min-width:4px}' +
    '.gc-seg:first-child{border-radius:4px 0 0 4px}.gc-seg:last-child{border-radius:0 4px 4px 0}.gc-seg:only-child{border-radius:4px}' +
    '.gc-a1{background:var(--gc-a1)}.gc-a2{background:var(--gc-a2)}.gc-a3{background:var(--gc-a3)}.gc-a4{background:var(--gc-a4)}' +
    '.gc-legend{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;color:var(--gc-ink)}' +
    '.gc-legend li{display:flex;align-items:center;gap:6px}.gc-legend b{font-variant-numeric:tabular-nums}' +
    '.gc-sw{display:inline-block;width:12px;height:12px;border-radius:3px;flex:none}' +
    '.gc-sw.gc-line1,.gc-sw.gc-line2{height:3px;width:14px;border-radius:2px}' +
    '.gc-line1{background:var(--gc-s1)}.gc-line2{background:var(--gc-s2)}' +
    // line chart
    '.gc-svg{width:100%;max-width:720px;height:auto;display:block}' +
    '.gc-grid{stroke:var(--gc-line);stroke-width:1}' +
    '.gc-axis{font-size:11px;fill:var(--gc-muted)}' +
    '.gc-end{font-size:11.5px;fill:var(--gc-ink)}' +
    '.gc-path{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}' +
    '.gc-path.s1{stroke:var(--gc-s1)}.gc-path.s2{stroke:var(--gc-s2)}' +
    '.gc-dot{stroke:var(--gc-card);stroke-width:2}.gc-dot.s1{fill:var(--gc-s1)}.gc-dot.s2{fill:var(--gc-s2)}' +
    '.gc-cross{stroke:var(--gc-muted);stroke-width:1;stroke-dasharray:3 3}' +
    '.gc-hit{fill:transparent;cursor:pointer}' +
    '.gc-trend:focus-visible{outline:3px solid #FFDD00;outline-offset:2px}' +
    '.gc-tip{position:absolute;top:8px;min-width:150px;background:var(--gc-card);color:var(--gc-ink);border:1px solid var(--gc-line);border-radius:6px;padding:6px 8px;font-size:12.5px;box-shadow:0 2px 8px rgba(0,0,0,.18);pointer-events:none}' +
    '.gc-tip div{display:flex;align-items:center;gap:6px}' +
    // "Show as table"
    '.gc-more{margin:4px 0 14px;font-size:13.5px;color:var(--gc-ink)}' +
    '.gc-more>summary{cursor:pointer;min-height:28px;display:flex;align-items:center;font-weight:600}' +
    '.gc-more table{border-collapse:collapse;margin-top:6px;min-width:260px}' +
    '.gc-more th,.gc-more td{text-align:left;padding:5px 10px 5px 0;border-bottom:1px solid var(--gc-line)}' +
    '.gc-more td.n,.gc-more th.n{text-align:right;font-variant-numeric:tabular-nums}' +
    '.gc-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}';
  function addCss() {
    if (document.getElementById('gc-css')) return;
    var st = document.createElement('style'); st.id = 'gc-css'; st.textContent = css;
    document.head.appendChild(st);
  }
  function fmt(n, loc) { return Number(n).toLocaleString(loc || 'en-IN'); }
  function table(label, cols, rows, loc) {
    return '<details class="gc-more"><summary>' + esc(label) + '</summary><div style="overflow-x:auto"><table><thead><tr><th scope="col">' + esc(cols[0]) + '</th>' +
      cols.slice(1).map(function (c) { return '<th scope="col" class="n">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><th scope="row">' + esc(r[0]) + '</th>' + r.slice(1).map(function (v) { return '<td class="n">' + (v == null ? '—' : esc(fmt(v, loc))) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div></details>';
  }

  // Horizontal bars, largest first. o = { title, summary, rows: [{ name, value }],
  // top (default 10), moreNote(n, total), empty, nameCol, valueCol, tableLabel, loc }
  function bars(o) {
    addCss();
    var rows = (o.rows || []).slice().sort(function (a, b) { return b.value - a.value || String(a.name).localeCompare(String(b.name)); });
    var head = '<h3 class="gc-h">' + esc(o.title) + '</h3>';
    if (!rows.length) return head + '<p class="gc-sum">' + esc(o.empty) + '</p>';
    var top = rows.slice(0, o.top || 10), max = Math.max.apply(null, top.map(function (r) { return r.value; })) || 1;
    var list = '<ul class="gc-bars">' + top.map(function (r) {
      var w = Math.max(1, Math.round(r.value / max * 1000) / 10);
      return '<li class="gc-bar"><span class="gc-name">' + esc(r.name) + '</span><span class="gc-track" aria-hidden="true"><span class="gc-fill" style="width:' + w + '%"></span></span><span class="gc-val">' + esc(fmt(r.value, o.loc)) + '</span></li>';
    }).join('') + '</ul>';
    var more = rows.length > top.length && o.moreNote ? '<p class="gc-note">' + esc(o.moreNote(top.length, rows.length)) + '</p>' : '';
    return head + (o.summary ? '<p class="gc-sum">' + esc(o.summary) + '</p>' : '') + '<div class="gc-box">' + list + more + '</div>' +
      table(o.tableLabel, [o.nameCol, o.valueCol], rows.map(function (r) { return [r.name, r.value]; }), o.loc);
  }

  // One stacked bar (pending cases by age). o = { title, summary, parts: [{ label, value }]
  // newest to oldest, empty, nameCol, valueCol, tableLabel, loc }
  function stack(o) {
    addCss();
    var parts = o.parts || [], total = parts.reduce(function (s, p) { return s + p.value; }, 0);
    var head = '<h3 class="gc-h">' + esc(o.title) + '</h3>';
    if (!total) return head + '<p class="gc-sum">' + esc(o.empty) + '</p>';
    var bar = '<div class="gc-stack" aria-hidden="true">' + parts.map(function (p, i) {
      return p.value ? '<span class="gc-seg gc-a' + (i + 1) + '" style="flex:' + p.value + ' 1 0"></span>' : '';
    }).join('') + '</div>';
    var legend = '<ul class="gc-legend">' + parts.map(function (p, i) {
      return '<li><span class="gc-sw gc-a' + (i + 1) + '" aria-hidden="true"></span>' + esc(p.label) + ': <b>' + esc(fmt(p.value, o.loc)) + '</b></li>';
    }).join('') + '</ul>';
    return head + (o.summary ? '<p class="gc-sum">' + esc(o.summary) + '</p>' : '') + '<div class="gc-box">' + bar + legend + '</div>' +
      table(o.tableLabel, [o.nameCol, o.valueCol], parts.map(function (p) { return [p.label, p.value]; }), o.loc);
  }

  // 12-month line: received and resolved. o = { id, title, summary, data: [{ month, received, resolved }],
  // received, resolved, monthCol, tableLabel, keysHint, loc }
  function trend(o) {
    addCss();
    var data = o.data || [];
    if (!data.length) return '';
    // Drawn at about the size it will show, so the text stays readable on a
    // phone and doesn't grow huge on a wide screen.
    var vw = Math.min(window.innerWidth || 800, document.documentElement.clientWidth || 800);
    var W = Math.round(Math.max(300, Math.min(720, vw - 70))), H = W < 480 ? 200 : 220, L = 34, R = 74, Tp = 16, B = 28, loc = o.loc;
    var every = W < 480 ? 3 : 2;
    var max = Math.max(1, Math.max.apply(null, data.map(function (m) { return Math.max(m.received, m.resolved); })));
    var step = Math.pow(10, Math.floor(Math.log10(max))), nice = Math.ceil(max / step) * step;
    if (nice / step > 5 && step >= 1) nice = Math.ceil(max / (step * 2)) * step * 2;
    if (nice < 4) nice = 4;
    var x = function (i) { return L + i * (W - L - R) / Math.max(1, data.length - 1); };
    var y = function (v) { return Tp + (H - Tp - B) * (1 - v / nice); };
    var mon = function (mo) { return new Date(mo + '-01T00:00:00+05:30').toLocaleDateString(loc, { month: 'short', timeZone: 'Asia/Kolkata' }); };
    var grid = '';
    for (var g = 0; g <= 4; g++) { var gv = Math.round(nice * g / 4); grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" class="gc-grid"/><text x="' + (L - 6) + '" y="' + (y(gv) + 4) + '" class="gc-axis" text-anchor="end">' + gv + '</text>'; }
    var labels = data.map(function (m, i) { return ((data.length - 1 - i) % every === 0) ? '<text x="' + x(i) + '" y="' + (H - 8) + '" class="gc-axis" text-anchor="middle">' + esc(mon(m.month)) + '</text>' : ''; }).join('');
    var line = function (k) { return data.map(function (m, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(m[k]).toFixed(1); }).join(' '); };
    var last = data[data.length - 1], ly1 = y(last.received), ly2 = y(last.resolved);
    if (Math.abs(ly1 - ly2) < 14) { if (ly1 <= ly2) { ly1 -= 7; ly2 += 7; } else { ly1 += 7; ly2 -= 7; } }
    var w = (W - L - R) / Math.max(1, data.length - 1);
    var hits = data.map(function (m, i) { return '<rect class="gc-hit" x="' + (x(i) - w / 2) + '" y="' + Tp + '" width="' + w + '" height="' + (H - Tp - B) + '" data-i="' + i + '"/>'; }).join('');
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="gc-svg" aria-hidden="true">' + grid + labels +
      '<line class="gc-cross" x1="0" x2="0" y1="' + Tp + '" y2="' + (H - B) + '" visibility="hidden"/>' +
      '<path d="' + line('received') + '" class="gc-path s1"/><path d="' + line('resolved') + '" class="gc-path s2"/>' +
      data.map(function (m, i) { return '<circle cx="' + x(i) + '" cy="' + y(m.received) + '" r="4" class="gc-dot s1"/><circle cx="' + x(i) + '" cy="' + y(m.resolved) + '" r="4" class="gc-dot s2"/>'; }).join('') +
      '<text x="' + (W - R + 8) + '" y="' + (ly1 + 4) + '" class="gc-end">' + esc(o.received) + '</text>' +
      '<text x="' + (W - R + 8) + '" y="' + (ly2 + 4) + '" class="gc-end">' + esc(o.resolved) + '</text>' + hits + '</svg>';
    var monY = function (mo) { return new Date(mo + '-01T00:00:00+05:30').toLocaleDateString(loc, { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }); };
    return '<h3 class="gc-h">' + esc(o.title) + '</h3>' + (o.summary ? '<p class="gc-sum">' + esc(o.summary) + '</p>' : '') +
      '<ul class="gc-legend" style="margin-bottom:6px"><li><span class="gc-sw gc-line1" aria-hidden="true"></span>' + esc(o.received) + '</li><li><span class="gc-sw gc-line2" aria-hidden="true"></span>' + esc(o.resolved) + '</li></ul>' +
      '<div class="gc-box gc-trend" id="' + esc(o.id) + '" data-w="' + W + '" tabindex="0" role="group" aria-label="' + esc(o.title + '. ' + o.keysHint) + '" data-gc-trend="' + esc(JSON.stringify(data)) + '">' + svg +
        '<div class="gc-tip" hidden></div><p class="gc-sr" aria-live="polite"></p></div>' +
      table(o.tableLabel, [o.monthCol, o.received, o.resolved], data.map(function (m) { return [monY(m.month), m.received, m.resolved]; }), loc);
  }
  // Hover, tap and arrow keys for every line chart inside root.
  function attach(root, o) {
    (root || document).querySelectorAll('.gc-trend').forEach(function (box) {
      if (box.dataset.gcOn) return; box.dataset.gcOn = '1';
      var data; try { data = JSON.parse(box.getAttribute('data-gc-trend')); } catch (e) { return; }
      var svg = box.querySelector('svg'), tip = box.querySelector('.gc-tip'), cross = box.querySelector('.gc-cross'), live = box.querySelector('.gc-sr');
      var hits = box.querySelectorAll('.gc-hit'), cur = -1;
      function show(i, announce) {
        cur = Math.max(0, Math.min(data.length - 1, i));
        var h = hits[cur], m = data[cur];
        var cx = +h.getAttribute('x') + +h.getAttribute('width') / 2;
        cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
        var mo = new Date(m.month + '-01T00:00:00+05:30').toLocaleDateString(o.loc, { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
        tip.innerHTML = '<b>' + esc(mo) + '</b><div><span class="gc-sw gc-line1"></span>' + esc(o.received) + ': ' + esc(fmt(m.received, o.loc)) + '</div><div><span class="gc-sw gc-line2"></span>' + esc(o.resolved) + ': ' + esc(fmt(m.resolved, o.loc)) + '</div>';
        tip.hidden = false;
        var bw = box.clientWidth, scale = svg.getBoundingClientRect().width / (+box.getAttribute('data-w') || 640), px = cx * scale + 12;
        tip.style.left = Math.min(Math.max(4, px - 75), Math.max(4, bw - 165)) + 'px';
        if (announce) live.textContent = mo + ': ' + o.received + ' ' + fmt(m.received, o.loc) + ', ' + o.resolved + ' ' + fmt(m.resolved, o.loc);
      }
      function hide() { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); }
      hits.forEach(function (h) {
        h.addEventListener('mouseenter', function () { show(+h.getAttribute('data-i')); });
        h.addEventListener('click', function () { show(+h.getAttribute('data-i')); });
      });
      svg.addEventListener('mouseleave', function () { if (document.activeElement !== box) hide(); });
      box.addEventListener('focus', function () { show(cur < 0 ? data.length - 1 : cur, true); });
      box.addEventListener('blur', hide);
      box.addEventListener('keydown', function (e) {
        var k = e.key;
        if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End') {
          e.preventDefault();
          show(k === 'Home' ? 0 : k === 'End' ? data.length - 1 : cur + (k === 'ArrowLeft' ? -1 : 1), true);
        } else if (k === 'Escape') hide();
      });
    });
  }
  window.GIQC = { bars: bars, stack: stack, trend: trend, attach: attach, esc: esc };
})();
