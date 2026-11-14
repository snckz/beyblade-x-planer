// Katalog-Import: liest die Produktliste im Beyblade Wiki („List of Beyblade X products (Takara Tomy)“),
// erkennt je Produktnummer die enthaltenen Kreisel (Seitentitel wie „DranSword 3-60F“ oder „PerseusDark B6-80W“),
// holt zu jedem neuen Kreisel Typ, Drehrichtung und Bit-Namen von seiner Wiki-Seite und ergänzt db.json.
// Alles Importierte ist „ungeprüft“ (verified: false, imported: true). Von Hand gepflegte Einträge bleiben unangetastet.
// Läuft im Neuheiten-Radar-Workflow. Bei Netzwerkfehlern bleibt db.json unverändert.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { API, wikiUrl } from './update-data.mjs';
import { validateDb } from './validate-data.mjs';

export const LIST_TITLES = ['List of Beyblade X products (Takara Tomy)', 'List of Beyblade X Products (Takara Tomy)'];
const CODE_RE = /\b(BX|UX|CX)-(\d{2,3})\b/g;
const LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const MAX_PAGES = 320;

/** Schreibweisen im Wiki, die zu bereits gepflegten Blades gehören. */
const BLADE_ALIASES = { StormPegasis: 'StormPegasus' };

export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Zerlegt einen Kreisel-Seitentitel. Gibt null zurück, wenn der Titel kein Kreisel ist.
 * „DranSword 3-60F“ → Blade DranSword, Ratchet 3-60, Bit F
 * „PerseusDark B6-80W“ → Assist Blade B, Ratchet 6-80, Bit W (Custom Line)
 * „BulletGriffon H“ → kein Ratchet (integriert), Bit H
 */
export function parseBeyTitle(rawTitle) {
  const title = String(rawTitle).replace(/\s*\([^)]*\)\s*$/, '').trim();
  const m = /^([A-Z][A-Za-z0-9'-]*(?: [A-Z][A-Za-z0-9'-]*){0,2}) ([A-Z]{0,2}?)((?:\d|[A-Z])-\d{2})?([A-Z]{1,3}[a-z]?)$/.exec(title);
  if (!m) return null;
  const [, blade, assist, ratchet, bit] = m;
  // Ohne Ratchet nur CamelCase-Namen (z. B. BulletGriffon) akzeptieren, sonst passen „Beyblade X“ & Co.
  const camel = /^[A-Z][a-z0-9']+(?:[A-Z][a-z0-9']+)+$/.test(blade);
  if (!ratchet && !camel) return null;
  if (assist && !ratchet) return null;
  return { title, blade, bladeId: blade.replace(/[^A-Za-z0-9]/g, ''), assist: assist || undefined, ratchet: ratchet || undefined, bit };
}

export function kindOf(text) {
  const t = String(text).toLowerCase();
  if (/random booster/.test(t)) return 'random-booster';
  if (/starter/.test(t)) return 'starter';
  if (/deck set|set\b/.test(t)) return 'set';
  return 'booster';
}

const KIND_LABEL = { starter: 'Starter', booster: 'Booster', 'random-booster': 'Random Booster', set: 'Set' };

/** Lesbarer Produktname: „Starter Valkyrie Volt S4-70V“ statt „ValkyrieVolt S4-70V“. */
export function productName(kind, bey, blade) {
  const rest = bey.title.slice(bey.blade.length).trim();
  return `${KIND_LABEL[kind] ?? 'Booster'} ${blade.name}${rest ? ' ' + rest : ''}`;
}

/**
 * Geht den Wikitext der Liste der Reihe nach durch: Jede Produktnummer gilt für die folgenden
 * Kreisel-Links bis zur nächsten Nummer. Funktioniert für Tabellen und Aufzählungen.
 */
export function parseList(wikitext) {
  const text = String(wikitext);
  const marks = [];
  for (const m of text.matchAll(CODE_RE)) marks.push({ pos: m.index, code: `${m[1]}-${m[2]}` });
  const byCode = new Map();
  for (let i = 0; i < marks.length; i++) {
    const { code, pos } = marks[i];
    const end = i + 1 < marks.length ? marks[i + 1].pos : text.length;
    const seg = text.slice(pos, end);
    const entry = byCode.get(code) ?? { code, text: '', beys: [], links: [] };
    entry.text += ' ' + seg.replace(LINK_RE, ' ').slice(0, 300);
    for (const l of seg.matchAll(LINK_RE)) {
      const target = l[1].trim();
      if (/^(file|image|category|template):/i.test(target)) continue;
      const bey = parseBeyTitle(target);
      if (bey) {
        if (!entry.beys.some((b) => b.title === bey.title)) entry.beys.push({ ...bey, page: target });
      } else if (!entry.links.includes(target)) entry.links.push(target);
    }
    byCode.set(code, entry);
  }
  return [...byCode.values()].filter((e) => e.beys.length || e.links.length);
}

/** Alle Kreisel-Links einer Seite (z. B. Random-Booster- oder Set-Seite). */
export function beysOnPage(wikitext) {
  const beys = [];
  for (const l of String(wikitext).matchAll(LINK_RE)) {
    const target = l[1].trim();
    if (/^(file|image|category|template):/i.test(target)) continue;
    const bey = parseBeyTitle(target);
    if (bey && !beys.some((b) => b.title === bey.title)) beys.push({ ...bey, page: target });
  }
  return beys;
}

/** Nicht-Kreisel-Seiten, die sich als Produktseite eignen (Booster, Sets) – keine Teile- oder Themenseiten. */
const PRODUCT_LINK = /random booster|booster|deck set|set\b|select|starter/i;
const NOT_PRODUCT = /^(blade|bit|ratchet|lock chip|main blade|assist blade) - |^(takara tomy|hasbro|beyblade x|xtreme|launcher|stadium)/i;

/** Japanischer Verkaufspreis (UVP Takara Tomy) aus dem Seitentext, z. B. „for 2,321円“ oder „¥1,320“. */
export function parsePriceJpy(wikitext) {
  const text = String(wikitext).replace(/<[^>]+>/g, ' ');
  const m = /([\d][\d,.]{2,6})\s*(?:円|yen\b|JPY\b)/i.exec(text) ?? /(?:¥|￥)\s*([\d][\d,.]{2,6})/.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(/[,.]/g, ''));
  return n >= 300 && n <= 30000 ? n : null;
}

/** Liest Typ, Drehrichtung und Teile-Namen aus dem Wikitext einer Kreisel-Seite. */
export function parseBeyPage(wikitext) {
  const text = String(wikitext);
  // Einleitung: Text vor der ersten Überschrift, ohne Infobox-Vorlagen.
  const intro = text.split(/\n==/)[0].replace(/\{\{[\s\S]*?\}\}/g, ' ');
  const typeM = /\b(Attack|Defense|Defence|Stamina|Balance)[ -]Type\b/i.exec(intro) ?? /\b(Attack|Defense|Defence|Stamina|Balance)[ -]Type\b/i.exec(text);
  const type = typeM ? typeM[1].toLowerCase().replace('defence', 'defense') : undefined;
  const spin = /\bleft[- ]spin/i.test(intro) ? 'left' : /\b(dual|both)[- ]spin/i.test(intro) ? 'both' : 'right';
  const bitName = /\bBit - ([A-Z][^\]|}#\n=]*?)\s*(?:\]\]|\||\}\}|=|\n|$)/.exec(text)?.[1]?.trim();
  const isBey = !!typeM || /\b(Blade|Bit|Ratchet) - /.test(text);
  return { type, spin, bitName, isBey, ratchetIntegratedBit: /ratchet integrated bit/i.test(text) };
}

async function api(fetchFn, params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  const res = await fetchFn(url, { headers: { 'User-Agent': 'beyblade-x-planer-catalog/1.0 (GitHub Actions)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function wikitextOf(fetchFn, title) {
  const d = await api(fetchFn, { action: 'parse', page: title, prop: 'wikitext', redirects: '1' });
  return d?.parse?.wikitext ?? null;
}

/** Ergänzt db um die Einträge der Liste. Reine Funktion (bis auf fetchPage) – gut testbar. */
export async function mergeCatalog(db, entries, fetchPage) {
  const out = structuredClone(db);
  const report = { added: { blades: [], ratchets: [], bits: [], products: [] }, skipped: [] };
  const bladeByNorm = new Map();
  for (const b of out.blades) {
    bladeByNorm.set(norm(b.id), b);
    bladeByNorm.set(norm(b.name), b);
    if (b.hasbroName) bladeByNorm.set(norm(b.hasbroName), b);
  }
  const ratchetIds = new Set(out.ratchets.map((r) => r.id));
  const bitIds = new Set(out.bits.map((b) => b.id));
  const baseCodes = new Set(out.products.map((p) => /^([A-Z]{2,3}-\d{2,3})/.exec(p.code)?.[1]).filter(Boolean));
  const combos = new Set(out.products.map((p) => `${p.bladeId}|${p.ratchetId ?? ''}|${p.bitId}`));
  const lookAt = (b) => {
    const alias = BLADE_ALIASES[b.bladeId];
    return bladeByNorm.get(norm(alias ?? b.bladeId));
  };
  let fetched = 0;

  report.unresolved = [];
  for (const entry of entries) {
    if (baseCodes.has(entry.code)) continue; // von Hand gepflegt
    if (!entry.beys.length) {
      // Random Booster / Sets: Inhalt steht auf der verlinkten Produktseite.
      const subPages = entry.links.filter((l) => PRODUCT_LINK.test(l) && !NOT_PRODUCT.test(l)).slice(0, 2);
      for (const pg of subPages) {
        if (fetched >= MAX_PAGES) break;
        fetched++;
        const wt = await fetchPage(pg);
        if (wt) entry.beys.push(...beysOnPage(wt).filter((b) => !entry.beys.some((x) => x.title === b.title)));
        entry.text += ' ' + pg;
      }
      if (!entry.beys.length) {
        report.unresolved.push({ code: entry.code, links: entry.links.slice(0, 6) });
        continue;
      }
    }
    const kind = kindOf(entry.text);
    const multi = entry.beys.length > 1;
    let n = 0;
    for (const bey of entry.beys) {
      n++;
      const code = multi ? `${entry.code}-${String(n).padStart(2, '0')}` : entry.code;
      let blade = lookAt(bey);
      let info = null;
      const needsInfo = !blade || !bitIds.has(bey.bit);
      if (needsInfo) {
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
          line: entry.code.slice(0, 2),
          type: info.type,
          spin: info.spin,
          verified: false,
          imported: true,
          wikiTitle: bey.page,
          ...(!bey.ratchet && !info.ratchetIntegratedBit ? { integratedRatchet: true } : {}),
          ...(bey.assist ? { note: `CX: Assist Blade (${bey.assist}).` } : {}),
        };
        out.blades.push(blade);
        bladeByNorm.set(norm(blade.id), blade);
        report.added.blades.push(blade.id);
      }
      if (bey.ratchet && !ratchetIds.has(bey.ratchet)) {
        const [c, h] = bey.ratchet.split('-');
        const contacts = /^\d$/.test(c) && c !== '0' ? Number(c) : null;
        out.ratchets.push({ id: bey.ratchet, contacts, heightMm: Number(h) / 10, imported: true, ...(contacts === null ? { note: 'Sonderform ohne klassische Zacken.' } : {}) });
        ratchetIds.add(bey.ratchet);
        report.added.ratchets.push(bey.ratchet);
      }
      if (!bitIds.has(bey.bit)) {
        const name = info?.bitName ?? bey.bit;
        out.bits.push({
          id: bey.bit,
          name,
          type: blade.type,
          uncertain: true,
          imported: true,
          ...(info?.bitName ? { wikiTitle: `Bit - ${info.bitName}` } : {}),
          note: `Aus dem Wiki übernommen (${bey.title}); Typ vom Kreisel abgeleitet.`,
        });
        bitIds.add(bey.bit);
        report.added.bits.push(bey.bit);
      }
      const ratchetId = blade.integratedRatchet ? undefined : bey.ratchet;
      const combo = `${blade.id}|${ratchetId ?? ''}|${bey.bit}`;
      if (/-00$/.test(entry.code) && combos.has(combo)) continue; // Sonderedition einer schon erfassten Kombo
      const product = {
        code,
        name: productName(kind, bey, blade),
        kind,
        bladeId: blade.id,
        ...(ratchetId ? { ratchetId } : {}),
        bitId: bey.bit,
        ...(kind === 'starter' ? { includesLauncher: true } : {}),
        verified: false,
        imported: true,
        source: wikiUrl(bey.page),
      };
      if (out.products.some((p) => p.code === code)) continue;
      out.products.push(product);
      combos.add(combo);
      report.added.products.push(code);
    }
  }
  // Importierte Bits, deren Name noch unbekannt ist: über einen Kreisel mit diesem Bit nachschlagen.
  for (const bit of out.bits) {
    if (!bit.imported || bit.name !== bit.id || fetched >= MAX_PAGES) continue;
    const p = out.products.find((x) => x.bitId === bit.id && x.source);
    const title = p ? decodeURIComponent(p.source.split('/wiki/')[1] ?? '').replace(/_/g, ' ') : '';
    if (!title) continue;
    fetched++;
    const name = parseBeyPage((await fetchPage(title)) ?? '').bitName;
    if (name) {
      bit.name = name;
      bit.wikiTitle = `Bit - ${name}`;
      report.added.bits.push(`${bit.id} (Name: ${name})`);
    }
  }
  // Japan-Preise: jede Kreisel-Seite einmal ansehen.
  // null = Seite fehlt oder kein Preis (wird nicht erneut versucht); Netzwerkfehler → undefined (nächster Lauf).
  // Sets: Die Kreisel-Seite nennt den Einzelpreis, nicht den Set-Preis – daher bewusst kein Preis.
  report.prices = 0;
  const pageCache = new Map();
  for (const p of out.products) {
    if (p.priceJpy !== undefined || !p.bladeId || fetched >= MAX_PAGES) continue;
    if (p.kind === 'set') {
      p.priceJpy = null;
      continue;
    }
    const blade = out.blades.find((b) => b.id === p.bladeId);
    let fromSource = null;
    try {
      fromSource = p.source?.includes('/wiki/') ? decodeURIComponent(p.source.split('/wiki/')[1]).replace(/_/g, ' ') : null;
    } catch {
      /* kaputte URL – Titel raten */
    }
    const title = fromSource ?? (blade ? `${blade.id} ${p.ratchetId ?? ''}${p.bitId ?? ''}`.trim() : null);
    if (!title) continue;
    if (!pageCache.has(title)) {
      fetched++;
      pageCache.set(title, await fetchPage(title).catch(() => undefined));
    }
    const wt = pageCache.get(title);
    if (wt === undefined) continue; // Netzwerkfehler: später erneut
    p.priceJpy = wt ? parsePriceJpy(wt) : null;
    if (p.priceJpy) report.prices++;
  }
  return { db: out, report, fetched };
}

export async function run({ fetchFn = fetch, dataDir = new URL('../public/data/', import.meta.url), now = new Date().toISOString() } = {}) {
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
    if (!wikitext) throw new Error('Produktliste im Wiki nicht gefunden');
    const entries = parseList(wikitext);
    report.codes = entries.length;
    report.listLength = wikitext.length;
    if (!entries.length) report.sample = wikitext.slice(0, 1500);
    const res = await mergeCatalog(db, entries, (title) => wikitextOf(fetchFn, title));
    const errors = validateDb(res.db);
    if (errors.length) throw new Error('Import ergäbe ungültige Daten: ' + errors.slice(0, 5).join('; '));
    Object.assign(report, { ok: true, fetched: res.fetched, ...res.report });
    const changed = Object.values(res.report.added).some((a) => a.length) || JSON.stringify(res.db.products) !== JSON.stringify(db.products);
    if (changed) {
      res.db.updatedAt = now.slice(0, 10);
      writeFileSync(dbPath, JSON.stringify(res.db, null, 2) + '\n');
    }
    writeReport(dataDir, report);
    const a = res.report.added;
    console.log(`Katalog: ${entries.length} Nummern gelesen, neu: ${a.products.length} Produkte, ${a.blades.length} Blades, ${a.bits.length} Bits, ${a.ratchets.length} Ratchets, ${res.report.prices} Preise, übersprungen: ${res.report.skipped.length}.`);
    return { changed, report };
  } catch (err) {
    report.error = err.message;
    console.warn(`⚠️ Katalog-Import abgebrochen, db.json bleibt unverändert: ${err.message}`);
    writeReport(dataDir, report);
    return { changed: false, report };
  }
}

/** Bericht nur schreiben, wenn er sich ändert – sonst gäbe es jeden Tag einen leeren Commit. */
function writeReport(dataDir, report) {
  const path = new URL('catalog-report.json', dataDir);
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
