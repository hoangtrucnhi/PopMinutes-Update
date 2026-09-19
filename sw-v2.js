// ============================================================
//  PopMinutes Service Worker v2
//  Kết hợp: Caching + Push Notification
// ============================================================

const CACHE_NAME = 'popminutes-v2';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './launchericon-192x192.png',
  './launchericon-512x512.png'
];

// ========== INSTALL ==========
self.addEventListener('install', event => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// ========== ACTIVATE ==========
self.addEventListener('activate', event => {
    console.log('[SW] Activated');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) return caches.delete(cache);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ========== FETCH (cache-first) ==========
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request).catch(err => {
                console.warn('[SW] Fetch failed:', event.request.url, err.message);
                return new Response('', { status: 408, statusText: 'Request Timeout' });
            });
        })
    );
});

// ========== PUSH NOTIFICATION ==========
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
            category: data.category || 'system',
            recordId: data.recordId || ''
        }
    };

    // Gửi message tới tất cả app đang mở → trigger refresh badge
    event.waitUntil(
        Promise.all([
            self.registration.showNotification(title, options),
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
                clientList.forEach(client => {
                    client.postMessage({
                        type: 'PUSH_RECEIVED',
                        title: title,
                        body: options.body,
                        category: options.data.category
                    });
                });
            })
        ])
    );
});

self.addEventListener('notificationclick', function(event) {
    console.log('[SW] 🔔 Notification clicked');
    event.notification.close();

    const data = event.notification.data || {};
    const targetUrl = data.url || './#notifications';
    const recordId = data.recordId || '';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Ưu tiên tab đang mở app
            for (const client of clientList) {
                if (client.url.includes('PopMinutes') && 'focus' in client) {
                    client.focus();
                    // Firefox cần navigate (postMessage không reliable)
                    if ('navigate' in client) {
                        client.navigate(targetUrl);
                    }
                    // Chrome vẫn dùng postMessage
                    client.postMessage({
                        type: 'NOTIFICATION_CLICK',
                        url: targetUrl,
                        recordId: recordId,
                        category: data.category || ''
                    });
                    return;
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
