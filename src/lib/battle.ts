import type { BeyType, Combo, Database, MetaFeed } from './types';
import { analyze, resolveCombo, type Analysis, type Resolved } from './analysis';

/**
 * Battle-Analyse auf Basis der Richtwerte aus analysis.ts.
 * Alle Zahlen sind Faustregeln (Typ-Dreieck, Profil, Drehrichtung, Höhe) – keine Simulation.
 */

export interface Bey {
  combo: Combo;
  resolved: Resolved;
  analysis: Analysis;
}

export interface Matchup {
  /** −100 … +100, positiv = Vorteil für „a“ */
  score: number;
  /** grobe Siegchance für „a“ in %, 5–95 */
  chance: number;
  reasons: string[];
}

const BEATS: Record<BeyType, BeyType | null> = {
  attack: 'stamina',
  stamina: 'defense',
  defense: 'attack',
  balance: null,
};

export function toBey(db: Database, combo: Combo): Bey | null {
  const resolved = resolveCombo(db, combo);
  if (!resolved) return null;
  return { combo, resolved, analysis: analyze(resolved) };
}

export function matchup(a: Bey, b: Bey): Matchup {
  const reasons: string[] = [];
  const pa = a.analysis.profile;
  const pb = b.analysis.profile;
  const ta = a.analysis.type;
  const tb = b.analysis.type;
  let s = 0;

  if (BEATS[ta] === tb) {
    s += 20;
    reasons.push(`Typ-Vorteil: ${label(ta)} schlägt ${label(tb)}`);
  } else if (BEATS[tb] === ta) {
    s -= 20;
    reasons.push(`Typ-Nachteil: ${label(tb)} schlägt ${label(ta)}`);
  }

  s += 0.3 * (pa.attack + pa.defense - pb.attack - pb.defense);
  s += 0.3 * (pa.stamina - pb.stamina);
  s += 0.15 * (pa.burstResistance - pb.burstResistance);
  if (pa.stamina - pb.stamina >= 20) reasons.push('Dreht deutlich länger');
  if (pb.stamina - pa.stamina >= 20) reasons.push('Gegner dreht deutlich länger');
  if (pa.burstResistance - pb.burstResistance >= 12) reasons.push('Mehr Burst-Schutz');
  if (pb.burstResistance - pa.burstResistance >= 12) reasons.push('Weniger Burst-Schutz als der Gegner');

  const sa = a.resolved.blade.spin;
  const sb = b.resolved.blade.spin;
  if (sa !== sb && sa !== 'both' && sb !== 'both') {
    if (ta === 'stamina' || ta === 'balance') {
      s += 8;
      reasons.push('Gegendrehung: kann dem Gegner Spin klauen');
    }
    if (tb === 'stamina' || tb === 'balance') s -= 8;
  }

  const ha = a.analysis.heightMm;
  const hb = b.analysis.heightMm;
  if (ha !== null && hb !== null) {
    if (ta === 'attack' && ha <= hb - 1) {
      s += 6;
      reasons.push('Niedriger als der Gegner: trifft von unten');
    }
    if (tb === 'attack' && hb <= ha - 1) {
      s -= 6;
      reasons.push('Gegner ist niedriger und trifft von unten');
    }
  }

  const score = Math.max(-100, Math.min(100, Math.round(s)));
  return { score, chance: Math.max(5, Math.min(95, Math.round(50 + score / 2))), reasons };
}

const label = (t: BeyType) => ({ attack: 'Attack', defense: 'Defense', stamina: 'Stamina', balance: 'Balance' })[t];

function permutations<T>(list: T[]): T[][] {
  if (list.length <= 1) return [list];
  return list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((p) => [x, ...p]));
}

export interface DeckDuel {
  /** matrix[i][j] = mein Kreisel i gegen Gegner j */
  matrix: Matchup[][];
  /** beste Reihenfolge meiner Kreisel (Indizes) gegen die Gegner-Reihenfolge */
  bestOrder: number[];
  bestOrderScore: number;
  /** Durchschnitt über alle Paarungen – wenn die Gegner-Reihenfolge unbekannt ist */
  overall: number;
}

export function deckDuel(mine: Bey[], theirs: Bey[]): DeckDuel {
  const matrix = mine.map((a) => theirs.map((b) => matchup(a, b)));
  const n = Math.min(mine.length, theirs.length);
  let bestOrder = mine.map((_, i) => i).slice(0, n);
  let bestOrderScore = -Infinity;
  for (const perm of permutations(mine.map((_, i) => i))) {
    const sc = perm.slice(0, n).reduce((sum, i, slot) => sum + matrix[i]![slot]!.score, 0);
    if (sc > bestOrderScore) {
      bestOrderScore = sc;
      bestOrder = perm.slice(0, n);
    }
  }
  const all = matrix.flat();
  const overall = all.length ? Math.round(all.reduce((s, m) => s + m.score, 0) / all.length) : 0;
  return { matrix, bestOrder, bestOrderScore: n ? Math.round(bestOrderScore / n) : 0, overall };
}

/** Standard-Gegner, wenn kein Gegner-Deck eingegeben ist. */
export const ARCHETYPES: Combo[] = [
  { id: 'arch-attack', name: 'Typischer Angreifer', bladeId: 'PhoenixWing', ratchetId: '9-60', bitId: 'GF' },
  { id: 'arch-stamina', name: 'Typischer Ausdauer-Kreisel', bladeId: 'WizardRod', ratchetId: '5-70', bitId: 'DB' },
  { id: 'arch-defense', name: 'Typischer Verteidiger', bladeId: 'KnightShield', ratchetId: '3-80', bitId: 'N' },
  { id: 'arch-balance', name: 'Typischer Allrounder', bladeId: 'HellsScythe', ratchetId: '4-60', bitId: 'T' },
];

export interface Suggestion {
  slot: number;
  from: Combo;
  to: Combo;
  part: 'Bit' | 'Ratchet';
  oldId: string;
  newId: string;
  /** durchschnittliche Verbesserung des Scores gegen die Gegner */
  gain: number;
  newLabel: string;
}

export interface PartPool {
  ratchets: string[];
  bits: string[];
}

/**
 * Sucht für jeden eigenen Kreisel den besten Bit- bzw. Ratchet-Tausch gegen die Gegner.
 * Hält die Turnierregel ein: keine doppelten Teile im Deck.
 */
export function suggestImprovements(db: Database, deck: Combo[], opponents: Bey[], pool: PartPool, limit = 3): Suggestion[] {
  if (!opponents.length) return [];
  const avg = (c: Combo) => {
    const bey = toBey(db, c);
    if (!bey || !bey.analysis.valid) return -Infinity;
    return opponents.reduce((s, o) => s + matchup(bey, o).score, 0) / opponents.length;
  };
  const out: Suggestion[] = [];
  deck.forEach((combo, slot) => {
    const base = avg(combo);
    if (base === -Infinity) return;
    const others = deck.filter((_, i) => i !== slot);
    const usedBits = new Set(others.map((c) => c.bitId));
    const usedRatchets = new Set(others.map((c) => c.ratchetId).filter(Boolean));
    const blade = db.blades.find((b) => b.id === combo.bladeId);
    const best: { v: Suggestion | null } = { v: null };
    const consider = (to: Combo, part: Suggestion['part'], oldId: string, newId: string) => {
      const gain = avg(to) - base;
      if (gain >= 3 && (!best.v || gain > best.v.gain)) {
        const bey = toBey(db, to)!;
        best.v = { slot, from: combo, to, part, oldId, newId, gain: Math.round(gain), newLabel: bey.analysis.label };
      }
    };
    for (const bitId of pool.bits) {
      if (bitId === combo.bitId || usedBits.has(bitId)) continue;
      consider({ ...combo, bitId }, 'Bit', combo.bitId, bitId);
    }
    if (!blade?.integratedRatchet && combo.ratchetId) {
      for (const ratchetId of pool.ratchets) {
        if (ratchetId === combo.ratchetId || usedRatchets.has(ratchetId)) continue;
        consider({ ...combo, ratchetId }, 'Ratchet', combo.ratchetId, ratchetId);
      }
    }
    if (best.v) out.push(best.v);
  });
  return out.sort((a, b) => b.gain - a.gain).slice(0, limit);
}

/** Gegner für Optimierer und Kaufberater: aktuelle Turnier-Kombos (mind. 3 gültige), sonst typische Archetypen. */
export function metaOpponents(db: Database, meta?: MetaFeed | null): { opponents: Bey[]; vsMeta: boolean } {
  const list = (meta?.combos ?? [])
    .map((c) => toBey(db, { id: '', bladeId: c.bladeId, ratchetId: c.ratchetId ?? undefined, bitId: c.bitId }))
    .filter((b): b is Bey => !!b && b.analysis.valid);
  if (list.length >= 3) return { opponents: list, vsMeta: true };
  return { opponents: ARCHETYPES.map((c) => toBey(db, c)).filter((b): b is Bey => !!b), vsMeta: false };
}
