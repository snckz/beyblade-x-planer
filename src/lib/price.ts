import { tr, NUM_LOCALE } from './i18n';
import type { Product, Rates } from './types';

const nf = (max = 0) => new Intl.NumberFormat(NUM_LOCALE, { maximumFractionDigits: max });

/** „¥2.321“ */
export const yen = (jpy: number) => `¥${nf().format(jpy)}`;

/** Umrechnung in € und ฿ (gerundet), wenn Kurse vorhanden sind. */
export function convert(jpy: number, rates: Rates | null): { eur: number; thb: number } | null {
  if (!rates || !(rates.JPY > 0) || !(rates.THB > 0)) return null;
  const eur = jpy / rates.JPY;
  return { eur, thb: eur * rates.THB };
}

type Priced = Pick<Product, 'priceJpy'> & Partial<Pick<Product, 'code' | 'kind' | 'priceUsd'>>;

const usd = (n: number) => `$${n.toLocaleString(NUM_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Vergleichspreis in € und ฿: Japan-Preis (Takara) oder – bei Hasbro – der US-Preis. */
export function refPrice(p: Priced, rates: Rates | null): { eur: number; thb: number; label: string; from: 'jp' | 'us' } | null {
  if (p.priceJpy) {
    const c = convert(p.priceJpy, rates);
    return c ? { ...c, label: `Japan ${yen(p.priceJpy)}`, from: 'jp' } : null;
  }
  if (p.priceUsd && rates?.USD && rates.USD > 0 && rates.THB > 0) {
    const eur = p.priceUsd / rates.USD;
    return { eur, thb: eur * rates.THB, label: `USA ${usd(p.priceUsd)}`, from: 'us' };
  }
  return null;
}

/**
 * Mehrere Kreisel aus demselben Set bzw. Random Booster (BX-46-01, BX-46-02 …) sind ein Kauf.
 * Nur eine echte Unternummer abtrennen – „UX-15“ allein bleibt „UX-15“.
 */
export function groupKey(p: Partial<Pick<Product, 'code' | 'kind'>>): string {
  const m = p.code ? /^([A-Z]+-?\d+)-\d{2}$/.exec(p.code) : null; // BX-08-01 (Takara) und G1543-01 (Hasbro)
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
  if (!p.priceJpy && p.priceUsd) {
    const r = refPrice(p, rates);
    return r ? tr('US-Preis {0} ≈ {1} € · {2} ฿', usd(p.priceUsd), nf().format(r.eur), nf().format(r.thb)) : tr('US-Preis {0}', usd(p.priceUsd));
  }
  if (!p.priceJpy) return null;
  const c = convert(p.priceJpy, rates);
  const text = c ? `${yen(p.priceJpy)} ≈ ${nf().format(c.eur)} € · ${nf().format(c.thb)} ฿` : yen(p.priceJpy);
  return p.kind === 'set' ? tr('Set: {0}', text) : text;
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
 * bis +60 % als okay, darüber als teuer. Hasbro (US-Preis ohne Steuer): bis +70 % gut, bis +120 % okay.
 * Ohne Vergleichspreis oder Kurs: null.
 */
export function shopVerdict(amount: number, cur: 'THB' | 'EUR', p: Priced, rates: Rates | null): { verdict: Verdict; ratio: number } | null {
  if (!(amount > 0)) return null;
  const c = refPrice(p, rates);
  if (!c) return null;
  const ratio = amount / (cur === 'THB' ? c.thb : c.eur);
  // US-Preise sind ohne Umsatzsteuer und oft Aktionspreise – in Europa sind +50–70 % normal.
  const [good, ok] = c.from === 'us' ? [1.7, 2.2] : [1.3, 1.6];
  return { verdict: ratio <= good ? 'good' : ratio <= ok ? 'ok' : 'high', ratio };
}

export const VERDICT_LABEL: Record<Verdict, string> = { good: tr('Guter Preis'), ok: tr('Geht so'), high: tr('Teuer') };
