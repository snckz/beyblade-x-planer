import { describe, expect, it, beforeEach } from 'vitest';
import { exportState, importState, loadState, sanitize, saveState } from '../src/lib/storage';

describe('storage', () => {
  beforeEach(() => localStorage.clear());
  it('liefert leeren Zustand bei Müll', () => {
    expect(sanitize(null).combos).toEqual([]);
    expect(sanitize({ owned: { a: -1 }, combos: 'x', deck: 5 })).toEqual({ owned: {}, combos: [], deck: [], seenNews: [] });
  });
  it('entfernt Deck-Einträge ohne Kombo und begrenzt auf 3', () => {
    const combos = ['a', 'b', 'c', 'd'].map((id) => ({ id, bladeId: 'X', bitId: 'F' }));
    const s = sanitize({ combos, deck: ['a', 'zz', 'b', 'c', 'd'] });
    expect(s.deck).toEqual(['a', 'b', 'c']);
  });
  it('speichert und lädt', () => {
    const s = { owned: { 'UX-20': 2 }, combos: [], deck: [], seenNews: ['n1'] };
    expect(saveState(s)).toBe(true);
    expect(loadState()).toEqual(s);
  });
  it('Export/Import Rundreise', () => {
    const s = { owned: { 'BX-01': 1 }, combos: [{ id: 'c', bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' }], deck: ['c'], seenNews: [] };
    expect(importState(exportState(s))).toEqual(s);
  });
  it('kaputter localStorage-Inhalt bricht nicht', () => {
    localStorage.setItem('bxplaner:v1', '{kaputt');
    expect(loadState().owned).toEqual({});
  });
});
