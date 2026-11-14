import type { Blade, Database, Product } from './types';

// Namen: Überall der Takara-Tomy-Name (wie im Wiki und in Turnierlisten), der Hasbro-Name steht daneben.
// Hasbro-Packungen tragen ihren eigenen Namen (z. B. „Booster Dagger Dran 4-70Q“).

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(' ');
/** Hasbro-Name nur, wenn er sich wirklich unterscheidet (nicht bloß umgedreht: „Dran Sword“ ↔ „Sword Dran“ zählt trotzdem). */
const hasOther = (b: Pick<Blade, 'name' | 'hasbroName'>) => !!b.hasbroName && b.hasbroName !== b.name;

/** Anzeigename einer Blade (Takara Tomy). */
export const displayName = (b: Pick<Blade, 'name' | 'hasbroName'>) => b.name;

/** Hasbro-Name als Untertitel, falls vorhanden: „Hasbro: Wand Wizard“. */
export const otherName = (b: Pick<Blade, 'name' | 'hasbroName'>) => (hasOther(b) ? `Hasbro: ${b.hasbroName}` : null);

/** Beide Namen in einer Zeile: „Wizard Rod · Wand Wizard“ (gleiche Wörter → nur einer). */
export const bothNames = (b: Pick<Blade, 'name' | 'hasbroName'>) => (hasOther(b) && words(b.hasbroName!) !== words(b.name) ? `${b.name} · ${b.hasbroName}` : b.name);

/** Produktname: Takara-Produkte mit Takara-Namen, Hasbro-Packungen mit ihrem Hasbro-Namen. */
export function displayProductName(p: Product, db?: Pick<Database, 'blades'>): string {
  void db; // Signatur bleibt für Aufrufer gleich
  return p.name;
}

/** Hersteller der Packung zum Erkennen: „Hasbro“ oder „Takara Tomy“. */
export const regionLabel = (p: Pick<Product, 'region'>) => (p.region === 'hasbro' ? 'Hasbro' : 'Takara Tomy');
