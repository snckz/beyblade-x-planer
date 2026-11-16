import { describe, expect, it } from 'vitest';
import { notePriceYen, splitNote } from '../src/lib/eventText';

describe('splitNote', () => {
  it('trennt nach dem ersten Satz, nicht in Zahlen', () => {
    const r = splitNote('Balance-Typ, der je nach Abschuss eher angreift oder verteidigt. 1.600 Yen. Bei Hasbro als Suppress Superion.');
    expect(r.lead).toBe('Balance-Typ, der je nach Abschuss eher angreift oder verteidigt.');
    expect(r.rest).toBe('1.600 Yen. Bei Hasbro als Suppress Superion.');
  });
  it('lässt einen einzelnen Satz ganz', () => {
    expect(splitNote('Exklusive schwarze Metallic-Version, nur über den B4-Store.')).toEqual({ lead: 'Exklusive schwarze Metallic-Version, nur über den B4-Store.', rest: '' });
  });
  it('trennt nicht nach Abkürzungen oder Zahlen mit Punkt', () => {
    expect(splitNote('2.500 Yen inkl. Long-Winder-Launcher.').rest).toBe('');
    expect(splitNote('4 Blades, 3 Ratchets (72 Kombos), Hauptkreisel WHM-65MT mit Metallteilen. 6.600 Yen, ohne Launcher.').rest).toBe('6.600 Yen, ohne Launcher.');
  });
  it('verliert keinen Text', () => {
    const note = 'Erstes Weltfinale der GP-Serie, 3-gegen-3 im BX-10-Stadium, Regular Class (6–12) und Open Class. Mitspielen nur für Qualifizierte; ob Zuschauer zugelassen sind, nennt die offizielle Seite noch nicht. Du bist dann in Bangkok.';
    const r = splitNote(note);
    expect(`${r.lead} ${r.rest}`).toBe(note);
  });
});

describe('notePriceYen', () => {
  it('liest den Yen-Preis', () => {
    expect(notePriceYen('Defense-Typ. 2.500 Yen inkl. Launcher.')).toBe(2500);
    expect(notePriceYen('Ab 3.000 Yen Einkauf gibt es ein Bit.')).toBe(3000);
    expect(notePriceYen('Erstes Weltfinale, BX-10-Stadium.')).toBeNull();
  });
});
