// Prüft public/data/db.json und news.json auf Konsistenz.
// Wird lokal (npm run validate-data) und im Auto-Update-Workflow ausgeführt.
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { buildReleaseIndex } from '../src/lib/release.js';
import { normalizeRegister, validateRegister } from '../src/lib/idRegister.js';

const TYPES = new Set(['attack', 'defense', 'stamina', 'balance']);
const SPINS = new Set(['right', 'left', 'both']);
const LINES = new Set(['BX', 'UX', 'CX']);
const KINDS = new Set(['starter', 'booster', 'random-booster', 'set', 'stadium', 'launcher', 'other']);

export function validateDb(db) {
  const errors = [];
  const uniq = (list, key, label) => {
    const seen = new Set();
    for (const item of list) {
      if (seen.has(item[key])) errors.push(`${label} doppelt: ${item[key]}`);
      seen.add(item[key]);
    }
    return seen;
  };
  if (!Array.isArray(db.blades) || !Array.isArray(db.ratchets) || !Array.isArray(db.bits) || !Array.isArray(db.products)) {
    return ['db.json: blades/ratchets/bits/products müssen Arrays sein'];
  }
  const bladeIds = uniq(db.blades, 'id', 'Blade');
  const ratchetIds = uniq(db.ratchets, 'id', 'Ratchet');
  const bitIds = uniq(db.bits, 'id', 'Bit');
  uniq(db.products, 'code', 'Produkt');

  for (const b of db.blades) {
    if (!b.name) errors.push(`Blade ${b.id}: Name fehlt`);
    if (!LINES.has(b.line)) errors.push(`Blade ${b.id}: ungültige Linie ${b.line}`);
    if (!TYPES.has(b.type)) errors.push(`Blade ${b.id}: ungültiger Typ ${b.type}`);
    if (!SPINS.has(b.spin)) errors.push(`Blade ${b.id}: ungültige Drehrichtung ${b.spin}`);
  }
  for (const r of db.ratchets) {
    if (!/^\d-\d{2}$|^[A-Z]-\d{2}$/.test(r.id)) errors.push(`Ratchet ${r.id}: ungültiges Format`);
  }
  for (const t of db.bits) {
    if (!TYPES.has(t.type)) errors.push(`Bit ${t.id}: ungültiger Typ ${t.type}`);
  }
  const integrated = new Set(db.blades.filter((b) => b.integratedRatchet).map((b) => b.id));
  for (const p of db.products) {
    if (!KINDS.has(p.kind)) errors.push(`Produkt ${p.code}: ungültige Art ${p.kind}`);
    if (p.bladeId && !bladeIds.has(p.bladeId)) errors.push(`Produkt ${p.code}: Blade ${p.bladeId} unbekannt`);
    if (p.ratchetId && !ratchetIds.has(p.ratchetId)) errors.push(`Produkt ${p.code}: Ratchet ${p.ratchetId} unbekannt`);
    if (p.bitId && !bitIds.has(p.bitId)) errors.push(`Produkt ${p.code}: Bit ${p.bitId} unbekannt`);
    if (p.bladeId && integrated.has(p.bladeId) && p.ratchetId) errors.push(`Produkt ${p.code}: Blade hat integrierten Ratchet, aber Ratchet angegeben`);
    if (p.released !== undefined && typeof p.released !== 'boolean') errors.push(`Produkt ${p.code}: released muss true/false sein`);
    if (p.releaseJp !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(p.releaseJp)) errors.push(`Produkt ${p.code}: releaseJp muss YYYY-MM-DD sein`);
  }
  return errors;
}

export function validateNews(news) {
  const errors = [];
  if (!news || !Array.isArray(news.items)) return ['news.json: items muss ein Array sein'];
  const ids = new Set();
  for (const n of news.items) {
    if (!n.id || !n.title || !n.url) errors.push(`News-Eintrag unvollständig: ${JSON.stringify(n)}`);
    if (n.url && !/^https:\/\//.test(n.url)) errors.push(`News ${n.id}: URL muss https sein`);
    if (ids.has(n.id)) errors.push(`News doppelt: ${n.id}`);
    ids.add(n.id);
  }
  return errors;
}

const KINDS_EVENT = new Set(['release', 'tournament', 'event']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Persönliche Anrede in Texten, die jeder Nutzer der App sieht („Du bist dann in Bangkok“).
 * Termine werden automatisch gepflegt – die Texte müssen für alle gelten, nicht für eine bestimmte Person.
 */
const PERSONAL = /(?<![\p{L}\p{N}])(du|dir|dich|dein(?:e[mnrs]?)?|ihr|euch|euer|eure[mnrs]?)(?![\p{L}\p{N}])/iu;

export function validateEvents(feed, bladeIds = new Set()) {
  const errors = [];
  if (!feed || !Array.isArray(feed.events)) return ['events.json: events muss ein Array sein'];
  const ids = new Set();
  for (const e of feed.events) {
    if (!e.id || !e.title) errors.push(`Termin unvollständig: ${JSON.stringify(e)}`);
    if (ids.has(e.id)) errors.push(`Termin doppelt: ${e.id}`);
    ids.add(e.id);
    if (!KINDS_EVENT.has(e.kind)) errors.push(`Termin ${e.id}: ungültige Art ${e.kind}`);
    if (!DATE.test(e.date ?? '') || Number.isNaN(Date.parse(e.date))) errors.push(`Termin ${e.id}: ungültiges Datum ${e.date}`);
    if (e.endDate && (!DATE.test(e.endDate) || e.endDate < e.date)) errors.push(`Termin ${e.id}: ungültiges Enddatum`);
    if (e.url && !/^https:\/\//.test(e.url)) errors.push(`Termin ${e.id}: URL muss https sein`);
    if (e.bladeId && bladeIds.size && !bladeIds.has(e.bladeId)) errors.push(`Termin ${e.id}: Blade ${e.bladeId} unbekannt`);
    if (typeof e.confirmed !== 'boolean') errors.push(`Termin ${e.id}: confirmed fehlt`);
    for (const field of ['title', 'place', 'note']) {
      const hit = typeof e[field] === 'string' ? PERSONAL.exec(e[field]) : null;
      if (hit) errors.push(`Termin ${e.id}: ${field} spricht jemanden persönlich an („${hit[0]}“) – neutral formulieren, die App nutzen mehrere Personen`);
    }
  }
  return errors;
}

/** Prüfziffer von EAN-8/EAN-13/UPC-A (wie src/lib/barcode.ts). */
export function validGtin(code) {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(String(code))) return false;
  const digits = String(code).split('').map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Mitgelieferte Barcodes (barcodes.json): gültige Prüfziffer, Herkunft angegeben, und die Nummer muss genau einen Kauf
 * in db.json bezeichnen – ein Produkt oder ein Set (Packungsnummer ohne Unternummer). Nichts Mehrdeutiges:
 * Ein falsch zugeordneter Barcode legt beim Scannen das falsche Produkt in die Sammlung.
 */
export function validateBarcodes(feed, db) {
  if (!feed || typeof feed.barcodes !== 'object' || !feed.barcodes || Array.isArray(feed.barcodes)) return ['barcodes.json: barcodes fehlt'];
  const errors = [];
  const sources = feed.sources && typeof feed.sources === 'object' ? feed.sources : {};
  // Random Booster haben zufälligen Inhalt: Ihr Barcode sagt nicht, welcher Kreisel drin ist.
  const codes = new Set(db.products.filter((p) => p.kind !== 'random-booster').map((p) => p.code));
  const setPacks = new Set(db.products.filter((p) => p.kind === 'set').map((p) => /^([A-Z]+-?\d+)-\d{2}$/.exec(p.code)?.[1]).filter(Boolean));
  const normal = new Set();
  for (const [gtin, entry] of Object.entries(feed.barcodes)) {
    if (!validGtin(gtin)) errors.push(`Barcode ${gtin}: ungültig (Länge oder Prüfziffer)`);
    const key = gtin.length === 12 ? `0${gtin}` : gtin;
    if (normal.has(key)) errors.push(`Barcode ${gtin}: doppelt (als UPC und EAN)`);
    normal.add(key);
    const pack = entry?.product;
    if (typeof pack !== 'string' || !(codes.has(pack) || setPacks.has(pack))) errors.push(`Barcode ${gtin}: Produkt ${pack} gibt es nicht (oder es ist kein einzelner Kauf)`);
    if (typeof entry?.source !== 'string' || !sources[entry.source]) errors.push(`Barcode ${gtin}: Quelle fehlt`);
  }
  return errors;
}

/** Meta-Liste: alle Teile müssen in der Datenbank stehen, Quellen sind Pflicht. */
export function validateMeta(meta, db) {
  const errors = [];
  if (!meta || !Array.isArray(meta.combos) || !Array.isArray(meta.decks)) return ['meta.json: combos/decks fehlen'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.updatedAt ?? '')) errors.push('meta.json: updatedAt fehlt');
  if (!meta.sources?.length || meta.sources.some((s) => !/^https:\/\//.test(s.url))) errors.push('meta.json: Quellen fehlen');
  const blades = new Map(db.blades.map((b) => [b.id, b]));
  const ratchets = new Set(db.ratchets.map((r) => r.id));
  const bits = new Set(db.bits.map((b) => b.id));
  const check = (where, bladeId, ratchetId, bitId) => {
    const b = blades.get(bladeId);
    if (!b) errors.push(`${where}: Blade ${bladeId} unbekannt`);
    if (ratchetId && !ratchets.has(ratchetId)) errors.push(`${where}: Ratchet ${ratchetId} unbekannt`);
    if (!ratchetId && b && !b.integratedRatchet) errors.push(`${where}: ${bladeId} braucht einen Ratchet`);
    if (!bits.has(bitId)) errors.push(`${where}: Bit ${bitId} unbekannt`);
  };
  meta.combos.forEach((c, i) => check(`meta.combos[${i}]`, c.bladeId, c.ratchetId, c.bitId));
  meta.decks.forEach((d, i) => d.combos.length !== 3 && errors.push(`meta.decks[${i}]: genau 3 Kombos erwartet`));
  meta.decks.forEach((d, i) => d.combos.forEach(([bl, r, bi], j) => check(`meta.decks[${i}][${j}]`, bl, r, bi)));
  return errors;
}

export function validateImages(index) {
  const errors = [];
  if (!index || typeof index.blades !== 'object') return ['images.json: blades fehlt'];
  for (const [id, img] of [...Object.entries(index.blades), ...Object.entries(index.bits ?? {}), ...Object.entries(index.ratchets ?? {})]) {
    if (!/^https:\/\/static\.wikia\.nocookie\.net\//.test(img.thumb ?? '')) errors.push(`Bild ${id}: unerlaubte Bild-Adresse`);
    if (!/^https:\/\/beyblade\.fandom\.com\/wiki\//.test(img.page ?? '')) errors.push(`Bild ${id}: Wiki-Link fehlt`);
  }
  return errors;
}

// ---- Übergangsprüfung: kein unbeabsichtigter Datenverlust bei automatischen Updates -----------------------------------
// Gespeicherte Kombos (Blade-/Ratchet-/Bit-IDs), Sammlungen und Wunschlisten (Produktnummern) verweisen auf db.json.
// Verschwindet eine ID oder bekommt eine Produktnummer andere Teile, gehen Nutzerdaten still kaputt. Deshalb gilt:
// Bestehendes bleibt – Löschen, Umbenennen und Umbelegen nur ausdrücklich über das ID-Register public/data/aliases.json.

const PART_KINDS = [
  ['blades', 'id', 'Blade'],
  ['ratchets', 'id', 'Ratchet'],
  ['bits', 'id', 'Bit'],
  ['products', 'code', 'Produkt'],
];

/**
 * MediaWiki-Fehlercodes, die „diese Seite gibt es nicht (bzw. kann es nicht geben)“ bedeuten – keine Abruffehler.
 * Alles andere (ratelimited, readonly, internal_api_error …) bricht einen Import ab.
 */
export const MISSING_PAGE_CODES = new Set(['missingtitle', 'invalidtitle', 'pagecannotexist', 'nosuchpageid']);

/**
 * Sicht der Übergangsprüfung auf das zentrale ID-Register (public/data/aliases.json, src/lib/idRegister.js):
 * stillgelegte bzw. umbenannte IDs je Art (`retired`) plus `reassigned`. Nimmt die volle Register-Form
 * ({ aliases, retired, reassigned }) wie die alte flache Form von retired.json.
 */
export function normalizeRetired(raw) {
  const r = normalizeRegister(raw);
  return { ...r.retired, reassigned: r.reassigned };
}

/** Leere Sicht (nichts stillgelegt, nichts umbelegt). */
export const EMPTY_RETIRED = Object.freeze(normalizeRetired({}));

/** Register gegen db.json prüfen (Ziele, Kreise, Konflikte, Gründe) – siehe validateRegister in src/lib/idRegister.js. */
export function validateRetired(register, db) {
  return validateRegister(register, db);
}

/**
 * Vergleicht den bisherigen mit dem neuen Datenstand. Gibt Fehler zurück, wenn
 * - ein Blade, Ratchet, Bit oder Produkt verschwindet, ohne in aliases.json unter `retired` zu stehen,
 * - eine bestehende Produktnummer andere Teile (Blade/Ratchet/Bit) bekommt, ohne in `reassigned` zu stehen.
 * Neue Einträge und geänderte Zusatzangaben (Namen, Preise, Prüfstatus …) sind erlaubt.
 */
export function validateTransition(prev, next, retired = EMPTY_RETIRED) {
  const errors = [];
  const r = normalizeRetired(retired);
  for (const [kind, key, label] of PART_KINDS) {
    const nextIds = new Set((next[kind] ?? []).map((x) => x[key]));
    const missing = (prev[kind] ?? []).map((x) => x[key]).filter((id) => !nextIds.has(id) && !Object.hasOwn(r[kind], id));
    if (missing.length) {
      errors.push(`${missing.length} ${label}${missing.length === 1 ? '' : 'e'} würde${missing.length === 1 ? '' : 'n'} verschwinden: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ' …' : ''}`);
    }
  }
  const nextProducts = new Map((next.products ?? []).map((p) => [p.code, p]));
  const parts = (p) => `${p.bladeId ?? '–'} | ${p.ratchetId ?? '–'} | ${p.bitId ?? '–'}`;
  // Umbenennungen aus dem Register gelten auch hier: Blade A → B macht aus „A | 3-60 | F“ erlaubt „B | 3-60 | F“.
  const renamed = (kind, id) => (id !== undefined && typeof r[kind][id] === 'string' ? r[kind][id] : id);
  const expected = (p) => ({ bladeId: renamed('blades', p.bladeId), ratchetId: renamed('ratchets', p.ratchetId), bitId: renamed('bits', p.bitId) });
  for (const old of prev.products ?? []) {
    const now = nextProducts.get(old.code);
    if (!now || Object.hasOwn(r.reassigned, old.code)) continue;
    if (parts(now) !== parts(expected(old))) errors.push(`Produkt ${old.code} bekäme andere Teile: ${parts(old)} → ${parts(now)}`);
    // Freigabestatus (src/lib/release.js): Bestätigungen gehen bei automatischen Updates nie verloren
    if (old.verified === true && now.verified !== true) errors.push(`Produkt ${old.code}: Bestätigung (verified) würde zurückgesetzt`);
    if (old.released === true && now.released !== true) errors.push(`Produkt ${old.code}: Release-Bestätigung (released) würde zurückgesetzt`);
  }
  const nextBlades = new Map((next.blades ?? []).map((b) => [b.id, b]));
  for (const old of prev.blades ?? []) {
    // Über das ID-Register umbenannt/zusammengeführt: Status gehört zum Ziel, kein Rücksetzen
    const now = renamed('blades', old.id) === old.id ? nextBlades.get(old.id) : undefined;
    if (now && old.verified === true && now.verified !== true) errors.push(`Blade ${old.id}: Bestätigung (verified) würde zurückgesetzt`);
  }
  const nextBits = new Map((next.bits ?? []).map((b) => [b.id, b]));
  for (const old of prev.bits ?? []) {
    const now = renamed('bits', old.id) === old.id ? nextBits.get(old.id) : undefined;
    if (now && !old.uncertain && now.uncertain) errors.push(`Bit ${old.id}: geprüfter Typ würde wieder „unsicher“`);
  }
  return errors;
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const read = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
  const db = read('db.json');
  // ID-Register: fehlt die Datei, ist nichts eingetragen. Kaputtes JSON ist ein Fehler (wie in data-safety.mjs).
  let retired = normalizeRegister({});
  if (existsSync(new URL('../public/data/aliases.json', import.meta.url))) retired = normalizeRegister(read('aliases.json'));
  const errors = [
    ...validateDb(db),
    ...validateRetired(retired, db),
    ...validateNews(read('news.json')),
    ...validateEvents(read('events.json'), new Set(db.blades.map((b) => b.id))),
    ...validateImages(read('images.json')),
    ...validateMeta(read('meta.json'), db),
    // Fehlt barcodes.json: keine mitgelieferten Barcodes (die App lernt sie dann nur beim Zuordnen).
    ...(existsSync(new URL('../public/data/barcodes.json', import.meta.url)) ? validateBarcodes(read('barcodes.json'), db) : []),
  ];
  // --previous <datei>: zusätzlich gegen den vorigen Stand prüfen (im Workflow: db.json aus dem letzten Commit)
  const i = process.argv.indexOf('--previous');
  if (i > 0 && process.argv[i + 1]) {
    const prev = JSON.parse(readFileSync(process.argv[i + 1], 'utf8'));
    errors.push(...validateTransition(prev, db, retired).map((e) => `Datenverlust-Schutz: ${e}`));
  }
  if (errors.length) {
    console.error(`❌ ${errors.length} Fehler:\n- ` + errors.join('\n- '));
    process.exit(1);
  }
  // Freigabestatus: Übersicht und Widersprüche (Hinweis, kein Abbruch – gesperrt bleibt im Zweifel gesperrt)
  const rel = buildReleaseIndex(db, undefined, read('meta.json'));
  const c = rel.counts();
  console.log(`Freigabe: Blades ${c.blades.confirmed}/${db.blades.length}, Ratchets ${c.ratchets.confirmed}/${db.ratchets.length}, Bits ${c.bits.confirmed}/${db.bits.length} im Kombo-Planer wählbar.`);
  for (const w of rel.conflicts) console.warn(`::warning::Freigabestatus widersprüchlich: ${w}`);
  console.log('✅ Daten sind konsistent.');
}
