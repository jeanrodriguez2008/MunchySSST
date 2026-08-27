const CACHE_NAME = 'munchyssst-cache-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/login',
        '/static/img/icon-192.png',
        '/static/img/icon-512.png',
        '/static/img/logo_header.png'
      ]);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});