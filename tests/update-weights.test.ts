// @vitest-environment node
import { describe, expect, it } from 'vitest';
// @ts-expect-error – JS-Modul ohne Typen
import { parseWeight, updateWeights } from '../scripts/update-weights.mjs';

describe('update-weights', () => {
  it('liest Gewichte aus Text und Infobox', () => {
    expect(parseWeight('SharkScale weighs 35.6 grams.')).toBe(35.6);
    expect(parseWeight('{{Blade|weight = 33,2 g}}')).toBe(33.2);
    expect(parseWeight('The Bey weighs 52.2 g in total')).toBe(52.2);
    expect(parseWeight('weighs 2.1 grams')).toBeNull();
  });
  it('versucht fehlende Gewichte nur bei retryMissing erneut, CX nie', async () => {
    const db = { blades: [{ id: 'A', line: 'BX', weightG: null }, { id: 'B', line: 'CX', weightG: null }, { id: 'C', line: 'UX' }] };
    const pages: Record<string, string> = { 'Blade - A': 'weighs 34 grams', 'Blade - C': 'weighs 36.5 grams' };
    const plain = await updateWeights(db, async (t: string) => pages[t] ?? null);
    expect(plain.db.blades.map((b: { weightG: unknown }) => b.weightG)).toEqual([null, null, 36.5]);
    const retry = await updateWeights(db, async (t: string) => pages[t] ?? null, { retryMissing: true });
    expect(retry.db.blades.map((b: { weightG: unknown }) => b.weightG)).toEqual([34, null, 36.5]);
    // Netzwerkfehler (undefined) lässt alles offen
    const off = await updateWeights(db, async () => undefined);
    expect(off.db.blades[2].weightG).toBeUndefined();
  });
});
