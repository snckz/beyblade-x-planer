// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Database } from '../src/lib/types';
import { findByCode, findByName } from '../src/lib/photo';
import { groupKey, parsePrice, sumPrices } from '../src/lib/price';
import { purchaseCodes } from '../src/lib/data';
import { judgeWithMeta, rateProduct } from '../src/lib/rate';
import type { MetaFeed } from '../src/lib/types';
import { metaUsage } from '../src/lib/metaUsage';
import { ARCHETYPES, toBey, type Bey } from '../src/lib/battle';
import { advise } from '../src/lib/advisor';

const db = JSON.parse(readFileSync(new URL('../public/data/db.json', import.meta.url), 'utf8')) as Database;
const opponents = ARCHETYPES.map((c) => toBey(db, c)).filter((b): b is Bey => !!b);
const codes = (list: { code: string }[]) => list.map((p) => p.code);

describe('Foto-Erkennung (Text → Produkt)', () => {
  it('findet Produktcodes auch mit typischen OCR-Fehlern', () => {
    expect(codes(findByCode('TAKARA TOMY\nBX-05 BOOSTER', db))).toEqual(['BX-05']);
    expect(codes(findByCode('bx 05', db))).toEqual(['BX-05']);
    expect(codes(findByCode('BX-O5', db))).toEqual(['BX-05']); // O statt 0
    expect(codes(findByCode('8X-05', db))).toEqual(['BX-05']); // 8 statt B
    expect(codes(findByCode('BX–08', db))).toEqual(['BX-08-01', 'BX-08-02', 'BX-08-03']);
    expect(codes(findByCode('BX-0815 lorem', db))).toEqual([]);
    expect(findByCode('nichts hier', db)).toEqual([]);
    expect(codes(findByCode('BX-01S', db))).toEqual(['BX-01']); // „STARTER“ angeklebt
    expect(codes(findByCode('BX-05B', db))).toEqual(['BX-05']);
    expect(codes(findByCode('bx-0l', db))).toContain('BX-01'); // kleines L
    expect(findByCode('Größe 8 x 14 cm', db)).toEqual([]);
  });
  it('findet Hasbro-Materialnummern wie „G4568“ auf der Packung', () => {
    expect(codes(findByCode('HASBRO G2745 EU4', db))).toEqual(['G2745']);
    expect(codes(findByCode('G2745EU4', db))).toEqual(['G2745']); // Ländercode angeklebt
    expect(codes(findByCode('G27A5', db))).toEqual([]);
    expect(codes(findByCode('F9588', db))).toEqual(['F9588-01', 'F9588-02']);
    expect(codes(findByCode('Z9999 1234', db))).toEqual([]);
  });
  it('findet Blade-Namen (auch Hasbro-Schreibweise) im Text', () => {
    const p = findByName('BEYBLADE X  DRAN SWORD 3-60F STARTER', db);
    expect(codes(p)).toContain('BX-01');
    const h = db.blades.find((b) => b.id === 'DranSword')!.hasbroName;
    if (h) expect(codes(findByName(`HASBRO ${h.toUpperCase()}`, db))).toContain('BX-01');
    expect(findByName('SWORD', db)).toEqual([]); // ein Wort reicht nicht
  });
});

describe('Preise und Käufe', () => {
  it('liest Ladenpreise mit Tausendertrennern und Dezimalkomma', () => {
    expect(parsePrice('1,290')).toBe(1290);
    expect(parsePrice('1.290')).toBe(1290);
    expect(parsePrice('1 290 ฿')).toBe(1290);
    expect(parsePrice('12,50')).toBe(12.5);
    expect(parsePrice('12.5')).toBe(12.5);
    expect(parsePrice('1.234,50')).toBe(1234.5);
    expect(parsePrice('450')).toBe(450);
    expect(parsePrice('abc')).toBeNull();
    expect(parsePrice('0')).toBeNull();
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('1290 THB')).toBe(1290);
    expect(parsePrice('Baht 1290')).toBe(1290);
  });
  it('gruppiert nur echte Unternummern', () => {
    expect(groupKey({ code: 'BX-14', kind: 'random-booster' })).toBe('BX-14');
    expect(groupKey({ code: 'UX-15', kind: 'set' })).toBe('UX-15');
    expect(groupKey({ code: 'BX-08-02', kind: 'set' })).toBe('BX-08');
    expect(groupKey({ code: 'BX-08-02', kind: 'booster' })).toBe('BX-08-02');
    expect(groupKey({ code: 'G1543-02', kind: 'set' })).toBe('G1543'); // Hasbro-Dual-Pack
    expect(groupKey({ code: 'G1491', kind: 'starter' })).toBe('G1491');
    // zwei verschiedene Sets → beide Preise zählen
    expect(sumPrices([{ code: 'UX-15', kind: 'set', priceJpy: 1000 }, { code: 'UX-16', kind: 'set', priceJpy: 2000 }]).jpy).toBe(3000);
    expect(sumPrices([{ code: 'BX-08-01', kind: 'set', priceJpy: 5000 }, { code: 'BX-08-02', kind: 'set', priceJpy: 5000 }]).jpy).toBe(5000);
  });
  it('ein Set-Kauf umfasst alle Kreisel des Sets', () => {
    const p = db.products.find((x) => x.code === 'BX-08-02')!;
    expect(purchaseCodes(db.products, p)).toEqual(['BX-08-01', 'BX-08-02', 'BX-08-03']);
    expect(purchaseCodes(db.products, db.products.find((x) => x.code === 'BX-05')!)).toEqual(['BX-05']);
    const dual = db.products.find((x) => x.code === 'G1543-01');
    if (dual) expect(purchaseCodes(db.products, dual)).toEqual(['G1543-01', 'G1543-02']);
  });
  it('Kaufberater mischt keine verschiedenen Produkte', async () => {
    const { offers } = await advise(db, {}, opponents);
    for (const o of offers) {
      const kinds = new Set(o.codes.map((c) => db.products.find((p) => p.code === c)!.kind));
      expect(kinds.size).toBe(1);
      expect(new Set(o.codes.map((c) => groupKey(db.products.find((p) => p.code === c)!))).size).toBe(1);
      expect(o.gain).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Bewertung', () => {
  const p = db.products.find((x) => x.code === 'BX-05')!;
  it('sagt nur „Hast du schon“, wenn man es schon hat', () => {
    const r = rateProduct(db, { 'BX-05': 1 }, opponents, p, null, null);
    expect(r.overall).toBe('owned');
    expect(r.reasons[0]).toContain('schon in deiner Sammlung');
  });
  it('limitierte Kreisel werden als Sammlerstück bewertet statt abgelehnt', () => {
    const lim = db.products.find((x) => /^CX-00/.test(x.code) && x.bladeId)!;
    // alles schon besessen außer dem limitierten → Deckgewinn klein
    const r = rateProduct(db, Object.fromEntries(db.products.filter((x) => x.kind === 'starter' && x.code !== lim.code).slice(0, 30).map((x) => [x.code, 1])), opponents, lim, null, null);
    expect(r.reasons[0]).toMatch(/Sammeln und Tauschen|Sammlerstück/);
    expect(r.overall === 'skip').toBe(false);
  });
  it('empfiehlt einen starken Zuwachs, ein hoher Preis bremst', () => {
    const rates = { source: '', date: '2026-11-13', base: 'EUR' as const, JPY: 170, THB: 37 };
    const cheap = rateProduct(db, {}, opponents, p, { amount: 1, cur: 'THB' }, rates);
    const pricey = rateProduct(db, {}, opponents, p, { amount: 100000, cur: 'THB' }, rates);
    expect(cheap.gain).toBeGreaterThan(0);
    expect(['buy', 'maybe']).toContain(cheap.overall);
    expect(pricey.price?.verdict).toBe('high');
    expect(pricey.overall === 'buy').toBe(false);
  });
});

describe('Kauf-Check mit Turnier-Meta', () => {
  const meta = JSON.parse(readFileSync(new URL('../public/data/meta.json', import.meta.url), 'utf8')) as MetaFeed;
  it('zählt Siegerdecks je Teil und findet die meistgespielte Kombo', () => {
    const u = metaUsage(db, { ...meta, decksTotal: 100, counts: { 'GloryValkyrie||K': 30, 'GloryValkyrie||R': 10, 'WizardRod|1-60|K': 5 } }, 'blade', 'GloryValkyrie')!;
    expect(u.decks).toBe(40);
    expect(u.share).toBeCloseTo(0.4);
    expect(u.top).toMatchObject({ bladeId: 'GloryValkyrie', ratchetId: null, bitId: 'K', decks: 30 });
    expect(metaUsage(db, { ...meta, counts: undefined }, 'blade', 'GloryValkyrie')).toBeNull();
  });
  it('ein Top-Teil im Turnier ist ein Kauf, auch wenn die Deck-Punkte wenig zeigen', () => {
    expect(judgeWithMeta(0.3, 0.28, null)).toBe('buy');
    expect(judgeWithMeta(0.3, 0.28, { verdict: 'high' })).toBe('maybe');
    expect(judgeWithMeta(0.3, 0.07, null)).toBe('maybe');
    expect(judgeWithMeta(0.3, 0, null)).toBe('skip');
    expect(judgeWithMeta(9, 0, null)).toBe('buy');
  });
  it('Glory Valkerion LF wird mit Meta nicht mehr abgelehnt', () => {
    const p = db.products.find((x) => x.code === 'G4568')!;
    const owned = Object.fromEntries(['G2745', 'G1543-01', 'G1543-02', 'F9588-01', 'F9588-02', 'G1491'].map((c) => [c, 1]));
    const fake: MetaFeed = { ...meta, decksTotal: 100, counts: { 'GloryValkyrie||K': 20, 'GloryValkyrie||R': 8 } };
    const r = rateProduct(db, owned, opponents, p, null, null, new Map(), fake);
    expect(r.meta[0]?.id).toBe('GloryValkyrie');
    expect(r.overall).toBe('buy');
    expect(r.reasons[0]).toMatch(/Top-Teil im Turnier/);
    expect(r.reasons.join(' ')).toMatch(/fehlt dir noch Bit K/);
  });
});
