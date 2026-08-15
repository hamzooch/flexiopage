/**
 * Service worker FlexioPage — réception des Web Push (notifications vendeur).
 *
 * Reçoit les push envoyés par le backend (webpush.service) MÊME quand le
 * navigateur/la PWA est fermé, et affiche la notification système. Au clic,
 * focus un onglet dashboard existant ou en ouvre un sur le lien de la notif.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'FlexioPage', body: '', link: '/dashboard', tag: undefined };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* payload non-JSON — on affiche le défaut */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/brand/icon.png',
      badge: '/brand/icon.png',
      data: { link: data.link || '/dashboard' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
