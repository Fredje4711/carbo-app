const CACHE_NAME = 'carbo-app-v20';
const STATIC_ASSETS = ['./', './index.html', './style.css?v=20', './script.js?v=20', './entry.js?v=20', './lib/installation.js?v=20', './lib/analysis.js?v=20', './lib/local-data.js?v=20', './lib/credits.js?v=20', './manifest.json', './icon-192.png', './icon-512.png'];
const FALLBACK_PAGE = new URL('./index.html', self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('carbo-app-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(request, { signal: controller.signal });
        if (!response.ok) throw new Error('Navigation failed');
        // Only the app entry point may replace the offline start page.
        if (url.pathname === new URL('./', self.registration.scope).pathname || url.pathname === new URL('./index.html', self.registration.scope).pathname) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(FALLBACK_PAGE, response.clone());
        }
        return response;
      } catch {
        return await caches.match(FALLBACK_PAGE) || new Response('Open de app opnieuw zodra u internet heeft.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      } finally { clearTimeout(timer); }
    })());
    return;
  }
  // Immutable assets are versioned together. Never cache API responses, photos or audio.
  event.respondWith(caches.open(CACHE_NAME).then(async cache => await cache.match(request) || fetch(request)));
});
