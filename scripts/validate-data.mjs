// Prüft public/data/db.json und news.json auf Konsistenz.
// Wird lokal (npm run validate-data) und im Auto-Update-Workflow ausgeführt.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

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
// Bestehendes bleibt – Löschen, Umbenennen und Umbelegen nur ausdrücklich über public/data/retired.json.

const PART_KINDS = [
  ['blades', 'id', 'Blade'],
  ['ratchets', 'id', 'Ratchet'],
  ['bits', 'id', 'Bit'],
  ['products', 'code', 'Produkt'],
];

/** Leere, gültige Liste stillgelegter Einträge (Form von retired.json). */
export const EMPTY_RETIRED = Object.freeze({ blades: {}, ratchets: {}, bits: {}, products: {}, reassigned: {} });

/** retired.json in die volle Form bringen (fehlende Abschnitte = leer). */
export function normalizeRetired(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return { blades: obj(r.blades), ratchets: obj(r.ratchets), bits: obj(r.bits), products: obj(r.products), reassigned: obj(r.reassigned) };
}

/**
 * retired.json prüfen:
 * - `blades|ratchets|bits|products`: { alteId: neueId | null } – null = bewusst entfernt, sonst umbenannt nach neueId.
 * - `reassigned`: { produktnummer: "Grund" } – Produktnummer darf ausnahmsweise andere Teile bekommen (Korrektur).
 * Stillgelegte IDs dürfen nicht mehr in db.json stehen; Umleitungen müssen auf vorhandene Einträge zeigen.
 */
export function validateRetired(retired, db) {
  const errors = [];
  const r = normalizeRetired(retired);
  for (const [kind, key, label] of PART_KINDS) {
    const ids = new Set((db[kind] ?? []).map((x) => x[key]));
    for (const [old, target] of Object.entries(r[kind])) {
      if (target !== null && typeof target !== 'string') errors.push(`retired.json ${label} ${old}: Ziel muss eine ID oder null sein`);
      if (ids.has(old)) errors.push(`retired.json: ${label} ${old} ist stillgelegt, steht aber noch in db.json`);
      if (typeof target === 'string' && !ids.has(target)) errors.push(`retired.json: ${label} ${old} → ${target}, aber ${target} gibt es nicht`);
    }
  }
  for (const [code, why] of Object.entries(r.reassigned)) {
    if (typeof why !== 'string' || !why.trim()) errors.push(`retired.json reassigned ${code}: Grund fehlt`);
  }
  return errors;
}

/**
 * Vergleicht den bisherigen mit dem neuen Datenstand. Gibt Fehler zurück, wenn
 * - ein Blade, Ratchet, Bit oder Produkt verschwindet, ohne in retired.json zu stehen,
 * - eine bestehende Produktnummer andere Teile (Blade/Ratchet/Bit) bekommt, ohne in `reassigned` zu stehen.
 * Neue Einträge und geänderte Zusatzangaben (Namen, Preise, Prüfstatus …) sind erlaubt.
 */
export function validateTransition(prev, next, retired = EMPTY_RETIRED) {
  const errors = [];
  const r = normalizeRetired(retired);
  for (const [kind, key, label] of PART_KINDS) {
    const nextIds = new Set((next[kind] ?? []).map((x) => x[key]));
    const missing = (prev[kind] ?? []).map((x) => x[key]).filter((id) => !nextIds.has(id) && !(id in r[kind]));
    if (missing.length) {
      errors.push(`${missing.length} ${label}${missing.length === 1 ? '' : 'e'} würde${missing.length === 1 ? '' : 'n'} verschwinden: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ' …' : ''}`);
    }
  }
  const nextProducts = new Map((next.products ?? []).map((p) => [p.code, p]));
  const parts = (p) => `${p.bladeId ?? '–'} | ${p.ratchetId ?? '–'} | ${p.bitId ?? '–'}`;
  for (const old of prev.products ?? []) {
    const now = nextProducts.get(old.code);
    if (!now || old.code in r.reassigned) continue;
    if (parts(now) !== parts(old)) errors.push(`Produkt ${old.code} bekäme andere Teile: ${parts(old)} → ${parts(now)}`);
  }
  return errors;
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const read = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
  const db = read('db.json');
  let retired = EMPTY_RETIRED;
  try {
    retired = normalizeRetired(read('retired.json'));
  } catch {
    /* keine retired.json: nichts stillgelegt */
  }
  const errors = [
    ...validateDb(db),
    ...validateRetired(retired, db),
    ...validateNews(read('news.json')),
    ...validateEvents(read('events.json'), new Set(db.blades.map((b) => b.id))),
    ...validateImages(read('images.json')),
    ...validateMeta(read('meta.json'), db),
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
  console.log('✅ Daten sind konsistent.');
}
