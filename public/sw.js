// Service Worker: App läuft nach dem ersten Besuch auch offline.
// - Beim Installieren werden index.html, die gehashten Build-Dateien und die Daten vorab gecacht.
// - Seiten und Daten: Netzwerk zuerst (neue Versionen sofort), offline die letzte Version.
// - Gehashte Assets: Cache zuerst; veraltete Assets werden beim Aktivieren aufgeräumt.
const CACHE = 'xplaner-v13';
// Wird beim Build durch eine Kennung der Build-Dateien ersetzt (vite.config.ts): jede neue Version
// ändert sw.js, damit der Browser den Service Worker neu installiert und die neuen Dateien vorab speichert.
const BUILD = 'dev';
void BUILD;
// Texterkennung (ca. 7 MB) in eigenem Cache: überlebt App-Updates, nur alte OCR-Versionen werden entfernt.
const OCR_CACHE = 'xplaner-ocr';
const STATIC = ['./', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'data/db.json', 'data/news.json', 'data/images.json', 'data/events.json', 'data/meta.json', 'data/rates.json', 'data/aliases.json', 'data/barcodes.json', 'bg-logo.webp', 'logo.webp'];

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
        const cache = await caches.open(CACHE);
        // Liste der Vorversion aufheben: deren Dateien bleiben bis zum nächsten Update erhalten,
        // damit eine noch offene App (alte Version) ihre Tabs weiter nachladen kann.
        const old = await cache.match('precache.json');
        if (old) await cache.put('precache-prev.json', old);
        await cache.put('precache.json', res);
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
  const prevRes = await cache.match('precache-prev.json');
  const prev = prevRes ? await prevRes.json().catch(() => []) : [];
  const names = [...(Array.isArray(assets) ? assets : assetsFromHtml(await index.text())), ...(Array.isArray(prev) ? prev : [])];
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

/** Netzwerk zuerst, aber bei schwachem Netz nach `ms` die gespeicherte Version zeigen (Netz aktualisiert im Hintergrund). */
function networkFirst(event, req, key, ms = 3500) {
  const cached = () => caches.match(key, { ignoreSearch: true, ignoreVary: true });
  const net = fetch(req).then((res) => putInCache(key, res, event));
  const slow = new Promise((r) => setTimeout(r, ms)).then(cached);
  return Promise.race([net.catch(() => null), slow]).then((res) => res || net.catch(cached).then((r) => r || Response.error()));
}

/** Antwort speichern; mit `event` wartet der Service Worker, bis gespeichert ist (auch wenn längst der Cache geantwortet hat). */
function putInCache(req, res, event) {
  if (res.ok) {
    const copy = res.clone();
    const done = caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    if (event) event.waitUntil(done);
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(event, req, './'));
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
    event.respondWith(networkFirst(event, req, req));
    return;
  }
  event.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => putInCache(req, res, event))));
});
