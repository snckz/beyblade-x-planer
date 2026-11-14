// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Database } from '../src/lib/types';
import { ARCHETYPES, toBey, type Bey } from '../src/lib/battle';
import { compatible, optimizeDeck } from '../src/lib/optimizer';

const db = JSON.parse(readFileSync(new URL('../public/data/db.json', import.meta.url), 'utf8')) as Database;
const opponents = ARCHETYPES.map((c) => toBey(db, c)).filter((b): b is Bey => !!b);

describe('Deck-Optimierer', () => {
  it('findet ein regelkonformes Deck nur aus den vorhandenen Teilen', () => {
    const pool = { blades: ['DranSword', 'WizardRod', 'KnightShield', 'GloryValkyrie'], ratchets: ['3-60', '5-70', '4-60', '1-60'], bits: ['F', 'H', 'N', 'K', 'B'] };
    const res = optimizeDeck(db, pool, opponents)!;
    expect(res.picks).toHaveLength(3);
    const [a, b, c] = res.picks.map((p) => p.combo);
    expect(compatible(a!, b!) && compatible(a!, c!) && compatible(b!, c!)).toBe(true);
    for (const p of res.picks) {
      expect(pool.blades).toContain(p.combo.bladeId);
      expect(pool.bits).toContain(p.combo.bitId);
      if (p.combo.ratchetId) expect(pool.ratchets).toContain(p.combo.ratchetId);
      else expect(db.blades.find((x) => x.id === p.combo.bladeId)?.integratedRatchet).toBe(true);
    }
  });
  it('gibt null zurück, wenn kein Deck möglich ist', () => {
    expect(optimizeDeck(db, { blades: ['DranSword'], ratchets: ['3-60'], bits: ['F'] }, opponents)).toBeNull();
    expect(optimizeDeck(db, { blades: ['DranSword'], ratchets: ['3-60'], bits: ['F'] }, [])).toBeNull();
  });
  it('bleibt mit allen Teilen schnell', () => {
    const t = performance.now();
    const res = optimizeDeck(db, { blades: db.blades.map((b) => b.id), ratchets: db.ratchets.map((r) => r.id), bits: db.bits.map((b) => b.id) }, opponents);
    expect(res).not.toBeNull();
    expect(performance.now() - t).toBeLessThan(4000);
  });
});
