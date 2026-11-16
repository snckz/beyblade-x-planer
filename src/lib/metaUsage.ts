import type { Database, MetaFeed } from './types';
import { displayName } from './names';

export type PartKind = 'blade' | 'ratchet' | 'bit';

export interface MetaUsage {
  kind: PartKind;
  id: string;
  /** Anzeigename des Teils */
  name: string;
  /** in so vielen Siegerdecks kommt das Teil vor (Teile sind pro Deck nie doppelt) */
  decks: number;
  /** Anteil an allen Siegerdecks (0 … 1) */
  share: number;
  /** meistgespielte Kombo mit diesem Teil */
  top: { bladeId: string; ratchetId: string | null; bitId: string; decks: number } | null;
}

/** Ab diesem Anteil an Siegerdecks gilt ein Teil als Top im Turnier. */
export const META_TOP = 0.15;
/** Ab diesem Anteil wird ein Teil im Turnier regelmäßig gespielt. */
export const META_SEEN = 0.05;

type Key = [string, string | null, string];
const parseKey = (k: string): Key => {
  const [b = '', r = '', t = ''] = k.split('|');
  return [b, r || null, t];
};

/** Wie oft steckt ein Teil in den Siegerdecks? Ohne Zähldaten (alte meta.json) gibt es kein Ergebnis. */
export function metaUsage(db: Pick<Database, 'blades' | 'bits'>, meta: MetaFeed | null | undefined, kind: PartKind, id: string): MetaUsage | null {
  const total = meta?.decksTotal ?? 0;
  if (!meta?.counts || total <= 0) return null;
  const idx = kind === 'blade' ? 0 : kind === 'ratchet' ? 1 : 2;
  let decks = 0;
  let top: MetaUsage['top'] = null;
  for (const [k, n] of Object.entries(meta.counts)) {
    const key = parseKey(k);
    if (key[idx] !== id) continue;
    decks += n;
    if (!top || n > top.decks) top = { bladeId: key[0], ratchetId: key[1], bitId: key[2], decks: n };
  }
  return { kind, id, name: partName(db, kind, id), decks: Math.min(decks, total), share: Math.min(1, decks / total), top };
}

export function partName(db: Pick<Database, 'blades' | 'bits'>, kind: PartKind, id: string): string {
  if (kind === 'blade') {
    const b = db.blades.find((x) => x.id === id);
    return b ? displayName(b) : id;
  }
  if (kind === 'bit') {
    const b = db.bits.find((x) => x.id === id);
    return b ? `Bit ${b.name} (${id})` : `Bit ${id}`;
  }
  return `Ratchet ${id}`;
}

/** „Glory Valkerion K“ – Kombo so geschrieben, wie man sie im Turnier ansagt. */
export function comboName(db: Pick<Database, 'blades'>, c: { bladeId: string; ratchetId: string | null; bitId: string }): string {
  const b = db.blades.find((x) => x.id === c.bladeId);
  return `${b ? displayName(b) : c.bladeId} ${c.ratchetId ?? ''}${c.bitId}`;
}

export const pct = (share: number) => `${Math.round(share * 100)} %`;
