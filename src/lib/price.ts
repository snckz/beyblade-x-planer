import type { Product, Rates } from './types';

const nf = (max = 0) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: max });

/** „¥2.321“ */
export const yen = (jpy: number) => `¥${nf().format(jpy)}`;

/** Umrechnung in € und ฿ (gerundet), wenn Kurse vorhanden sind. */
export function convert(jpy: number, rates: Rates | null): { eur: number; thb: number } | null {
  if (!rates || !(rates.JPY > 0) || !(rates.THB > 0)) return null;
  const eur = jpy / rates.JPY;
  return { eur, thb: eur * rates.THB };
}

type Priced = Pick<Product, 'priceJpy'> & Partial<Pick<Product, 'code' | 'kind'>>;

/**
 * Mehrere Kreisel aus demselben Set bzw. Random Booster (BX-46-01, BX-46-02 …) sind ein Kauf.
 * Nur eine echte Unternummer abtrennen – „UX-15“ allein bleibt „UX-15“.
 */
export function groupKey(p: Partial<Pick<Product, 'code' | 'kind'>>): string {
  const m = p.code ? /^([A-Z]+-\d+)-\d{2}$/.exec(p.code) : null;
  return m && (p.kind === 'set' || p.kind === 'random-booster') ? m[1]! : (p.code ?? '');
}
const setKey = (p: Priced) => (p.kind === 'set' && p.code ? groupKey(p) : null);

/**
 * Preis aus einer Eingabe lesen – mit Tausendertrennern wie im Laden („1,290“ ฿ oder „1.290“)
 * und Dezimalkomma („12,50“ €). Ungültig/leer: null.
 */
export function parsePrice(raw: string): number | null {
  const s = raw
    .replace(/[\s฿€'’]/g, '')
    .replace(/^(?:THB|EUR|BAHT)/i, '')
    .replace(/(?:THB|EUR|BAHT|B\.?)$/i, '');
  if (!s) return null;
  let n: number;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) n = Number(s.replace(/[.,]/g, ''));
  else if (/^\d+([.,]\d{1,2})?$/.test(s)) n = Number(s.replace(',', '.'));
  else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
  else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(s)) n = Number(s.replace(/,/g, ''));
  else return null;
  return Number.isFinite(n) && n > 0 && n < 1e6 ? n : null;
}

/** Kurzer Preis-Hinweis: „¥2.321 ≈ 14 € · 500 ฿“ – oder null ohne bekannten Preis. Bei Sets mit „Set:“ davor. */
export function priceHint(p: Priced, rates: Rates | null): string | null {
  if (!p.priceJpy) return null;
  const c = convert(p.priceJpy, rates);
  const text = c ? `${yen(p.priceJpy)} ≈ ${nf().format(c.eur)} € · ${nf().format(c.thb)} ฿` : yen(p.priceJpy);
  return p.kind === 'set' ? `Set: ${text}` : text;
}

/** Summe einer Liste: bekannte Preise addiert (jedes Set nur einmal), Anzahl ohne Preis separat. */
export function sumPrices(products: Priced[]): { jpy: number; missing: number } {
  let jpy = 0;
  let missing = 0;
  const sets = new Set<string>();
  for (const p of products) {
    const key = setKey(p);
    if (key) {
      if (sets.has(key)) continue;
      sets.add(key);
    }
    if (p.priceJpy) jpy += p.priceJpy;
    else missing++;
  }
  return { jpy, missing };
}

export type Verdict = 'good' | 'ok' | 'high';

/**
 * Preis-Ampel für den Laden: Ladenpreis im Verhältnis zum umgerechneten Japan-Preis.
 * Takara-Tomy-Ware kostet außerhalb Japans fast immer mehr (Import, Händler) – bis +30 % gilt als gut,
 * bis +60 % als okay, darüber als teuer. Ohne Japan-Preis oder Kurs: null.
 */
export function shopVerdict(amount: number, cur: 'THB' | 'EUR', priceJpy: number | null | undefined, rates: Rates | null): { verdict: Verdict; ratio: number } | null {
  if (!priceJpy || !(amount > 0)) return null;
  const c = convert(priceJpy, rates);
  if (!c) return null;
  const ratio = amount / (cur === 'THB' ? c.thb : c.eur);
  return { verdict: ratio <= 1.3 ? 'good' : ratio <= 1.6 ? 'ok' : 'high', ratio };
}

export const VERDICT_LABEL: Record<Verdict, string> = { good: 'Guter Preis', ok: 'Geht so', high: 'Teuer' };
