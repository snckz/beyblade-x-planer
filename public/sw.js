// Service Worker: App läuft nach dem ersten Besuch auch offline.
// - Beim Installieren werden index.html, die gehashten Build-Dateien und die Daten vorab gecacht.
// - Seiten und Daten: Netzwerk zuerst (neue Versionen sofort), offline die letzte Version.
// - Gehashte Assets: Cache zuerst; veraltete Assets werden beim Aktivieren aufgeräumt.
const CACHE = 'xplaner-v7';
const STATIC = ['./', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'data/db.json', 'data/news.json', 'data/images.json', 'data/events.json', 'bg.webp'];

function assetsFromHtml(html) {
  return [...html.matchAll(/(?:src|href)="(?:\.\/|[^"]*\/)?(assets\/[^"]+)"/g)].map((m) => m[1]);
}

async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch('./', { cache: 'no-cache' });
  const html = await res.clone().text();
  await cache.put('./', res);
  await cache.addAll([...STATIC.slice(1), ...assetsFromHtml(html)]);
}

async function cleanup() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
  const cache = await caches.open(CACHE);
  const index = await cache.match('./');
  if (!index) return;
  const current = new Set(assetsFromHtml(await index.text()).map((a) => new URL(a, self.registration.scope).href));
  for (const req of await cache.keys()) {
    if (req.url.includes('/assets/') && !current.has(req.url)) await cache.delete(req);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(cleanup().then(() => self.clients.claim()));
});

function putInCache(req, res) {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => putInCache('./', res))
        .catch(() => caches.match('./', { ignoreVary: true })),
    );
    return;
  }
  if (req.url.includes('/data/')) {
    event.respondWith(
      fetch(req)
        .then((res) => putInCache(req, res))
        .catch(() => caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((r) => r || Response.error())),
    );
    return;
  }
  event.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => putInCache(req, res))));
});
