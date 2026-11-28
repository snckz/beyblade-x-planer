// @vitest-environment node
// Packungserkennung aus dem Text (OCR-Ergebnis): Barcode-Ziffern, Namen + Kombo, ID-Register, Mehrdeutigkeit.
// Die Texte stammen aus echten Testläufen mit Packungsbildern (Beyblade-Wiki) – inklusive ihrer OCR-Fehler.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Database } from '../src/lib/types';
import { findBarcodeDigits, findByCode, matchPackText } from '../src/lib/photo';
import { knownBarcodes } from '../src/lib/data';
import { groupKey } from '../src/lib/price';
import { normalizeGtin, validGtin } from '../src/lib/barcode';
import { normalizeRegister } from '../src/lib/idRegister';

const db = JSON.parse(readFileSync(new URL('../public/data/db.json', import.meta.url), 'utf8')) as Database;
const feed = JSON.parse(readFileSync(new URL('../public/data/barcodes.json', import.meta.url), 'utf8'));
const register = normalizeRegister(JSON.parse(readFileSync(new URL('../public/data/aliases.json', import.meta.url), 'utf8')));
const codes = (list: { code: string }[]) => list.map((p) => p.code);

// OCR der Hasbro-Rückseite „Sword Dran 3-60F“ (Graubild-Durchgang, Original-Fehler: „SWo RD=—“)
const HASBRO_BACK = 'SWo\n\nRD=—\n\nDRAN\n\n3-60F\n\nATTACK TYPE\n\nTYPE ATTAQUE\n\nTIPO ATAQUE\n\nSPINS RIGHT + ROTATION DROITE\n\n© BBXProject, TV TOKYO ©TOMY';
// OCR der Set-Rückseite „Tail Viper + Sword Dran“ (Durchgang „helle Schrift“)
const SET_BACK = 'TAIL VIPER 5-80O SWORD DRAN 3-60F STAMINA TYPE - TYPE ENDURANCE ATTACK TYPE';

describe('Barcode-Ziffern im Text', () => {
  it('liest die Zahl unter dem Strichcode – auch mit Leerzeichen –, nur mit gültiger Prüfziffer', () => {
    expect(findBarcodeDigits('® 9 ll @ 5010996256607 ‘dd')).toEqual(['5010996256607']);
    expect(findBarcodeDigits('5 010996 256607')).toEqual(['5010996256607']);
    expect(findBarcodeDigits('5010996256608')).toEqual([]); // Prüfziffer falsch → Fehllesung
    expect(findBarcodeDigits('Tel. 0800 123 456 789')).toEqual([]);
    expect(findBarcodeDigits('12 5010996256607')).toEqual(['5010996256607']); // fremde Ziffern davor
  });
  it('UPC-A (12 Stellen) wird wie beim Scan als EAN-13 mit führender 0 geführt', () => {
    expect(findBarcodeDigits('195166123455')).toEqual(['0195166123455']);
    expect(normalizeGtin('195166123455')).toBe('0195166123455');
    expect(validGtin('0195166123455')).toBe(true);
  });
});

describe('Barcode-Liste (Hasbro und Takara Tomy)', () => {
  it('alle Einträge sind gültig und zeigen auf ein vorhandenes, kaufbares Produkt', () => {
    const map = knownBarcodes(feed, db.products);
    const hasbro = Object.keys(feed.barcodes).filter((gtin) => !gtin.startsWith('4904810'));
    expect(hasbro).toHaveLength(52);
    expect(Object.keys(map)).toHaveLength(Object.keys(feed.barcodes).length);
    for (const code of Object.values(map)) expect(db.products.some((p) => p.code === code && p.kind !== 'stadium')).toBe(true);
    // Hasbro: keine Random Booster. Takara Tomy: Random Booster nur als Packung (ihr erster Eintrag).
    for (const gtin of hasbro) expect(db.products.find((p) => p.code === map[gtin])!.kind).not.toBe('random-booster');
    for (const code of Object.values(map)) {
      const p = db.products.find((x) => x.code === code)!;
      if (p.kind === 'random-booster') expect(db.products.find((x) => x.kind === 'random-booster' && groupKey(x) === groupKey(p))!.code).toBe(code);
    }
  });
  it('kein Barcode und keine Packungsnummer doppelt', () => {
    const packs = Object.values(feed.barcodes as Record<string, { product: string }>).map((e) => e.product);
    expect(new Set(packs).size).toBe(packs.length);
  });
});

describe('Packungstext → Produkt (Name + Kombo)', () => {
  it('Hasbro-Rückseite mit OCR-Fehlern: Name sicher erkannt, Hasbro-Packungen zuerst', () => {
    const r = matchPackText(HASBRO_BACK, db, register);
    expect(r.sure).toBe(true);
    expect(r.products[0]!.code).toBe('F9580');
    expect(r.products.every((p) => p.bladeId === 'DranSword')).toBe(true);
    // Takara-Ausgabe bleibt wählbar (nur Reihenfolge, kein Ausschluss)
    expect(codes(r.products)).toContain('BX-01');
  });
  it('Set mit zwei erkannten Kreiseln: nur das Set', () => {
    const r = matchPackText(SET_BACK, db, register);
    expect(new Set(r.products.map((p) => p.code.replace(/-\d{2}$/, '')))).toEqual(new Set(['G0197']));
  });
  it('Teilname nur zusammen mit passender Kombo – und dann als unsicher (Nachfrage)', () => {
    const partial = matchPackText('XX DRAN 3-60F XX', db, register);
    expect(partial.products.length).toBeGreaterThan(0);
    expect(partial.sure).toBe(false);
    expect(partial.products.every((p) => p.bladeId === 'DranSword' && p.ratchetId === '3-60' && p.bitId === 'F')).toBe(true);
    // Teilname ohne Kombo: nichts raten
    expect(matchPackText('DRAN', db, register).products).toEqual([]);
    expect(matchPackText('BEYBLADE X', db, register).products).toEqual([]);
  });
  it('toleriert einen OCR-Fehler in langen Wörtern, rät aber keine kurzen', () => {
    expect(matchPackText('WIZARO ARROW', db, register).products.some((p) => p.bladeId === 'WizardArrow')).toBe(true);
    // „DRAM“ ist nicht „DRAN“ (kurzes Wort → exakt)
    expect(matchPackText('SWORD DRAM', db, register).products).toEqual([]);
  });
  it('Kombo „5-80O“ auch als „5-800“ gelesen', () => {
    const r = matchPackText('VIPER 5-800', db, register);
    expect(r.products.some((p) => p.bladeId === 'ViperTail')).toBe(true);
    expect(r.sure).toBe(false);
  });
  it('kennt Schreibweisen aus dem ID-Register (Aliase und alte IDs)', () => {
    // Eine Schreibweise, die nur im Register steht – ohne Register kein Treffer
    const reg = normalizeRegister({ aliases: { blades: { SchwertDrache: 'DranSword' } }, retired: { blades: { AltesSchwert: 'DranSword' } } });
    expect(matchPackText('SCHWERT DRACHE', db, null).products).toEqual([]);
    const r = matchPackText('SCHWERT DRACHE', db, reg);
    expect(r.sure).toBe(true);
    expect(r.products.length).toBeGreaterThan(0);
    expect(r.products.every((p) => p.bladeId === 'DranSword')).toBe(true);
    expect(matchPackText('ALTES SCHWERT', db, reg).products.every((p) => p.bladeId === 'DranSword')).toBe(true);
    // Das mitgelieferte Register stört normale Namen nicht
    expect(matchPackText('STORM PEGASIS 3-70RA', db, register).products.every((p) => p.bladeId === 'StormPegasus')).toBe(true);
  });
  it('Produktnummern auf echten Packungen (Hasbro-Vorderseite „F9580“)', () => {
    expect(codes(findByCode('INCLUDES ... F9580', db))).toEqual(['F9580']);
    // Nummer, die es im Katalog nicht gibt (Sortimentsnummer F9586) → kein Treffer, nichts geraten
    expect(findByCode('F9586', db)).toEqual([]);
  });
  it('einwortige Namen („Venom“): erkannt, aber nur mit Nachfrage', () => {
    const r = matchPackText('MARVEL VENOM', db, register);
    expect(r.products.length).toBeGreaterThan(0);
    expect(r.products.every((p) => p.bladeId === 'Venom')).toBe(true);
    expect(r.sure).toBe(false);
  });
  it('Set-Partner nur innerhalb derselben Packung (UX-15 ist kein Partner von UX-10)', () => {
    const mini = {
      blades: [
        { id: 'X', name: 'Shark Scale', line: 'UX', type: 'attack', spin: 'right' },
        { id: 'Y', name: 'Knight Mail', line: 'UX', type: 'defense', spin: 'right' },
      ],
      products: [
        { code: 'UX-15', name: 'Set', kind: 'set', bladeId: 'X', ratchetId: '4-50', bitId: 'UF' },
        { code: 'UX-16', name: 'Starter', kind: 'starter', bladeId: 'X', ratchetId: '4-50', bitId: 'UF' },
        { code: 'UX-10', name: 'Set', kind: 'set', bladeId: 'Y', ratchetId: '3-85', bitId: 'BS' },
      ],
    } as unknown as Database;
    // „KNIGHT“ allein macht UX-10 zum Teiltreffer – das darf UX-15 keinen Set-Bonus geben
    expect(codes(matchPackText('SHARK SCALE 4-50UF KNIGHT', mini, null).products).sort()).toEqual(['UX-15', 'UX-16']);
  });
});
