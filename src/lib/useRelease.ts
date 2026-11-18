import { buildReleaseIndex, isoDay, type ReleaseIndex } from './release';
import type { Database, MetaFeed } from './types';
import { useApp } from './context';

// Ein Index je Datenbank, Turnier-Meta und Tag – alle Komponenten teilen ihn (keine eigene Freigabelogik in der Oberfläche).
const cache = new WeakMap<Database, { today: string; meta: MetaFeed | null; idx: ReleaseIndex }>();

/** Freigabestatus für diese Datenbank (heute). Zentrale Stelle für Kombo-Planer, Lexikon, Steckbrief und Battle. */
export function releaseOf(db: Database, meta: MetaFeed | null = null): ReleaseIndex {
  const today = isoDay();
  const hit = cache.get(db);
  if (hit && hit.today === today && hit.meta === meta) return hit.idx;
  const idx = buildReleaseIndex(db, today, meta);
  cache.set(db, { today, meta, idx });
  return idx;
}

/** Nur die im Kombo-Planer wählbaren Teile (Status „freigegeben“). */
export function playableParts(db: Database, rel: ReleaseIndex = releaseOf(db)) {
  return {
    blades: db.blades.filter((b) => rel.selectable('blades', b.id)),
    ratchets: db.ratchets.filter((x) => rel.selectable('ratchets', x.id)),
    bits: db.bits.filter((b) => rel.selectable('bits', b.id)),
  };
}

/** Hook: Freigabestatus mit der geladenen Turnier-Meta (aus dem App-Kontext). */
export function useRelease(db: Database) {
  const { meta } = useApp();
  const rel = releaseOf(db, meta);
  return { rel, play: playableParts(db, rel) };
}
