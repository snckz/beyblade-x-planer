// @vitest-environment node
// Zentraler Freigabestatus (src/lib/release.js): Regel, Migration ohne Massensperre, Schutz in der Datenpipeline.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Database } from '../src/lib/types';
import { buildReleaseIndex, isoDay, lockedParts, playedParts, productRelease } from '../src/lib/release';
import { migrateUserState, normalizeRegister } from '../src/lib/idRegister';
import { ownedParts } from '../src/lib/data';
import { EMPTY_STATE } from '../src/lib/storage';
// @ts-expect-error – JS-Modul ohne Typen
import { validateDb, validateTransition } from '../scripts/validate-data.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { verifyCatalog } from '../scripts/verify-catalog.mjs';

const TODAY = '2026-11-18';
const real = JSON.parse(readFileSync(new URL('../public/data/db.json', import.meta.url), 'utf8')) as Database;
const realMeta = JSON.parse(readFileSync(new URL('../public/data/meta.json', import.meta.url), 'utf8'));

/** Kleine Datenbank: ein altes Teil-Set (BX-01) und ein neues, angekündigtes Produkt mit neuem Blade/Ratchet/Bit. */
function mini(over: Record<string, unknown> = {}): Database {
  return structuredClone({
    version: 1,
    updatedAt: TODAY,
    blades: [
      { id: 'Old', name: 'Old Blade', line: 'BX', type: 'attack', spin: 'right', verified: true },
      { id: 'New', name: 'New Blade', line: 'BX', type: 'attack', spin: 'right', verified: true, imported: true },
    ],
    ratchets: [
      { id: '3-60', contacts: 3, heightMm: 6 },
      { id: '9-90', contacts: 9, heightMm: 9, imported: true },
    ],
    bits: [
      { id: 'F', name: 'Flat', type: 'attack' },
      { id: 'NB', name: 'New Bit', type: 'attack', imported: true },
    ],
    products: [
      { code: 'BX-01', name: 'Starter Old', kind: 'starter', verified: true, bladeId: 'Old', ratchetId: '3-60', bitId: 'F' },
      { code: 'BX-99', name: 'Booster New', kind: 'booster', verified: false, imported: true, bladeId: 'New', ratchetId: '9-90', bitId: 'NB', releaseJp: '2026-12-26' },
      // neues Produkt aus bereits freigegebenen Teilen – darf nichts sperren
      { code: 'BX-98', name: 'Booster Old again', kind: 'booster', verified: false, imported: true, bladeId: 'Old', ratchetId: '3-60', bitId: 'F', releaseJp: '2026-12-26' },
    ],
    ...over,
  }) as unknown as Database;
}
const set = (db: Database, code: string, patch: Record<string, unknown>) => Object.assign(db.products.find((p) => p.code === code)!, patch);

describe('Freigaberegel', () => {
  it('1. angekündigtes neues Blade: angekündigt, im Kombo-Planer gesperrt', () => {
    const r = buildReleaseIndex(mini(), TODAY);
    expect(r.part('blades', 'New')).toMatchObject({ status: 'announced', date: '2026-12-26' });
    expect(r.selectable('blades', 'New')).toBe(false);
  });
  it('4. dasselbe für Ratchets und Bits', () => {
    const r = buildReleaseIndex(mini(), TODAY);
    expect(r.part('ratchets', '9-90').status).toBe('announced');
    expect(r.part('bits', 'NB').status).toBe('announced');
    expect(r.selectable('ratchets', '9-90') || r.selectable('bits', 'NB')).toBe(false);
  });
  it('5. neues Produkt mit bereits freigegebenen Teilen sperrt diese nicht', () => {
    const r = buildReleaseIndex(mini(), TODAY);
    for (const [k, id] of [['blades', 'Old'], ['ratchets', '3-60'], ['bits', 'F']] as const) expect(r.selectable(k, id)).toBe(true);
    expect(r.product('BX-98').released).toBe(false); // das Produkt selbst ist angekündigt
  });
  it('2. erschienen, aber Blade-Daten ungeprüft: weiterhin gesperrt („ungeprüft“)', () => {
    const db = mini();
    set(db, 'BX-99', { verified: true, releaseJp: '2026-11-01' }); // importiert + geprüft = Release laut Wiki
    db.blades.find((b) => b.id === 'New')!.verified = false;
    const r = buildReleaseIndex(db, TODAY);
    expect(r.part('blades', 'New').status).toBe('unchecked');
    expect(r.selectable('blades', 'New')).toBe(false);
    // Bit mit unsicherem Typ ebenso
    db.bits.find((b) => b.id === 'NB')!.uncertain = true;
    expect(buildReleaseIndex(db, TODAY).part('bits', 'NB').status).toBe('unchecked');
  });
  it('3. erschienen und geprüft: auswählbar', () => {
    const db = mini();
    set(db, 'BX-99', { verified: true, releaseJp: '2026-11-01' });
    const r = buildReleaseIndex(db, TODAY);
    expect(r.part('blades', 'New').status).toBe('confirmed');
    expect(r.selectable('ratchets', '9-90') && r.selectable('bits', 'NB')).toBe(true);
  });
  it('Datum vorbei reicht nicht: ohne Bestätigung bleibt es gesperrt', () => {
    const db = mini();
    set(db, 'BX-99', { releaseJp: '2026-11-01' }); // vorbei, aber nicht verified/released
    expect(buildReleaseIndex(db, TODAY).selectable('blades', 'New')).toBe(false);
    // von Hand „geprüft“ mit Datum ist kein Release-Beleg (z. B. UX-22) …
    set(db, 'BX-99', { imported: false, verified: true });
    expect(buildReleaseIndex(db, TODAY).selectable('blades', 'New')).toBe(false);
    // … erst released: true
    set(db, 'BX-99', { released: true });
    expect(buildReleaseIndex(db, TODAY).selectable('blades', 'New')).toBe(true);
  });
  it('6. verschobenes Release: zukünftiges Datum sperrt wieder, Widerspruch wird gemeldet', () => {
    const db = mini();
    set(db, 'BX-99', { verified: true, releaseJp: '2027-02-01' }); // war bestätigt, Termin verschoben
    const r = buildReleaseIndex(db, TODAY);
    expect(r.selectable('blades', 'New')).toBe(false);
    expect(r.conflicts.join(' ')).toContain('BX-99');
  });
  it('7. fehlendes Release-Datum: ungeprüftes Produkt gesperrt, geprüftes Bestandsprodukt frei', () => {
    const db = mini();
    set(db, 'BX-99', { releaseJp: undefined });
    expect(productRelease(db.products.find((p) => p.code === 'BX-99')!, TODAY).released).toBe(false);
    expect(buildReleaseIndex(db, TODAY).selectable('blades', 'New')).toBe(false);
    expect(productRelease(db.products.find((p) => p.code === 'BX-01')!, TODAY).released).toBe(true);
  });
  it('regionale Releases: ein erschienenes Produkt (z. B. Hasbro) genügt fürs Teil', () => {
    const db = mini();
    db.products.push({ code: 'G9999', name: 'Starter New (Hasbro)', kind: 'starter', verified: true, imported: true, region: 'hasbro', bladeId: 'New', ratchetId: '9-90', bitId: 'NB' } as never);
    expect(buildReleaseIndex(db, TODAY).selectable('blades', 'New')).toBe(true);
  });
  it('in Turnier-Siegerdecks gespielt = erschienen (z. B. Hasbro vor dem Japan-Release); Teiledaten trotzdem nötig', () => {
    const db = mini();
    const meta = { counts: { 'New|9-90|NB': 3 } };
    const r = buildReleaseIndex(db, TODAY, meta);
    expect(r.part('blades', 'New')).toMatchObject({ status: 'confirmed', reason: 'in Turnier-Siegerdecks gespielt' });
    expect(r.selectable('bits', 'NB') && r.selectable('ratchets', '9-90')).toBe(true);
    expect(r.product('BX-99').released).toBe(false); // das Produkt selbst bleibt angekündigt
    db.blades.find((b) => b.id === 'New')!.verified = false;
    expect(buildReleaseIndex(db, TODAY, meta).part('blades', 'New').status).toBe('unchecked');
  });
  it('Teil ohne Produkt: von Hand gepflegt frei, importiert gesperrt', () => {
    const db = mini();
    db.ratchets.push({ id: '1-70', contacts: 1, heightMm: 7 } as never, { id: '2-70', contacts: 2, heightMm: 7, imported: true } as never);
    const r = buildReleaseIndex(db, TODAY);
    expect(r.selectable('ratchets', '1-70')).toBe(true);
    expect(r.selectable('ratchets', '2-70')).toBe(false);
  });
  it('12. direkte Auswahl gesperrter Teile wird erkannt (lockedParts)', () => {
    const r = buildReleaseIndex(mini(), TODAY);
    expect(lockedParts(r, { bladeId: 'New', ratchetId: '3-60', bitId: 'F' })).toEqual([{ kind: 'blades', id: 'New' }]);
    expect(lockedParts(r, { bladeId: 'Old', ratchetId: '3-60', bitId: 'F' })).toEqual([]);
    expect(lockedParts(r, { bladeId: 'Unbekannt', bitId: 'F' })).toHaveLength(1); // unbekannte ID ist nie wählbar
  });
});

// Echter Datenbestand: Er ändert sich täglich (Neuheiten-Radar). Darum hier keine festen Listen, sondern Regeln,
// die immer gelten müssen – mit dem heutigen Datum. Die Zahlen der Migration stehen im Bericht zu Phase 4.
describe('Echter Datenbestand (11: keine Massensperre)', () => {
  const today = isoDay();
  const r = buildReleaseIndex(real, today, realMeta);
  const played = playedParts(realMeta);
  const KEYS = { blades: 'bladeId', ratchets: 'ratchetId', bits: 'bitId' } as const;
  it('gesperrt ist nur, was in keinem erschienenen Produkt steckt und nicht im Turnier gespielt wird', () => {
    for (const kind of ['blades', 'ratchets', 'bits'] as const) {
      for (const part of real[kind]) {
        if (r.selectable(kind, part.id)) continue;
        const inReleased = real.products.some((p) => p[KEYS[kind]] === part.id && r.product(p.code).released);
        expect(inReleased, `${kind} ${part.id}`).toBe(false);
        expect(played[kind].has(part.id), `${kind} ${part.id}`).toBe(false);
      }
    }
  });
  it('höchstens ein kleiner Teil gesperrt (Schutz vor Massensperre)', () => {
    const c = r.counts();
    for (const kind of ['blades', 'ratchets', 'bits'] as const) expect(c[kind].confirmed / real[kind].length).toBeGreaterThan(0.9);
  });
  it('kein Teil aus der Turnier-Meta ist gesperrt', () => {
    for (const c of realMeta.combos ?? []) expect(lockedParts(r, { ...c, ratchetId: c.ratchetId ?? undefined })).toEqual([]);
  });
  it('9./10. gespeicherte Kombos, Deck und Sammlung bleiben unverändert erhalten', () => {
    // Kombo mit einem Teil, das (in der kleinen Testdatenbank) gesperrt ist, plus eine normale
    const state = {
      ...EMPTY_STATE,
      owned: { 'BX-01': 1, 'BX-99': 1 },
      combos: [
        { id: 'a', bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' },
        { id: 'b', bladeId: 'New', ratchetId: '9-90', bitId: 'NB' },
      ],
      deck: ['a', 'b'],
    };
    const before = JSON.stringify(state);
    // Freigabe verändert keine Nutzerdaten (die einzige Umstellung beim Laden ist das ID-Register)
    const reg = normalizeRegister(JSON.parse(readFileSync(new URL('../public/data/aliases.json', import.meta.url), 'utf8')));
    expect(JSON.stringify(migrateUserState(state, reg, real).state)).toBe(before);
    const m = buildReleaseIndex(mini(), TODAY);
    expect(lockedParts(m, state.combos[1]!).map((x) => x.id)).toEqual(['New', '9-90', 'NB']);
    expect(lockedParts(r, state.combos[0]!)).toEqual([]);
    // Sammlung zählt weiter alles, was man hat – auch Vorbestelltes
    expect(ownedParts(mini(), state.owned).blades.has('New')).toBe(true);
  });
});

describe('Datenpipeline: Status bleibt erhalten (Datenverlust-Schutz)', () => {
  it('Zurücksetzen von verified/released/geprüftem Bit-Typ wird abgelehnt', () => {
    const prev = mini();
    set(prev, 'BX-01', { released: true });
    const next = structuredClone(prev);
    set(next, 'BX-01', { verified: false, released: false });
    next.blades.find((b) => b.id === 'Old')!.verified = false;
    next.bits.find((b) => b.id === 'F')!.uncertain = true;
    const errors = validateTransition(prev, next).join('\n');
    expect(errors).toContain('BX-01: Bestätigung (verified)');
    expect(errors).toContain('BX-01: Release-Bestätigung (released)');
    expect(errors).toContain('Blade Old');
    expect(errors).toContain('Bit F');
    expect(validateTransition(prev, structuredClone(prev))).toEqual([]);
  });
  it('released muss true/false sein', () => {
    const db = mini();
    set(db, 'BX-01', { released: 'ja' });
    expect(validateDb(db).join(' ')).toContain('released muss true/false sein');
  });
  it('8. verify-catalog bestätigt einen Release nur mit Wiki-Beleg – wiederholt idempotent', async () => {
    const db = mini();
    // von Hand gepflegt, geprüft, Datum vorbei – aber noch kein Release-Beleg
    set(db, 'BX-99', { imported: false, verified: true, releaseJp: '2026-11-10', source: 'https://beyblade.fandom.com/wiki/New_9-90NB' });
    const today = new Date(`${TODAY}T12:00:00Z`);
    // Wiki meldet noch nichts → bleibt gesperrt, wird als „unbestätigt“ gemeldet
    const pending = await verifyCatalog(db, async () => 'Nothing here.', today);
    expect(pending.report.releasePending).toContain('BX-99');
    expect(buildReleaseIndex(pending.db, TODAY).selectable('blades', 'New')).toBe(false);
    // Wiki meldet den Release → released: true
    const page = "'''New''' was released as a Booster in Japan on November 10th, 2026.";
    const first = await verifyCatalog(db, async (t: string) => (t === 'New 9-90NB' ? page : null), today);
    expect(first.report.releaseConfirmed).toEqual(['BX-99']);
    expect(buildReleaseIndex(first.db, TODAY).selectable('blades', 'New')).toBe(true);
    // zweiter Lauf: nichts mehr zu tun, Datenstand gleich, kein Rücksetzen
    const second = await verifyCatalog(first.db, async () => null, today);
    expect(JSON.stringify(second.db)).toBe(JSON.stringify(first.db));
    expect(second.report.releaseConfirmed).toEqual([]);
    expect(validateTransition(first.db, second.db)).toEqual([]);
  });
  it('Release-Bestätigung nur über die eigene Seite (nie über die Seite eines anderen Produkts)', async () => {
    const db = mini();
    // ohne Quelle, und ein anderes Produkt hat dieselbe Kombo → keine Seite eindeutig → bleibt unbestätigt
    set(db, 'BX-99', { imported: false, verified: true, releaseJp: '2026-11-10' });
    db.products.push({ code: 'BX-97', name: 'Old reissue', kind: 'booster', verified: true, bladeId: 'New', ratchetId: '9-90', bitId: 'NB' } as never);
    const res = await verifyCatalog(db, async () => 'It was released in Japan on July 1st, 2024.', new Date(`${TODAY}T12:00:00Z`));
    expect(res.report.releasePending).toContain('BX-99');
    expect(res.db.products.find((p: { code: string }) => p.code === 'BX-99').released).toBeUndefined();
  });
  it('Zusammenführen über das ID-Register gilt nicht als Rücksetzen', () => {
    const prev = mini();
    const next = structuredClone(prev);
    next.blades = next.blades.filter((b) => b.id !== 'Old');
    next.blades.find((b) => b.id === 'New')!.verified = false;
    for (const p of next.products) if (p.bladeId === 'Old') p.bladeId = 'New';
    const reg = normalizeRegister({ retired: { blades: { Old: 'New' } } });
    expect(validateTransition(prev, next, reg).join(' ')).not.toContain('Blade Old');
  });
});
