import type { Combo } from './types';
import { sanitizeMatches, type Match } from './matches';

export const STORAGE_KEY = 'bxplaner:v1';
const KEY = STORAGE_KEY;

export interface UserState {
  /** Produktcode → Anzahl im Besitz */
  owned: Record<string, number>;
  combos: Combo[];
  /** IDs aus combos, max. 3 */
  deck: string[];
  /** IDs gelesener News */
  seenNews: string[];
  /** Gegner-Deck für die Battle-Analyse (max. 3) */
  opponent: Combo[];
  /** Produktcodes auf der Wunschliste */
  wishlist: string[];
  /** gelernte Zuordnung Barcode (EAN/JAN) → Produktcode */
  barcodes: Record<string, string>;
  /** eingetragene Kämpfe (Battle-Tagebuch) */
  matches: Match[];
  /** Anzeige-Einstellungen */
  prefs: Prefs;
  /** im Laden gesehene Preise (Einkaufsmodus): Produktcode → Betrag + Währung */
  shopPrices: Record<string, ShopPrice>;
}

export interface ShopPrice {
  amount: number;
  cur: 'THB' | 'EUR';
}

export interface Prefs {
  /** Hasbro-Namen (wie auf europäischen Packungen) statt japanischer Takara-Tomy-Namen */
  hasbroNames: boolean;
}

export const EMPTY_STATE: UserState = { owned: {}, combos: [], deck: [], seenNews: [], opponent: [], wishlist: [], barcodes: {}, matches: [], prefs: { hasbroNames: false }, shopPrices: {} };

/** Nur gültige Stückzahlen behalten – ein kaputter Eintrag löscht nicht mehr die ganze Sammlung. */
function validCounts(v: object): Record<string, number> {
  return Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n > 0).map(([k, n]) => [k, Math.floor(n as number)]));
}

/** Robust gegen kaputte oder veraltete Daten im Speicher. */
/**
 * Alte Produktcodes, die durch genauere ersetzt wurden. Wer den alten Eintrag hatte, bekommt die neuen
 * (z. B. das Hasbro Xtreme Battle Set als zwei Kreisel statt eines Eintrags ohne Kreisel).
 */
const LEGACY_CODES: Record<string, string[]> = { 'HAS-XBS': ['F9588-01', 'F9588-02'] };

function migrateCodes(owned: Record<string, number>): Record<string, number> {
  const out = { ...owned };
  for (const [old, next] of Object.entries(LEGACY_CODES)) {
    const n = out[old];
    if (!n) continue;
    delete out[old];
    for (const c of next) out[c] = Math.max(out[c] ?? 0, n);
  }
  return out;
}
const migrateList = (list: string[]) => [...new Set(list.flatMap((c) => LEGACY_CODES[c] ?? [c]))];

export function sanitize(raw: unknown): UserState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STATE };
  const r = raw as Partial<UserState>;
  const isCombo = (c: unknown): c is Combo => {
    const x = c as Combo;
    return !!x && typeof x.id === 'string' && typeof x.bladeId === 'string' && typeof x.bitId === 'string';
  };
  const combos = Array.isArray(r.combos) ? r.combos.filter(isCombo) : [];
  const ids = new Set(combos.map((c) => c.id));
  return {
    owned: r.owned && typeof r.owned === 'object' ? migrateCodes(validCounts(r.owned)) : {},
    combos,
    deck: Array.isArray(r.deck) ? [...new Set(r.deck.filter((id) => typeof id === 'string' && ids.has(id)))].slice(0, 3) : [],
    seenNews: Array.isArray(r.seenNews) ? r.seenNews.filter((s) => typeof s === 'string') : [],
    opponent: Array.isArray(r.opponent) ? r.opponent.filter(isCombo).slice(0, 3) : [],
    wishlist: migrateList(Array.isArray(r.wishlist) ? [...new Set(r.wishlist.filter((s) => typeof s === 'string'))] : []),
    barcodes: r.barcodes && typeof r.barcodes === 'object' ? Object.fromEntries(Object.entries(r.barcodes).filter(([k, v]) => /^\d{8,14}$/.test(k) && typeof v === 'string')) : {},
    matches: sanitizeMatches(r.matches),
    prefs: { hasbroNames: !!(r.prefs && typeof r.prefs === 'object' && (r.prefs as Prefs).hasbroNames === true) },
    shopPrices:
      r.shopPrices && typeof r.shopPrices === 'object'
        ? Object.fromEntries(
            Object.entries(r.shopPrices as Record<string, ShopPrice>)
              .filter(([, v]) => !!v && typeof v === 'object' && Number.isFinite(v.amount) && v.amount > 0 && v.amount < 1e6 && (v.cur === 'THB' || v.cur === 'EUR'))
              .map(([k, v]) => [k, { amount: v.amount, cur: v.cur }]),
          )
        : {},
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
  // Nur Sicherungen dieser App annehmen – eine fremde JSON-Datei würde sonst alles durch einen leeren Stand ersetzen.
  const r = parsed as Record<string, unknown> | null;
  const known = !!r && typeof r === 'object' && !Array.isArray(r) && (r.app === 'beyblade-x-planer' || ['owned', 'combos', 'deck', 'wishlist'].some((k) => k in r));
  if (!known) throw new Error('keine X-Planer-Sicherung');
  return sanitize(parsed);
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
