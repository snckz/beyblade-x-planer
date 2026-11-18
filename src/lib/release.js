// Zentraler Freigabestatus – gemeinsam für App und Datenpipeline (wie idRegister.js).
//
// Begriffe (bestehende Felder werden NICHT umgedeutet):
// - Produkt.verified: Daten des Produkts geprüft. Bei automatisch importierten Produkten (imported) setzt
//   verify-catalog es erst, wenn das Wiki den Release meldet – dort ist es also ein Release-Beleg. Bei von Hand
//   gepflegten Produkten bedeutet es nur „Daten geprüft“ und kann vor dem Release gesetzt sein (z. B. UX-22).
// - Produkt.releaseJp: Japan-Release laut Wiki. Ein Datum in der Zukunft sperrt immer; ein vergangenes Datum gibt
//   NIE allein frei.
// - Produkt.released: ausdrückliche Bestätigung „ist erschienen“ (verify-catalog nach Wiki-Meldung oder von Hand).
// - Blade.verified / Bit.uncertain: Teiledaten geprüft (Typ, Drehrichtung). Ratchets haben kein Prüffeld.
//
// Produkt erschienen:
//   1. releaseJp in der Zukunft            → nein (angekündigt; widerspricht released/verified → Hinweis)
//   2. released === true                   → ja
//   3. importiert und verified             → ja (verify-catalog hat den Release im Wiki gesehen)
//   4. releaseJp bekannt, sonst nichts     → nein (Datum allein reicht nicht)
//   5. verified, kein Datum                → ja (Bestand: von Hand gepflegte, längst erschienene Produkte)
//   6. sonst                               → nein
// Teil (Blade/Ratchet/Bit) erschienen: in mindestens einem erschienenen Produkt enthalten. Ein neues Produkt sperrt
// also nie ein Teil, das schon in einem anderen erschienenen Produkt steckt.
// Zusätzlicher Beleg für Teile: in Turnier-Siegerdecks gespielt (meta.json, scripts/update-meta.mjs). Wer ein Teil
// im Turnier einsetzt, hat es nachweislich – typisch für Hasbro-Packungen ohne Release-Datum im Wiki (z. B. Suppress
// Superion vor dem Japan-Release). Die Teiledaten müssen trotzdem geprüft sein.
// Teil ohne jedes Produkt: von Hand gepflegt → wie bisher frei (Inhalte von Sets mit mehreren Teilen sind im
// Datenmodell noch nicht einzeln erfasst); automatisch importiert → angekündigt (kein Beleg).
// Status: 'announced' (angekündigt) | 'unchecked' (erschienen, Daten ungeprüft) | 'confirmed' (im Kombo-Planer wählbar).

export const STATUS_LABEL = { announced: 'Angekündigt', unchecked: 'Erschienen, ungeprüft', confirmed: 'Freigegeben' };

/** Heutiges Datum als YYYY-MM-DD (lokal) */
export function isoDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ist das Produkt erschienen? Liefert auch den Grund (für Steckbrief, Bericht und Tests). */
export function productRelease(p, today = isoDay()) {
  if (p.releaseJp && p.releaseJp > today) {
    const confirmed = p.released === true || (p.imported && p.verified);
    return { released: false, reason: `erscheint am ${p.releaseJp}`, date: p.releaseJp, conflict: confirmed ? 'als erschienen bestätigt, aber Release-Datum in der Zukunft (verschoben?)' : null };
  }
  if (p.released === true) return { released: true, reason: 'Release bestätigt', date: p.releaseJp ?? null, conflict: null };
  if (p.imported && p.verified) return { released: true, reason: 'Release laut Wiki-Prüfung', date: p.releaseJp ?? null, conflict: null };
  if (p.releaseJp) return { released: false, reason: `Release ${p.releaseJp} noch nicht bestätigt`, date: p.releaseJp, conflict: null };
  if (p.verified) return { released: true, reason: 'geprüftes Produkt', date: null, conflict: null };
  return { released: false, reason: 'Release nicht bestätigt', date: null, conflict: null };
}

const KEY = { blades: 'bladeId', ratchets: 'ratchetId', bits: 'bitId' };

/**
 * Freigabestatus aller Teile und Produkte einer Datenbank.
 * `part(kind, id)` → { status, reason, date } ; `selectable(kind, id)` → nur 'confirmed' ist im Kombo-Planer wählbar.
 */
/** Teile aus den Turnier-Siegerdecks (meta.counts „Blade|Ratchet|Bit“, meta.decks, meta.combos) */
export function playedParts(meta) {
  const out = { blades: new Set(), ratchets: new Set(), bits: new Set() };
  const add = (b, r, t) => {
    if (b) out.blades.add(b);
    if (r) out.ratchets.add(r);
    if (t) out.bits.add(t);
  };
  for (const key of Object.keys(meta?.counts ?? {})) {
    const [b, r, t] = key.split('|');
    add(b, r, t);
  }
  for (const d of meta?.decks ?? []) for (const c of d.combos ?? []) add(c[0], c[1], c[2]);
  for (const c of meta?.combos ?? []) add(c.bladeId, c.ratchetId, c.bitId);
  return out;
}

export function buildReleaseIndex(db, today = isoDay(), meta = null) {
  const played = playedParts(meta);
  const products = new Map();
  const conflicts = [];
  for (const p of db.products ?? []) {
    const r = productRelease(p, today);
    products.set(p.code, r);
    if (r.conflict) conflicts.push(`Produkt ${p.code}: ${r.conflict}`);
  }
  const parts = { blades: new Map(), ratchets: new Map(), bits: new Map() };
  for (const kind of Object.keys(KEY)) {
    const containing = new Map();
    for (const p of db.products ?? []) {
      const id = p[KEY[kind]];
      if (!id) continue;
      if (!containing.has(id)) containing.set(id, []);
      containing.get(id).push(p);
    }
    for (const part of db[kind] ?? []) {
      const list = containing.get(part.id) ?? [];
      let released;
      let date = null;
      let reason;
      if (!list.length) {
        released = !part.imported;
        reason = released ? 'von Hand gepflegt' : 'in keinem Produkt enthalten';
      } else {
        const rel = list.find((p) => products.get(p.code).released);
        released = !!rel || played[kind].has(part.id);
        if (rel) reason = `erschienen in ${rel.code}`;
        else if (released) reason = 'in Turnier-Siegerdecks gespielt';
        else {
          // frühestes bekanntes Datum der Produkte, die es enthalten
          date = list.map((p) => products.get(p.code).date).filter(Boolean).sort()[0] ?? null;
          reason = date && date > today ? `erscheint am ${date}` : 'Release nicht bestätigt';
        }
      }
      const dataOk = kind === 'blades' ? part.verified === true : kind === 'bits' ? !part.uncertain : true;
      const status = !released ? 'announced' : dataOk ? 'confirmed' : 'unchecked';
      if (status === 'unchecked') reason = `${reason}, Daten noch nicht geprüft`;
      parts[kind].set(part.id, { status, reason, date });
    }
  }
  const part = (kind, id) => parts[kind].get(id) ?? { status: 'announced', reason: 'unbekanntes Teil', date: null };
  return {
    today,
    conflicts,
    product: (code) => products.get(code) ?? { released: false, reason: 'unbekanntes Produkt', date: null, conflict: null },
    part,
    selectable: (kind, id) => part(kind, id).status === 'confirmed',
    /** Zählung je Status, z. B. für den Migrationsvergleich */
    counts() {
      const out = {};
      for (const kind of Object.keys(KEY)) {
        out[kind] = { confirmed: 0, unchecked: 0, announced: 0 };
        for (const s of parts[kind].values()) out[kind][s.status]++;
      }
      return out;
    },
  };
}

/** Kombo mit nicht freigegebenen Teilen? Liefert die gesperrten Teile (leer = alles wählbar). */
export function lockedParts(index, combo) {
  const out = [];
  if (combo.bladeId && !index.selectable('blades', combo.bladeId)) out.push({ kind: 'blades', id: combo.bladeId });
  if (combo.ratchetId && !index.selectable('ratchets', combo.ratchetId)) out.push({ kind: 'ratchets', id: combo.ratchetId });
  if (combo.bitId && !index.selectable('bits', combo.bitId)) out.push({ kind: 'bits', id: combo.bitId });
  return out;
}
