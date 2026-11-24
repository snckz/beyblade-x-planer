import { tr, NUM_LOCALE } from './i18n';
import type { Ratchet } from './types';

/**
 * Suche und Filter der Ratchet-Auswahl. Alle Werte kommen aus den Daten (contacts, heightMm) –
 * keine erfundenen Kategorien. Sonderformen (0-70, M-85 …) haben keine Zackenzahl und bilden eine eigene Gruppe.
 */
export type TeethGroup = '' | 'low' | 'mid' | 'high' | 'special';

export const TEETH_GROUPS: { id: Exclude<TeethGroup, ''>; value: string; caption: string; test: (r: Ratchet) => boolean }[] = [
  { id: 'low', value: '1–3', caption: tr('Zacken'), test: (r) => r.contacts != null && r.contacts >= 1 && r.contacts <= 3 },
  { id: 'mid', value: '4–5', caption: tr('Zacken'), test: (r) => r.contacts != null && r.contacts >= 4 && r.contacts <= 5 },
  { id: 'high', value: '6+', caption: tr('Zacken'), test: (r) => r.contacts != null && r.contacts >= 6 },
  { id: 'special', value: '0 / M', caption: tr('Sonderform'), test: (r) => r.contacts == null || r.contacts === 0 },
];

/** Gruppen, in denen es überhaupt Ratchets gibt (z. B. keine Sonderform-Gruppe ohne Sonderformen). */
export const teethGroups = (ratchets: Ratchet[]) => TEETH_GROUPS.filter((g) => ratchets.some(g.test));

/** Vorhandene Höhen, aufsteigend (ohne Ratchets ohne Höhenangabe). */
export const ratchetHeights = (ratchets: Ratchet[]): number[] =>
  [...new Set(ratchets.map((r) => r.heightMm).filter((h): h is number => typeof h === 'number'))].sort((a, b) => a - b);

/** Höhe mit deutschem Komma, z. B. „6,0 mm“. */
export const heightLabel = (mm: number) => `${mm.toLocaleString(NUM_LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/**
 * Passt der Ratchet zur Suche? Vollständiger Code oder Teil davon, ohne Groß-/Kleinschreibung,
 * auch ohne Bindestrich oder mit Leerzeichen („3-60“, „360“, „3 60“, „-60“, „m-8“).
 */
export function matchRatchetQuery(r: Ratchet, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  const id = norm(r.id);
  return id.includes(q) || id.replace(/-/g, '').includes(q.replace(/-/g, ''));
}

export function filterRatchets(ratchets: Ratchet[], { query = '', teeth = '' as TeethGroup, height = null as number | null }): Ratchet[] {
  const group = TEETH_GROUPS.find((g) => g.id === teeth);
  return ratchets.filter((r) => (!group || group.test(r)) && (height == null || r.heightMm === height) && matchRatchetQuery(r, query));
}
