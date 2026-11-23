// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error – JS-Modul ohne Typen
import { validateEvents } from '../scripts/validate-data.mjs';

const feed = JSON.parse(readFileSync(new URL('../public/data/events.json', import.meta.url), 'utf8'));
const event = (extra: Record<string, unknown>) => ({ events: [{ id: 'x', kind: 'tournament', date: '2026-12-12', title: 'Beyblade X GP Final 2026', confirmed: true, ...extra }] });

describe('Termin-Texte sind neutral', () => {
  it('die mitgelieferten Termine sprechen niemanden persönlich an', () => {
    expect(validateEvents(feed)).toEqual([]);
  });

  it('persönliche Anrede wird abgelehnt', () => {
    for (const note of ['Vor Ort gibt es Metal Coat: Black. Du bist dann in Bangkok.', 'Passt zu deiner Reise.', 'Für dich interessant.', 'Das Turnier ist bei dir um die Ecke.', 'Ihr könnt zuschauen.']) {
      const errors = validateEvents(event({ note })) as string[];
      expect(errors, note).toHaveLength(1);
      expect(errors[0]).toMatch(/neutral formulieren/);
    }
    expect(validateEvents(event({ title: 'Turnier für dich' }))).toHaveLength(1);
    expect(validateEvents(event({ place: 'Bei dir in Bangkok' }))).toHaveLength(1);
  });

  it('sachliche Texte mit ähnlichen Wörtern bleiben erlaubt', () => {
    const note = 'Dual Pack im Duell, zwei Durchgänge, ICONSIAM in Bangkok. Zuschauen darf laut offizieller Seite jeder, direkt am Stadium.';
    expect(validateEvents(event({ note, place: 'ICONSIAM, Bangkok' }))).toEqual([]);
  });
});
