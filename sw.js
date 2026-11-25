const VERSION='tcg-unboxing-sim-neon-v72';
const SHELL=['./pack-pearl-wrapper.webp','./nunito-latin.woff2','./fredoka-bold-latin.woff2?v=68','./pack-foil-texture.webp','./theme-casino.css?v=72','./art-creatures-expansion.webp?v=46','./art-football-expansion.webp?v=46','./art-basketball-expansion.webp?v=46','./art-creatures.webp?v=46','./art-football.webp?v=46','./art-basketball.webp?v=46','./','./index.html','./styles.css?v=47','./engine.js?v=47','./app.js?v=72','./catalog.json?v=47','./cloud-config.js?v=47','./supabase.min.js?v=47','./cloud.js?v=52','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];

self.addEventListener('install', event => {
  const requests = SHELL.map(path => new Request(new URL(path, self.location.href), {cache:'reload'}));
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('tcg-unboxing-sim-') && key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const {request} = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('.apk')) return;

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (request.mode === 'navigate') {
      try {
        const response = await fetch(request, {cache:'no-cache'});
        if (response.ok) await cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch {
        return await cache.match(request) || await cache.match('./index.html');
      }
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone()).catch(() => {});
    return response;
  })());
});
