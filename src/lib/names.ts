import type { Blade, Database, Product } from './types';

// Namen: Überall der englische Hasbro-Name (wie auf den Packungen in Europa/USA), falls es einen gibt.
// Der japanische Takara-Tomy-Name (wie im Wiki und in Turnierlisten) steht daneben.

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(' ');
/** Gibt es einen abweichenden Hasbro-Namen? */
const hasOther = (b: Pick<Blade, 'name' | 'hasbroName'>) => !!b.hasbroName && b.hasbroName !== b.name;

/** Anzeigename einer Blade: Hasbro-Name, sonst Takara-Name. */
export const displayName = (b: Pick<Blade, 'name' | 'hasbroName'>) => (hasOther(b) ? b.hasbroName! : b.name);

/** Takara-Name als Untertitel, falls er sich unterscheidet: „Japan: Wizard Rod“. */
export const otherName = (b: Pick<Blade, 'name' | 'hasbroName'>) => (hasOther(b) ? `Japan: ${b.name}` : null);

/** Beide Namen in einer Zeile: „Wand Wizard · Wizard Rod“ (gleiche Wörter → nur einer). */
export const bothNames = (b: Pick<Blade, 'name' | 'hasbroName'>) => (hasOther(b) && words(b.hasbroName!) !== words(b.name) ? `${b.hasbroName} · ${b.name}` : displayName(b));

/** Produktname: Takara-Produkte mit Takara-Namen, Hasbro-Packungen mit ihrem Hasbro-Namen. */
export function displayProductName(p: Product, db?: Pick<Database, 'blades'>): string {
  void db; // Signatur bleibt für Aufrufer gleich
  return p.name;
}

/** Hersteller der Packung zum Erkennen: „Hasbro“ oder „Takara Tomy“. */
export const regionLabel = (p: Pick<Product, 'region'>) => (p.region === 'hasbro' ? 'Hasbro' : 'Takara Tomy');
