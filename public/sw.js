// GrievIQ service worker: shows phone/computer notifications (rep console,
// and citizens' optional complaint updates) and opens the right page when
// one is tapped. It does nothing
// else (no offline copies of pages or data).
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = {}; }
  var url = typeof d.url === 'string' && d.url.charAt(0) === '/' && d.url.charAt(1) !== '/' ? d.url : '/rep';
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'GrievIQ', {
      body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', lang: /[ऀ-ॿ]/.test(d.title || '') ? 'hi' : 'en',
      tag: d.tag || undefined, renotify: !!d.tag, data: { url: url },
    }),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      list.forEach(function (c) { c.postMessage({ type: 'giq-push' }); });
    }),
  ]));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var path = (e.notification.data && e.notification.data.url) || '/rep';
  var url = new URL(path, self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var section = self.location.origin + '/' + (path.split(/[/?#]/)[1] || '');
      if (c.url.indexOf(section) === 0 && 'focus' in c) {
        return c.focus().then(function (w) { return w && 'navigate' in w ? w.navigate(url) : null; });
      }
    }
    return self.clients.openWindow(url);
  }));
});
