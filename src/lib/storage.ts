import type { Combo } from './types';

const KEY = 'bxplaner:v1';

export interface UserState {
  /** Produktcode → Anzahl im Besitz */
  owned: Record<string, number>;
  combos: Combo[];
  /** IDs aus combos, max. 3 */
  deck: string[];
  /** IDs gelesener News */
  seenNews: string[];
}

export const EMPTY_STATE: UserState = { owned: {}, combos: [], deck: [], seenNews: [] };

function isRecordOfNumbers(v: unknown): v is Record<string, number> {
  return !!v && typeof v === 'object' && Object.values(v).every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
}

/** Robust gegen kaputte oder veraltete Daten im Speicher. */
export function sanitize(raw: unknown): UserState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STATE };
  const r = raw as Partial<UserState>;
  const combos = Array.isArray(r.combos)
    ? r.combos.filter((c): c is Combo => !!c && typeof c.id === 'string' && typeof c.bladeId === 'string' && typeof c.bitId === 'string')
    : [];
  const ids = new Set(combos.map((c) => c.id));
  return {
    owned: isRecordOfNumbers(r.owned) ? r.owned : {},
    combos,
    deck: Array.isArray(r.deck) ? r.deck.filter((id) => typeof id === 'string' && ids.has(id)).slice(0, 3) : [],
    seenNews: Array.isArray(r.seenNews) ? r.seenNews.filter((s) => typeof s === 'string') : [],
  };
}

export function loadState(): UserState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : { ...EMPTY_STATE };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function saveState(state: UserState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportState(state: UserState): string {
  return JSON.stringify({ app: 'beyblade-x-planer', version: 1, ...state }, null, 2);
}

export function importState(text: string): UserState {
  const parsed = JSON.parse(text) as unknown;
  return sanitize(parsed);
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
