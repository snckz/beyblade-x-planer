// Hasbro-Katalog: liest „List of Beyblade X products (Hasbro)“ im Beyblade Wiki und ergänzt db.json um
// Hasbro-Packungen (Artikelnummern wie G1670, Dual Packs …) – auch Kreisel, die es nur bei Hasbro gibt.
// Links im Wiki sehen meist so aus: [[DranSword 3-60F|Sword Dran 3-60F]] → Ziel = Kreisel-Seite, Text = Hasbro-Name.
// Alles Importierte ist ungeprüft (verified: false, imported: true, region: 'hasbro'). Von Hand Gepflegtes bleibt.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { API, wikiUrl } from './update-data.mjs';
import { LINK_RE, MAX_PAGES, norm, parseBeyPage, parseBeyTitle } from './import-catalog.mjs';
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

const HASBRO_NOTE = 'Aus der Hasbro-Produktliste übernommen.';

/**
 * Kreisel-Titel wie im Hasbro-Teil des Wikis: „Sword Dran 3-60F“, „Arc Wizard R 4-55LO“ (CX mit Assist-Blade R),
 * „Glory Valkerion LF“. Gibt Blade-Name (ohne Assist), Assist, Ratchet und Bit zurück.
 */
export function parseHasbroTitle(raw) {
  let bey = parseBeyTitle(raw);
  if (!bey) {
    // Integrierter Ratchet ohne Zahl im Namen: „Glory Valkerion LF“, „Rocket Griffon H“
    const m = /^([A-Z][a-z']+(?: [A-Z][a-z']+){1,2}) ([A-Z]{1,3}[a-z]?)$/.exec(String(raw).replace(/\s*\([^)]*\)\s*$/, '').trim());
    if (!m || /stadium|launcher|pack|set|booster/i.test(m[1])) return null;
    bey = { title: m[0], blade: m[1], bladeId: m[1].replace(/[^A-Za-z0-9]/g, ''), assist: undefined, ratchet: undefined, bit: m[2] };
  }
  const parts = bey.blade.split(' ');
  // letztes Wort aus 1–2 Großbuchstaben = Assist-Blade (CX), gehört nicht zum Namen
  if (parts.length > 2 && /^[A-Z]{1,2}$/.test(parts[parts.length - 1])) {
    const assist = parts.pop();
    const blade = parts.join(' ');
    return { ...bey, blade, bladeId: blade.replace(/[^A-Za-z0-9]/g, ''), assist: bey.assist ?? assist };
  }
  return bey;
}

/** Kreisel direkt im Namen einer Produktseite: „Cobalt Dragoon 2-60C Deluxe … Launcher Set“ → Cobalt Dragoon 2-60C. */
export function beysInLinkName(link) {
  const out = [];
  for (const m of String(link).matchAll(/([A-Z][a-z']+(?: [A-Z][a-z']+){1,2}(?: [A-Z]{1,2})?) ((?:\d|M)-\d{2}[A-Z]{1,3}[a-z]?)\b/g)) {
    const bey = parseHasbroTitle(`${m[1]} ${m[2]}`);
    if (bey && !/^(Deluxe|Launcher|Set|Pack|Battle)\b/.test(bey.blade)) out.push({ ...bey, page: `${m[1]} ${m[2]}`, hasbro: bey.blade });
  }
  return out;
}

/** Kreisel-Namen ohne Teile in einem Produktnamen: „Gale Wyvern and Sword Dran Dual Pack“ → [Gale Wyvern, Sword Dran]. */
export function namesInLinkName(link) {
  return String(link)
    .replace(/\b(Deluxe|String|Left-Spin|Custom|Victory|Dual Pack|Multi ?Pack|Battle Set|Launcher|Starter Set|Deck Set|Set|Pack)\b.*$/i, '')
    .split(/\s+(?:and|&|\+)\s+/i)
    .map((s) => s.trim())
    .filter((s) => /^[A-Z][a-z']+(?: [A-Z][a-z']+){1,2}$/.test(s));
}

/** US-Preis aus der Zeile („[[File:Flag of United States.png|20px]] $9.99“). */
export function parseUsd(text) {
  const m = /United States[^\]]*\]\]\s*(?:US)?\$\s*(\d{1,3}(?:\.\d{2})?)/.exec(String(text));
  const n = m ? Number(m[1]) : NaN;
  return n > 0 && n < 500 ? n : null;
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
    const entry = byCode.get(code) ?? { code, text: '', beys: [], links: [], usd: null };
    // Abschnitt-Überschriften („! colspan=4 | … Dual Pack …“) gehören zum Text, damit die Art stimmt
    const before = text.slice(Math.max(0, pos - 400), pos);
    const heading = [...before.matchAll(/!\s*colspan[^|\n]*\|([^\n]+)/g)].pop()?.[1] ?? '';
    entry.text += ' ' + heading + ' ' + seg.replace(LINK_RE, (_, t) => ' ' + t + ' ').slice(0, 400);
    entry.usd ??= parseUsd(seg);
    for (const l of seg.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g)) {
      const target = l[1].trim();
      if (/^(file|image|category|template):/i.test(target)) continue;
      const bey = parseHasbroTitle(target);
      if (!bey) {
        if (!entry.links.includes(target)) entry.links.push(target);
        continue;
      }
      if (entry.beys.some((b) => b.title === bey.title)) continue;
      // Linktext ist der Hasbro-Name; ohne Linktext ist schon das Ziel Hasbro-benannt
      entry.beys.push({ ...bey, page: target, hasbro: hasbroLabel(l[2] ?? '') ?? bey.blade });
    }
    byCode.set(code, entry);
  }
  return [...byCode.values()].filter((e) => e.beys.length || e.links.length);
}

/**
 * fetchPage(title) → { title, wikitext } (title = Ziel nach Weiterleitung) oder null.
 * Der Import wird bei jedem Lauf neu aufgebaut: frühere Hasbro-Importe werden erst entfernt.
 */
export async function mergeHasbro(db, entries, fetchPage) {
  const out = structuredClone(db);
  const report = { added: { blades: [], ratchets: [], bits: [], products: [] }, names: [], skipped: [], unresolved: [] };
  // Neu aufbauen: importierte Hasbro-Produkte und nur dafür angelegte Blades entfernen
  out.products = out.products.filter((p) => !(p.region === 'hasbro' && p.imported));
  const used = new Set(out.products.map((p) => p.bladeId));
  out.blades = out.blades.filter((b) => b.note !== HASBRO_NOTE || used.has(b.id));
  const byKey = new Map();
  const index = (b) => {
    for (const n of [b.id, b.name, b.hasbroName].filter(Boolean)) {
      byKey.set(norm(n), b);
      byKey.set(wkey(n), b); // Reihenfolge egal: „Sword Dran“ = „Dran Sword“
    }
  };
  out.blades.forEach(index);
  // Schreibvarianten im Wiki für schon gepflegte Blades
  const ALIASES = { StormPegasis: 'StormPegasus' };
  const findBlade = (bey) =>
    (ALIASES[bey.bladeId] ? byKey.get(norm(ALIASES[bey.bladeId])) : undefined) ?? byKey.get(norm(bey.bladeId)) ?? byKey.get(wkey(bey.blade)) ?? (bey.hasbro ? byKey.get(wkey(bey.hasbro)) : undefined);
  const ratchetIds = new Set(out.ratchets.map((r) => r.id));
  const bitIds = new Set(out.bits.map((b) => b.id));
  let fetched = 0;

  const pages = new Map();
  const page = async (title) => {
    if (pages.has(title)) return pages.get(title);
    if (fetched >= MAX_PAGES) return undefined;
    fetched++;
    const r = await fetchPage(title).catch(() => null);
    pages.set(title, r);
    return r;
  };

  for (const entry of entries) {
    // Dual Packs/Sets: Inhalt steht auf der verlinkten Produktseite
    if (!entry.beys.length) {
      for (const l of entry.links.filter((x) => /pack|set|booster|collection|bundle/i.test(x)).slice(0, 2)) {
        entry.text += ' ' + l;
        // 1. Kreisel steht schon im Namen der Produktseite → direkt übernehmen (Seite listet oft auch fremde Kreisel)
        const direct = beysInLinkName(l);
        if (direct.length) {
          for (const b of direct) if (!entry.beys.some((x) => x.title === b.title)) entry.beys.push(b);
          continue;
        }
        // 2. Produktseite lesen. Mit Namen im Produktnamen (Dual Packs, „Cobalt Dragoon Deluxe …“): nur diese Kreisel.
        //    Ohne Namen („Xtreme Battle Set“): nur Kreisel aus der Einleitung – weiter unten stehen oft fremde.
        const names = namesInLinkName(l).map(wkey);
        const pg = await page(l);
        const wt = String(pg?.wikitext ?? '');
        // Produktseiten haben einen Abschnitt „==Contents==“ mit genau dem Packungsinhalt – der ist maßgeblich.
        const contents = /\n==\s*Contents\s*==([\s\S]*?)(?=\n==[^=]|$)/i.exec(wt)?.[1];
        const scope = contents ?? (names.length ? wt : wt.split(/\n==/)[0]);
        const found = [];
        for (const m of scope.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g)) {
          const bey = parseHasbroTitle(m[1].trim());
          if (bey) found.push({ ...bey, page: m[1].trim(), hasbro: hasbroLabel(m[2] ?? '') ?? bey.blade });
        }
        // Kreisel nur als Text erwähnt (Seite verlinkt sich nicht selbst): „includes Saber Samurai 2-70L“
        // Im Contents-Abschnitt reichen die Links (Teile wie „Blade - Circle Ghost“ sind keine ganzen Kreisel).
        const plain = contents ? '' : scope.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?|<[^>]+>|\{\{[^{}]*\}\}/g, ' ');
        found.push(...beysInLinkName(plain));
        for (const bey of found) {
          if (entry.beys.some((b) => b.bladeId === bey.bladeId || wkey(b.hasbro ?? '') === wkey(bey.hasbro ?? ''))) continue;
          if (names.length && !names.includes(wkey(bey.hasbro ?? '')) && !names.includes(wkey(bey.blade))) continue;
          entry.beys.push(bey);
        }
        if (!contents && !names.length && entry.beys.length > 4) entry.beys.length = 0; // unklar → lieber nichts als falsch
      }
      if (!entry.beys.length) {
        report.unresolved.push({ code: entry.code, links: entry.links.slice(0, 5) });
        continue;
      }
    }
    let kind = kindOfHasbro(entry.text);
    // Launcher-Sets gab es nacheinander mit verschiedenen Kreiseln: jede Variante ist ein eigener Kauf, kein Set.
    if (/launcher set/i.test(entry.text)) kind = 'starter';
    const multi = entry.beys.length > 1;
    let n = 0;
    for (const bey of entry.beys) {
      n++;
      const code = multi ? `${entry.code}-${String(n).padStart(2, '0')}` : entry.code;
      if (out.products.some((p) => p.code === code)) continue;
      let blade = findBlade(bey);
      let info = null;
      let real = bey; // Kreisel laut Zielseite (nach Weiterleitung, meist der Takara-Name)
      let realTitle = bey.page;
      if (!blade || !bitIds.has(bey.bit)) {
        const pg = await page(bey.page);
        if (pg === undefined) {
          report.skipped.push({ code, title: bey.title, reason: 'Seitenlimit erreicht' });
          continue;
        }
        info = pg?.wikitext ? parseBeyPage(pg.wikitext) : null;
        if (!info?.isBey) {
          report.skipped.push({ code, title: bey.title, reason: pg ? 'keine Kreisel-Seite' : 'Seite fehlt' });
          continue;
        }
        // „Steel Samurai 4-80T“ leitet auf die Takara-Seite weiter → dortigen Blade nehmen
        const target = pg.title ? parseHasbroTitle(pg.title) : null;
        if (target) {
          realTitle = pg.title;
          real = { ...bey, blade: target.blade, bladeId: target.bladeId };
          blade ??= byKey.get(norm(ALIASES[target.bladeId] ?? target.bladeId)) ?? byKey.get(wkey(target.blade));
        }
      }
      if (!blade) {
        if (!info.type) {
          report.skipped.push({ code, title: bey.title, reason: 'Typ nicht erkennbar' });
          continue;
        }
        const name = real.blade.includes(' ') ? real.blade : real.blade.replace(/([a-z])([A-Z])/g, '$1 $2');
        blade = {
          id: real.bladeId,
          name,
          ...(bey.hasbro && wkey(bey.hasbro) !== wkey(name) ? { hasbroName: bey.hasbro, hasbroNameAuto: true } : {}),
          line: bey.assist ? 'CX' : 'BX',
          type: info.type,
          spin: info.spin,
          verified: false,
          imported: true,
          wikiTitle: realTitle,
          note: HASBRO_NOTE,
          ...(!bey.ratchet && !info.ratchetIntegratedBit ? { integratedRatchet: true } : {}),
        };
        out.blades.push(blade);
        index(blade);
        report.added.blades.push(blade.id);
      } else if (bey.hasbro && (!blade.hasbroName || blade.hasbroNameAuto) && wkey(bey.hasbro) !== wkey(blade.name) && wkey(blade.hasbroName ?? '') !== wkey(bey.hasbro)) {
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
        ...(entry.usd ? { priceUsd: entry.usd } : {}),
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
    const fetchPage = async (title) => {
      const url = `${API}?${new URLSearchParams({ action: 'parse', page: title, prop: 'wikitext', redirects: '1', format: 'json', formatversion: '2' })}`;
      const res = await fetchFn(url, { headers: { 'User-Agent': 'beyblade-x-planer-hasbro/1.0 (GitHub Actions)' } });
      if (!res.ok) return null;
      const d = await res.json();
      return d?.parse?.wikitext ? { title: d.parse.title, wikitext: d.parse.wikitext } : null;
    };
    for (const t of LIST_TITLES) {
      wikitext = (await fetchPage(t).catch(() => null))?.wikitext ?? null;
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
    report.firstEntries = entries.slice(0, 8).map((e) => ({ code: e.code, beys: e.beys.map((b) => `${b.title} | ${b.hasbro}`), usd: e.usd }));
    report.linkOnly = entries.filter((e) => !e.beys.length).slice(0, 12).map((e) => ({ code: e.code, links: e.links.slice(0, 4), text: e.text.slice(0, 160) }));
    const res = await mergeHasbro(db, entries, fetchPage);
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
