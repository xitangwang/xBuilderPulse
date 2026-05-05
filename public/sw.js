/* BuilderPulse Reader — Service Worker */
const CACHE = 'bp-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // HTML navigations: network-first, fall back to cache (offline).
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirst(req));
    return;
  }

  // Static assets: stale-while-revalidate.
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/_astro/') ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/manifest.webmanifest' ||
    /\.(?:css|js|woff2?|ttf|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (_) {
    const cached = await cache.match(req);
    if (cached) return cached;
    const fallback = await cache.match('/');
    return fallback ?? Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached ?? network;
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: 'BuilderPulse', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'BuilderPulse Daily';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    data: { url: payload.url || '/' },
    tag: payload.tag || 'bp-daily',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ('focus' in client && client.url.endsWith(url)) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })(),
  );
});
