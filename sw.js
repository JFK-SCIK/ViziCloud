const CACHE = 'vizicloud-v3';
const SHELL = [
  './',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Push notifications ────────────────────────────────────────────────────────

self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title || 'ViziCloud', {
      body:      data.body || 'Nouvelles photos dans l\'album',
      icon:      '/icons/icon-192.png',
      badge:     '/icons/icon-192.png',
      tag:       'vizicloud-new-photos',
      renotify:  true,
      data:      { url: '/', token: data.token },
    }),
    navigator.setAppBadge ? navigator.setAppBadge(data.count || 1) : Promise.resolve(),
  ]));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      const existing = wins.find(w => w.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(event.notification.data?.url || '/');
    })
  );
});

self.addEventListener('message', event => {
  if (event.data === 'clear-notifications') {
    self.registration.getNotifications().then(notifs => notifs.forEach(n => n.close()));
  }
});

// ── Fetch cache ───────────────────────────────────────────────────────────────

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Let iCloud API calls bypass the cache entirely
  if (url.includes('icloud.com')) return;

  // GET only
  if (e.request.method !== 'GET') return;

  // Never cache dynamic endpoints
  const path = new URL(url).pathname;
  if (path.startsWith('/push/') || path.startsWith('/api/') ||
      path.startsWith('/admin') || path === '/version.json' ||
      path === '/albums.json') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
