// @vitest-environment node
// Phase 3: Zentrales ID-Register (src/lib/idRegister.js, public/data/aliases.json) – Schreibweisen, alte IDs,
// Konflikte, Kreise, Idempotenz und gespeicherte Nutzerdaten.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBladeIndex, migrateUserState, normalizeRegister, resolveId, resolveIds, validateRegister } from '../src/lib/idRegister';
// @ts-expect-error – JS-Modul ohne Typen
import { mergeCatalog, parseList } from '../scripts/import-catalog.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { mergeHasbro, parseHasbroList } from '../scripts/import-hasbro.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { validateTransition } from '../scripts/validate-data.mjs';
import { resolveCombo } from '../src/lib/analysis';
import { EMPTY_STATE, type UserState } from '../src/lib/storage';
import type { Blade, Database } from '../src/lib/types';

const realDb = JSON.parse(readFileSync(join(process.cwd(), 'public/data/db.json'), 'utf8')) as Database;
const realRegister = JSON.parse(readFileSync(join(process.cwd(), 'public/data/aliases.json'), 'utf8'));
const clone = () => structuredClone(realDb);
const bladeIds = new Set(realDb.blades.map((b) => b.id));
const isBlade = (id: string) => bladeIds.has(id);
const beyPage = (type: string, bit: string) => `'''X''' is a ${type} Type Beyblade. It was released in Japan on March 1st, 2026.\n[[Bit - ${bit}]]\n==Features==\n`;
const catalog = (db: Database, rows: string, register: unknown, pages: Record<string, string> = {}) =>
  mergeCatalog(db, parseList(rows), async (t: string) => pages[t] ?? null, { retired: register });

describe('Register-Datei und Auflösung', () => {
  it('das echte Register ist gültig und löst die bekannten Einträge auf', () => {
    expect(validateRegister(realRegister, realDb)).toEqual([]);
    expect(resolveId(realRegister, 'blades', 'StormPegasis', isBlade)).toBe('StormPegasus');
    const codes = new Set(realDb.products.map((p) => p.code));
    expect(resolveIds(realRegister, 'products', 'HAS-XBS', (c) => codes.has(c))).toEqual(['F9588-01', 'F9588-02']);
  });

  it('existierende IDs bleiben, wie sie sind; Unbekanntes wird nie „ähnlich“ geraten', () => {
    expect(resolveId(realRegister, 'blades', 'DranSword', isBlade)).toBe('DranSword');
    expect(resolveId(realRegister, 'blades', 'DranSwords', isBlade)).toBeUndefined();
    expect(resolveId(realRegister, 'blades', 'dransword', isBlade)).toBeUndefined(); // IDs: exakt, keine Normalisierung
  });

  it('alte ID → richtige kanonische ID, auch über mehrere Umbenennungen', () => {
    const reg = { retired: { blades: { AltA: 'AltB', AltB: 'DranSword' } } };
    expect(resolveId(reg, 'blades', 'AltA', isBlade)).toBe('DranSword');
    expect(validateRegister(reg, realDb)).toEqual([]);
  });

  it('Blade-, Ratchet-, Bit- und Produkt-IDs sind getrennt', () => {
    const reg = { aliases: { blades: { X1: 'DranSword' } } };
    expect(resolveId(reg, 'blades', 'X1', isBlade)).toBe('DranSword');
    expect(resolveId(reg, 'bits', 'X1', () => false)).toBeUndefined();
  });

  it('alte flache Form (retired.json aus Phase 1) wird weiter verstanden', () => {
    expect(normalizeRegister({ products: { A: null }, reassigned: { B: 'Grund' } })).toMatchObject({ retired: { products: { A: null } }, reassigned: { B: 'Grund' } });
  });
});

describe('Konflikte und Kreise werden erkannt', () => {
  const errs = (reg: unknown) => validateRegister(reg, realDb).join('\n');

  it('Alias darf keine echte ID verdecken', () => {
    expect(errs({ aliases: { blades: { DranSword: 'WizardArrow' } } })).toContain('ein Alias darf keine echte ID verdecken');
  });

  it('gleich geschriebene Aliase mit verschiedenem Ziel widersprechen sich', () => {
    expect(errs({ aliases: { blades: { 'Storm Pegasis': 'StormPegasus', StormPegasis: 'DranSword' } } })).toContain('widersprechen sich');
  });

  it('Alias, dessen Name einem anderen bestehenden Blade gleicht: Prüfbedarf statt stiller Umleitung', () => {
    expect(errs({ aliases: { blades: { 'Wizard Arrow': 'DranSword' } } })).toContain('gehört bereits zu Blade WizardArrow');
  });

  it('Eintrag zugleich als Alias und stillgelegt ist ein Fehler', () => {
    expect(errs({ aliases: { blades: { AltX: 'DranSword' } }, retired: { blades: { AltX: 'DranSword' } } })).toContain('zugleich unter retired');
  });

  it('zirkuläre Weiterleitung wird abgewiesen und nie aufgelöst', () => {
    const reg = { retired: { blades: { AltA: 'AltB', AltB: 'AltA' } } };
    expect(errs(reg)).toContain('Kreis');
    expect(resolveIds(reg, 'blades', 'AltA', isBlade)).toEqual([]);
  });

  it('Ziel muss existieren; Aliase brauchen ein Ziel', () => {
    expect(errs({ aliases: { blades: { AltA: 'GibtEsNicht' } } })).toContain('Ziel gibt es nicht');
    expect(errs({ aliases: { blades: { AltA: null } } })).toContain('braucht ein Ziel');
  });

  it('mehrdeutige Namen werden nicht zugeordnet', () => {
    const a = { id: 'AlphaBetaGamma', name: 'Alpha Beta Gamma', line: 'BX', type: 'attack', spin: 'right', verified: true } as Blade;
    const b = { id: 'OtherBlade', name: 'Other Blade', hasbroName: 'Gamma Beta Alpha', line: 'BX', type: 'attack', spin: 'right', verified: true } as Blade;
    const index = createBladeIndex([a, b], {}, { wordOrder: true });
    // „Beta Alpha Gamma“ passt nur über die Wortreihenfolge – und zwar zu beiden Blades
    expect(index.find('Beta Alpha Gamma')).toBeUndefined();
    expect(index.ambiguous('Beta Alpha Gamma')).toBe(true);
    // Exakte (normalisierte) Namen bleiben eindeutig
    expect(index.find('Alpha Beta Gamma')).toBe(a);
    expect(index.find('Gamma Beta Alpha')).toBe(b);
  });
});

describe('Importe nutzen das Register', () => {
  it('bekannter Alias → bestehender Datensatz (Katalog und Hasbro)', async () => {
    const res = await catalog(clone(), '|-\n|BX-95\n|[[StormPegasis 3-70RA]]\n', realRegister);
    expect(res.report.added.blades).toEqual([]);
    expect(res.db.products.find((p: { code: string }) => p.code === 'BX-95').bladeId).toBe('StormPegasus');
    const h = await mergeHasbro(clone(), parseHasbroList('|-\n|G9997\n|[[StormPegasis 3-70RA]]\n'), async () => null, { retired: realRegister });
    expect(h.report.added.blades).toEqual([]);
    expect(h.db.products.find((p: { code: string }) => p.code === 'G9997')?.bladeId).toBe('StormPegasus');
  });

  it('neue Schreibweise im Register → keine doppelte Anlage', async () => {
    const reg = { aliases: { blades: { DranSwordNeo: 'DranSword' } } };
    const without = await catalog(clone(), '|-\n|BX-96\n|[[DranSwordNeo 3-60F]]\n', {}, { 'DranSwordNeo 3-60F': beyPage('Attack', 'Flat') });
    expect(without.report.added.blades).toEqual(['DranSwordNeo']); // ohne Eintrag: eigenes Blade (kein Raten)
    const withAlias = await catalog(clone(), '|-\n|BX-96\n|[[DranSwordNeo 3-60F]]\n', reg, { 'DranSwordNeo 3-60F': beyPage('Attack', 'Flat') });
    expect(withAlias.report.added.blades).toEqual([]);
    expect(withAlias.db.products.find((p: { code: string }) => p.code === 'BX-96').bladeId).toBe('DranSword');
  });

  it('umbenannte (alte) ID im Wiki → kanonische ID, kein Wiederanlegen', async () => {
    const reg = { retired: { blades: { DranSwordAlt: 'DranSword' } } };
    const res = await catalog(clone(), '|-\n|BX-97\n|[[DranSwordAlt 3-60F]]\n', reg);
    expect(res.report.added.blades).toEqual([]);
    expect(res.db.products.find((p: { code: string }) => p.code === 'BX-97').bladeId).toBe('DranSword');
  });

  it('unterschiedliche Teile mit ähnlichen Namen bleiben getrennt', async () => {
    const res = await catalog(clone(), '|-\n|BX-98\n|[[DranSwords 3-60F]]\n', realRegister, { 'DranSwords 3-60F': beyPage('Balance', 'Flat') });
    expect(res.report.added.blades).toEqual(['DranSwords']);
    expect(res.db.blades.find((b: { id: string }) => b.id === 'DranSword').type).toBe('attack');
  });

  it('wiederholter Import mit Register bleibt idempotent', async () => {
    const rows = '|-\n|BX-95\n|[[StormPegasis 3-70RA]]\n|-\n|BX-96\n|[[DranSwordNeo 3-60F]]\n';
    const reg = { ...realRegister, aliases: { ...realRegister.aliases, blades: { ...realRegister.aliases.blades, DranSwordNeo: 'DranSword' } } };
    const a = await catalog(clone(), rows, reg);
    const b = await catalog(a.db, rows, reg);
    expect(JSON.stringify(b.db)).toBe(JSON.stringify(a.db));
    const blades = a.db.blades.map((x: { id: string }) => x.id);
    expect(new Set(blades).size).toBe(blades.length);
  });
});

describe('Gespeicherte Nutzerdaten bleiben auflösbar', () => {
  // Datenbank, in der DranSword zu DranSwordX umbenannt wurde (mit Eintrag im Register)
  const renamedDb = () => {
    const db = clone();
    for (const b of db.blades) if (b.id === 'DranSword') b.id = 'DranSwordX';
    for (const p of db.products) if (p.bladeId === 'DranSword') p.bladeId = 'DranSwordX';
    return db;
  };
  const reg = { retired: { blades: { DranSword: 'DranSwordX' }, products: { 'HAS-XBS': ['F9588-01', 'F9588-02'] } } };
  const saved = (): UserState => ({
    ...EMPTY_STATE,
    owned: { 'HAS-XBS': 2, 'BX-01': 1 },
    wishlist: ['HAS-XBS'],
    combos: [
      { id: 'c1', bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' },
      { id: 'c2', bladeId: 'GanzUnbekannt', ratchetId: '3-60', bitId: 'F' },
    ],
    deck: ['c1'],
    matches: [{ id: 'm1', date: '2026-01-01', won: true, finish: 'spin', mine: { bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' }, opp: { bladeId: 'WizardArrow', ratchetId: '4-80', bitId: 'B' } }],
  });

  it('Kombo mit alter Blade-ID zeigt danach auf den richtigen Datensatz; Umbenennung besteht die Übergangsprüfung', () => {
    const db = renamedDb();
    expect(validateRegister(reg, db)).toEqual([]);
    expect(validateTransition(realDb, db, reg)).toEqual([]);
    const { state, changes } = migrateUserState(saved(), reg, db);
    expect(changes).toContain('Blade DranSword → DranSwordX');
    expect(state.combos[0]!.bladeId).toBe('DranSwordX');
    expect(resolveCombo(db, state.combos[0]!)?.blade.id).toBe('DranSwordX');
    expect(state.matches[0]!.mine.bladeId).toBe('DranSwordX');
    expect(state.deck).toEqual(['c1']);
  });

  it('nicht Auflösbares bleibt unverändert (nichts wird gelöscht), aufgeteilte Produkte bekommen beide Nummern', () => {
    const { state } = migrateUserState(saved(), reg, renamedDb());
    expect(state.combos[1]!.bladeId).toBe('GanzUnbekannt');
    expect(state.combos).toHaveLength(2);
    expect(state.owned).toEqual({ 'BX-01': 1, 'F9588-01': 2, 'F9588-02': 2 });
    expect(state.wishlist).toEqual(['F9588-01', 'F9588-02']);
  });

  it('Umstellung ist idempotent: zweiter Durchlauf ändert nichts (gleiches Objekt)', () => {
    const db = renamedDb();
    const first = migrateUserState(saved(), reg, db);
    const second = migrateUserState(first.state, reg, db);
    expect(second.changes).toEqual([]);
    expect(second.state).toBe(first.state);
  });

  it('mit dem echten Register und aktuellen Daten bleibt ein heutiger Stand unverändert', () => {
    const today: UserState = { ...EMPTY_STATE, owned: { 'BX-01': 1 }, combos: [{ id: 'c', bladeId: 'StormPegasus', ratchetId: '3-70', bitId: 'RA' }] };
    const res = migrateUserState(today, realRegister, realDb);
    expect(res.changes).toEqual([]);
    expect(res.state).toBe(today);
  });
});
