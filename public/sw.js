/**
 * FauxLore service worker.
 *
 * Exists for one reason: a push notification has to be received by something
 * that runs when the tab is closed, and only a service worker can. It stays
 * deliberately thin — no caching, no offline shell — because anything it cached
 * would be one more thing to invalidate on deploy for no benefit here.
 */

// Take over immediately rather than waiting for every old tab to close, so a
// re-registered worker starts receiving pushes on the same visit.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // A push with a body we cannot read is still worth surfacing.
    data = { title: 'FauxLore', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'FauxLore';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // The dedupe key doubles as the tag, so the same event replacing itself on
    // the lock screen rather than stacking is free.
    tag: data.tag || data.type || 'fauxlore',
    renotify: false,
    data: { link: data.link || '/', type: data.type || '' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reuse a tab that is already open rather than piling up new ones.
    for (const client of all) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(link).catch(() => {});
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(link);
  })());
});
