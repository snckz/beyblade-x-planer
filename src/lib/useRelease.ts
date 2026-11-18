import { buildReleaseIndex, isoDay, type ReleaseIndex } from './release';
import type { Database } from './types';

// Ein Index je Datenbank und Tag – alle Komponenten teilen ihn (keine eigene Freigabelogik in der Oberfläche).
const cache = new WeakMap<Database, ReleaseIndex>();

/** Freigabestatus für diese Datenbank (heute). Zentrale Stelle für Kombo-Planer, Lexikon, Steckbrief und Battle. */
export function releaseOf(db: Database): ReleaseIndex {
  const today = isoDay();
  let idx = cache.get(db);
  if (!idx || idx.today !== today) {
    idx = buildReleaseIndex(db, today);
    cache.set(db, idx);
  }
  return idx;
}

/** Nur die im Kombo-Planer wählbaren Teile (Status „freigegeben“). */
export function playableParts(db: Database) {
  const r = releaseOf(db);
  return {
    blades: db.blades.filter((b) => r.selectable('blades', b.id)),
    ratchets: db.ratchets.filter((x) => r.selectable('ratchets', x.id)),
    bits: db.bits.filter((b) => r.selectable('bits', b.id)),
  };
}
