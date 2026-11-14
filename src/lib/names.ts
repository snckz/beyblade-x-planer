import type { Blade, Database, Product } from './types';

// Zentrale Namens-Einstellung: Takara Tomy (Japan) oder Hasbro (Europa/USA).
// Wird von App.tsx bei jedem Rendern gesetzt, bevor die Kinder rendern.
let hasbro = false;
export const setHasbroNames = (on: boolean) => {
  hasbro = on;
};

/** Anzeigename einer Blade nach Einstellung; ohne bekannten Hasbro-Namen bleibt der japanische. */
export const displayName = (b: Pick<Blade, 'name' | 'hasbroName'>) => (hasbro && b.hasbroName ? b.hasbroName : b.name);

/** Der jeweils andere Name (für Untertitel), falls vorhanden. */
export const otherName = (b: Pick<Blade, 'name' | 'hasbroName'>) => (!b.hasbroName ? null : hasbro ? `Japan: ${b.name}` : `Hasbro: ${b.hasbroName}`);

/** Produktname mit dem Blade-Namen nach Einstellung: „Starter Dran Sword 3-60F“ → „Starter Sword Dran 3-60F“. */
export function displayProductName(p: Product, db: Pick<Database, 'blades'>): string {
  if (!hasbro || !p.bladeId) return p.name;
  const b = db.blades.find((x) => x.id === p.bladeId);
  if (!b?.hasbroName) return p.name;
  return p.name.includes(b.name) ? p.name.replace(b.name, b.hasbroName) : p.name.replace(b.id, b.hasbroName);
}
