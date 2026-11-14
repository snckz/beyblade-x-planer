// Echte Blade-Gewichte aus dem Beyblade Wiki („Blade - SharkScale“ … „weighs 35.6 grams“ oder Infobox „| weight = 35.6 g“).
// Die Kombo-Analyse nutzt sie: schwere Blades halten länger durch und stehen stabiler.
// Pro Blade nur ein Versuch: null = kein Gewicht gefunden. Netzwerkfehler → nächster Lauf.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { API } from './update-data.mjs';

const MAX_PAGES = 120;

/** Gewicht in Gramm aus dem Wikitext einer Blade-Seite (Blades wiegen ca. 25–55 g). */
export function parseWeight(wikitext) {
  const text = String(wikitext);
  const m =
    /\|\s*weight\s*=\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:g|grams)\b/i.exec(text) ??
    /\bweigh(?:s|ing)?\s+(?:in\s+at\s+|about\s+|approximately\s+|around\s+|an average of\s+)?(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:g|grams)\b/i.exec(text);
  if (!m) return null;
  const g = Number(m[1].replace(',', '.'));
  return g >= 20 && g <= 60 ? Math.round(g * 10) / 10 : null;
}

export async function updateWeights(db, fetchPage) {
  const out = structuredClone(db);
  let fetched = 0;
  const found = [];
  for (const b of out.blades) {
    if (b.weightG !== undefined || fetched >= MAX_PAGES) continue;
    // CX-Blades bestehen aus mehreren Teilen – dort gibt es kein einzelnes Blade-Gewicht.
    if (b.line === 'CX') {
      b.weightG = null;
      continue;
    }
    fetched++;
    const wt = await fetchPage(`Blade - ${b.id}`);
    if (wt === undefined) continue;
    b.weightG = wt ? parseWeight(wt) : null;
    if (b.weightG) found.push(`${b.id} ${b.weightG} g`);
  }
  return { db: out, found, fetched };
}

async function wikitextOf(fetchFn, title) {
  const url = `${API}?${new URLSearchParams({ action: 'parse', page: title, prop: 'wikitext', redirects: '1', format: 'json', formatversion: '2' })}`;
  try {
    const res = await fetchFn(url, { headers: { 'User-Agent': 'beyblade-x-planer-weights/1.0 (GitHub Actions)' } });
    if (!res.ok) return undefined;
    const d = await res.json();
    return d?.parse?.wikitext ?? null;
  } catch {
    return undefined;
  }
}

export async function run({ fetchFn = fetch, dataDir = new URL('../public/data/', import.meta.url) } = {}) {
  const path = new URL('db.json', dataDir);
  const db = JSON.parse(readFileSync(path, 'utf8'));
  const res = await updateWeights(db, (t) => wikitextOf(fetchFn, t));
  const changed = JSON.stringify(res.db) !== JSON.stringify(db);
  if (changed) writeFileSync(path, JSON.stringify(res.db, null, 2) + '\n');
  console.log(`Gewichte: ${res.found.length} gefunden (${res.fetched} Seiten).`);
  return { changed, found: res.found };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) void run();
