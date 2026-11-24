import { tr } from './i18n';
import type { Analysis } from './analysis';

/** Die vier Richtwerte einer Kombo – in dieser Reihenfolge überall (Balken, Diagramm, Vergleich). */
export type Metric = keyof Analysis['profile'];

export interface MetricInfo {
  key: Metric;
  label: string;
  /** Farbrolle (tone-…) wie bei den Typen */
  tone: 'attack' | 'stamina' | 'defense' | 'balance';
  /** Formulierung, wenn der Wert hoch bzw. niedrig ist */
  strong: string;
  weak: string;
}

export const METRICS: MetricInfo[] = [
  { key: 'attack', label: tr('Angriff'), tone: 'attack', strong: tr('Starker Angriff'), weak: tr('Wenig Angriffskraft') },
  { key: 'defense', label: tr('Verteidigung'), tone: 'defense', strong: tr('Stabile Verteidigung'), weak: tr('Schwache Verteidigung') },
  { key: 'stamina', label: tr('Ausdauer'), tone: 'stamina', strong: tr('Lange Ausdauer'), weak: tr('Geringe Ausdauer') },
  { key: 'burstResistance', label: tr('Burst-Schutz'), tone: 'balance', strong: tr('Hoher Burst-Schutz'), weak: tr('Anfällig für Burst') },
];

/** Ab diesem Richtwert gilt etwas als Stärke, bis zu diesem als Schwäche (Skala 0–100). */
export const STRONG_FROM = 60;
export const WEAK_UNTIL = 40;

/** Summe der vier Richtwerte (höchstens 400). Nur zum Vergleichen von Kombos untereinander gedacht. */
export function totalScore(profile: Analysis['profile']): number {
  return METRICS.reduce((sum, m) => sum + profile[m.key], 0);
}

/**
 * Stärken und Schwächen in Worten – abgeleitet aus den vorhandenen Richtwerten, nichts Neues gerechnet.
 * Stärken: höchster Wert zuerst. Schwächen: niedrigster zuerst. Beides kann leer sein (ausgeglichene Kombo).
 */
export function verdict(profile: Analysis['profile']): { strong: string[]; weak: string[] } {
  const strong = METRICS.filter((m) => profile[m.key] >= STRONG_FROM)
    .sort((a, b) => profile[b.key] - profile[a.key])
    .map((m) => m.strong);
  const weak = METRICS.filter((m) => profile[m.key] <= WEAK_UNTIL)
    .sort((a, b) => profile[a.key] - profile[b.key])
    .map((m) => m.weak);
  return { strong, weak };
}

/**
 * Eckpunkte des Netzdiagramms: je Richtwert ein Punkt auf seiner Achse (oben, rechts, unten, links …).
 * `radius` ist die Achsenlänge bei 100. Ein Mindestabstand hält die Fläche auch bei sehr kleinen Werten sichtbar.
 */
export function radarPoints(values: number[], cx: number, cy: number, radius: number, floor = 0.06): [number, number][] {
  return values.map((v, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / values.length;
    const r = radius * Math.max(floor, Math.min(1, v / 100));
    return [Math.round((cx + Math.cos(angle) * r) * 10) / 10, Math.round((cy + Math.sin(angle) * r) * 10) / 10];
  });
}
