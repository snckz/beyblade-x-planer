// Service Worker: App läuft nach dem ersten Besuch auch offline.
// - Beim Installieren werden index.html, die gehashten Build-Dateien und die Daten vorab gecacht.
// - Seiten und Daten: Netzwerk zuerst (neue Versionen sofort), offline die letzte Version.
// - Gehashte Assets: Cache zuerst; veraltete Assets werden beim Aktivieren aufgeräumt.
const CACHE = 'xplaner-v12';
// Texterkennung (ca. 7 MB) in eigenem Cache: überlebt App-Updates, nur alte OCR-Versionen werden entfernt.
const OCR_CACHE = 'xplaner-ocr';
const STATIC = ['./', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'data/db.json', 'data/news.json', 'data/images.json', 'data/events.json', 'data/meta.json', 'data/rates.json', 'bg.webp', 'logo.webp'];

function assetsFromHtml(html) {
  return [...html.matchAll(/(?:src|href)="(?:\.\/|[^"]*\/)?(assets\/[^"]+)"/g)].map((m) => m[1]);
}

/** Alle Build-Assets inkl. nachgeladener Teile (Barcode-Leser) – aus precache.json, sonst aus index.html. */
async function assetList(html) {
  try {
    const res = await fetch('precache.json', { cache: 'no-cache' });
    if (res.ok) {
      const list = await res.clone().json();
      if (Array.isArray(list)) {
        await (await caches.open(CACHE)).put('precache.json', res);
        return list;
      }
    }
  } catch {
    /* offline oder alter Build */
  }
  return assetsFromHtml(html);
}

async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch('./', { cache: 'no-cache' });
  const html = await res.clone().text();
  await cache.put('./', res);
  await cache.addAll([...STATIC.slice(1), ...(await assetList(html))]);
}

async function cleanup() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== CACHE && k !== OCR_CACHE).map((k) => caches.delete(k)));
  const cache = await caches.open(CACHE);
  const index = await cache.match('./');
  if (!index) return;
  const listed = await cache.match('precache.json');
  const assets = listed ? await listed.json().catch(() => null) : null;
  const names = Array.isArray(assets) ? assets : assetsFromHtml(await index.text());
  const current = new Set(names.map((a) => new URL(a, self.registration.scope).href));
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
  if (req.url.includes('/ocr/')) {
    event.respondWith(
      caches.open(OCR_CACHE).then(async (cache) => {
        const hit = await cache.match(req, { ignoreVary: true });
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          await cache.put(req, res.clone());
          // andere OCR-Versionen (Ordner ocr/<version>/) aufräumen
          const dir = new URL('.', req.url).href;
          for (const k of await cache.keys()) if (!k.url.startsWith(dir)) await cache.delete(k);
        }
        return res;
      }),
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
