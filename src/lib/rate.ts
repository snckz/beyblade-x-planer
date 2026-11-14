import type { Database, Product, Rates } from './types';
import type { Bey } from './battle';
import type { ShopPrice } from './storage';
import { deckValue, type Candidate, type PartPool, type ScoreCache } from './optimizer';
import { ownedParts } from './data';
import { shopVerdict, type Verdict } from './price';

export type Overall = 'buy' | 'maybe' | 'skip';

export interface Rating {
  owned: number;
  /** neue Teile (Anzahl) */
  fresh: number;
  /** Verbesserung des besten Decks in Punkten */
  gain: number;
  deck: Candidate[];
  price: { verdict: Verdict; ratio: number } | null;
  overall: Overall;
  reasons: string[];
}

export const OVERALL_LABEL: Record<Overall, string> = { buy: 'Zuschlagen', maybe: 'Kann man machen', skip: 'Lieber nicht' };

/** Preis-Ampel auf eine Gewinn-Einschätzung anwenden (gleiche Regel für Einzelkauf und Random Booster). */
export function judge(gain: number, pv: { verdict: Verdict } | null): Overall {
  const strong = gain >= 8;
  const some = gain >= 2;
  if (strong) return pv?.verdict === 'high' ? 'maybe' : 'buy';
  if (some) return pv?.verdict === 'good' ? 'buy' : pv?.verdict === 'high' ? 'skip' : 'maybe';
  return pv?.verdict === 'good' ? 'maybe' : 'skip';
}

/**
 * Wie viel bringt dieser Kauf mir – und passt der Preis? Ein Set wird als Ganzes bewertet
 * (alle Kreisel des Sets übergeben), die Teile zählen dann zusammen.
 */
export function rateProduct(
  db: Database,
  owned: Record<string, number>,
  opponents: Bey[],
  item: Product | Product[],
  price: ShopPrice | null,
  rates: Rates | null,
  cache: ScoreCache = new Map(),
): Rating {
  const items = Array.isArray(item) ? item : [item];
  const p = items[0]!;
  const op = ownedParts(db, owned);
  const pool: PartPool = { blades: [...op.blades.keys()], ratchets: [...op.ratchets.keys()], bits: [...op.bits.keys()] };
  const add = (list: string[], id?: string) => (id && !list.includes(id) ? [...list, id] : list);
  let after = pool;
  let fresh = 0;
  for (const x of items) {
    if (x.bladeId && !after.blades.includes(x.bladeId)) fresh++;
    if (x.ratchetId && !after.ratchets.includes(x.ratchetId)) fresh++;
    if (x.bitId && !after.bits.includes(x.bitId)) fresh++;
    after = { blades: add(after.blades, x.bladeId), ratchets: add(after.ratchets, x.ratchetId), bits: add(after.bits, x.bitId) };
  }
  const hasParts = items.some((x) => x.bladeId || x.ratchetId || x.bitId);
  const base = deckValue(db, pool, opponents, cache).value;
  const res = deckValue(db, after, opponents, cache);
  const gain = Math.max(0, res.value - base);
  const pv = price ? shopVerdict(price.amount, price.cur, p.priceJpy, rates) : null;
  // „Hast du schon“ erst, wenn alles aus dem Kauf da ist
  const n = Math.min(...items.map((x) => owned[x.code] ?? 0));

  const reasons: string[] = [];
  let overall: Overall;
  if (!hasParts) {
    overall = 'maybe';
    reasons.push('Zu dieser Packung fehlen noch die Teile-Daten – den Nutzen fürs Deck kann ich nicht berechnen.');
    if (pv) reasons.push(pv.verdict === 'good' ? 'Der Preis ist gut.' : pv.verdict === 'ok' ? 'Der Preis ist okay.' : 'Der Preis ist hoch.');
  } else if (n > 0) {
    overall = 'skip';
    reasons.push(`Hast du schon (${n}×).`);
  } else if (!fresh) {
    overall = 'skip';
    reasons.push('Alle Teile hast du schon aus anderen Packungen.');
  } else {
    const strong = gain >= 8;
    const some = gain >= 2;
    reasons.push(
      strong
        ? `Macht dein bestes Deck deutlich stärker (+${gain.toFixed(1).replace('.', ',')} Punkte).`
        : some
          ? `Verbessert dein Deck etwas (+${gain.toFixed(1).replace('.', ',')} Punkte).`
          : `${fresh === 1 ? '1 neues Teil' : `${fresh} neue Teile`}, aber dein bestes Deck wird kaum stärker.`,
    );
    if (pv) reasons.push(pv.verdict === 'good' ? 'Der Preis ist gut.' : pv.verdict === 'ok' ? 'Der Preis ist okay.' : 'Der Preis ist hoch.');
    overall = judge(gain, pv);
    if (p.kind === 'random-booster') reasons.push('Random Booster: Welcher Kreisel drin ist, siehst du erst beim Öffnen.');
  }
  return { owned: n, fresh, gain, deck: res.picks, price: pv, overall, reasons };
}
