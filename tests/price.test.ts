import { describe, expect, it } from 'vitest';
import { convert, priceHint, sumPrices } from '../src/lib/price';
// @ts-expect-error – JS-Modul ohne Typen
import { parseEcb } from '../scripts/update-rates.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { parsePriceJpy } from '../scripts/import-catalog.mjs';

const rates = { source: 'EZB', date: '2026-11-13', base: 'EUR' as const, JPY: 160, THB: 38 };

describe('Preise', () => {
  it('rechnet Yen in Euro und Baht um', () => {
    expect(convert(1600, rates)).toEqual({ eur: 10, thb: 380 });
    expect(convert(1600, null)).toBeNull();
    expect(priceHint({ priceJpy: 1600 }, rates)).toBe('¥1.600 ≈ 10 € · 380 ฿');
    expect(priceHint({ priceJpy: 1600 }, null)).toBe('¥1.600');
    expect(priceHint({ priceJpy: null }, rates)).toBeNull();
  });
  it('summiert und zählt fehlende Preise', () => {
    expect(sumPrices([{ priceJpy: 1000 }, { priceJpy: null }, {}, { priceJpy: 320 }])).toEqual({ jpy: 1320, missing: 2 });
  });
  it('liest EZB-Kurse', () => {
    const xml = `<Cube><Cube time='2026-11-13'><Cube currency='USD' rate='1.08'/><Cube currency='JPY' rate='162.35'/><Cube currency='THB' rate='37.9'/></Cube></Cube>`;
    expect(parseEcb(xml)).toMatchObject({ date: '2026-11-13', JPY: 162.35, THB: 37.9 });
    expect(parseEcb('<x/>')).toBeNull();
  });
  it('liest den Japan-Preis aus dem Wiki-Text', () => {
    expect(parsePriceJpy("It was released as a Starter in Japan on July 13th, 2024 for 2,321円.")).toBe(2321);
    expect(parsePriceJpy('released for ¥1,320 as part of')).toBe(1320);
    expect(parsePriceJpy('weighs 35.4 grams')).toBeNull();
    expect(parsePriceJpy('for 99円')).toBeNull();
  });
});
