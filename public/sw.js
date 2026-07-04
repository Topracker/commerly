/* Commerly service worker — minimal & conservative */
const VERSION = 'commerly-v3';
const STATIC_CACHE = `${VERSION}-static`;

const PRECACHE = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

const STATIC_ASSET_RE = /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|otf|css)$/i;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(req).then((c) => c || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
      )
    );
    return;
  }

  const isImmutable = url.pathname.startsWith('/_next/static/');
  const isStatic = STATIC_ASSET_RE.test(url.pathname);
  if (!isImmutable && !isStatic) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── Web Push ────────────────────────────────────────────────────────────────
// Recebe o push enviado pelo servidor (rota /api/push/send) e mostra a
// notificação nativa — funciona mesmo com o app/aba fechado.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { titulo: 'Commerly', mensagem: event.data ? event.data.text() : '' };
  }

  const titulo = data.titulo || 'Commerly';
  const options = {
    body: data.mensagem || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'commerly',
    renotify: true,
    data: { link: data.link || '/', tipo: data.tipo || 'geral' },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(titulo, options));
});

// Ao clicar na notificação: foca uma aba existente do app ou abre a rota alvo.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  const target = new URL(link, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate ? client.navigate(target) : null;
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
