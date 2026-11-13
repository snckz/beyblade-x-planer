import type { Database, NewsFeed, Product } from './types';

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

export function searchProducts(products: Product[], query: string): Product[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return products;
  return products.filter((p) =>
    [p.code, p.name, p.hasbroName ?? '', p.bladeId ?? ''].some((s) => s.toLowerCase().replace(/\s+/g, '').includes(q)),
  );
}
