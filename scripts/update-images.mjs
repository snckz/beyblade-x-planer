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

/**
 * Bit-Seite wählen: Der Bit-Name ist oft ein allgemeines Wort („Flat“, „Ball“), daher nur
 * Titel akzeptieren, die genau dem Namen entsprechen (optional mit Zusatz wie „(Bit)“ oder „Bit - “).
 */
export function pickBitPage(bit, pages) {
  const want = norm(bit.name);
  const ok = (pages ?? []).filter((p) => p?.thumbnail?.source && ALLOWED_HOST.test(p.thumbnail.source));
  const strip = (t) => norm(String(t).replace(/^bit\s*-\s*/i, '').replace(/\((bit|beyblade x|x)\)/i, ''));
  const exact = ok.filter((p) => strip(p.title) === want);
  if (!exact.length) return null;
  const pref = (p) => (/\(bit\)|^bit\s*-/i.test(p.title) ? 0 : 1);
  return exact.sort((a, b) => pref(a) - pref(b) || (a.index ?? 0) - (b.index ?? 0))[0];
}

/**
 * Fallback, wenn eine Seite kein Vorschaubild hat (z. B. Ratchet Integrated Bits):
 * Dateien der Seite durchgehen und die nehmen, deren Name den Teile-Namen enthält.
 */
export async function findImageInPage(fetchFn, title, name) {
  const d = await query(fetchFn, { generator: 'images', titles: title, gimlimit: '50', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '400', redirects: '1' });
  const key = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  const files = (d?.query?.pages ?? []).filter((f) => /\.(png|jpe?g|webp)$/i.test(f.title ?? '') && f.imageinfo?.[0]?.thumburl && ALLOWED_HOST.test(f.imageinfo[0].thumburl));
  const hit = files.find((f) => f.title.toLowerCase().replace(/[^a-z0-9]/g, '').includes(key));
  if (hit) return { thumb: hit.imageinfo[0].thumburl, page: wikiUrl(title), title };
  // Letzter Versuch: Dateisuche im Wiki (Namensraum 6 = Dateien).
  const s = await query(fetchFn, { generator: 'search', gsrsearch: `${name} Bit`, gsrnamespace: '6', gsrlimit: '20', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '400' });
  const found = (s?.query?.pages ?? [])
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f.title ?? '') && f.imageinfo?.[0]?.thumburl && ALLOWED_HOST.test(f.imageinfo[0].thumburl))
    .filter((f) => f.title.toLowerCase().replace(/[^a-z0-9]/g, '').includes(key))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0];
  return found ? { thumb: found.imageinfo[0].thumburl, page: wikiUrl(title), title } : null;
}

export async function findBitImage(fetchFn, bit) {
  const common = { prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '400', redirects: '1' };
  if (bit.wikiTitle) {
    const d = await query(fetchFn, { ...common, titles: bit.wikiTitle });
    const p = (d?.query?.pages ?? []).find((x) => x?.thumbnail?.source && ALLOWED_HOST.test(x.thumbnail.source));
    if (p) return { thumb: p.thumbnail.source, page: wikiUrl(p.title), title: p.title };
    return findImageInPage(fetchFn, bit.wikiTitle, bit.name);
  }
  // Direkte Titel-Kandidaten zuerst (schnell und eindeutig), dann Suche.
  const titles = [`Bit - ${bit.name}`, `${bit.name} (Bit)`, bit.name].join('|');
  const direct = await query(fetchFn, { ...common, titles });
  let page = pickBitPage(bit, direct?.query?.pages);
  if (!page) {
    const d = await query(fetchFn, { ...common, generator: 'search', gsrsearch: `${bit.name} Bit Beyblade X`, gsrnamespace: '0', gsrlimit: '10' });
    page = pickBitPage(bit, d?.query?.pages);
  }
  return page ? { thumb: page.thumbnail.source, page: wikiUrl(page.title), title: page.title } : null;
}

/** Ratchet-Seite wählen: nur Titel, die genau die Bezeichnung tragen („Ratchet - 3-60“ oder „3-60“). */
export function pickRatchetPage(ratchet, pages) {
  const want = String(ratchet.id).trim();
  const ok = (pages ?? []).filter((p) => p?.thumbnail?.source && ALLOWED_HOST.test(p.thumbnail.source));
  const strip = (t) => String(t).replace(/^ratchet\s*-\s*/i, '').replace(/\s*\(ratchet\)\s*$/i, '').trim();
  const exact = ok.filter((p) => strip(p.title) === want);
  if (!exact.length) return null;
  const pref = (p) => (/^ratchet\s*-|\(ratchet\)/i.test(p.title) ? 0 : 1);
  return exact.sort((a, b) => pref(a) - pref(b) || (a.index ?? 0) - (b.index ?? 0))[0];
}

export async function findRatchetImage(fetchFn, ratchet) {
  const common = { prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '400', redirects: '1' };
  const titles = ratchet.wikiTitle ?? [`Ratchet - ${ratchet.id}`, `${ratchet.id} (Ratchet)`].join('|');
  const direct = await query(fetchFn, { ...common, titles });
  let page = ratchet.wikiTitle
    ? (direct?.query?.pages ?? []).find((x) => x?.thumbnail?.source && ALLOWED_HOST.test(x.thumbnail.source))
    : pickRatchetPage(ratchet, direct?.query?.pages);
  if (!page && !ratchet.wikiTitle) {
    const d = await query(fetchFn, { ...common, generator: 'search', gsrsearch: `Ratchet ${ratchet.id}`, gsrnamespace: '0', gsrlimit: '10' });
    page = pickRatchetPage(ratchet, d?.query?.pages);
  }
  return page ? { thumb: page.thumbnail.source, page: wikiUrl(page.title), title: page.title } : null;
}

export async function run({ fetchFn = fetch, dataDir = new URL('../public/data/', import.meta.url), refreshAll = false } = {}) {
  const db = JSON.parse(readFileSync(new URL('db.json', dataDir), 'utf8'));
  const path = new URL('images.json', dataDir);
  let blades = {};
  let bits = {};
  let ratchets = {};
  try {
    const old = JSON.parse(readFileSync(path, 'utf8'));
    blades = old.blades ?? {};
    bits = old.bits ?? {};
    ratchets = old.ratchets ?? {};
  } catch {
    /* noch keine Datei */
  }
  let changed = false;
  let failures = 0;
  const jobs = [
    ...db.blades.map((x) => ({ x, store: blades, find: findImage })),
    ...(db.bits ?? []).map((x) => ({ x, store: bits, find: findBitImage })),
    ...(db.ratchets ?? []).map((x) => ({ x, store: ratchets, find: findRatchetImage })),
  ];
  for (const { x, store, find } of jobs) {
    if (!refreshAll && store[x.id]) continue;
    try {
      const img = await find(fetchFn, x);
      if (img && JSON.stringify(img) !== JSON.stringify(store[x.id])) {
        store[x.id] = img;
        changed = true;
      }
    } catch (err) {
      failures++;
      console.warn(`⚠️ ${x.id}: ${err.message}`);
      if (failures >= 3) {
        console.warn('Wiki nicht erreichbar – Abbruch, bestehende Bilder bleiben.');
        break;
      }
    }
  }
  if (changed) {
    writeFileSync(path, JSON.stringify({ source: 'Beyblade Wiki (beyblade.fandom.com)', blades, bits, ratchets }, null, 2) + '\n');
  }
  const count = Object.keys(blades).length;
  console.log(`Bilder: ${count}/${db.blades.length} Blades, ${Object.keys(bits).length}/${(db.bits ?? []).length} Bits, ${Object.keys(ratchets).length}/${(db.ratchets ?? []).length} Ratchets verknüpft${changed ? ' (aktualisiert)' : ''}.`);
  for (const [id, img] of Object.entries(bits)) console.log(`  Bit ${id} → ${img.title}`);
  for (const [id, img] of Object.entries(ratchets)) console.log(`  Ratchet ${id} → ${img.title}`);
  return { changed, count, bits: Object.keys(bits).length, ratchets: Object.keys(ratchets).length };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run({ refreshAll: process.argv.includes('--all') }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
