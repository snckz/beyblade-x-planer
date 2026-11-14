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
  /** true = vom Daten-Update automatisch zugeordnet (darf neu berechnet werden) */
  hasbroNameAuto?: boolean;
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
  /** Gewicht der Blade in g laut Wiki; null = nicht bekannt (scripts/update-weights.mjs) */
  weightG?: number | null;
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
  /** true = vom Daten-Update automatisch zugeordnet (darf neu berechnet werden) */
  hasbroNameAuto?: boolean;
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
  /** Japan-Release laut Wiki (YYYY-MM-DD), gesetzt von scripts/verify-catalog.mjs */
  releaseJp?: string;
  /** Japan-Verkaufspreis (Takara Tomy) in Yen laut Wiki; null = nicht gefunden */
  priceJpy?: number | null;
}

/** Euro-Referenzkurse: 1 € = JPY Yen = THB Baht */
export interface Rates {
  source: string;
  date: string;
  base: 'EUR';
  JPY: number;
  THB: number;
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

export type MetaTrend = 'top' | 'up' | 'down' | 'steady';

/** Turnier-Meta: Momentaufnahme gewinnender Kombos (public/data/meta.json) */
export interface MetaFeed {
  updatedAt: string;
  note: string;
  sources: { name: string; url: string }[];
  combos: { bladeId: string; ratchetId: string | null; bitId: string; note: string; trend: MetaTrend }[];
  /** Siegerdecks: je Kombo [Blade, Ratchet (null = integriert), Bit] */
  decks: { event: string; date: string; combos: [string, string | null, string][] }[];
  /** true = von scripts/update-meta.mjs erzeugt */
  auto?: boolean;
  decksTotal?: number;
  counts?: Record<string, number>;
}
