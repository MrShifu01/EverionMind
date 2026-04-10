import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

// Take control immediately when a new SW version is available
self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());

// Remove old precaches from previous SW versions
cleanupOutdatedCaches();

// Injected by vite-plugin-pwa at build time
precacheAndRoute(self.__WB_MANIFEST);

// Fallback: if a lazy-loaded chunk 404s (stale hash), fetch from network
registerRoute(
  ({ request }) => request.destination === 'script',
  new NetworkFirst({ cacheName: 'js-chunks' })
);

// SPA navigation fallback to index.html
registerRoute(new NavigationRoute(
  async ({ event }) => {
    try {
      return await fetch(event.request);
    } catch {
      return caches.match('/index.html');
    }
  }
));

// ── Push event: show notification ──
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  const {
    title = 'Everion',
    body  = '',
    url   = '/',
    icon  = '/icons/icon-192.png',
  } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/icons/icon-192.png',
      data: { url },
    })
  );
});

// ── Notification click: focus or open window ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        const existing = windowClients.find(c =>
          c.url.startsWith(self.location.origin)
        );
        if (existing) {
          existing.focus();
          existing.postMessage({ type: 'navigate', url });
        } else {
          self.clients.openWindow(url);
        }
      })
  );
});
