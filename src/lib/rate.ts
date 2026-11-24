import { tr, dec } from './i18n';
import type { Database, MetaFeed, Product, Rates } from './types';
import { comboName, META_SEEN, META_TOP, metaUsage, pct, type MetaUsage, type PartKind } from './metaUsage';
import type { Bey } from './battle';
import type { ShopPrice } from './storage';
import { deckValue, type Candidate, type PartPool, type ScoreCache } from './optimizer';
import { ownedParts } from './data';
import { shopVerdict, type Verdict } from './price';
import { rarityOf } from './rarity';

export type Overall = 'buy' | 'maybe' | 'skip' | 'owned' | 'collect';

export interface Rating {
  owned: number;
  /** neue Teile (Anzahl) */
  fresh: number;
  /** Verbesserung des besten Decks in Punkten */
  gain: number;
  deck: Candidate[];
  price: { verdict: Verdict; ratio: number } | null;
  /** neue Teile, die im Turnier gespielt werden (meistgespielt zuerst) */
  meta: MetaUsage[];
  overall: Overall;
  reasons: string[];
}

export const OVERALL_LABEL: Record<Overall, string> = { buy: tr('Ja, kaufen!'), maybe: tr('Kann man machen'), skip: tr('Nein, lieber nicht'), owned: tr('Hast du schon ✓'), collect: tr('Sammlerstück') };

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
  meta: MetaFeed | null = null,
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
  // Turnier-Meta: Wie oft werden die neuen Teile in echten Siegerdecks gespielt?
  const newParts: [PartKind, string][] = [];
  for (const x of items) {
    if (x.bladeId && !pool.blades.includes(x.bladeId)) newParts.push(['blade', x.bladeId]);
    if (x.ratchetId && !pool.ratchets.includes(x.ratchetId)) newParts.push(['ratchet', x.ratchetId]);
    if (x.bitId && !pool.bits.includes(x.bitId)) newParts.push(['bit', x.bitId]);
  }
  const metaParts = newParts
    .map(([k, id]) => metaUsage(db, meta, k, id))
    .filter((u): u is MetaUsage => !!u && u.share >= META_SEEN)
    .filter((u, i, a) => a.findIndex((v) => v.kind === u.kind && v.id === u.id) === i)
    .sort((a, b) => b.share - a.share);
  const base = deckValue(db, pool, opponents, cache).value;
  const res = deckValue(db, after, opponents, cache);
  const gain = Math.max(0, res.value - base);
  const pv = price ? shopVerdict(price.amount, price.cur, p, rates) : null;
  // „Hast du schon“ erst, wenn alles aus dem Kauf da ist
  const n = Math.min(...items.map((x) => owned[x.code] ?? 0));

  const reasons: string[] = [];
  let overall: Overall;
  if (!hasParts) {
    overall = 'maybe';
    reasons.push(tr('Zu dieser Packung fehlen noch die Teile-Daten – den Nutzen fürs Deck kann ich nicht berechnen.'));
    if (pv) reasons.push(pv.verdict === 'good' ? tr('Der Preis ist gut.') : pv.verdict === 'ok' ? tr('Der Preis ist okay.') : tr('Der Preis ist hoch.'));
  } else if (n > 0) {
    // Kein Kaufurteil – einfach: ist schon da
    overall = 'owned';
    reasons.push(n > 1 ? tr('Ist {0}× in deiner Sammlung.', n) : tr('Ist schon in deiner Sammlung.'));
  } else if (!fresh) {
    overall = 'skip';
    reasons.push(tr('Alle Teile hast du schon aus anderen Packungen.'));
  } else {
    const strong = gain >= 8;
    const some = gain >= 2;
    const top = metaParts[0];
    if (top) {
      const ofTotal = tr('in {0} von {1} Siegerdecks ({2})', top.decks, meta?.decksTotal, pct(top.share));
      reasons.push(top.share >= META_TOP ? tr('{0} ist gerade ein Top-Teil im Turnier: {1}.', top.name, ofTotal) : tr('{0} wird im Turnier regelmäßig gespielt: {1}.', top.name, ofTotal));
      if (top.top) {
        const missing = missingFor(db, after, top.top);
        reasons.push(tr('Meistgespielt als {0} ({1}×){2}', comboName(db, top.top), top.top.decks, missing.length ? tr(' – dafür fehlt dir noch {0}.', missing.join(tr(' und '))) : tr(' – die Teile dafür hast du dann komplett.')));
      }
      for (const u of metaParts.slice(1, 2)) reasons.push(tr('Auch {0} ist turnierrelevant ({1} der Siegerdecks).', u.name, pct(u.share)));
    }
    const pts = dec(gain);
    reasons.push(
      strong
        ? tr('Macht dein bestes Deck deutlich stärker (+{0} Punkte).', pts)
        : some
          ? tr('Verbessert dein Deck etwas (+{0} Punkte).', pts)
          : top
            ? tr('Für dein jetziges 3er-Deck rechnet die App wenig Zugewinn (+{0}) – oft fehlen nur die passenden Partnerteile.', pts)
            : tr('{0}, aber dein bestes Deck wird kaum stärker.', fresh === 1 ? tr('1 neues Teil') : tr('{0} neue Teile', fresh)),
    );
    if (pv) reasons.push(pv.verdict === 'good' ? tr('Der Preis ist gut.') : pv.verdict === 'ok' ? tr('Der Preis ist okay.') : tr('Der Preis ist hoch.'));
    overall = judgeWithMeta(gain, top?.share ?? 0, pv);
    if (p.kind === 'random-booster') reasons.push(tr('Random Booster: Welcher Kreisel drin ist, siehst du erst beim Öffnen.'));
  }
  // Limitierte Kreisel: der Wert liegt im Sammeln/Tauschen, nicht (nur) im Deck – kein „Nein“ nur wegen der Turnierstärke.
  const rare = items.some((x) => rarityOf(x) === 'limited' || rarityOf(x) === 'ultra');
  if (rare && overall !== 'owned') {
    const ultra = items.some((x) => rarityOf(x) === 'ultra');
    reasons.unshift(
      ultra
        ? tr('Ultra-limitiert (Turnierpreis oder winzige Auflage): echtes Sammlerstück – kaum zu bekommen und gefragt zum Tauschen.')
        : tr('Limitierte Auflage (Event, Lotterie oder Sonderfarbe): gut zum Sammeln und Tauschen – später oft schwer zu bekommen und teurer.'),
    );
    if (overall === 'skip' || overall === 'maybe') {
      overall = pv?.verdict === 'high' ? 'maybe' : 'collect';
      if (pv?.verdict === 'high') reasons.push(tr('Fürs Sammeln okay, aber der Preis ist hoch – vergleichen lohnt sich.'));
    }
  }
  return { owned: n, fresh, gain, deck: res.picks, price: pv, meta: metaParts, overall, reasons };
}

/**
 * Urteil aus Deck-Gewinn UND Turnier-Meta: Die Punkte-Rechnung kennt nur die eigene Sammlung –
 * ein Teil, das in vielen Siegerdecks steckt, ist trotzdem ein guter Kauf.
 */
export function judgeWithMeta(gain: number, metaShare: number, pv: { verdict: Verdict } | null): Overall {
  const byPoints = judge(gain, pv);
  if (metaShare >= META_TOP) return pv?.verdict === 'high' ? (byPoints === 'buy' ? 'buy' : 'maybe') : 'buy';
  if (metaShare >= META_SEEN && byPoints === 'skip') return pv?.verdict === 'high' ? 'skip' : 'maybe';
  return byPoints;
}

/** Welche Teile der Meta-Kombo fehlen nach dem Kauf noch? */
function missingFor(db: Database, pool: PartPool, c: { bladeId: string; ratchetId: string | null; bitId: string }): string[] {
  const out: string[] = [];
  if (!pool.blades.includes(c.bladeId)) out.push(comboName(db, { ...c, ratchetId: null, bitId: '' }).trim());
  if (c.ratchetId && !pool.ratchets.includes(c.ratchetId)) out.push(`Ratchet ${c.ratchetId}`);
  if (!pool.bits.includes(c.bitId)) out.push(`Bit ${c.bitId}`);
  return out;
}
