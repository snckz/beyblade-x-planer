// Typen zu release.js (gemeinsam für App und Datenpipeline)
import type { Database, Product } from './types';

export type PartKind = 'blades' | 'ratchets' | 'bits';
export type ReleaseStatus = 'announced' | 'unchecked' | 'confirmed';
export interface PartRelease {
  status: ReleaseStatus;
  reason: string;
  /** frühestes bekanntes Release-Datum, solange nicht erschienen */
  date: string | null;
}
export interface ProductRelease {
  released: boolean;
  reason: string;
  date: string | null;
  conflict: string | null;
}
export interface ReleaseIndex {
  today: string;
  conflicts: string[];
  product: (code: string) => ProductRelease;
  part: (kind: PartKind, id: string) => PartRelease;
  selectable: (kind: PartKind, id: string) => boolean;
  counts: () => Record<PartKind, Record<ReleaseStatus, number>>;
}

export const STATUS_LABEL: Record<ReleaseStatus, string>;
export function isoDay(d?: Date): string;
export function productRelease(p: Product, today?: string): ProductRelease;
export function buildReleaseIndex(db: Pick<Database, 'blades' | 'ratchets' | 'bits' | 'products'>, today?: string): ReleaseIndex;
export function lockedParts(index: ReleaseIndex, combo: { bladeId?: string; ratchetId?: string; bitId?: string }): { kind: PartKind; id: string }[];
