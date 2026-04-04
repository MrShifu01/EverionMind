import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// Take control immediately when a new SW version is available
self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());

// Remove old precaches from previous SW versions
cleanupOutdatedCaches();

// Injected by vite-plugin-pwa at build time
precacheAndRoute(self.__WB_MANIFEST);

// ── Push event: show notification ──
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  const {
    title = 'OpenBrain',
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
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        const existing = windowClients.find(c =>
          c.url.startsWith(self.location.origin)
        );
        if (existing) {
          existing.focus();
          existing.postMessage({ type: 'navigate', url });
        } else {
          clients.openWindow(url);
        }
      })
  );
});
