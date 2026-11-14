import { describe, expect, it } from 'vitest';
import { advance, canAdvance, validResult, createTournament, currentRound, finished, isDone, loadTournament, saveTournament, setResult, standings, type Tournament } from '../src/lib/tournament';

const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);
const pairKey = (a: string, b: string | null) => [a, b].sort().join('|');
/** spielt alle offenen Matches; niedrigerer Index gewinnt 4:2 */
const playOpen = (t: Tournament) => {
  const idx = (id: string) => t.players.findIndex((p) => p.id === id);
  for (const m of t.matches.filter((x) => !isDone(x))) t = setResult(t, m.id, idx(m.a) < idx(m.b!) ? 4 : 2, idx(m.a) < idx(m.b!) ? 2 : 4);
  return t;
};

describe('Mini-Turnier', () => {
  it('Jeder gegen jeden: alle Paarungen genau einmal, ungerade mit Freilos', () => {
    for (const n of [3, 4, 5, 8]) {
      const t = createTournament(names(n), 'rr', 4);
      const real = t.matches.filter((m) => m.b !== null);
      expect(real).toHaveLength((n * (n - 1)) / 2);
      expect(new Set(real.map((m) => pairKey(m.a, m.b))).size).toBe(real.length);
      expect(t.rounds).toBe(n % 2 ? n : n - 1);
      // pro Runde spielt jeder höchstens einmal
      for (let r = 1; r <= t.rounds; r++) {
        const ids = t.matches.filter((m) => m.round === r).flatMap((m) => [m.a, m.b].filter(Boolean));
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it('Schweizer System: keine Wiederholungen, Freilos rotiert, Sieger steht oben', () => {
    let t = createTournament(names(7), 'swiss', 4);
    expect(t.rounds).toBe(3);
    while (!finished(t)) {
      t = playOpen(t);
      t = advance(t);
    }
    const real = t.matches.filter((m) => m.b !== null);
    expect(new Set(real.map((m) => pairKey(m.a, m.b))).size).toBe(real.length);
    const byes = t.matches.filter((m) => m.b === null).map((m) => m.a);
    expect(new Set(byes).size).toBe(byes.length);
    // P1 gewinnt jedes Spiel → ungeschlagen (Auslosung von Runde 1 ist zufällig)
    const p1 = standings(t).find((s) => s.player.name === 'P1')!;
    expect(p1.losses).toBe(0);
    expect(standings(t)[0]!.wins).toBe(3);
    expect(currentRound(t)).toBe(3);
  });

  it('Tabelle zählt Siege, Punkte und Freilos', () => {
    let t = createTournament(['A', 'B', 'C'], 'rr', 4);
    t = playOpen(t);
    const st = standings(t);
    expect(st.map((s) => s.player.name)).toEqual(['A', 'B', 'C']);
    // 3 Spieler, jeder hat genau ein Freilos (= Sieg)
    expect(st[0]!.wins).toBe(3);
    expect(st[0]!.pointsFor).toBe(8);
  });

  it('prüft Ergebnisse streng und lost nur auf Wunsch weiter', () => {
    expect(validResult(4, 4, 2)).toBe(true);
    expect(validResult(4, 6, 3)).toBe(true);
    expect(validResult(4, 5, 4)).toBe(false); // beide am Ziel
    expect(validResult(4, 4.5, 0)).toBe(false);
    expect(validResult(4, 3, 2)).toBe(false);
    expect(validResult(7, 9, 6)).toBe(true);
    let t = createTournament(names(4), 'swiss', 4);
    t = playOpen(t);
    expect(canAdvance(t)).toBe(true);
    expect(currentRound(t)).toBe(1);
    t = advance(t);
    expect(currentRound(t)).toBe(2);
  });

  it('speichert und lädt, kaputte Daten werden verworfen', () => {
    const t = createTournament(names(4), 'swiss', 7);
    saveTournament(t);
    expect(loadTournament()).toEqual(t);
    localStorage.setItem('bxplaner:tournament', '{"format":"x"}');
    expect(loadTournament()).toBeNull();
    saveTournament(null);
    expect(loadTournament()).toBeNull();
  });
});
