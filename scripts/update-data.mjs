// Neuheiten-Radar: sucht im Beyblade Wiki (MediaWiki-API) nach neuen Beyblade-X-Produktnummern
// (BX-/UX-/CX-…), die noch nicht in der Datenbank stehen, und trägt Treffer in news.json ein.
// Läuft täglich per GitHub Actions. Bei Netzwerkfehlern bleibt news.json unverändert.
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { validateNews } from './validate-data.mjs';

export const API = 'https://beyblade.fandom.com/api.php';
const WIKI = 'https://beyblade.fandom.com/wiki/';
const LINES = ['BX', 'UX', 'CX'];
const LOOKAHEAD = 4;
const MAX_ITEMS = 60;
const CODE_RE = /\b(BX|UX|CX)-(\d{2,3})\b/g;

export function highestCodes(codes) {
  const max = Object.fromEntries(LINES.map((l) => [l, 0]));
  for (const code of codes) {
    for (const m of String(code).matchAll(CODE_RE)) {
      const n = Number(m[2]);
      if (n > max[m[1]]) max[m[1]] = n;
    }
  }
  return max;
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function wikiUrl(title) {
  return WIKI + encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/');
}

function stripHtml(s) {
  return String(s ?? '').replace(/<[^>]*>/g, '');
}

async function api(fetchFn, params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  const res = await fetchFn(url, { headers: { 'User-Agent': 'beyblade-x-planer-news-radar/1.0 (GitHub Actions)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  return res.json();
}

/** Sucht gezielt nach den nächsten Produktnummern je Linie. */
export async function searchNextCodes(fetchFn, known) {
  const max = highestCodes(known);
  const found = [];
  for (const line of LINES) {
    for (let n = max[line] + 1; n <= max[line] + LOOKAHEAD; n++) {
      const code = `${line}-${pad(n)}`;
      const data = await api(fetchFn, { action: 'query', list: 'search', srsearch: `"${code}"`, srlimit: '5', srnamespace: '0' });
      const codeRe = new RegExp(`\\b${code}\\b`);
      for (const hit of data?.query?.search ?? []) {
        if (codeRe.test(hit.title) || codeRe.test(stripHtml(hit.snippet))) {
          found.push({ id: `wiki:${hit.pageid}`, code, title: hit.title, url: wikiUrl(hit.title), source: 'Beyblade Wiki (Suche)' });
          break;
        }
      }
    }
  }
  return found;
}

/** Neu angelegte Wiki-Seiten der letzten Zeit, deren Titel eine X-Produktnummer enthält. */
export async function recentNewPages(fetchFn) {
  const data = await api(fetchFn, { action: 'query', list: 'recentchanges', rctype: 'new', rcnamespace: '0', rclimit: '200', rcprop: 'title|ids|timestamp' });
  const found = [];
  for (const rc of data?.query?.recentchanges ?? []) {
    const m = [...String(rc.title).matchAll(CODE_RE)][0];
    if (m) found.push({ id: `wiki:${rc.pageid}`, code: `${m[1]}-${m[2]}`, title: rc.title, url: wikiUrl(rc.title), source: 'Beyblade Wiki (neue Seite)' });
  }
  return found;
}

/** Führt neue Treffer mit bestehenden News zusammen. Gibt null zurück, wenn sich nichts ändert. */
export function mergeNews(news, hits, knownCodes, now) {
  const known = new Set(knownCodes);
  const byId = new Map(news.items.map((i) => [i.id, i]));
  let added = 0;
  for (const hit of hits) {
    if (hit.code && known.has(hit.code)) continue;
    if (byId.has(hit.id)) continue;
    byId.set(hit.id, { ...hit, foundAt: now });
    added++;
  }
  if (!added) return null;
  const items = [...byId.values()].sort((a, b) => b.foundAt.localeCompare(a.foundAt)).slice(0, MAX_ITEMS);
  return { updatedAt: now, lastRunOk: true, items };
}

export async function run({ fetchFn = fetch, dataDir = new URL('../public/data/', import.meta.url), now = new Date().toISOString() } = {}) {
  const dbPath = new URL('db.json', dataDir);
  const newsPath = new URL('news.json', dataDir);
  const db = JSON.parse(readFileSync(dbPath, 'utf8'));
  const news = JSON.parse(readFileSync(newsPath, 'utf8'));
  const knownCodes = db.products.map((p) => p.code);

  let hits;
  try {
    hits = [
      ...(await searchNextCodes(fetchFn, [...knownCodes, ...news.items.map((i) => i.code).filter(Boolean)])),
      ...(await recentNewPages(fetchFn)),
    ];
  } catch (err) {
    console.warn(`⚠️ Wiki nicht erreichbar, News bleiben unverändert: ${err.message}`);
    return { changed: false, ok: false };
  }

  const merged = mergeNews(news, hits, knownCodes, now);
  if (!merged) {
    console.log(`Keine neuen Produkte gefunden (${hits.length} Treffer geprüft).`);
    return { changed: false, ok: true };
  }
  const errors = validateNews(merged);
  if (errors.length) throw new Error('Ungültige News: ' + errors.join('; '));
  writeFileSync(newsPath, JSON.stringify(merged, null, 2) + '\n');
  console.log(`✅ ${merged.items.length} News-Einträge, neu: ${merged.items.filter((i) => i.foundAt === now).map((i) => i.code ?? i.title).join(', ')}`);
  return { changed: true, ok: true };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
