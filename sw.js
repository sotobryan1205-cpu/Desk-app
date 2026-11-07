/* Plan B: no web push. Service worker only for offline shell cache of static assets. */
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', () => {});
