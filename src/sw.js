import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

// New SW waits until the user taps "Update" in the toast, which posts
// { type: 'SKIP_WAITING' }. Then skipWaiting + clients.claim triggers
// controllerchange in main.tsx which reloads the page with fresh chunks.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
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

// SPA navigation: serve cached index.html instantly, revalidate in background
registerRoute(new NavigationRoute(
  new StaleWhileRevalidate({ cacheName: 'html-nav' })
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
