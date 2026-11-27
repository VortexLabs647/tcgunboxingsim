const VERSION='tcg-unboxing-sim-rocks-v105';
const SHELL=['./campaign-profile.css?v=105','./campaign-canyon.webp','./levels-pickaxe.webp','./profile-amethyst.webp','./arena-elements.webp','./arena-attacks.webp','./pack-lettering.webp','./art-rocks.webp','./art-rocks-2.webp','./art-rocks-3.webp','./crystal-canyon.webp','./pack-pearl-wrapper.webp','./nunito-latin.woff2','./font-1.ttf','./font-7.ttf','./fredoka-bold-latin.woff2?v=68','./theme-casino.css?v=102','./','./index.html','./styles.css?v=47','./engine.js?v=105','./app.js?v=105','./arena.js?v=102','./catalog.json?v=80','./cloud-config.js?v=47','./supabase.min.js?v=47','./cloud.js?v=105','./manifest.webmanifest?v=80','./icon.svg','./icon-192.png','./icon-512.png'];

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
        const response = await fetch(request, {cache:'reload'});
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
