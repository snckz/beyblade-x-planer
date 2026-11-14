// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Database } from '../src/lib/types';
import { ARCHETYPES, toBey, type Bey } from '../src/lib/battle';
import { advise, rankOffers, valuePer1000 } from '../src/lib/advisor';

const db = JSON.parse(readFileSync(new URL('../public/data/db.json', import.meta.url), 'utf8')) as Database;
const opponents = ARCHETYPES.map((c) => toBey(db, c)).filter((b): b is Bey => !!b);
const starters = db.products.filter((p) => p.kind === 'starter' && p.bladeId && !p.imported).slice(0, 4);
const owned = Object.fromEntries(starters.map((p) => [p.code, 1]));

describe('Kaufberater', () => {
  it('schlägt nur Käufe mit neuen Teilen vor und überspringt Besitz', async () => {
    const t = performance.now();
    const { base, offers } = await advise(db, owned, opponents);
    const ms = performance.now() - t;
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o.gain).toBeGreaterThan(0);
      expect(o.newParts.length).toBeGreaterThan(0);
      expect(o.codes.some((c) => owned[c])).toBe(false);
    }
    expect(Number.isFinite(base)).toBe(true);
    console.log(`Kaufberater: ${offers.length} Angebote in ${Math.round(ms)} ms`);
    expect(ms).toBeLessThan(8000);
  });
  it('bewertet auch eine leere Sammlung und Random Booster als Erwartungswert', async () => {
    const { offers } = await advise(db, {}, opponents);
    expect(offers.length).toBeGreaterThan(0);
    const rb = offers.find((o) => o.kind === 'random-booster');
    if (rb) expect(rb.bestGain!).toBeGreaterThanOrEqual(rb.gain);
  });
  it('sortiert nach Punkten pro Yen, Angebote ohne Preis ans Ende', () => {
    const mk = (gain: number, priceJpy: number | null) => ({ code: String(gain), codes: [], name: '', kind: 'booster' as const, priceJpy, gain, newParts: [{ kind: 'bit' as const, id: 'F' }], deck: [] });
    const r = rankOffers([mk(10, null), mk(10, 2000), mk(8, 1000), mk(30, null)]);
    expect(r.map((o) => o.code)).toEqual(['8', '10', '30', '10']);
    expect(valuePer1000(mk(10, 2000))).toBe(5);
  });
});
