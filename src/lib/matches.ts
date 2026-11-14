import type { Combo } from './types';

export type Finish = 'spin' | 'over' | 'burst' | 'xtreme';

/** Ein eingetragener Kampf. Kombos ohne id, nur die Teile. */
export interface Match {
  id: string;
  /** ISO-Datum */
  date: string;
  mine: Omit<Combo, 'id' | 'name'>;
  opp: Omit<Combo, 'id' | 'name'>;
  won: boolean;
  finish: Finish;
}

/** Punkte nach WBO-Regeln für Beyblade X */
export const FINISH: Record<Finish, { label: string; points: number }> = {
  spin: { label: 'Spin', points: 1 },
  over: { label: 'Over', points: 2 },
  burst: { label: 'Burst', points: 2 },
  xtreme: { label: 'Xtreme', points: 3 },
};

export const comboKey = (c: Omit<Combo, 'id' | 'name'>) => `${c.bladeId}|${c.ratchetId ?? ''}|${c.bitId}`;

export interface ComboStats {
  key: string;
  combo: Omit<Combo, 'id' | 'name'>;
  games: number;
  wins: number;
  /** eigene minus gegnerische Punkte */
  pointDiff: number;
  /** Siege nach Art */
  winsBy: Record<Finish, number>;
  /** häufigste Niederlagen-Art, falls vorhanden */
  weakness: Finish | null;
}

/** Statistik pro eigener Kombo, meistgespielte zuerst. */
export function statsByCombo(matches: Match[]): ComboStats[] {
  const map = new Map<string, ComboStats & { lossesBy: Record<Finish, number> }>();
  for (const m of matches) {
    const key = comboKey(m.mine);
    const s =
      map.get(key) ??
      { key, combo: m.mine, games: 0, wins: 0, pointDiff: 0, winsBy: { spin: 0, over: 0, burst: 0, xtreme: 0 }, lossesBy: { spin: 0, over: 0, burst: 0, xtreme: 0 }, weakness: null };
    s.games++;
    const pts = FINISH[m.finish].points;
    if (m.won) {
      s.wins++;
      s.pointDiff += pts;
      s.winsBy[m.finish]++;
    } else {
      s.pointDiff -= pts;
      s.lossesBy[m.finish]++;
    }
    map.set(key, s);
  }
  return [...map.values()]
    .map(({ lossesBy, ...s }) => {
      const worst = (Object.entries(lossesBy) as [Finish, number][]).sort((a, b) => b[1] - a[1])[0]!;
      return { ...s, weakness: worst[1] > 0 ? worst[0] : null };
    })
    .sort((a, b) => b.games - a.games || b.wins - a.wins);
}

const isPart = (c: unknown): c is Omit<Combo, 'id' | 'name'> => {
  const x = c as Combo;
  return !!x && typeof x.bladeId === 'string' && typeof x.bitId === 'string' && (x.ratchetId === undefined || typeof x.ratchetId === 'string');
};

/** Gespeicherte Kämpfe robust einlesen (max. 500). */
export function sanitizeMatches(raw: unknown): Match[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is Match =>
        !!m &&
        typeof m.id === 'string' &&
        typeof m.date === 'string' &&
        isPart(m.mine) &&
        isPart(m.opp) &&
        typeof m.won === 'boolean' &&
        Object.prototype.hasOwnProperty.call(FINISH, m.finish),
    )
    .slice(-500);
}
