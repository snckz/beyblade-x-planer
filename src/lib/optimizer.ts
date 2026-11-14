import type { Combo, Database } from './types';
import { matchup, toBey, type Bey } from './battle';

export interface PartPool {
  blades: string[];
  ratchets: string[];
  bits: string[];
}

export interface Candidate {
  combo: Omit<Combo, 'id' | 'name'>;
  bey: Bey;
  /** Durchschnitts-Score gegen die Gegner (−100 … +100) */
  score: number;
}

export interface OptimizedDeck {
  picks: Candidate[];
  /** Durchschnitt der drei Kreisel */
  score: number;
  /** wie viele Kombos geprüft wurden */
  checked: number;
}

const avgScore = (bey: Bey, opponents: Bey[]) => opponents.reduce((s, o) => s + matchup(bey, o).score, 0) / opponents.length;

/**
 * Beste Kombos je Blade: erst alle Bits mit einem Standard-Ratchet testen,
 * dann für die besten Bits alle Ratchets. So bleibt es auch mit vielen Teilen schnell.
 */
export function bestCombos(db: Database, pool: PartPool, opponents: Bey[], perBlade = 6): { list: Candidate[]; checked: number } {
  const list: Candidate[] = [];
  let checked = 0;
  const rate = (combo: Candidate['combo']): Candidate | null => {
    checked++;
    const bey = toBey(db, { id: '', ...combo });
    if (!bey || !bey.analysis.valid) return null;
    return { combo, bey, score: avgScore(bey, opponents) };
  };
  for (const bladeId of pool.blades) {
    const blade = db.blades.find((b) => b.id === bladeId);
    if (!blade) continue;
    let found: Candidate[];
    if (blade.integratedRatchet) {
      found = pool.bits.map((bitId) => rate({ bladeId, bitId })).filter((c): c is Candidate => !!c);
    } else {
      if (!pool.ratchets.length) continue;
      const probe = pool.ratchets.includes('3-60') ? '3-60' : pool.ratchets[0]!;
      const bitsRanked = pool.bits
        .map((bitId) => rate({ bladeId, ratchetId: probe, bitId }))
        .filter((c): c is Candidate => !!c)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);
      found = [...bitsRanked];
      for (const b of bitsRanked) {
        for (const ratchetId of pool.ratchets) {
          if (ratchetId === probe) continue;
          const c = rate({ bladeId, ratchetId, bitId: b.combo.bitId });
          if (c) found.push(c);
        }
      }
    }
    // Pro Blade mehrere gute Varianten mit unterschiedlichen Bits bzw. Ratchets –
    // sonst kollidieren die Kandidaten im Deck (Teile dürfen nicht doppelt sein).
    const bits = new Set<string>();
    const ratchets = new Set<string>();
    let kept = 0;
    for (const c of found.sort((a, b) => b.score - a.score)) {
      const r = c.combo.ratchetId ?? '';
      if (bits.has(c.combo.bitId) && ratchets.has(r)) continue;
      bits.add(c.combo.bitId);
      ratchets.add(r);
      list.push(c);
      if (++kept >= perBlade) break;
    }
  }
  return { list: list.sort((a, b) => b.score - a.score), checked };
}

/** Turnierregel: Blade, Ratchet und Bit dürfen im Deck nicht doppelt vorkommen. */
export function compatible(a: Candidate['combo'], b: Candidate['combo']): boolean {
  return a.bladeId !== b.bladeId && a.bitId !== b.bitId && !(a.ratchetId && b.ratchetId && a.ratchetId === b.ratchetId);
}

/** Bestes regelkonformes 3er-Deck (kleiner Bonus für verschiedene Typen gegen Überraschungen). */
export function optimizeDeck(db: Database, pool: PartPool, opponents: Bey[]): OptimizedDeck | null {
  if (!opponents.length) return null;
  const { list, checked } = bestCombos(db, pool, opponents);
  const best = pickTriple(list.slice(0, 60)) ?? pickTriple(list.slice(0, 150));
  if (!best) return null;
  return { picks: best.picks, score: Math.round(best.picks.reduce((s, p) => s + p.score, 0) / 3), checked };
}

function pickTriple(top: Candidate[]): { picks: Candidate[]; value: number } | null {
  let best: { picks: Candidate[]; value: number } | null = null;
  for (let i = 0; i < top.length; i++)
    for (let j = i + 1; j < top.length; j++) {
      if (!compatible(top[i]!.combo, top[j]!.combo)) continue;
      for (let k = j + 1; k < top.length; k++) {
        const picks = [top[i]!, top[j]!, top[k]!];
        if (!compatible(picks[0]!.combo, picks[2]!.combo) || !compatible(picks[1]!.combo, picks[2]!.combo)) continue;
        const types = new Set(picks.map((p) => p.bey.analysis.type)).size;
        const value = picks.reduce((s, p) => s + p.score, 0) / 3 + (types - 1) * 2;
        if (!best || value > best.value) best = { picks, value };
      }
    }
  return best;
}
