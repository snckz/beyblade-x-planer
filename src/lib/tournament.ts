import { newId } from './storage';

export interface Player {
  id: string;
  name: string;
}

export interface TMatch {
  id: string;
  round: number;
  a: string;
  /** null = Freilos für a */
  b: string | null;
  sa: number | null;
  sb: number | null;
}

export type Format = 'rr' | 'swiss';

export interface Tournament {
  format: Format;
  target: 4 | 7;
  players: Player[];
  matches: TMatch[];
  /** geplante Rundenanzahl */
  rounds: number;
  createdAt: string;
}

export interface Standing {
  player: Player;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Summe der Siege der Gegner (Feinwertung im Schweizer System) */
  buchholz: number;
}

const KEY = 'bxplaner:tournament';
export const MAX_PLAYERS = 16;

export const isDone = (m: TMatch) => m.b === null || (m.sa !== null && m.sb !== null);

/** Jeder gegen jeden (Kreis-Methode): n−1 Runden bei gerader, n Runden bei ungerader Spielerzahl. */
export function roundRobin(players: Player[]): TMatch[] {
  const ids: (string | null)[] = players.map((p) => p.id);
  if (ids.length % 2) ids.push(null);
  const n = ids.length;
  const out: TMatch[] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const x = ids[i]!;
      const y = ids[n - 1 - i]!;
      if (x === null && y === null) continue;
      const a = x ?? y!;
      const b = x === null ? null : y;
      out.push({ id: newId(), round: r + 1, a, b, sa: null, sb: null });
    }
    // alle außer dem ersten rotieren
    ids.splice(1, 0, ids.pop()!);
  }
  return out;
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export const swissRounds = (n: number) => Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));

export function createTournament(names: string[], format: Format, target: 4 | 7): Tournament {
  const players = names.map((name) => ({ id: newId(), name: name.trim() })).filter((p) => p.name);
  const t: Tournament = { format, target, players, matches: [], rounds: 0, createdAt: new Date().toISOString() };
  if (format === 'rr') {
    t.matches = roundRobin(players);
    t.rounds = Math.max(0, ...t.matches.map((m) => m.round));
  } else {
    t.rounds = swissRounds(players.length);
    t.matches = swissPairing(t, 1);
  }
  return t;
}

export function standings(t: Tournament): Standing[] {
  const s = new Map<string, Standing>(t.players.map((p) => [p.id, { player: p, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, buchholz: 0 }]));
  const opps = new Map<string, string[]>(t.players.map((p) => [p.id, []]));
  for (const m of t.matches) {
    const A = s.get(m.a);
    if (!A) continue;
    if (m.b === null) {
      A.wins++; // Freilos zählt als Sieg
      continue;
    }
    const B = s.get(m.b);
    if (!B || m.sa === null || m.sb === null) continue;
    A.played++;
    B.played++;
    A.pointsFor += m.sa;
    A.pointsAgainst += m.sb;
    B.pointsFor += m.sb;
    B.pointsAgainst += m.sa;
    if (m.sa > m.sb) {
      A.wins++;
      B.losses++;
    } else {
      B.wins++;
      A.losses++;
    }
    opps.get(m.a)!.push(m.b);
    opps.get(m.b)!.push(m.a);
  }
  for (const [id, st] of s) st.buchholz = opps.get(id)!.reduce((sum, o) => sum + (s.get(o)?.wins ?? 0), 0);
  return [...s.values()].sort(
    (x, y) =>
      y.wins - x.wins ||
      (t.format === 'swiss' ? y.buchholz - x.buchholz : 0) ||
      y.pointsFor - y.pointsAgainst - (x.pointsFor - x.pointsAgainst) ||
      y.pointsFor - x.pointsFor ||
      x.player.name.localeCompare(y.player.name, 'de'),
  );
}

/** Schweizer System: Gleichstarke gegeneinander, keine Wiederholungen; bei ungerader Zahl Freilos für den Schwächsten ohne Freilos. */
export function swissPairing(t: Tournament, round: number): TMatch[] {
  // Runde 1 wird ausgelost, danach nach Tabelle gepaart.
  const order = round === 1 ? shuffle(t.players.map((p) => p.id)) : standings(t).map((s) => s.player.id);
  const met = new Set<string>();
  const hadBye = new Set<string>();
  for (const m of t.matches) {
    if (m.b === null) hadBye.add(m.a);
    else met.add([m.a, m.b].sort().join('|'));
  }
  const out: TMatch[] = [];
  let pool = [...order];
  if (pool.length % 2) {
    const bye = [...pool].reverse().find((id) => !hadBye.has(id)) ?? pool[pool.length - 1]!;
    pool = pool.filter((id) => id !== bye);
    out.push({ id: newId(), round, a: bye, b: null, sa: null, sb: null });
  }
  const pair = (rest: string[]): [string, string][] | null => {
    if (!rest.length) return [];
    const [first, ...others] = rest;
    for (let i = 0; i < others.length; i++) {
      if (met.has([first!, others[i]!].sort().join('|'))) continue;
      const sub = pair([...others.slice(0, i), ...others.slice(i + 1)]);
      if (sub) return [[first!, others[i]!], ...sub];
    }
    return null;
  };
  // Geht es ohne Wiederholung nicht mehr (kleine Gruppen), nach Tabelle paaren.
  const pairs = pair(pool) ?? Array.from({ length: pool.length / 2 }, (_, i) => [pool[2 * i]!, pool[2 * i + 1]!] as [string, string]);
  for (const [a, b] of pairs) out.push({ id: newId(), round, a, b, sa: null, sb: null });
  return out;
}

/** Aktuelle Runde = erste Runde mit offenen Matches (oder die letzte, wenn alles gespielt ist). */
export function currentRound(t: Tournament): number {
  const open = t.matches.filter((m) => !isDone(m)).map((m) => m.round);
  return open.length ? Math.min(...open) : Math.max(0, ...t.matches.map((m) => m.round));
}

/** Nach einer fertigen Runde im Schweizer System: nächste auslosen. Gibt das Turnier unverändert zurück, wenn nichts zu tun ist. */
export function advance(t: Tournament): Tournament {
  if (t.format !== 'swiss' || t.matches.some((m) => !isDone(m))) return t;
  const last = Math.max(0, ...t.matches.map((m) => m.round));
  if (last >= t.rounds) return t;
  return { ...t, matches: [...t.matches, ...swissPairing(t, last + 1)] };
}

export const finished = (t: Tournament) => t.matches.length > 0 && t.matches.every(isDone) && Math.max(...t.matches.map((m) => m.round)) >= t.rounds;

/** Gültiges Endergebnis: ganze Zahlen, genau einer hat das Ziel erreicht (max. Ziel+2 durch einen Xtreme-Finish). */
export function validResult(target: number, a: number, b: number): boolean {
  return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && Math.min(a, b) < target && Math.max(a, b) >= target && Math.max(a, b) <= target + 2;
}

/** Schweizer System: Runde fertig und noch Runden übrig → „Nächste Runde auslosen“ anbieten. */
export const canAdvance = (t: Tournament) => t.format === 'swiss' && t.matches.every(isDone) && Math.max(0, ...t.matches.map((m) => m.round)) < t.rounds;

export function setResult(t: Tournament, matchId: string, sa: number | null, sb: number | null): Tournament {
  return { ...t, matches: t.matches.map((m) => (m.id === matchId ? { ...m, sa, sb } : m)) };
}

export function loadTournament(): Tournament | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Tournament | null;
    if (!raw || !Array.isArray(raw.players) || !Array.isArray(raw.matches) || (raw.format !== 'rr' && raw.format !== 'swiss')) return null;
    const ids = new Set(raw.players.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string').map((p) => p.id));
    const num = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
    const posInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0;
    const seen = new Set<string>();
    return {
      format: raw.format,
      target: raw.target === 7 ? 7 : 4,
      players: raw.players.filter((p) => ids.has(p.id)),
      matches: raw.matches
        .filter((m) => m && ids.has(m.a) && (m.b === null || ids.has(m.b)) && posInt(m.round))
        .map((m) => {
          // doppelte oder fehlende IDs neu vergeben, sonst ändert ein Ergebnis mehrere Matches
          const id = typeof m.id === 'string' && m.id && !seen.has(m.id) ? m.id : newId();
          seen.add(id);
          return { id, round: m.round, a: m.a, b: m.b, sa: num(m.sa), sb: num(m.sb) };
        }),
      rounds: posInt(raw.rounds) ? raw.rounds : 1,
      createdAt: String(raw.createdAt ?? ''),
    };
  } catch {
    return null;
  }
}

export function saveTournament(t: Tournament | null) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {
    /* Speicher voll/privat – Turnier läuft trotzdem weiter */
  }
}
