const CACHE_NAME = 'popminutes-v2';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './launchericon-192x192.png',
  './launchericon-512x512.png'
];

// Cài đặt và cache các asset tĩnh để có thể chạy offline cơ bản
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    }).then(() => self.skipWaiting())
  );
});

// Kích hoạt SW và xóa cache cũ nếu có thay đổi phiên bản
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Xử lý phản hồi yêu cầu mạng (Bắt buộc phải có để kích hoạt nút Cài đặt PWA)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
// ============================================================
//  PopMinutes Service Worker
// ============================================================

self.addEventListener('install', function(event) {
    console.log('[SW] Installing...');
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    console.log('[SW] Activated');
    event.waitUntil(clients.claim());
});

self.addEventListener('push', function(event) {
    console.log('[SW] 🔔 Push received');

    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'PopMinutes', body: event.data.text() };
        }
    }

    const title = data.title || 'PopMinutes';
    const options = {
        body: data.body || 'Bạn có thông báo mới',
        icon: './launchericon-192x192.png',
        badge: './launchericon-192x192.png',
        vibrate: [200, 100, 200],
        tag: data.tag || 'popminutes-' + Date.now(),
        renotify: true,
        requireInteraction: false,
        data: {
            url: data.url || './#notifications',
            category: data.category || 'system'
        }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    console.log('[SW] 🔔 Notification clicked');
    event.notification.close();

    const targetUrl = event.notification.data?.url || './#notifications';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (const client of clientList) {
                if (client.url.includes('PopMinutes') && 'focus' in client) {
                    client.focus();
                    if ('navigate' in client) {
                        client.navigate(targetUrl);
                    }
                    return;
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
