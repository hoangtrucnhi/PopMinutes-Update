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
    const req = event.request;
    const url = new URL(req.url);
    
    // Network-first cho HTML + JS (luôn lấy bản mới)
    const isHtmlOrJs = req.mode === 'navigate' || 
                       url.pathname.endsWith('.html') || 
                       url.pathname.endsWith('.js');
    
    if (isHtmlOrJs) {
        event.respondWith(
            fetch(req).then(response => {
                // Cache bản mới
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
                return response;
            }).catch(() => {
                // Offline → fallback cache
                return caches.match(req);
            })
        );
        return;
    }
    
    // Còn lại: cache-first
    event.respondWith(
        caches.match(req).then(response => {
            return response || fetch(req).catch(() => {
                return new Response('', { status: 408 });
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
