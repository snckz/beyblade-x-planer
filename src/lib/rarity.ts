import type { Product, Rarity } from './types';

export const RARITY_LABEL: Record<Rarity, string> = {
  standard: 'Standard',
  random: 'Zufall',
  limited: 'Limitiert',
  ultra: 'Ultra-Limitiert',
};

export const RARITY_HINT: Record<Rarity, string> = {
  standard: 'Normal im Handel als Starter, Booster oder Set.',
  random: 'Aus einem Random Booster – welche Variante drin ist, siehst du erst beim Öffnen.',
  limited: 'Nur bei Events, Lotterien oder in kleiner Stückzahl erschienen (z. B. BX-00, Metal Coat).',
  ultra: 'Turnierpreise oder extrem kleine Auflagen.',
};

export const RARITY_ORDER: Rarity[] = ['ultra', 'limited', 'random', 'standard'];

/** Seltenheit aus Erhältlichkeit abgeleitet – kein offizielles System von Takara Tomy. */
export function rarityOf(p: Product): Rarity {
  if (p.rarity) return p.rarity;
  if (/^(BX|UX|CX)-00\b|^(BXG|UXG|CXG)-/.test(p.code)) return 'limited';
  if (/metal coat|event|limited|lotterie/i.test(`${p.name} ${p.note ?? ''}`)) return 'limited';
  if (p.kind === 'random-booster') return 'random';
  return 'standard';
}

/** Anzeige-Code: interne Zusätze („BX-00-SP“) und Platzhalter („TBA-…“) ausblenden. */
export function codeLabel(code: string): string {
  if (code.startsWith('TBA')) return 'neu';
  if (code.startsWith('HAS-')) return 'Hasbro';
  const m = /^([A-Z]{2,3}-\d{2,3})/.exec(code);
  return m ? m[1]! : code;
}
