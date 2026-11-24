import { tr } from './i18n';
import type { Database, MetaFeed, Product } from './types';
import { META_SEEN, metaUsage } from './metaUsage';
import type { Bey } from './battle';
import { deckValue, type Candidate, type PartPool, type ScoreCache } from './optimizer';
import { contentLabel, ownedParts } from './data';
import { groupKey } from './price';

export interface Offer {
  /** Code fürs Anzeigen/Wunschliste (bei Sets das erste Teil) */
  code: string;
  /** alle Produktcodes dieses Kaufs */
  codes: string[];
  name: string;
  kind: Product['kind'];
  /** Preis des Kaufs (Set/Pack einmal) in Yen */
  priceJpy: number | null;
  /** Verbesserung des besten Decks in Punkten (bei Random Boostern der Mittelwert über alle möglichen Inhalte) */
  gain: number;
  /** bester möglicher Treffer (nur Random Booster) */
  bestGain?: number;
  /** neue Teile, die man dadurch bekommt */
  newParts: NewPart[];
  /** Deck nach dem Kauf (beim Random Booster: mit dem besten Treffer) */
  deck: Candidate[];
  /** meistgespieltes neues Teil im Turnier-Meta (Anteil an Siegerdecks 0 … 1) */
  meta?: { name: string; share: number };
}

/** Gesamtwert eines Angebots: Deck-Punkte plus Turnier-Bonus (Top-Teil mit 30 % ≈ +12 Punkte). */
export const offerScore = (o: Pick<Offer, 'gain' | 'meta'>) => o.gain + (o.meta?.share ?? 0) * 40;

export interface NewPart {
  kind: 'blade' | 'ratchet' | 'bit';
  id: string;
}
const uniqParts = (list: NewPart[]) => list.filter((p, i) => list.findIndex((q) => q.kind === p.kind && q.id === p.id) === i);

const BUYABLE: Product['kind'][] = ['starter', 'booster', 'random-booster', 'set'];
/** BX-46-01, BX-46-02 … gehören zu einem Kauf */


function addPart(pool: PartPool, p: Product): PartPool {
  const add = (list: string[], id?: string) => (id && !list.includes(id) ? [...list, id] : list);
  return { blades: add(pool.blades, p.bladeId), ratchets: add(pool.ratchets, p.ratchetId), bits: add(pool.bits, p.bitId) };
}

/**
 * Welche Käufe verbessern das beste Deck am meisten? Rechnet in Häppchen (onProgress), damit das Handy flüssig bleibt.
 * Teile, die man schon hat, bringen nichts – Packungen ohne neue Teile fallen raus.
 */
export async function advise(
  db: Database,
  owned: Record<string, number>,
  opponents: Bey[],
  onProgress?: (done: number, total: number) => void,
  preferHasbro = false,
  meta: MetaFeed | null = null,
): Promise<{ base: number; offers: Offer[] }> {
  // Turnier-Meta der neuen Teile: das am meisten gespielte zählt
  const metaOf = (parts: NewPart[]): Offer['meta'] => {
    const best = parts
      .map((p) => metaUsage(db, meta, p.kind, p.id))
      .filter((u) => !!u && u.share >= META_SEEN)
      .sort((a, b) => b!.share - a!.share)[0];
    return best ? { name: best.name, share: best.share } : undefined;
  };
  const op = ownedParts(db, owned);
  const pool: PartPool = { blades: [...op.blades.keys()], ratchets: [...op.ratchets.keys()], bits: [...op.bits.keys()] };
  const cache: ScoreCache = new Map();
  const base = deckValue(db, pool, opponents, cache).value;

  const groups = new Map<string, Product[]>();
  // Gleicher Kreisel als Takara- und Hasbro-Packung: nur einmal anbieten (bevorzugt die passende Region).
  const single = (p: Product) => p.kind === 'starter' || p.kind === 'booster';
  const combo = (p: Product) => `${p.bladeId}|${p.ratchetId ?? ''}|${p.bitId ?? ''}`;
  const preferred = new Map<string, Product>();
  for (const p of db.products) {
    if (!single(p) || !p.bladeId) continue;
    const cur = preferred.get(combo(p));
    const want = (x: Product) => (x.region === 'hasbro') === preferHasbro;
    if (!cur || (!want(cur) && want(p))) preferred.set(combo(p), p);
  }
  for (const p of db.products) {
    if (single(p) && p.bladeId && preferred.get(combo(p)) !== p) continue;
    // Besitz hier nicht filtern: schon gezogene Random-Booster-Varianten zählen im Mittel mit 0 Gewinn.
    // Lose Teile aus Sets (Einträge ohne Blade) gehören zum Kauf und zählen mit
    if (!BUYABLE.includes(p.kind) || !(p.bladeId || (p.kind === 'set' && (p.ratchetId || p.bitId)))) continue;
    const k = groupKey(p);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }

  const offers: Offer[] = [];
  const entries = [...groups.values()];
  let done = 0;
  for (const items of entries) {
    if (++done % 6 === 0) {
      onProgress?.(done, entries.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    if (items.every((p) => (owned[p.code] ?? 0) > 0)) continue;
    const first = items[0]!;
    const isRandom = first.kind === 'random-booster';
    const fresh = (p: Product): NewPart[] => {
      const out: NewPart[] = [];
      if (p.bladeId && !pool.blades.includes(p.bladeId)) out.push({ kind: 'blade', id: p.bladeId });
      if (p.ratchetId && !pool.ratchets.includes(p.ratchetId)) out.push({ kind: 'ratchet', id: p.ratchetId });
      if (p.bitId && !pool.bits.includes(p.bitId)) out.push({ kind: 'bit', id: p.bitId });
      return out;
    };
    if (isRandom) {
      // Zufallsinhalt: Erwartungswert über alle möglichen Kreisel des Packs
      const results = items.map((p) => (fresh(p).length ? { p, ...deckValue(db, addPart(pool, p), opponents, cache) } : { p, value: base, picks: [] as Candidate[] }));
      // deckValue ist eine Heuristik – mehr Teile dürfen nie „schlechter“ zählen.
      const gains = results.map((r) => Math.max(0, r.value - base));
      const gain = gains.reduce((s, g) => s + g, 0) / gains.length;
      const bestIdx = gains.indexOf(Math.max(...gains));
      const newParts = uniqParts(items.flatMap(fresh));
      const m = metaOf(newParts);
      // Erwarteter Turnier-Anteil: nur ein Kreisel aus dem Pack landet bei dir
      const metaAvg = items.reduce((s2, p) => s2 + (metaOf(fresh(p))?.share ?? 0), 0) / items.length;
      if (gains[bestIdx]! <= 0.5 && !m) continue;
      offers.push({
        code: first.code,
        codes: items.map((p) => p.code),
        name: items.length > 1 ? tr('{0} Random Booster ({1} Varianten)', groupKey(first), items.length) : first.name,
        kind: first.kind,
        priceJpy: items.find((p) => p.priceJpy)?.priceJpy ?? null,
        gain,
        bestGain: gains[bestIdx],
        newParts,
        deck: results[bestIdx]!.picks,
        meta: m && metaAvg > 0 ? { name: m.name, share: metaAvg } : undefined,
      });
    } else {
      const newParts = uniqParts(items.flatMap(fresh));
      if (!newParts.length) continue;
      const after = deckValue(db, items.reduce(addPart, pool), opponents, cache);
      const gain = Math.max(0, after.value - base);
      const m = metaOf(newParts);
      // Teile, die viel im Turnier gespielt werden, bleiben drin – auch wenn die Punkte-Rechnung wenig zeigt.
      if (gain <= 0.5 && !m) continue;
      offers.push({
        code: first.code,
        codes: items.map((p) => p.code),
        name: items.length > 1 ? tr('{0} Set ({1})', groupKey(first), contentLabel(items)) : first.name,
        kind: first.kind,
        priceJpy: items.find((p) => p.priceJpy)?.priceJpy ?? null,
        gain,
        newParts,
        deck: after.picks,
        meta: m,
      });
    }
  }
  onProgress?.(entries.length, entries.length);
  return { base, offers };
}

/** Punkte pro 1.000 ¥ – höher ist besser. Ohne Preis: null. */
export const valuePer1000 = (o: Offer) => (o.priceJpy ? (offerScore(o) / o.priceJpy) * 1000 : null);

/** Sortierung „Preis-Leistung“: zuerst Angebote mit Preis nach Punkten pro Yen, dann die ohne Preis nach Punkten. */
export function rankOffers(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => {
    const va = valuePer1000(a);
    const vb = valuePer1000(b);
    if (va !== null && vb !== null) return vb - va;
    if (va !== null) return -1;
    if (vb !== null) return 1;
    return offerScore(b) - offerScore(a);
  });
}
