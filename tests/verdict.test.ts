// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { METRICS, STRONG_FROM, WEAK_UNTIL, radarPoints, totalScore, verdict } from '../src/lib/verdict';

const profile = (attack: number, defense: number, stamina: number, burstResistance: number) => ({ attack, defense, stamina, burstResistance });

describe('Leistungsbewertung: Stärken, Schwächen, Summe', () => {
  it('führt genau die vier Richtwerte der Analyse – nichts Erfundenes', () => {
    expect(METRICS.map((m) => m.key)).toEqual(['attack', 'defense', 'stamina', 'burstResistance']);
    expect(METRICS.map((m) => m.label)).toEqual(['Angriff', 'Verteidigung', 'Ausdauer', 'Burst-Schutz']);
  });

  it('Summe der vier Werte', () => {
    expect(totalScore(profile(62, 38, 48, 80))).toBe(228);
    expect(totalScore(profile(0, 0, 0, 0))).toBe(0);
    expect(totalScore(profile(100, 100, 100, 100))).toBe(400);
  });

  it('Stärken ab der Schwelle, höchster Wert zuerst; Schwächen bis zur Schwelle, niedrigster zuerst', () => {
    expect(verdict(profile(62, 38, 48, 80))).toEqual({ strong: ['Hoher Burst-Schutz', 'Starker Angriff'], weak: ['Schwache Verteidigung'] });
    expect(verdict(profile(STRONG_FROM, WEAK_UNTIL, STRONG_FROM - 1, WEAK_UNTIL + 1))).toEqual({ strong: ['Starker Angriff'], weak: ['Schwache Verteidigung'] });
    expect(verdict(profile(20, 30, 90, 10)).weak).toEqual(['Anfällig für Burst', 'Wenig Angriffskraft', 'Schwache Verteidigung']);
  });

  it('ausgeglichene Kombo: keine Stärke und keine Schwäche behauptet', () => {
    expect(verdict(profile(55, 55, 55, 55))).toEqual({ strong: [], weak: [] });
  });
});

describe('Netzdiagramm', () => {
  it('ein Punkt je Wert: oben, rechts, unten, links', () => {
    expect(radarPoints([100, 100, 100, 100], 100, 100, 50)).toEqual([[100, 50], [150, 100], [100, 150], [50, 100]]);
    expect(radarPoints([50, 20, 100, 80], 100, 100, 50)).toEqual([[100, 75], [110, 100], [100, 150], [60, 100]]);
  });

  it('bleibt bei 0 sichtbar und geht nie über die Achse hinaus', () => {
    const [top, right] = radarPoints([0, 250, 0, 0], 100, 100, 50);
    expect(top).toEqual([100, 97]); // Mindestabstand 6 %
    expect(right).toEqual([150, 100]);
  });
});
