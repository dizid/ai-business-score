// Minimal PWA-installability service worker for app.html. Deliberately
// does no caching — this dashboard is always-online (auth'd API calls by
// ID, not offline-first), so a pass-through fetch handler is enough to
// satisfy Chrome's installability/Lighthouse checks without adding a
// stale-cache class of bugs this product doesn't need.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
