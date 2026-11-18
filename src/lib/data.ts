import { groupKey } from './price';
import type { Blade, Database, EventFeed, ImageIndex, MetaFeed, NewsFeed, Product, Rates } from './types';
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

/** Was man mit einem Kauf bekommt: bei Sets alle Kreisel des Sets, sonst nur das eine Produkt. */
export function purchaseCodes(products: Product[], p: Product): string[] {
  if (p.kind !== 'set') return [p.code];
  const k = groupKey(p);
  const list = products.filter((x) => x.kind === 'set' && groupKey(x) === k).map((x) => x.code);
  return list.length ? list : [p.code];
}
