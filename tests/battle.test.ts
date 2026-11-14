import { describe, expect, it } from 'vitest';
import db from '../public/data/db.json';
import type { Combo, Database } from '../src/lib/types';
import { ARCHETYPES, deckDuel, matchup, suggestImprovements, toBey } from '../src/lib/battle';

const DB = db as Database;
const c = (bladeId: string, ratchetId: string | undefined, bitId: string, id = bladeId): Combo => ({ id, bladeId, ratchetId, bitId });
const bey = (x: Combo) => toBey(DB, x)!;

describe('matchup', () => {
  it('ist antisymmetrisch', () => {
    const a = bey(c('DranSword', '3-60', 'F'));
    const b = bey(c('WizardRod', '5-70', 'DB'));
    expect(matchup(a, b).score).toBe(-matchup(b, a).score);
  });
  it('Attack hat Vorteil gegen Stamina laut Typ-Dreieck', () => {
    const m = matchup(bey(c('DranSword', '3-60', 'F')), bey(c('WizardArrow', '4-80', 'B')));
    expect(m.reasons[0]).toMatch(/Typ-Vorteil/);
  });
  it('Gegendrehung hilft Stamina', () => {
    const m = matchup(bey(c('CobaltDragoon', '4-60', 'B')), bey(c('WizardRod', '5-70', 'DB')));
    expect(m.reasons.join(' ')).toMatch(/Gegendrehung/);
  });
  it('Chance bleibt zwischen 5 und 95', () => {
    for (const a of DB.blades.slice(0, 8)) for (const b of DB.blades.slice(0, 8)) {
      const m = matchup(bey(c(a.id, a.integratedRatchet ? undefined : '3-60', 'F')), bey(c(b.id, b.integratedRatchet ? undefined : '9-80', 'B')));
      expect(m.chance).toBeGreaterThanOrEqual(5);
      expect(m.chance).toBeLessThanOrEqual(95);
    }
  });
});

describe('deckDuel', () => {
  it('findet die beste Reihenfolge', () => {
    const mine = [c('KnightShield', '3-80', 'N'), c('DranSword', '3-60', 'F'), c('WizardRod', '5-70', 'DB')].map(bey);
    const theirs = [c('PhoenixWing', '9-60', 'GF'), c('WizardArrow', '4-80', 'B'), c('HellsScythe', '4-60', 'T')].map(bey);
    const d = deckDuel(mine, theirs);
    expect(d.matrix).toHaveLength(3);
    expect([...d.bestOrder].sort()).toEqual([0, 1, 2]);
    const manual = d.bestOrder.reduce((s, i, slot) => s + d.matrix[i]![slot]!.score, 0) / 3;
    expect(d.bestOrderScore).toBe(Math.round(manual));
  });
});

describe('suggestImprovements', () => {
  it('schlägt nur Teile vor, die im Deck nicht doppelt sind', () => {
    const deck = [c('WizardRod', '5-70', 'F', 'a'), c('DranSword', '3-60', 'B', 'b'), c('KnightShield', '3-80', 'N', 'c')];
    const opp = ARCHETYPES.map(bey);
    const pool = { bits: DB.bits.map((b) => b.id), ratchets: DB.ratchets.map((r) => r.id) };
    const s = suggestImprovements(DB, deck, opp, pool);
    expect(s.length).toBeGreaterThan(0);
    for (const x of s) {
      const others = deck.filter((_, i) => i !== x.slot);
      if (x.part === 'Bit') expect(others.map((o) => o.bitId)).not.toContain(x.newId);
      else expect(others.map((o) => o.ratchetId)).not.toContain(x.newId);
      expect(x.gain).toBeGreaterThanOrEqual(3);
    }
  });
  it('keine Vorschläge ohne Gegner', () => {
    expect(suggestImprovements(DB, [c('DranSword', '3-60', 'F')], [], { bits: ['B'], ratchets: [] })).toEqual([]);
  });
  it('Archetypen verweisen auf existierende Teile', () => {
    for (const a of ARCHETYPES) expect(toBey(DB, a)?.analysis.valid).toBe(true);
  });
});
