const CACHE_NAME = 'opencode-tui-v1';

// Assets to pre-cache on install (will be populated by build)
const STATIC_ASSETS = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Pre-cache known static assets
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Silently fail pre-cache - runtime caching will handle it
      });
    }),
  );
  // Take control immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
    }),
  );
  // Claim all clients
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache: API routes, WebSocket upgrades
  if (url.pathname.startsWith('/api/') || event.request.headers.get('upgrade') === 'websocket') {
    return;
  }

  // For navigation requests: network-first, fall back to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful navigation responses
          const cached = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cached));
          return response;
        })
        .catch(() => {
          return caches.match('/index.html') || caches.match('/');
        }),
    );
    return;
  }

  // For all other requests: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const sessionId =
    event.notification?.data && typeof event.notification.data.sessionId === 'string'
      ? event.notification.data.sessionId
      : null;

  const activateUrl = sessionId ? `/?activateSession=${encodeURIComponent(sessionId)}` : '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clients) => {
        const message = {
          type: 'ACTIVATE_SESSION',
          sessionId,
        };

        if (clients.length > 0) {
          const visibleClient =
            clients.find((client) => client.visibilityState === 'visible') ?? clients[0];

          let targetClient = visibleClient;

          if (
            sessionId &&
            targetClient.visibilityState !== 'visible' &&
            typeof targetClient.navigate === 'function'
          ) {
            try {
              targetClient = (await targetClient.navigate(activateUrl)) ?? targetClient;
            } catch {
              // fall back to focus/message or a new window below
            }
          }

          try {
            targetClient = (await targetClient.focus()) ?? targetClient;
          } catch {
            return self.clients.openWindow(activateUrl);
          }

          try {
            targetClient.postMessage(message);
          } catch {
            // best-effort activation hint
          }

          return targetClient;
        }

        return self.clients.openWindow(activateUrl);
      })
      .catch(() => {
        // Notification click handling is best-effort.
      }),
  );
});
