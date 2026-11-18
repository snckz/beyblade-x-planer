// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Database } from '../src/lib/types';
import { contentLabel, ownedParts, purchaseCodes, purchaseProducts } from '../src/lib/data';
import { findByCode } from '../src/lib/photo';
import { groupKey } from '../src/lib/price';
import { rateProduct } from '../src/lib/rate';
import { advise } from '../src/lib/advisor';
import { ARCHETYPES, toBey, type Bey } from '../src/lib/battle';
// @ts-expect-error – JS-Modul ohne Typen
import { mergeHasbro, parseHasbroList } from '../scripts/import-hasbro.mjs';

const db = JSON.parse(readFileSync(new URL('../public/data/db.json', import.meta.url), 'utf8')) as Database;
const opponents = ARCHETYPES.map((c) => toBey(db, c)).filter((b): b is Bey => !!b);
const CODES = ['G3195', 'G3195-02', 'G3195-03', 'G3195-04', 'G3195-05'];
const product = (code: string) => db.products.find((p) => p.code === code)!;
const sorted = (m: Map<string, number>) => [...m.keys()].sort();

// Hasbro X-Treme Expansion Pack (G3195): 1 fertiger Kreisel, 2 lose Blades, 3 lose Ratchets, 4 lose Bits.
describe('Set mit losen Teilen (G3195, X-Treme Expansion Pack)', () => {
  it('enthält laut Daten genau 3 Blades, 4 Ratchets und 5 Bits', () => {
    const items = CODES.map(product);
    expect(items.every((p) => p?.kind === 'set' && p.region === 'hasbro')).toBe(true);
    expect(items.map((p) => p.bladeId).filter(Boolean)).toEqual(['KnightMail', 'GhostCircle', 'HellsHammer']);
    expect(items.map((p) => p.ratchetId).filter(Boolean).sort()).toEqual(['3-85', '4-55', '7-70', '9-65']);
    expect(items.map((p) => p.bitId).filter(Boolean).sort()).toEqual(['B', 'BS', 'MN', 'P', 'RA']);
    // Die bisherige Nummer behält ihre Teile – ein schon gemerkter Barcode zeigt weiter auf den Kopf des Sets
    expect(product('G3195')).toMatchObject({ bladeId: 'KnightMail', ratchetId: '3-85', bitId: 'BS' });
  });

  it('ein Kauf umfasst alle Einträge, egal über welchen man kommt', () => {
    for (const c of CODES) {
      expect(groupKey(product(c))).toBe('G3195');
      expect(purchaseCodes(db.products, product(c))).toEqual(CODES);
    }
    expect(purchaseProducts(db.products, product('BX-05')).map((p) => p.code)).toEqual(['BX-05']);
  });

  it('legt alle Teile in die Sammlung', () => {
    const owned = Object.fromEntries(purchaseCodes(db.products, product('G3195')).map((c) => [c, 1]));
    const parts = ownedParts(db, owned);
    expect(sorted(parts.blades)).toEqual(['GhostCircle', 'HellsHammer', 'KnightMail']);
    expect(sorted(parts.ratchets)).toEqual(['3-85', '4-55', '7-70', '9-65']);
    expect(sorted(parts.bits)).toEqual(['B', 'BS', 'MN', 'P', 'RA']);
    expect([...parts.ratchets.values(), ...parts.bits.values()].every((n) => n === 1)).toBe(true);
  });

  it('nennt Kreisel und lose Teile getrennt', () => {
    expect(contentLabel(CODES.map(product))).toBe('3 Kreisel + 3 Teile');
    expect(contentLabel([product('G1543-01'), product('G1543-02')])).toBe('2 Kreisel');
    expect(contentLabel([{ bitId: 'MN' }])).toBe('1 Teil');
    expect(contentLabel([])).toBe('');
  });

  it('wird über die Materialnummer auf der Packung gefunden', () => {
    expect(findByCode('G3195 5010996385185', db).map((p) => p.code)).toEqual(CODES);
  });

  it('Kaufcheck und Kaufberater zählen die losen Teile mit', async () => {
    // Sammlung mit sieben Hasbro-Kreiseln: Mit den losen Teilen ist die Packung mindestens so viel wert wie ohne.
    const owned = Object.fromEntries(['G2745', 'G1543-01', 'G1543-02', 'F9588-01', 'F9588-02', 'G1491', 'G1862-03'].map((c) => [c, 1]));
    expect(Object.keys(owned).every((c) => !!product(c))).toBe(true);
    const rating = rateProduct(db, owned, opponents, purchaseProducts(db.products, product('G3195')), null, null);
    const withoutLoose = rateProduct(db, owned, opponents, CODES.slice(0, 3).map(product), null, null);
    expect(rating.gain).toBeGreaterThanOrEqual(withoutLoose.gain);
    const { offers } = await advise(db, {}, opponents);
    const offer = offers.find((o) => o.code === 'G3195');
    expect(offer?.codes).toEqual(CODES);
    expect(offer?.name).toBe('G3195 Set (3 Kreisel + 3 Teile)');
    expect(offer?.newParts).toEqual(expect.arrayContaining([{ kind: 'ratchet', id: '9-65' }, { kind: 'bit', id: 'B' }, { kind: 'bit', id: 'MN' }]));
    // andere Sets heißen wie bisher
    for (const o of offers.filter((x) => x.kind === 'set' && x.codes.length > 1 && x.code !== 'G3195')) expect(o.name).toMatch(/ Set \(\d+ Kreisel\)$/);
  });

  it('bleibt beim Hasbro-Import, wie es ist (kein „Booster“ mehr, nichts doppelt)', async () => {
    // Die Wiki-Liste nennt unter G3195 nur den fertigen Kreisel.
    const wt = `{| class="wikitable"\n|-\n|G3195\n|[[Mail Knight 3-85BS]]\n|\n|[[File:Flag of United States.png|20px]] $29.99\n|}`;
    const { db: out, report } = await mergeHasbro(db, parseHasbroList(wt), () => Promise.resolve(null));
    const mine = out.products.filter((p: { code: string }) => p.code.startsWith('G3195'));
    expect(mine).toEqual(CODES.map(product));
    expect(report.added.products).toEqual([]);
    expect(report.conflicts).toEqual([]);
  });
});
