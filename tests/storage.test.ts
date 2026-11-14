import { describe, expect, it, beforeEach } from 'vitest';
import { exportState, importState, loadState, sanitize, saveState } from '../src/lib/storage';

describe('storage', () => {
  beforeEach(() => localStorage.clear());
  it('liefert leeren Zustand bei Müll', () => {
    expect(sanitize(null).combos).toEqual([]);
    expect(sanitize({ owned: { a: -1 }, combos: 'x', deck: 5 })).toEqual({ owned: {}, combos: [], deck: [], seenNews: [], opponent: [], wishlist: [], barcodes: {}, matches: [], prefs: { hasbroNames: false }, shopPrices: {} });
  });
  it('entfernt Deck-Einträge ohne Kombo und begrenzt auf 3', () => {
    const combos = ['a', 'b', 'c', 'd'].map((id) => ({ id, bladeId: 'X', bitId: 'F' }));
    const s = sanitize({ combos, deck: ['a', 'zz', 'b', 'c', 'd'] });
    expect(s.deck).toEqual(['a', 'b', 'c']);
  });
  it('speichert und lädt', () => {
    const s = { owned: { 'UX-20': 2 }, combos: [], deck: [], seenNews: ['n1'], opponent: [], wishlist: ['BX-05'], barcodes: { '4904810123456': 'BX-05' }, matches: [], prefs: { hasbroNames: true }, shopPrices: { 'BX-05': { amount: 450, cur: 'THB' as const } } };
    expect(saveState(s)).toBe(true);
    expect(loadState()).toEqual(s);
  });
  it('Export/Import Rundreise', () => {
    const s = { owned: { 'BX-01': 1 }, combos: [{ id: 'c', bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' }], deck: ['c'], seenNews: [], opponent: [{ id: 'o', bladeId: 'WizardRod', ratchetId: '5-70', bitId: 'DB' }], wishlist: [], barcodes: {}, matches: [], prefs: { hasbroNames: false }, shopPrices: {} };
    expect(importState(exportState(s))).toEqual(s);
  });
  it('alte Speicherstände ohne Wunschliste/Barcodes laden, Müll wird verworfen', () => {
    const s = sanitize({ owned: {}, wishlist: ['A', 'A', 3], barcodes: { abc: 'X', '4904810000000': 'BX-01', '4904810000001': 5 } });
    expect(s.wishlist).toEqual(['A']);
    expect(s.barcodes).toEqual({ '4904810000000': 'BX-01' });
    expect(s.shopPrices).toEqual({});
  });
  it('verwirft ungültige Ladenpreise', () => {
    const s = sanitize({ shopPrices: { A: { amount: 450, cur: 'THB' }, B: { amount: -1, cur: 'THB' }, C: { amount: 5, cur: 'USD' }, D: 7 } });
    expect(s.shopPrices).toEqual({ A: { amount: 450, cur: 'THB' } });
  });
  it('kaputter localStorage-Inhalt bricht nicht', () => {
    localStorage.setItem('bxplaner:v1', '{kaputt');
    expect(loadState().owned).toEqual({});
  });
});
