import { groupKey } from './price';
import { normalizeGtin, validGtin } from './barcode';
import type { BarcodeFeed, Blade, Database, EventFeed, ImageIndex, MetaFeed, NewsFeed, Product, Rates } from './types';
import { normalizeRegister, type IdRegister } from './idRegister';

const base = import.meta.env.BASE_URL;

async function getJson<T>(file: string): Promise<T> {
  // no-cache: Browser fragt neu nach, Service Worker liefert offline die letzte Version.
  const res = await fetch(`${base}data/${file}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function loadDatabase(): Promise<Database> {
  return getJson<Database>('db.json');
}

export async function loadNews(): Promise<NewsFeed> {
  try {
    return await getJson<NewsFeed>('news.json');
  } catch {
    return { updatedAt: null, lastRunOk: false, items: [] };
  }
}

export async function loadImages(): Promise<ImageIndex> {
  try {
    return await getJson<ImageIndex>('images.json');
  } catch {
    return { source: '', blades: {} };
  }
}

/** Zentrales ID-Register (Schreibweisen, umbenannte und alte IDs). Fehlt es: nichts umzuleiten. */
export async function loadIdRegister(): Promise<IdRegister> {
  try {
    return normalizeRegister(await getJson<unknown>('aliases.json'));
  } catch {
    return normalizeRegister({});
  }
}

export async function loadEvents(): Promise<EventFeed> {
  try {
    return await getJson<EventFeed>('events.json');
  } catch {
    return { updatedAt: '', events: [] };
  }
}

export async function loadMeta(): Promise<MetaFeed | null> {
  try {
    return await getJson<MetaFeed>('meta.json');
  } catch {
    return null;
  }
}

/** Mitgelieferte Barcode-Liste. Fehlt sie (offline, alter Stand), bleibt es beim Zuordnen von Hand. */
export async function loadBarcodes(): Promise<BarcodeFeed> {
  try {
    const f = await getJson<BarcodeFeed>('barcodes.json');
    return f && typeof f.barcodes === 'object' && f.barcodes ? f : { barcodes: {} };
  } catch {
    return { barcodes: {} };
  }
}

/** Produkt zu einer Packungsnummer: die Nummer selbst, bei Sets sonst der erste Eintrag der Packung (G0197 → G0197-01). */
export function packProduct(products: Product[], pack: string): Product | undefined {
  // Random Booster ausgenommen: Ihr Barcode sagt nicht, welcher Kreisel drin ist.
  return products.find((p) => p.code === pack && p.kind !== 'random-booster') ?? products.find((p) => p.kind === 'set' && groupKey(p) === pack);
}

/**
 * Mitgelieferte Barcodes als Zuordnung Barcode → Produktcode, wie sie die App auch für selbst gelernte führt.
 * Ungültige Barcodes (Prüfziffer) und Nummern, die es in der Datenbank nicht gibt, fallen weg.
 */
export function knownBarcodes(feed: BarcodeFeed | null | undefined, products: Product[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [raw, entry] of Object.entries(feed?.barcodes ?? {})) {
    if (!validGtin(raw) || typeof entry?.product !== 'string') continue;
    const p = packProduct(products, entry.product);
    if (p) out[normalizeGtin(raw)] = p.code;
  }
  return out;
}

export async function loadRates(): Promise<Rates | null> {
  try {
    const r = await getJson<Rates>('rates.json');
    return r && r.JPY > 0 && r.THB > 0 ? r : null;
  } catch {
    return null;
  }
}

/** Tage bis zu einem Datum (YYYY-MM-DD), lokal gerechnet; negativ = vorbei. */
export function daysUntil(date: string, today = new Date()): number {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(y!, m! - 1, d!);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

/** Teile, die durch die Sammlung (gekaufte Produkte) verfügbar sind, mit Anzahl. */
export function ownedParts(db: Database, owned: Record<string, number>) {
  const blades = new Map<string, number>();
  const ratchets = new Map<string, number>();
  const bits = new Map<string, number>();
  const add = (m: Map<string, number>, id: string | undefined, n: number) => {
    if (id) m.set(id, (m.get(id) ?? 0) + n);
  };
  for (const p of db.products) {
    const n = owned[p.code] ?? 0;
    if (n <= 0) continue;
    add(blades, p.bladeId, n);
    add(ratchets, p.ratchetId, n);
    add(bits, p.bitId, n);
  }
  return { blades, ratchets, bits };
}

/** Suche nach Code, Name und Blade – auch mit Hasbro-Namen („Sword Dran“), wenn die Blades übergeben werden. */
export function searchProducts(products: Product[], query: string, blades: Blade[] = []): Product[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return products;
  const hasbro = new Map(blades.filter((b) => b.hasbroName).map((b) => [b.id, b.hasbroName!]));
  return products.filter((p) =>
    [p.code, p.name, p.hasbroName ?? '', p.bladeId ?? '', hasbro.get(p.bladeId ?? '') ?? ''].some((s) => s.toLowerCase().replace(/\s+/g, '').includes(q)),
  );
}

/** Alle Einträge eines Kaufs: bei Sets jeder Kreisel und jedes lose Teil der Packung, sonst nur das eine Produkt. */
export function purchaseProducts(products: Product[], p: Product): Product[] {
  if (p.kind !== 'set') return [p];
  const k = groupKey(p);
  const list = products.filter((x) => x.kind === 'set' && groupKey(x) === k);
  return list.length ? list : [p];
}

/** Was man mit einem Kauf bekommt: bei Sets alle Einträge des Sets, sonst nur das eine Produkt. */
export const purchaseCodes = (products: Product[], p: Product): string[] => purchaseProducts(products, p).map((x) => x.code);

/**
 * Inhalt einer Packung in Worten: „2 Kreisel“ – oder „3 Kreisel + 3 Teile“, wenn ein Set neben den Kreiseln
 * auch lose Ratchets und Bits enthält (Einträge ohne Blade).
 */
export function contentLabel(items: Pick<Product, 'bladeId' | 'ratchetId' | 'bitId'>[]): string {
  const beys = items.filter((p) => p.bladeId).length;
  const loose = items.filter((p) => !p.bladeId).reduce((n, p) => n + (p.ratchetId ? 1 : 0) + (p.bitId ? 1 : 0), 0);
  const parts = [beys ? `${beys} Kreisel` : '', loose ? `${loose} ${loose === 1 ? 'Teil' : 'Teile'}` : ''].filter(Boolean);
  return parts.join(' + ');
}
