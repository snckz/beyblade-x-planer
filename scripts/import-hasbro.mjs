// Hasbro-Katalog: liest „List of Beyblade X products (Hasbro)“ im Beyblade Wiki und ergänzt db.json um
// Hasbro-Packungen (Artikelnummern wie G1670, Dual Packs …) – auch Kreisel, die es nur bei Hasbro gibt.
// Links im Wiki sehen meist so aus: [[DranSword 3-60F|Sword Dran 3-60F]] → Ziel = Kreisel-Seite, Text = Hasbro-Name.
// Alles Importierte ist ungeprüft (verified: false, imported: true, region: 'hasbro'). Von Hand Gepflegtes bleibt.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { wikiUrl } from './update-data.mjs';
import { LINK_RE, MAX_PAGES, norm, parseBeyPage, parseBeyTitle, wikitextOf } from './import-catalog.mjs';
import { validateDb } from './validate-data.mjs';

export const LIST_TITLES = ['List of Beyblade X products (Hasbro)', 'List of Beyblade X Products (Hasbro)', 'Beyblade X (Hasbro)'];
// Hasbro-Artikelnummern: Buchstabe + 4 Ziffern (F9580, G1670 …)
const CODE_RE = /\b([A-Z]\d{4})\b/g;

const words = (s) =>
  String(s)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const wkey = (s) => words(s).sort().join(' ');

export function kindOfHasbro(text) {
  const t = String(text).toLowerCase();
  if (/random booster/.test(t)) return 'random-booster';
  if (/dual pack|multipack|multi-pack|battle set|deck set|\bset\b|pack of/.test(t)) return 'set';
  if (/starter/.test(t)) return 'starter';
  return 'booster';
}
const KIND_LABEL = { starter: 'Starter', booster: 'Booster', 'random-booster': 'Random Booster', set: 'Set' };

/** Hasbro-Anzeigename aus dem Link-Text: „Sword Dran 3-60F“ → „Sword Dran“. */
export function hasbroLabel(label) {
  const m = /^(.*?)\s+(?:[A-Z]{1,2})?(?:(?:\d|M)-\d{2})?[A-Z]{1,3}[a-z]?$/.exec(String(label).trim());
  const name = (m ? m[1] : String(label)).replace(/\s*\([^)]*\)\s*$/, '').trim();
  return /^[A-Z][A-Za-z'-]+(?: [A-Z][A-Za-z'-]+){1,3}$/.test(name) ? name : null;
}

/**
 * Wikitext der Reihe nach: Jede Artikelnummer gilt für die folgenden Kreisel-Links bis zur nächsten Nummer.
 * Je Link: Kreisel (aus dem Ziel) + Hasbro-Name (aus dem Linktext).
 */
export function parseHasbroList(wikitext) {
  const text = String(wikitext);
  const marks = [...text.matchAll(CODE_RE)].map((m) => ({ pos: m.index, code: m[1] }));
  const byCode = new Map();
  for (let i = 0; i < marks.length; i++) {
    const { code, pos } = marks[i];
    const end = i + 1 < marks.length ? marks[i + 1].pos : text.length;
    const seg = text.slice(pos, end);
    const entry = byCode.get(code) ?? { code, text: '', beys: [] };
    entry.text += ' ' + seg.replace(LINK_RE, ' ').slice(0, 300);
    for (const l of seg.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g)) {
      const target = l[1].trim();
      if (/^(file|image|category|template):/i.test(target)) continue;
      const bey = parseBeyTitle(target);
      if (!bey || entry.beys.some((b) => b.title === bey.title)) continue;
      entry.beys.push({ ...bey, page: target, hasbro: hasbroLabel(l[2] ?? '') });
    }
    byCode.set(code, entry);
  }
  return [...byCode.values()].filter((e) => e.beys.length);
}

export async function mergeHasbro(db, entries, fetchPage) {
  const out = structuredClone(db);
  const report = { added: { blades: [], ratchets: [], bits: [], products: [] }, names: [], skipped: [] };
  const byKey = new Map();
  const index = (b) => {
    for (const n of [b.id, b.name, b.hasbroName].filter(Boolean)) {
      byKey.set(norm(n), b);
      byKey.set(wkey(n), b); // Reihenfolge egal: „Sword Dran“ = „Dran Sword“
    }
  };
  out.blades.forEach(index);
  const findBlade = (bey) => byKey.get(norm(bey.bladeId)) ?? byKey.get(wkey(bey.blade)) ?? (bey.hasbro ? byKey.get(wkey(bey.hasbro)) : undefined);
  const ratchetIds = new Set(out.ratchets.map((r) => r.id));
  const bitIds = new Set(out.bits.map((b) => b.id));
  let fetched = 0;

  for (const entry of entries) {
    const kind = kindOfHasbro(entry.text);
    const multi = entry.beys.length > 1;
    let n = 0;
    for (const bey of entry.beys) {
      n++;
      const code = multi ? `${entry.code}-${String(n).padStart(2, '0')}` : entry.code;
      if (out.products.some((p) => p.code === code)) continue;
      let blade = findBlade(bey);
      let info = null;
      if (!blade || !bitIds.has(bey.bit)) {
        if (fetched >= MAX_PAGES) {
          report.skipped.push({ code, title: bey.title, reason: 'Seitenlimit erreicht' });
          continue;
        }
        fetched++;
        const wt = await fetchPage(bey.page);
        info = wt ? parseBeyPage(wt) : null;
        if (!info?.isBey) {
          report.skipped.push({ code, title: bey.title, reason: wt ? 'keine Kreisel-Seite' : 'Seite fehlt' });
          continue;
        }
      }
      if (!blade) {
        if (!info.type) {
          report.skipped.push({ code, title: bey.title, reason: 'Typ nicht erkennbar' });
          continue;
        }
        blade = {
          id: bey.bladeId,
          name: bey.blade.includes(' ') ? bey.blade : bey.blade.replace(/([a-z])([A-Z])/g, '$1 $2'),
          ...(bey.hasbro ? { hasbroName: bey.hasbro, hasbroNameAuto: true } : {}),
          line: 'BX',
          type: info.type,
          spin: info.spin,
          verified: false,
          imported: true,
          wikiTitle: bey.page,
          note: 'Aus der Hasbro-Produktliste übernommen.',
          ...(!bey.ratchet && !info.ratchetIntegratedBit ? { integratedRatchet: true } : {}),
        };
        out.blades.push(blade);
        index(blade);
        report.added.blades.push(blade.id);
      } else if (bey.hasbro && (!blade.hasbroName || blade.hasbroNameAuto) && wkey(bey.hasbro) !== wkey(blade.name) && blade.hasbroName !== bey.hasbro) {
        // Hasbro-Name aus dem Linktext ist verlässlicher als die Heuristik von update-hasbro
        blade.hasbroName = bey.hasbro;
        blade.hasbroNameAuto = true;
        index(blade);
        report.names.push(`${blade.name} → ${bey.hasbro}`);
      }
      if (bey.ratchet && !ratchetIds.has(bey.ratchet)) {
        const [c, h] = bey.ratchet.split('-');
        const contacts = /^\d$/.test(c) && c !== '0' ? Number(c) : null;
        out.ratchets.push({ id: bey.ratchet, contacts, heightMm: Number(h) / 10, imported: true });
        ratchetIds.add(bey.ratchet);
        report.added.ratchets.push(bey.ratchet);
      }
      if (!bitIds.has(bey.bit)) {
        out.bits.push({ id: bey.bit, name: info?.bitName ?? bey.bit, type: blade.type, uncertain: true, imported: true, note: `Aus dem Wiki übernommen (${bey.title}); Typ vom Kreisel abgeleitet.` });
        bitIds.add(bey.bit);
        report.added.bits.push(bey.bit);
      }
      const ratchetId = blade.integratedRatchet ? undefined : bey.ratchet;
      const label = `${bey.hasbro ?? blade.hasbroName ?? blade.name}${ratchetId || bey.bit ? ' ' + (ratchetId ?? '') + bey.bit : ''}`;
      out.products.push({
        code,
        name: `${KIND_LABEL[kind]} ${label}`,
        hasbroName: `${KIND_LABEL[kind]} ${label}`,
        kind,
        bladeId: blade.id,
        ...(ratchetId ? { ratchetId } : {}),
        bitId: bey.bit,
        ...(kind === 'starter' ? { includesLauncher: true } : {}),
        region: 'hasbro',
        priceJpy: null,
        verified: false,
        imported: true,
        source: wikiUrl(bey.page),
      });
      report.added.products.push(code);
    }
  }
  return { db: out, report, fetched };
}

export async function run({ fetchFn = fetch, dataDir = new URL('../public/data/', import.meta.url) } = {}) {
  const dbPath = new URL('db.json', dataDir);
  const db = JSON.parse(readFileSync(dbPath, 'utf8'));
  const report = { ok: false, listTitle: null, codes: 0 };
  try {
    let wikitext = null;
    for (const t of LIST_TITLES) {
      wikitext = await wikitextOf(fetchFn, t).catch(() => null);
      if (wikitext) {
        report.listTitle = t;
        break;
      }
    }
    if (!wikitext) throw new Error('Hasbro-Produktliste im Wiki nicht gefunden');
    const entries = parseHasbroList(wikitext);
    report.codes = entries.length;
    report.listLength = wikitext.length;
    // Zum Nachjustieren des Parsers: Ausschnitte der Seite
    report.sample = wikitext.slice(0, 2500);
    report.sampleMid = wikitext.slice(Math.floor(wikitext.length / 2), Math.floor(wikitext.length / 2) + 1500);
    report.firstEntries = entries.slice(0, 8).map((e) => ({ code: e.code, beys: e.beys.map((b) => `${b.title} | ${b.hasbro}`), text: e.text.slice(0, 120) }));
    const res = await mergeHasbro(db, entries, (title) => wikitextOf(fetchFn, title));
    const errors = validateDb(res.db);
    if (errors.length) throw new Error('Import ergäbe ungültige Daten: ' + errors.slice(0, 5).join('; '));
    Object.assign(report, { ok: true, fetched: res.fetched, ...res.report });
    const changed = JSON.stringify(res.db) !== JSON.stringify(db);
    if (changed) writeFileSync(dbPath, JSON.stringify(res.db, null, 2) + '\n');
    writeReport(dataDir, report);
    const a = res.report.added;
    console.log(`Hasbro: ${entries.length} Artikelnummern, neu: ${a.products.length} Produkte, ${a.blades.length} Blades, ${res.report.names.length} Namen, übersprungen: ${res.report.skipped.length}.`);
    return { changed, report };
  } catch (err) {
    report.error = err.message;
    console.warn(`⚠️ Hasbro-Import abgebrochen, db.json bleibt unverändert: ${err.message}`);
    writeReport(dataDir, report);
    return { changed: false, report };
  }
}

function writeReport(dataDir, report) {
  const path = new URL('hasbro-report.json', dataDir);
  const next = JSON.stringify(report, null, 2) + '\n';
  let prev = '';
  try {
    prev = readFileSync(path, 'utf8');
  } catch {
    /* noch kein Bericht */
  }
  if (prev !== next) writeFileSync(path, next);
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
