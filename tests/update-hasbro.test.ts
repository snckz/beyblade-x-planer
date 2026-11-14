// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error – JS-Modul ohne Typen
import { matchHasbro, parseHasbroNames } from '../scripts/update-hasbro.mjs';

const db = JSON.parse(readFileSync(new URL('../public/data/db.json', import.meta.url), 'utf8'));

describe('Hasbro-Namen', () => {
  it('erkennt umgedrehte und umbenannte Namen', () => {
    const wt = `{| class="wikitable"
| F9580 || Starter || [[Sword Dran 3-60F]]
| G1670 || Booster || [[Dagger Dran 4-70Q|Dagger Dran 4-70Q]]
| F9581 || '''Helm Knight 3-80N'''
| G2748 || Fang Leon T 4-60U
| G2350 || Blast Pegasus ATr
| G0000 || Beyblade X Xtreme Stadium
| G9999 || Völlig Neu 3-60F
|}`;
    const c = parseHasbroNames(wt);
    expect(c.map((x: { name: string }) => x.name)).toEqual(expect.arrayContaining(['Sword Dran', 'Helm Knight', 'Fang Leon', 'Blast Pegasus']));
    const names = matchHasbro(db, c);
    expect(names.DranSword).toBe('Sword Dran');
    expect(names.KnightShield).toBe('Helm Knight');
    expect(names.LeonFang).toBe('Fang Leon');
    expect(names.PegasusBlast).toBe('Blast Pegasus');
    expect(Object.values(names)).not.toContain('Xtreme Stadium');
  });

  it('trennt Produkttypen im Fließtext ab und vergibt keine doppelten Namen', () => {
    const c = parseHasbroNames('Starter Sword Dran 3-60F, Booster Dagger Dran 4-70Q and Dual Pack Fang Leon T 4-60U');
    expect(c.map((x: { name: string }) => x.name)).toEqual(expect.arrayContaining(['Sword Dran', 'Dagger Dran', 'Fang Leon']));
    // gleicher Name bei Hasbro sperrt den Ersatz-Treffer über Ratchet+Bit
    const locked = matchHasbro(db, [
      { name: 'Dran Sword', ratchet: '3-60', bit: 'F' },
      { name: 'Super Dran', ratchet: '3-60', bit: 'F' },
    ]);
    expect(locked.DranSword).toBeUndefined();
  });
});

describe('Namens-Anzeige', () => {
  it('zeigt englischen Hasbro-Namen mit Takara-Namen daneben und den Hersteller der Packung', async () => {
    const { displayName, bothNames, otherName, regionLabel } = await import('../src/lib/names');
    const wizard = { name: 'Wizard Rod', hasbroName: 'Wand Wizard' };
    expect(displayName(wizard)).toBe('Wand Wizard');
    expect(displayName({ name: 'Wyvern Gale' })).toBe('Wyvern Gale');
    expect(bothNames(wizard)).toBe('Wand Wizard · Wizard Rod');
    expect(otherName(wizard)).toBe('Japan: Wizard Rod');
    // nur umgedreht → kein doppelter Name in einer Zeile
    expect(bothNames({ name: 'Dran Sword', hasbroName: 'Sword Dran' })).toBe('Sword Dran');
    expect(otherName({ name: 'Dran Sword' })).toBeNull();
    expect(regionLabel({ region: 'hasbro' })).toBe('Hasbro');
    expect(regionLabel({})).toBe('Takara Tomy');
  });
});
