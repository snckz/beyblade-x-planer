// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error – JS-Modul ohne Typen
import { validateMeta } from '../scripts/validate-data.mjs';

const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));

describe('meta.json', () => {
  it('alle Meta-Kombos und Siegerdecks verweisen auf bekannte Teile', () => {
    expect(validateMeta(read('meta.json'), read('db.json'))).toEqual([]);
  });
  it('meldet unbekannte Teile und fehlende Ratchets', () => {
    const db = read('db.json');
    const meta = { updatedAt: '2026-11-09', sources: [{ name: 'x', url: 'https://x.y' }], combos: [{ bladeId: 'Nope', ratchetId: '3-60', bitId: 'F' }, { bladeId: 'WizardRod', ratchetId: null, bitId: 'H' }], decks: [] };
    const errors = validateMeta(meta, db);
    expect(errors.join(' ')).toContain('Blade Nope unbekannt');
    expect(errors.join(' ')).toContain('WizardRod braucht einen Ratchet');
  });
});
