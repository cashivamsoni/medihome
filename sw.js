// MediHome Service Worker
// Caches the app shell so it loads instantly and works offline.
// Firebase data sync still needs internet — that's fine.

const CACHE = 'medihome-v1';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700;800&display=swap',
];

// Install: cache the app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// Activate: delete old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for Firebase, cache-first for app shell
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Always go network-first for Firebase (real-time data must be fresh)
  if (url.includes('firebaseio.com') || url.includes('googleapis.com/identitytoolkit')) {
    return; // let browser handle it normally
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(response => {
        // Cache successful GET responses for app shell files
        if (response && response.status === 200 && e.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached); // if network fails, fall back to cache
      return cached || networkFetch;
    })
  );
});