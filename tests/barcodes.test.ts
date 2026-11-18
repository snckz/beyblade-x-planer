// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BarcodeFeed, Database } from '../src/lib/types';
import { knownBarcodes, packProduct, purchaseCodes } from '../src/lib/data';
import { validGtin } from '../src/lib/barcode';
// @ts-expect-error – JS-Modul ohne Typen
import { validateBarcodes, validGtin as validGtinScript } from '../scripts/validate-data.mjs';

const read = <T>(f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8')) as T;
const db = read<Database>('db.json');
const feed = read<BarcodeFeed>('barcodes.json');
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

describe('mitgelieferte Barcodes', () => {
  it('die Liste ist gültig und jeder Eintrag führt zu genau einem Kauf', () => {
    expect(validateBarcodes(feed, db)).toEqual([]);
    const known = knownBarcodes(feed, db.products);
    expect(Object.keys(known).length).toBe(Object.keys(feed.barcodes).length);
    expect(Object.keys(known).length).toBeGreaterThanOrEqual(50);
  });

  it('löst Einzelpackungen und Sets auf', () => {
    const known = knownBarcodes(feed, db.products);
    expect(known['5010996438553']).toBe('G4566'); // Whip Brachio (Einzelpack)
    expect(known['5010996259295']).toBe('G0197-01'); // Dual Pack: erster Eintrag der Packung
    expect(purchaseCodes(db.products, packProduct(db.products, 'G0197')!)).toEqual(['G0197-01', 'G0197-02']);
    expect(known['5010996385185']).toBe('G3195'); // X-Treme Expansion Pack
    expect(purchaseCodes(db.products, packProduct(db.products, 'G3195')!)).toHaveLength(5);
  });

  it('lässt Ungültiges und Unbekanntes weg statt zu raten', () => {
    const f: BarcodeFeed = {
      barcodes: {
        '5010996438554': { product: 'G4566' }, // falsche Prüfziffer
        '5010996438553': { product: 'G9999' }, // Nummer gibt es nicht
        '195166315546': { product: 'G3195' }, // UPC-A (12 Stellen) → als EAN-13 geführt
        '4904810000006': { product: 'BX-14' }, // Random Booster: Inhalt zufällig
      },
    };
    expect(db.products.some((p) => p.kind === 'random-booster' && p.code.startsWith('BX-14'))).toBe(true);
    expect(knownBarcodes(f, db.products)).toEqual({ '0195166315546': 'G3195' });
    expect(knownBarcodes(null, db.products)).toEqual({});
    expect(knownBarcodes({ barcodes: {} }, db.products)).toEqual({});
  });

  it('die Datenprüfung meldet falsche Einträge', () => {
    const sources = { shop: 'https://example.com' };
    const check = (barcodes: BarcodeFeed['barcodes']) => validateBarcodes({ sources, barcodes }, db) as string[];
    expect(check({ '5010996438553': { product: 'G4566', source: 'shop' } })).toEqual([]);
    expect(check({ '5010996438554': { product: 'G4566', source: 'shop' } })[0]).toMatch(/ungültig/);
    expect(check({ '5010996438553': { product: 'G9999', source: 'shop' } })[0]).toMatch(/gibt es nicht/);
    expect(check({ '5010996438553': { product: 'G4566' } })[0]).toMatch(/Quelle fehlt/);
    expect(check({ '5010996438553': { product: 'G4566', source: 'unbekannt' } })[0]).toMatch(/Quelle fehlt/);
    const random = db.products.find((p) => p.kind === 'random-booster')!;
    expect(check({ '5010996438553': { product: random.code, source: 'shop' } })[0]).toMatch(/gibt es nicht/);
    // derselbe Code einmal als UPC und einmal als EAN
    expect(check({ '195166315546': { product: 'G3195', source: 'shop' }, '0195166315546': { product: 'G3195', source: 'shop' } }).some((e) => /doppelt/.test(e))).toBe(true);
    expect(validateBarcodes({}, db)).toEqual(['barcodes.json: barcodes fehlt']);
  });

  it('Prüfziffer in Skript und App stimmen überein', () => {
    for (const c of ['5010996385185', '5010996385186', '195166315546', '12345678', '501099638518', 'abc']) expect(validGtinScript(c)).toBe(validGtin(c));
  });

  it('die Liste wird für den Offline-Betrieb vorab gespeichert', () => {
    expect(sw).toContain("'data/barcodes.json'");
  });
});
