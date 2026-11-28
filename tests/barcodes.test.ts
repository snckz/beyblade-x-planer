// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BarcodeFeed, Database } from '../src/lib/types';
import { knownBarcodes, packProduct, purchaseCodes } from '../src/lib/data';
import { isStoreCode, validGtin } from '../src/lib/barcode';
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
    expect(Object.keys(known).length).toBeGreaterThanOrEqual(135);
  });

  it('löst Einzelpackungen und Sets auf', () => {
    const known = knownBarcodes(feed, db.products);
    expect(known['5010996438553']).toBe('G4566'); // Whip Brachio (Einzelpack)
    expect(known['5010996259295']).toBe('G0197-01'); // Dual Pack: erster Eintrag der Packung
    expect(known['5010996290335']).toBe('G1542-01'); // Dual Pack Beat Tyranno + Knife Shinobi
    expect(purchaseCodes(db.products, packProduct(db.products, 'G1542')!)).toEqual(['G1542-01', 'G1542-02']);
    expect(known['5010996259318']).toBe('G0190-01'); // Dual Pack Knife Shinobi + Keel Shark
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
        '4904810000006': { product: 'BX-24-03' }, // ein bestimmter Kreisel aus einem Random Booster: Das weiß kein Barcode
      },
    };
    expect(db.products.some((p) => p.kind === 'random-booster' && p.code === 'BX-24-03')).toBe(true);
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
    // Random Booster: nur die Packung (BX-24), nie ein bestimmter Inhalt (BX-24-03)
    expect(check({ '5010996438553': { product: 'BX-24', source: 'shop' } })).toEqual([]);
    expect(check({ '5010996438553': { product: 'BX-24-03', source: 'shop' } })[0]).toMatch(/gibt es nicht/);
    // derselbe Code einmal als UPC und einmal als EAN
    expect(check({ '195166315546': { product: 'G3195', source: 'shop' }, '0195166315546': { product: 'G3195', source: 'shop' } }).some((e) => /doppelt/.test(e))).toBe(true);
    expect(validateBarcodes({}, db)).toEqual(['barcodes.json: barcodes fehlt']);
  });

  it('Takara Tomy: Einzelpackungen, Sets und Random Booster', () => {
    const known = knownBarcodes(feed, db.products);
    expect(known['4904810910381']).toBe('BX-01'); // Starter
    expect(known['4904810913047']).toBe('BX-17-01'); // Set: erster Eintrag der Packung
    expect(purchaseCodes(db.products, packProduct(db.products, 'BX-17')!)).toEqual(['BX-17-01', 'BX-17-02']);
    // Random Booster: Der Barcode führt zur Packung (ihr erster Eintrag) – die App fragt dann nach dem Inhalt
    expect(known['4904810913108']).toBe('BX-24-01');
    expect(packProduct(db.products, 'BX-24')!.kind).toBe('random-booster');
    expect(packProduct(db.products, 'BX-24-03')).toBeUndefined();
    expect(known['4904810912965']).toBe('BX-14'); // Random Booster mit nur einem erfassten Inhalt
    // Jeder Takara-Tomy-Barcode beginnt mit der Herstellernummer 4904810 und zeigt auf ein BX-/UX-/CX-Produkt
    const takara = Object.entries(feed.barcodes).filter(([gtin]) => gtin.startsWith('4904810'));
    expect(takara.length).toBeGreaterThanOrEqual(60);
    for (const [, entry] of takara) expect(entry.product).toMatch(/^(BX|UX|CX)-\d+$/);
    for (const [gtin, entry] of Object.entries(feed.barcodes)) if (/^(BX|UX|CX)-/.test(entry.product)) expect(gtin.startsWith('4904810')).toBe(true);
    // Stadien erkennt die App nirgends als Kauf – sie stehen nicht in der Liste
    expect(Object.values(feed.barcodes).some((e) => db.products.find((p) => p.code === e.product)?.kind === 'stadium')).toBe(false);
  });

  it('jede Packung hat höchstens einen Barcode in der Liste', () => {
    const packs = Object.values(feed.barcodes).map((e) => e.product);
    expect(packs.filter((p, i) => packs.indexOf(p) !== i)).toEqual([]);
  });

  it('Etiketten des Ladens (Präfix 02, 04, 20–29) sind keine Hersteller-Barcodes', () => {
    for (const c of ['2000000123455', '2912345678900', '0212345678901', '0412345678909', '212345678905', '20123451']) expect(isStoreCode(c)).toBe(true);
    for (const c of ['4904810910381', '5010996438553', '195166315546', '0195166315546', '49048108']) expect(isStoreCode(c)).toBe(false);
    for (const gtin of Object.keys(feed.barcodes)) expect(isStoreCode(gtin)).toBe(false);
  });

  it('Prüfziffer in Skript und App stimmen überein', () => {
    for (const c of ['5010996385185', '5010996385186', '195166315546', '12345678', '501099638518', 'abc']) expect(validGtinScript(c)).toBe(validGtin(c));
  });

  it('die Liste wird für den Offline-Betrieb vorab gespeichert', () => {
    expect(sw).toContain("'data/barcodes.json'");
  });
});
