// JPvano Service Worker — Push Notifications & Background Sync
'use strict';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

// Handle push events from server (Web Push API)
self.addEventListener('push', function(event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'JPvano', body: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: '/icon.png',
    badge: '/icon.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    tag: data.tag || 'jpvano-notification',
    renotify: true
  };

  // Call notifications include action buttons (accept / reject)
  if (data.type === 'call') {
    options.actions = [
      { action: 'accept', title: '📞 Atender' },
      { action: 'reject', title: '❌ Recusar' }
    ];
    options.requireInteraction = true;
  }

  event.waitUntil(
    self.registration.showNotification(data.title || '📱 JPvano', options)
  );
});

// Handle notification click and action button clicks
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const data = event.notification.data || {};

  if (event.action === 'accept' && data.call_id) {
    // Focus existing window and post message to accept call
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            client.postMessage({ type: 'ACCEPT_CALL', call_id: data.call_id });
            return;
          }
        }
        return clients.openWindow('/?accept_call=' + data.call_id);
      })
    );
    return;
  }

  if (event.action === 'reject' && data.call_id) {
    // Post message to reject call to any open window
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
        for (const client of clientList) {
          client.postMessage({ type: 'REJECT_CALL', call_id: data.call_id });
          return;
        }
      })
    );
    return;
  }

  // Default: focus or open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});
