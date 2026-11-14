// Hasbro-Namen (Westen/Europa) aus der Hasbro-Produktliste im Beyblade Wiki.
// Zuordnung zu den Blades in db.json:
//  1. gleiche Wörter, andere Reihenfolge („Sword Dran“ ↔ Dran Sword)
//  2. sonst gleiche Ratchet+Bit-Kombination wie ein Takara-Produkt und mindestens ein gemeinsames Wort
//     („Helm Knight 3-80N“ ↔ Knight Shield 3-80N)
// Von Hand gepflegte hasbroName-Werte werden nie überschrieben. Automatisch gefundene tragen
// hasbroNameAuto: true und werden bei jedem Lauf neu berechnet (Fehlzuordnungen korrigieren sich so).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { API } from './update-data.mjs';

export const LIST_TITLES = ['List of Beyblade X products (Hasbro)', 'List of Beyblade X Products (Hasbro)'];

const words = (s) =>
  String(s)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const key = (s) => words(s).sort().join(' ');

/** Kandidaten „Name Ratchet Bit“ aus dem Wikitext, z. B. „Helm Knight 3-80N“ oder „Fang Leon T 4-60U“. */
export function parseHasbroNames(wikitext) {
  const text = String(wikitext)
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'''?|<[^>]+>/g, ' ')
    // Produkttyp vor dem Namen abtrennen („Starter Sword Dran 3-60F“ → „Sword Dran 3-60F“)
    .replace(/\b(?:Random Booster(?: Vol\.\s*\d+)?|Starter|Booster|Dual Pack|Multipack|Multi Pack|Deck Set|Battle Set|Set)\s+/g, '\n');
  const re = /([A-Z][a-z][A-Za-z'-]*(?: [A-Z][a-z][A-Za-z'-]*){1,3})(?: ([A-Z]{1,2}))? ?((?:\d|M)-\d{2})?([A-Z]{1,3}[a-z]?)(?![A-Za-z0-9-])/g;
  const out = [];
  for (const m of text.matchAll(re)) {
    const [, name, , ratchet, bit] = m;
    if (/^(Beyblade|Hasbro|Takara|Starter|Booster|Random|Dual|Pack|Set|Deck|Xtreme|Battle|Stadium|Launcher)\b/.test(name)) continue;
    out.push({ name, ratchet: ratchet ?? null, bit });
  }
  return out;
}

export function matchHasbro(db, candidates) {
  const byKey = new Map(db.blades.map((b) => [key(b.name), b]));
  const votes = new Map();
  const vote = (blade, name) => {
    const m = votes.get(blade.id) ?? new Map();
    m.set(name, (m.get(name) ?? 0) + 1);
    votes.set(blade.id, m);
  };
  const fallback = [];
  // Blades, die bei Hasbro unter demselben Namen laufen: kein Ersatzname per Ratchet+Bit.
  const locked = new Set();
  for (const c of candidates) {
    const direct = byKey.get(key(c.name));
    if (direct) {
      if (words(direct.name).join(' ') !== words(c.name).join(' ')) vote(direct, c.name);
      else locked.add(direct.id);
    } else fallback.push(c);
  }
  for (const c of fallback) {
    if (!c.bit) continue;
    const cw = new Set(words(c.name));
    const same = db.products.filter((p) => p.bladeId && p.bitId === c.bit && (p.ratchetId ?? null) === c.ratchet);
    const blades = [...new Set(same.map((p) => p.bladeId))]
      .map((id) => db.blades.find((b) => b.id === id))
      .filter((b) => b && words(b.name).some((w) => cw.has(w)));
    if (blades.length === 1 && !locked.has(blades[0].id) && !votes.has(blades[0].id)) vote(blades[0], c.name);
  }
  const result = {};
  for (const [id, m] of votes) {
    const ranked = [...m.entries()].sort((a, b) => b[1] - a[1]);
    // Unentschieden zwischen zwei Namen → lieber keinen Namen als einen falschen.
    if (ranked[1] && ranked[1][1] === ranked[0][1]) continue;
    result[id] = ranked[0][0];
  }
  // Ein Hasbro-Name gehört zu genau einer Blade.
  const count = new Map();
  for (const n of Object.values(result)) count.set(n, (count.get(n) ?? 0) + 1);
  for (const [id, n] of Object.entries(result)) if (count.get(n) > 1) delete result[id];
  return result;
}

export async function run({ fetchFn = fetch, dataDir = new URL('../public/data/', import.meta.url) } = {}) {
  const path = new URL('db.json', dataDir);
  const db = JSON.parse(readFileSync(path, 'utf8'));
  try {
    let wikitext = null;
    for (const t of LIST_TITLES) {
      const url = `${API}?${new URLSearchParams({ action: 'parse', page: t, prop: 'wikitext', redirects: '1', format: 'json', formatversion: '2' })}`;
      const res = await fetchFn(url, { headers: { 'User-Agent': 'beyblade-x-planer-hasbro/1.0 (GitHub Actions)' }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      wikitext = (await res.json())?.parse?.wikitext ?? null;
      if (wikitext) break;
    }
    if (!wikitext) throw new Error('Hasbro-Liste nicht gefunden');
    const names = matchHasbro(db, parseHasbroNames(wikitext));
    let changed = 0;
    for (const b of db.blades) {
      if (b.hasbroName && !b.hasbroNameAuto) continue; // von Hand gepflegt
      const n = names[b.id];
      if (n === b.hasbroName) continue;
      if (n) {
        b.hasbroName = n;
        b.hasbroNameAuto = true;
      } else {
        delete b.hasbroName;
        delete b.hasbroNameAuto;
      }
      changed++;
    }
    if (changed) writeFileSync(path, JSON.stringify(db, null, 2) + '\n');
    console.log(`Hasbro-Namen: ${changed} geändert (${Object.keys(names).length} erkannt).`);
    return { changed: changed > 0, names };
  } catch (err) {
    console.warn(`⚠️ Hasbro-Namen nicht aktualisiert: ${err.message}`);
    return { changed: false, names: {} };
  }
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) void run();
