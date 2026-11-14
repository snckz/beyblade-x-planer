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

/** Mehrere Kreisel aus demselben Set (BX-46-01, BX-46-02 …) teilen sich einen Set-Preis. */
const setKey = (p: Priced) => (p.kind === 'set' && p.code ? p.code.replace(/-\d{2}$/, '') : null);

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
