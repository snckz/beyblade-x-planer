import type { BeyEvent, Database, Product } from './types';
import type { UserState } from './storage';
import { daysUntil } from './data';

export interface WishRelease {
  product: Product;
  date: string;
  /** Tage bis zum Release (negativ = schon erschienen) */
  days: number;
  status: 'upcoming' | 'new';
}

/** Japan-Release eines Produkts: aus der Datenbank, sonst aus einem Release-Termin mit derselben Blade. */
export function releaseDate(p: Product, events: BeyEvent[]): string | null {
  if (p.releaseJp) return p.releaseJp;
  const ev = events.find((e) => e.kind === 'release' && e.bladeId && e.bladeId === p.bladeId);
  return ev?.date ?? null;
}

/** Wunschliste mit bevorstehenden oder gerade (≤ 21 Tage) erschienenen Releases. */
export function wishReleases(db: Database, state: UserState, events: BeyEvent[], today = new Date()): WishRelease[] {
  const out: WishRelease[] = [];
  for (const code of state.wishlist) {
    const p = db.products.find((x) => x.code === code);
    if (!p) continue;
    const date = releaseDate(p, events);
    if (!date) continue;
    const days = daysUntil(date, today);
    if (days >= 0) out.push({ product: p, date, days, status: 'upcoming' });
    else if (days >= -21) out.push({ product: p, date, days, status: 'new' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
