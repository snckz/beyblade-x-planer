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

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const read = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
  const errors = [...validateDb(read('db.json')), ...validateNews(read('news.json'))];
  if (errors.length) {
    console.error(`❌ ${errors.length} Fehler:\n- ` + errors.join('\n- '));
    process.exit(1);
  }
  console.log('✅ Daten sind konsistent.');
}
