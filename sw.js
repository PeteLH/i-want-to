// I want to… service worker: offline copy of the app and push notifications.
const CACHE = 'iwt-v1.1.3';
const SHELL = ['./', 'index.html', 'app.js', 'core.js', 'inspire.js', 'config.js', 'version.js', 'style.css', 'fonts/fonts.css', 'fonts/inter.woff2', 'fonts/bricolage.woff2', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-180.png', 'badge-96.png'];
// Always fetch app files fresh (bypassing GitHub Pages' 10-minute cache) so updates show at once; fall back to the copy when offline.
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  const fresh = e.request.mode === 'navigate' ? fetch(e.request.url, { cache: 'no-cache' }) : fetch(e.request, { cache: 'no-cache' });
  e.respondWith(fresh.then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
self.addEventListener('push', e => {
  let msg = {};
  try { msg = e.data.json(); } catch { msg = { title: 'I want to…', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(msg.title || 'I want to…', {
    body: msg.body || '', icon: 'icon-192.png', badge: 'badge-96.png', tag: msg.tag || 'iwt', renotify: true,
    data: { url: msg.url || './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.navigate(target); return c.focus(); }
    return clients.openWindow(target);
  }));
});
