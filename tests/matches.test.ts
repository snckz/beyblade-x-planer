import { describe, expect, it } from 'vitest';
import { sanitizeMatches, statsByCombo, type Match } from '../src/lib/matches';

const m = (won: boolean, finish: Match['finish'], bitId = 'H'): Match => ({
  id: Math.random().toString(36),
  date: '2026-11-14T10:00:00Z',
  mine: { bladeId: 'WizardRod', ratchetId: '1-60', bitId },
  opp: { bladeId: 'SharkScale', ratchetId: '1-70', bitId: 'LR' },
  won,
  finish,
});

describe('Battle-Tagebuch', () => {
  it('zählt Siege, Punkte und häufigste Niederlage pro Kombo', () => {
    const s = statsByCombo([m(true, 'spin'), m(true, 'xtreme'), m(false, 'burst'), m(false, 'burst'), m(true, 'over', 'FB')]);
    expect(s[0]).toMatchObject({ games: 4, wins: 2, pointDiff: 1 + 3 - 2 - 2, weakness: 'burst' });
    expect(s[0]!.winsBy.xtreme).toBe(1);
    expect(s[1]).toMatchObject({ games: 1, wins: 1, weakness: null });
  });
  it('verwirft kaputte Einträge', () => {
    expect(sanitizeMatches([m(true, 'spin'), { id: 'x' }, { ...m(true, 'spin'), finish: 'boom' }, null])).toHaveLength(1);
    expect(sanitizeMatches('x')).toEqual([]);
  });
});
