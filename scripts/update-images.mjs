// Holt zu jeder Blade das Vorschaubild der passenden Beyblade-Wiki-Seite (MediaWiki pageimages)
// und speichert nur den LINK darauf in public/data/images.json. Die Bilder werden nicht kopiert:
// die App zeigt sie direkt vom Wiki an, mit Quellenhinweis und Link zur Wiki-Seite.
// Optional: Blade-Feld "wikiTitle" in db.json erzwingt eine bestimmte Wiki-Seite.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { API, wikiUrl } from './update-data.mjs';

const ALLOWED_HOST = /^https:\/\/static\.wikia\.nocookie\.net\//;

export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Wählt aus Suchtreffern die Seite, deren Titel den Blade-Namen enthält und ein Bild hat. */
export function pickPage(blade, pages) {
  const want = norm(blade.id);
  const candidates = (pages ?? [])
    .filter((p) => p?.thumbnail?.source && ALLOWED_HOST.test(p.thumbnail.source))
    .filter((p) => norm(p.title).includes(want));
  if (!candidates.length) return null;
  // Bevorzugt: Titel mit Beyblade-X-Kombo (Ratchet/Bit) oder „Beyblade X“, sonst der kürzeste Titel.
  const score = (p) => (/\d-\d{2}|beyblade x/i.test(p.title) ? 0 : 1) * 1000 + p.title.length - (p.index ?? 0) / 100;
  return candidates.sort((a, b) => score(a) - score(b))[0];
}

async function query(fetchFn, params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', action: 'query', ...params })}`;
  const res = await fetchFn(url, { headers: { 'User-Agent': 'beyblade-x-planer-images/1.0 (GitHub Actions)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function findImage(fetchFn, blade) {
  const common = { prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '400', redirects: '1' };
  const data = blade.wikiTitle
    ? await query(fetchFn, { ...common, titles: blade.wikiTitle })
    : await query(fetchFn, { ...common, generator: 'search', gsrsearch: blade.name, gsrnamespace: '0', gsrlimit: '8' });
  const pages = data?.query?.pages ?? [];
  const page = blade.wikiTitle ? pages.find((p) => p?.thumbnail?.source && ALLOWED_HOST.test(p.thumbnail.source)) : pickPage(blade, pages);
  return page ? { thumb: page.thumbnail.source, page: wikiUrl(page.title), title: page.title } : null;
}

export async function run({ fetchFn = fetch, dataDir = new URL('../public/data/', import.meta.url), refreshAll = false } = {}) {
  const db = JSON.parse(readFileSync(new URL('db.json', dataDir), 'utf8'));
  const path = new URL('images.json', dataDir);
  let images = {};
  try {
    images = JSON.parse(readFileSync(path, 'utf8')).blades ?? {};
  } catch {
    /* noch keine Datei */
  }
  let changed = false;
  let failures = 0;
  for (const blade of db.blades) {
    if (!refreshAll && images[blade.id]) continue;
    try {
      const img = await findImage(fetchFn, blade);
      if (img && JSON.stringify(img) !== JSON.stringify(images[blade.id])) {
        images[blade.id] = img;
        changed = true;
      }
    } catch (err) {
      failures++;
      console.warn(`⚠️ ${blade.id}: ${err.message}`);
      if (failures >= 3) {
        console.warn('Wiki nicht erreichbar – Abbruch, bestehende Bilder bleiben.');
        break;
      }
    }
  }
  if (changed) {
    writeFileSync(path, JSON.stringify({ source: 'Beyblade Wiki (beyblade.fandom.com)', blades: images }, null, 2) + '\n');
  }
  console.log(`Bilder: ${Object.keys(images).length}/${db.blades.length} Blades verknüpft${changed ? ' (aktualisiert)' : ''}.`);
  return { changed, count: Object.keys(images).length };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run({ refreshAll: process.argv.includes('--all') }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
