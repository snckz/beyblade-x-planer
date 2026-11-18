// Hasbro-Katalog: liest „List of Beyblade X products (Hasbro)“ im Beyblade Wiki und ergänzt db.json um
// Hasbro-Packungen (Artikelnummern wie G1670, Dual Packs …) – auch Kreisel, die es nur bei Hasbro gibt.
// Links im Wiki sehen meist so aus: [[DranSword 3-60F|Sword Dran 3-60F]] → Ziel = Kreisel-Seite, Text = Hasbro-Name.
// Alles Importierte ist ungeprüft (verified: false, imported: true, region: 'hasbro'). Von Hand Gepflegtes bleibt.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { API, wikiUrl } from './update-data.mjs';
import { LINK_RE, MAX_PAGES, norm, parseBeyPage, parseBeyTitle } from './import-catalog.mjs';
import { validateDb, EMPTY_RETIRED, MISSING_PAGE_CODES, normalizeRetired } from './validate-data.mjs';
import { DataSafetyError, loadRetired, writeDbSafely, writeFileAtomic } from './data-safety.mjs';

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
/** „StormPegasis“ → „Storm Pegasis“ (Wiki-Titel schreiben Namen zusammen). */
export const spaced = (s) => (s && !s.includes(' ') ? s.replace(/([a-z])([A-Z])/g, '$1 $2') : s);

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
    if (bey && !/^(Deluxe|Launcher|Set|Pack|Battle)\b/.test(bey.blade)) out.push({ ...bey, page: `${m[1]} ${m[2]}`, hasbro: spaced(bey.blade) });
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
      entry.beys.push({ ...bey, page: target, hasbro: hasbroLabel(l[2] ?? '') ?? spaced(bey.blade) });
    }
    byCode.set(code, entry);
  }
  return [...byCode.values()].filter((e) => e.beys.length || e.links.length);
}

/**
 * Hasbro-Produkte aus der Wiki-Liste schrittweise ergänzen.
 * fetchPage(title) → { title, wikitext } (title = Ziel nach Weiterleitung) oder null (Seite gibt es nicht).
 * Abruffehler (Netz, HTTP 5xx/429 …) muss fetchPage werfen – sie brechen den Import ab und gelten NIE als „fehlt“.
 *
 * - Nichts wird entfernt oder neu aufgebaut. Bekannte Produkte und Teile bleiben, wie sie sind (inkl. Prüfstatus,
 *   Gewicht, Release-Datum); ergänzt wird nur Neues – bei bekannten Produkten höchstens ein neuer US-Preis.
 * - Wiedererkennung: Produktnummer; bei Packungen mit mehreren Kreiseln (Nummer-01, -02 …) über die Teile
 *   (Blade, Ratchet, Bit) – nicht über die Reihenfolge in der Liste. Neue Kreisel bekommen die nächste freie Nummer.
 * - Was die Quelle diesmal nicht liefert, bleibt erhalten (Bericht: `missingFromSource`).
 * - Gewollt entfernen/umbenennen nur über retired.json (`retired`).
 */
export async function mergeHasbro(db, entries, fetchPage, { retired = EMPTY_RETIRED, maxPages = MAX_PAGES } = {}) {
  const out = structuredClone(db);
  const stillgelegt = normalizeRetired(retired);
  const report = {
    added: { blades: [], ratchets: [], bits: [], products: [] },
    existing: 0,
    updated: [],
    conflicts: [],
    names: [],
    skipped: [],
    unresolved: [],
    missingFromSource: [],
  };
  const byKey = new Map();
  const index = (b) => {
    for (const n of [b.id, b.name, b.hasbroName].filter(Boolean)) {
      byKey.set(norm(n), b);
      byKey.set(wkey(n), b); // Reihenfolge egal: „Sword Dran“ = „Dran Sword“
    }
  };
  out.blades.forEach(index);
  // Schreibvarianten im Wiki für schon gepflegte Blades
  const ALIASES = { StormPegasis: 'StormPegasus' }; // alte ID beibehalten (gespeicherte Kombos), Name ist „Storm Pegasis“
  const findBlade = (bey) => {
    const renamed = stillgelegt.blades[bey.bladeId];
    if (typeof renamed === 'string') return byKey.get(norm(renamed));
    return (ALIASES[bey.bladeId] ? byKey.get(norm(ALIASES[bey.bladeId])) : undefined) ?? byKey.get(norm(bey.bladeId)) ?? byKey.get(wkey(bey.blade)) ?? (bey.hasbro ? byKey.get(wkey(bey.hasbro)) : undefined);
  };
  const ratchetIds = new Set(out.ratchets.map((r) => r.id));
  const bitIds = new Set(out.bits.map((b) => b.id));
  const byCode = new Map(out.products.map((p) => [p.code, p]));
  const seen = new Set();
  let fetched = 0;

  const pages = new Map();
  const page = async (title) => {
    if (pages.has(title)) return pages.get(title);
    if (fetched >= maxPages) return undefined;
    fetched++;
    // Kein .catch: Ein Abruffehler ist kein „Seite fehlt“ – er bricht den ganzen Import ab (Bestand bleibt).
    const r = await fetchPage(title);
    pages.set(title, r);
    return r;
  };

  /** Teile eines Kreisels, wie sie im Produkt stehen (integrierter Ratchet: ohne Ratchet) */
  const partsKey = (bladeId, ratchetId, bitId) => `${bladeId}|${ratchetId ?? ''}|${bitId}`;
  const partsOf = (blade, bey) => partsKey(blade.id, blade.integratedRatchet ? undefined : bey.ratchet, bey.bit);

  /** Hasbro-Name aus dem Linktext ist verlässlicher als die Heuristik von update-hasbro – nur automatische Namen */
  const maybeName = (blade, bey) => {
    if (bey.hasbro && (!blade.hasbroName || blade.hasbroNameAuto) && wkey(bey.hasbro) !== wkey(blade.name) && wkey(blade.hasbroName ?? '') !== wkey(bey.hasbro)) {
      blade.hasbroName = bey.hasbro;
      blade.hasbroNameAuto = true;
      index(blade);
      report.names.push(`${blade.name} → ${bey.hasbro}`);
    }
  };

  /** Bekanntes Produkt: unverändert lassen, nur ein neuer US-Preis wird übernommen (nie gelöscht). */
  const confirmExisting = (product, entry) => {
    seen.add(product.code);
    report.existing++;
    if (entry.usd && product.priceUsd !== entry.usd) {
      product.priceUsd = entry.usd;
      report.updated.push(`${product.code}: US-Preis ${entry.usd}`);
    }
  };

  for (const entry of entries) {
    // Schon bekannte Produkte dieser Artikelnummer (einzeln oder als -01, -02 …)
    const known = out.products.filter((p) => p.region === 'hasbro' && (p.code === entry.code || p.code.startsWith(`${entry.code}-`)));
    if (!entry.beys.length && known.length) {
      // Packung schon erfasst: Inhalt nicht erneut von der Produktseite holen. Stehen die Kreisel im Namen der
      // Produktseite (ohne Abruf lesbar) und sind es mehr als bekannt, fehlt einer → wie neu auflösen (Lücke nachholen).
      const direct = [];
      for (const l of entry.links.filter((x) => /pack|set|booster|collection|bundle/i.test(x)).slice(0, 2)) {
        for (const b of beysInLinkName(l)) if (!direct.some((x) => x.title === b.title)) direct.push(b);
      }
      if (direct.length <= known.length) {
        for (const p of known) confirmExisting(p, entry);
        continue;
      }
    }
    // Dual Packs/Sets: Inhalt steht auf der verlinkten Produktseite
    let limited = false;
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
        if (pg === undefined) {
          report.skipped.push({ code: entry.code, title: l, reason: 'Seitenlimit erreicht' });
          limited = true;
          continue;
        }
        const wt = String(pg?.wikitext ?? '');
        // Produktseiten haben einen Abschnitt „==Contents==“ mit genau dem Packungsinhalt – der ist maßgeblich.
        const contents = /\n==\s*Contents\s*==([\s\S]*?)(?=\n==[^=]|$)/i.exec(wt)?.[1];
        const scope = contents ?? (names.length ? wt : wt.split(/\n==/)[0]);
        const found = [];
        for (const m of scope.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g)) {
          const bey = parseHasbroTitle(m[1].trim());
          if (bey) found.push({ ...bey, page: m[1].trim(), hasbro: hasbroLabel(m[2] ?? '') ?? spaced(bey.blade) });
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
        if (!limited) report.unresolved.push({ code: entry.code, links: entry.links.slice(0, 5) });
        continue;
      }
    }
    let kind = kindOfHasbro(entry.text);
    // Launcher-Sets gab es nacheinander mit verschiedenen Kreiseln: jede Variante ist ein eigener Kauf, kein Set.
    if (/launcher set/i.test(entry.text)) kind = 'starter';
    const multi = entry.beys.length > 1 || known.some((p) => p.code !== entry.code);
    const claimed = new Set();
    // Stillgelegte Plätze dieser Packung zählen mit: Ihre Nummer wird nie neu vergeben
    const retiredSlots = Object.keys(stillgelegt.products).filter((c) => c.startsWith(`${entry.code}-`));
    let nextNo = Math.max(0, ...[...known.map((p) => p.code), ...retiredSlots].map((c) => Number(/-(\d{2})$/.exec(c)?.[1] ?? 0))) + 1;
    /** Bekanntes Produkt dieses Eintrags mit genau diesen Teilen */
    const match = (key) => known.find((p) => !claimed.has(p.code) && partsKey(p.bladeId, p.ratchetId, p.bitId) === key);

    for (const bey of entry.beys) {
      let blade = findBlade(bey);
      let existing = blade ? match(partsOf(blade, bey)) : undefined;
      // Einzelner Kreisel unter derselben Nummer, aber andere Teile laut Quelle: Bestand behalten, Abweichung melden
      if (!existing && !multi && byCode.has(entry.code) && blade) {
        existing = byCode.get(entry.code);
        const p = existing;
        report.conflicts.push({ code: p.code, db: partsKey(p.bladeId, p.ratchetId, p.bitId), quelle: partsOf(blade, bey) });
      }
      if (existing) {
        claimed.add(existing.code);
        maybeName(blade, bey);
        confirmExisting(existing, entry);
        continue;
      }
      let info = null;
      let real = bey; // Kreisel laut Zielseite (nach Weiterleitung, meist der Takara-Name)
      let realTitle = bey.page;
      if (!blade || !bitIds.has(bey.bit)) {
        const pg = await page(bey.page);
        if (pg === undefined) {
          report.skipped.push({ code: entry.code, title: bey.title, reason: 'Seitenlimit erreicht' });
          continue;
        }
        info = pg?.wikitext ? parseBeyPage(pg.wikitext) : null;
        if (!info?.isBey) {
          report.skipped.push({ code: entry.code, title: bey.title, reason: pg ? 'keine Kreisel-Seite' : 'Seite fehlt' });
          continue;
        }
        // „Steel Samurai 4-80T“ leitet auf die Takara-Seite weiter → dortigen Blade nehmen
        const target = pg.title ? parseHasbroTitle(pg.title) : null;
        if (target) {
          realTitle = pg.title;
          real = { ...bey, blade: target.blade, bladeId: target.bladeId };
          blade ??= byKey.get(norm(ALIASES[target.bladeId] ?? target.bladeId)) ?? byKey.get(wkey(target.blade));
        }
        // Erst nach der Weiterleitung erkannt: doch ein bekanntes Produkt
        const late = blade ? match(partsOf(blade, bey)) : undefined;
        if (late) {
          claimed.add(late.code);
          maybeName(blade, bey);
          confirmExisting(late, entry);
          continue;
        }
      }
      // Einzelprodukt, dessen Nummer schon belegt ist (Kreisel erst jetzt oder gar nicht wiedererkannt):
      // nie ein zweites Produkt unter derselben Nummer – Bestand behalten, Abweichung melden
      if (!multi && byCode.has(entry.code)) {
        const p = byCode.get(entry.code);
        report.conflicts.push({ code: p.code, db: partsKey(p.bladeId, p.ratchetId, p.bitId), quelle: blade ? partsOf(blade, bey) : `${real.bladeId} (unbekannt)|${bey.ratchet ?? ''}|${bey.bit}` });
        claimed.add(p.code);
        confirmExisting(p, entry);
        continue;
      }
      // Packung mit stillgelegten Plätzen: Ein nicht wiedererkannter Kreisel könnte genau der stillgelegte sein –
      // nicht automatisch wieder anlegen, sondern melden
      if (multi && retiredSlots.length) {
        report.skipped.push({ code: entry.code, title: bey.title, reason: 'Packung hat stillgelegte Einträge (retired.json) – bitte prüfen' });
        continue;
      }
      // Neues Produkt: nächste freie Nummer (bei Einzelprodukten die Artikelnummer selbst)
      let code = multi ? `${entry.code}-${String(nextNo).padStart(2, '0')}` : entry.code;
      while (multi && byCode.has(code)) code = `${entry.code}-${String(++nextNo).padStart(2, '0')}`;
      if (Object.hasOwn(stillgelegt.products, code)) continue; // bewusst entfernt bzw. umbenannt
      if (!blade && stillgelegt.blades[real.bladeId] === null) {
        report.skipped.push({ code, title: bey.title, reason: 'Blade stillgelegt (retired.json)' });
        continue;
      }
      if (!blade) {
        if (!info?.type) {
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
      } else maybeName(blade, bey);
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
      const product = {
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
      };
      out.products.push(product);
      byCode.set(code, product);
      claimed.add(code);
      seen.add(code);
      if (multi) nextNo++;
      report.added.products.push(code);
    }
  }
  // Bekannte Hasbro-Produkte, die die Quelle diesmal nicht liefert: bleiben – nur zur Information im Bericht
  report.missingFromSource = out.products.filter((p) => p.region === 'hasbro' && p.imported && !seen.has(p.code)).map((p) => p.code);
  return { db: out, report, fetched };
}

/** Weniger als dieser Anteil der zuletzt gelesenen Artikelnummern: Liste unvollständig oder Format geändert → Fehler */
export const MIN_LIST_SHARE = 0.6;

/**
 * Ergebnis eines Laufs (auch im Bericht `status`):
 * - `ok`: Quelle vollständig gelesen, alles verarbeitet.
 * - `partial`: gelesen, aber einzelne neue Produkte konnten nicht übernommen werden (Bericht `skipped`) – Warnung.
 * - `error`: Quelle unerreichbar, fehlerhaft oder unvollständig – nichts wird geschrieben, der Workflow schlägt fehl.
 */
export async function run({ fetchFn = fetch, dataDir = new URL('../public/data/', import.meta.url) } = {}) {
  const dbPath = new URL('db.json', dataDir);
  const db = JSON.parse(readFileSync(dbPath, 'utf8'));
  const report = { status: 'error', ok: false, listTitle: null, codes: 0 };
  let previousCodes = 0;
  try {
    // Vergleichswert nur aus erfolgreichen Läufen (ein Fehlerbericht darf die Schranke nicht aufweichen)
    const prev = JSON.parse(readFileSync(new URL('hasbro-report.json', dataDir), 'utf8'));
    const usable = prev.status ? prev.status === 'ok' || prev.status === 'partial' : prev.ok === true;
    previousCodes = usable ? Number(prev.codes) || 0 : Number(prev.baselineCodes) || 0;
  } catch {
    /* noch kein Bericht */
  }
  try {
    let wikitext = null;
    const fetchPage = async (title) => {
      const url = `${API}?${new URLSearchParams({ action: 'parse', page: title, prop: 'wikitext', redirects: '1', format: 'json', formatversion: '2' })}`;
      const res = await fetchFn(url, { headers: { 'User-Agent': 'beyblade-x-planer-hasbro/1.0 (GitHub Actions)' } });
      // HTTP-Fehler (503, 429 …) sind Abruffehler, keine fehlende Seite → werfen.
      if (!res.ok) throw new Error(`HTTP ${res.status} für „${title}“`);
      const d = await res.json();
      if (d?.error && !MISSING_PAGE_CODES.has(d.error.code)) throw new Error(`Wiki-Fehler ${d.error.code} für „${title}“`);
      return d?.parse?.wikitext ? { title: d.parse.title, wikitext: d.parse.wikitext } : null;
    };
    // Liste: die Titel der Reihe nach; ein Abruffehler bricht ab (kein Ausweichen auf „nicht gefunden“)
    for (const t of LIST_TITLES) {
      wikitext = (await fetchPage(t))?.wikitext ?? null;
      if (wikitext) {
        report.listTitle = t;
        break;
      }
    }
    if (!wikitext) throw new Error('Hasbro-Produktliste im Wiki nicht gefunden');
    const entries = parseHasbroList(wikitext);
    report.listLength = wikitext.length;
    // Leere oder stark geschrumpfte Liste: Quelle kaputt oder Format geändert – nicht als „nichts Neues“ werten
    if (!entries.length || (previousCodes && entries.length < previousCodes * MIN_LIST_SHARE)) {
      throw new Error(`Hasbro-Liste unvollständig: ${entries.length} Artikelnummern gelesen, zuletzt ${previousCodes}`);
    }
    report.codes = entries.length;
    // Zum Nachjustieren des Parsers: Ausschnitte der Seite
    report.sample = wikitext.slice(0, 2500);
    report.sampleMid = wikitext.slice(Math.floor(wikitext.length / 2), Math.floor(wikitext.length / 2) + 1500);
    report.firstEntries = entries.slice(0, 8).map((e) => ({ code: e.code, beys: e.beys.map((b) => `${b.title} | ${b.hasbro}`), usd: e.usd }));
    report.linkOnly = entries.filter((e) => !e.beys.length).slice(0, 12).map((e) => ({ code: e.code, links: e.links.slice(0, 4), text: e.text.slice(0, 160) }));
    const res = await mergeHasbro(db, entries, fetchPage, { retired: loadRetired(dataDir) });
    const errors = validateDb(res.db);
    if (errors.length) throw new Error('Import ergäbe ungültige Daten: ' + errors.slice(0, 5).join('; '));
    const status = res.report.skipped.length ? 'partial' : 'ok';
    Object.assign(report, { status, ok: status === 'ok', fetched: res.fetched, ...res.report });
    report.summary = summaryLine(res.report);
    // Übergangsprüfung + atomares Schreiben (wirft DataSafetyError bei verdächtigen Änderungen)
    const changed = writeDbSafely(dataDir, db, res.db);
    writeReport(dataDir, report);
    console.log(`Hasbro (${status}): ${report.summary}`);
    return { changed, status, report };
  } catch (err) {
    report.status = 'error';
    report.ok = false;
    report.error = err.message;
    report.baselineCodes = previousCodes; // Vergleichswert für den nächsten Lauf bleibt erhalten
    writeReport(dataDir, report);
    console.error(`❌ Hasbro-Import abgebrochen, db.json bleibt unverändert: ${err.message}`);
    // Verdächtige Änderung: weiterreichen (das Skript scheitert, nichts wird committet)
    if (err instanceof DataSafetyError) throw err;
    return { changed: false, status: 'error', report };
  }
}

/** Kurzfassung für Log, Bericht und Workflow-Zusammenfassung */
export function summaryLine(r) {
  const a = r.added;
  const parts = [
    `${a.products.length} neue Produkte`,
    `${a.blades.length} neue Blades`,
    `${a.ratchets.length} neue Ratchets`,
    `${a.bits.length} neue Bits`,
    `${r.existing} vorhandene wiedererkannt`,
  ];
  if (r.updated.length) parts.push(`${r.updated.length} ergänzt`);
  if (r.skipped.length) parts.push(`${r.skipped.length} nicht übernommen`);
  if (r.conflicts.length) parts.push(`${r.conflicts.length} Abweichungen`);
  if (r.missingFromSource.length) parts.push(`${r.missingFromSource.length} nicht in der Quelle (behalten)`);
  if (r.unresolved.length) parts.push(`${r.unresolved.length} Nummern ohne erkennbaren Kreisel`);
  return parts.join(', ');
}

/** Workflow: Zusammenfassung und Anmerkungen (Warnung/Fehler) – nur in GitHub Actions */
function annotate(result) {
  const r = result.report;
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [`### Hasbro-Import: ${result.status === 'ok' ? '✅ ok' : result.status === 'partial' ? '⚠️ teilweise' : '❌ Fehler'}`, '', r.error ?? r.summary ?? ''];
    if (r.skipped?.length) lines.push('', 'Nicht übernommen:', ...r.skipped.slice(0, 20).map((x) => `- ${x.code} ${x.title}: ${x.reason}`));
    if (r.conflicts?.length) lines.push('', 'Abweichungen (Bestand behalten):', ...r.conflicts.slice(0, 20).map((x) => `- ${x.code}: ${x.db} → Quelle ${x.quelle}`));
    try {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n', { flag: 'a' });
    } catch {
      /* ohne Zusammenfassung weiter */
    }
  }
  if (process.env.GITHUB_ACTIONS) {
    if (result.status === 'error') console.log(`::error title=Hasbro-Import fehlgeschlagen::${r.error}`);
    if (result.status === 'partial') console.log(`::warning title=Hasbro-Import unvollständig::${r.skipped.length} neue Produkte nicht übernommen – siehe hasbro-report.json`);
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
  if (prev !== next) writeFileAtomic(path, next);
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run()
    .then((result) => {
      annotate(result);
      // Quelle unerreichbar oder fehlerhaft: echter Fehlerstatus, der Workflow schlägt fehl (nichts wird committet)
      if (result.status === 'error') process.exit(1);
    })
    .catch((err) => {
      console.error(err.message ?? err);
      if (process.env.GITHUB_ACTIONS) console.log(`::error title=Hasbro-Import abgelehnt (Datenverlust-Schutz)::${String(err.message ?? err).split('\n')[0]}`);
      process.exit(1);
    });
}
