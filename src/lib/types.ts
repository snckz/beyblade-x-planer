export type BeyType = 'attack' | 'defense' | 'stamina' | 'balance';
export type Spin = 'right' | 'left' | 'both';
export type Line = 'BX' | 'UX' | 'CX';
export type ProductKind =
  | 'starter'
  | 'booster'
  | 'random-booster'
  | 'set'
  | 'stadium'
  | 'launcher'
  | 'other';

export interface Blade {
  id: string;
  name: string;
  /** Westlicher Hasbro-Name, falls abweichend */
  hasbroName?: string;
  line: Line;
  type: BeyType;
  spin: Spin;
  /** UX-Blades mit eingebautem Ratchet (z. B. Glory Valkyrie, Bullet Griffon) */
  integratedRatchet?: boolean;
  note?: string;
  verified: boolean;
  /** erzwingt eine bestimmte Beyblade-Wiki-Seite für das Bild */
  wikiTitle?: string;
  /** automatisch aus dem Beyblade Wiki übernommen (scripts/import-catalog.mjs) */
  imported?: boolean;
}

export interface Ratchet {
  /** z. B. "3-60" – Zacken-Höhe(x0,1 mm) */
  id: string;
  /** Anzahl der Zacken/Kontaktpunkte; null bei Sonderformen */
  contacts: number | null;
  /** Höhe in mm */
  heightMm: number | null;
  note?: string;
  imported?: boolean;
}

export interface Bit {
  /** Kürzel, z. B. "LF" */
  id: string;
  name: string;
  type: BeyType;
  /** true, wenn Typ-Zuordnung nicht gesichert ist */
  uncertain?: boolean;
  note?: string;
  /** erzwingt eine bestimmte Beyblade-Wiki-Seite für das Bild */
  wikiTitle?: string;
  imported?: boolean;
}

export type Rarity = 'standard' | 'random' | 'limited' | 'ultra';

export interface Product {
  code: string;
  name: string;
  hasbroName?: string;
  kind: ProductKind;
  bladeId?: string;
  ratchetId?: string;
  bitId?: string;
  /** Gewicht des kompletten Kreisels in g, nur wenn belegt */
  weightG?: number;
  includesLauncher?: boolean;
  note?: string;
  verified: boolean;
  source?: string;
  /** überschreibt die automatisch abgeleitete Seltenheit */
  rarity?: Rarity;
  imported?: boolean;
}

export interface Database {
  version: number;
  updatedAt: string;
  blades: Blade[];
  ratchets: Ratchet[];
  bits: Bit[];
  products: Product[];
}

export interface NewsItem {
  id: string;
  code?: string;
  title: string;
  url: string;
  foundAt: string;
  source: string;
}

export interface NewsFeed {
  updatedAt: string | null;
  lastRunOk: boolean;
  items: NewsItem[];
}

export interface Combo {
  id: string;
  name?: string;
  bladeId: string;
  ratchetId?: string;
  bitId: string;
}

export interface WikiImage {
  thumb: string;
  page: string;
  title: string;
}

export interface ImageIndex {
  source: string;
  blades: Record<string, WikiImage>;
  bits?: Record<string, WikiImage>;
  ratchets?: Record<string, WikiImage>;
}

export type EventKind = 'release' | 'tournament' | 'event';

export interface BeyEvent {
  id: string;
  kind: EventKind;
  /** YYYY-MM-DD */
  date: string;
  endDate?: string;
  title: string;
  place?: string;
  country?: string;
  url?: string;
  note?: string;
  bladeId?: string;
  confirmed: boolean;
}

export interface EventFeed {
  updatedAt: string;
  events: BeyEvent[];
}
