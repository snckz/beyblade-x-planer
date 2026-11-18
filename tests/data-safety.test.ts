// Phase 1: Datenverlust bei automatischen Updates verhindern.
// Regressionstests für den Fehler, durch den der Hasbro-Import bei Abruffehlern Bestandsprodukte samt Blade löschte,
// sowie für die Übergangsprüfung (validateTransition), das sichere Schreiben (writeDbSafely) und retired.json.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error – JS-Modul ohne Typen
import { mergeHasbro, parseHasbroList, run as runHasbro } from '../scripts/import-hasbro.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { mergeCatalog, parseList, run as runCatalog, wikitextOf } from '../scripts/import-catalog.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { validateRetired, validateTransition } from '../scripts/validate-data.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { DataSafetyError, writeDbSafely, writeFileAtomic } from '../scripts/data-safety.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { run as runNames } from '../scripts/update-hasbro.mjs';
import { resolveCombo } from '../src/lib/analysis';
import type { Database } from '../src/lib/types';

const realDb = JSON.parse(readFileSync(join(process.cwd(), 'public/data/db.json'), 'utf8')) as Database;
const clone = () => structuredClone(realDb);

/** Kreisel-Seite im Wiki-Stil */
const beyPage = (type: string, bit: string) => `'''X''' is a ${type} Type Beyblade. It was released in Australia on April 1st, 2026.\n[[Bit - ${bit}]]\n==Features==\n`;

/** Ein bestehendes Hasbro-exklusives Produkt (Blade nur durch den Hasbro-Import angelegt) */
const savage = realDb.products.find((p) => p.bladeId === 'SavageBear' && p.region === 'hasbro')!;
const savageTitle = decodeURIComponent(savage.source!.split('/wiki/')[1]!).replace(/_/g, ' ');
const savageEntries = () => parseHasbroList(`|-\n|${savage.code}\n|[[${savageTitle}]]\n`);
const codes = (db: Database) => new Set(db.products.map((p) => p.code));

/** Datenordner mit Kopie der echten Daten (für run() mit Dateizugriff) */
function dataDir(extra: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bx-data-'));
  writeFileSync(join(dir, 'db.json'), JSON.stringify(realDb, null, 2) + '\n');
  for (const [f, v] of Object.entries(extra)) writeFileSync(join(dir, f), JSON.stringify(v, null, 2) + '\n');
  return { dir, url: pathToFileURL(dir + '/'), db: () => readFileSync(join(dir, 'db.json'), 'utf8') };
}

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const http = (status: number) => ({ ok: false, status, json: async () => ({}) }) as Response;

const newHasbro = '|-\n|G9998\n|[[Comet Owl 3-60F]]\n';

describe('Root Cause: Abruffehler galten als „Seite fehlt“ und löschten Bestandsprodukte', () => {
  it('Regression: bekannte Produkte bleiben auch bei Netzwerkfehlern erhalten (kein Neuaufbau, kein Abruf nötig)', async () => {
    // Vorher: Neuaufbau entfernte G0286 samt Blade SavageBear, der Abruf scheiterte, beides fehlte im Ergebnis.
    const res = await mergeHasbro(clone(), savageEntries(), async () => {
      throw new Error('HTTP 503');
    });
    expect(codes(res.db).has(savage.code)).toBe(true);
    expect(res.db.blades.some((b: { id: string }) => b.id === 'SavageBear')).toBe(true);
    expect(res.report.existing).toBe(1);
    expect(validateTransition(realDb, res.db)).toEqual([]);
  });

  it('Netzwerkfehler beim Abruf eines neuen Produkts bricht den Import ab (gilt nicht als „Seite fehlt“)', async () => {
    await expect(
      mergeHasbro(clone(), parseHasbroList(newHasbro), async () => {
        throw new Error('HTTP 503');
      }),
    ).rejects.toThrow('HTTP 503');
  });

  it('end-to-end: HTTP 503 im Wiki → Fehlerstatus, db.json byte-gleich, Bericht nennt den Fehler', async () => {
    const d = dataDir();
    const before = d.db();
    const list = `|-\n|${savage.code}\n|[[${savageTitle}]]\n${newHasbro}`;
    const fetchFn = async (url: string) => (url.includes('List_of') || url.includes('List+of') ? json({ parse: { title: 'List', wikitext: list } }) : http(503));
    const res = await runHasbro({ fetchFn: fetchFn as typeof fetch, dataDir: d.url });
    expect(res.status).toBe('error');
    expect(res.changed).toBe(false);
    expect(d.db()).toBe(before);
    const report = JSON.parse(readFileSync(join(d.dir, 'hasbro-report.json'), 'utf8'));
    expect(report.status).toBe('error');
    expect(report.error).toContain('HTTP 503');
  });

  it('fehlende Seite eines neuen Produkts: Teilerfolg wird als „partial“ gemeldet, Bestand unverändert', async () => {
    const d = dataDir();
    const before = d.db();
    const list = `|-\n|${savage.code}\n|[[${savageTitle}]]\n${newHasbro}`;
    const fetchFn = async (url: string) => (url.includes('List_of') || url.includes('List+of') ? json({ parse: { title: 'List', wikitext: list } }) : json({ error: { code: 'missingtitle' } }));
    const res = await runHasbro({ fetchFn: fetchFn as typeof fetch, dataDir: d.url });
    expect(res.status).toBe('partial');
    expect(res.report.ok).toBe(false); // nicht als vollständig erfolgreich gemeldet
    expect(res.report.skipped[0]).toMatchObject({ code: 'G9998', reason: 'Seite fehlt' });
    expect(d.db()).toBe(before);
  });
});

describe('Importquelle leer, unvollständig oder fehlerhaft', () => {
  it('Quelle ohne Einträge: Bestand bleibt vollständig, nicht Gelieferte stehen nur im Bericht', async () => {
    const res = await mergeHasbro(clone(), [], async () => null);
    expect(codes(res.db)).toEqual(codes(realDb));
    expect(JSON.stringify(res.db)).toBe(JSON.stringify(realDb));
    expect(res.report.missingFromSource.length).toBe(realDb.products.filter((p) => p.region === 'hasbro').length);
  });

  it('leere oder stark geschrumpfte Liste ist ein Fehler, kein „nichts Neues“', async () => {
    const d = dataDir({ 'hasbro-report.json': { codes: 139 } });
    const before = d.db();
    const list = `|-\n|${savage.code}\n|[[${savageTitle}]]\n`;
    const fetchFn = async () => json({ parse: { title: 'List', wikitext: list } });
    const res = await runHasbro({ fetchFn: fetchFn as typeof fetch, dataDir: d.url });
    expect(res.status).toBe('error');
    expect(res.report.error).toContain('Hasbro-Liste unvollständig: 1 Artikelnummern gelesen, zuletzt 139');
    expect(d.db()).toBe(before);
    const empty = await runHasbro({ fetchFn: (async () => json({ parse: { title: 'List', wikitext: 'nichts' } })) as typeof fetch, dataDir: dataDir().url });
    expect(empty.status).toBe('error');
  });

  it('Hasbro-Liste nicht abrufbar: Fehlerstatus, db.json unverändert', async () => {
    const d = dataDir();
    const before = d.db();
    const res = await runHasbro({ fetchFn: (async () => http(502)) as typeof fetch, dataDir: d.url });
    expect(res.status).toBe('error');
    expect(res.changed).toBe(false);
    expect(d.db()).toBe(before);
  });

  it('Katalog: Netzwerkfehler während des Imports → db.json unverändert', async () => {
    const d = dataDir();
    const before = d.db();
    const res = await runCatalog({
      fetchFn: (async () => {
        throw new Error('ECONNRESET');
      }) as typeof fetch,
      dataDir: d.url,
    });
    expect(res.changed).toBe(false);
    expect(d.db()).toBe(before);
  });

  it('Katalog: Wiki-Fehlerantwort (z. B. Drosselung) gilt nicht als „Seite fehlt“', async () => {
    const entries = parseList('|-\n|BX-90\n|[[NovaFalcon 3-60QZ]]\n');
    const fetchPage = async () => {
      throw new Error('Wiki-Fehler ratelimited');
    };
    await expect(mergeCatalog(clone(), entries, fetchPage)).rejects.toThrow('ratelimited');
  });
});

describe('Phase 2: Hasbro-Import ergänzt schrittweise', () => {
  const setCode = realDb.products.find((p) => p.region === 'hasbro' && /-02$/.test(p.code))!.code.slice(0, -3);
  const setProducts = realDb.products.filter((p) => p.code.startsWith(`${setCode}-`));
  const title = (p: (typeof realDb.products)[number]) => decodeURIComponent(p.source!.split('/wiki/')[1]!).replace(/_/g, ' ');
  const setList = (order: typeof setProducts, extra = '') => `|-\n|${setCode}\n|Dual Pack ${order.map((p) => `[[${title(p)}]]`).join(' ')}${extra}\n`;

  it('Set-Inhalte werden über die Teile wiedererkannt, nicht über die Reihenfolge', async () => {
    const reversed = [...setProducts].reverse();
    const res = await mergeHasbro(clone(), parseHasbroList(setList(reversed)), async () => null);
    expect(res.report.added.products).toEqual([]);
    expect(res.report.existing).toBe(setProducts.length);
    expect(validateTransition(realDb, res.db)).toEqual([]); // keine Nummer bekommt andere Teile
  });

  it('neuer Kreisel in einer bekannten Packung bekommt die nächste freie Nummer', async () => {
    const res = await mergeHasbro(clone(), parseHasbroList(setList(setProducts, ' [[Comet Owl 3-60F]]')), async (t: string) => ({ title: t, wikitext: beyPage('Stamina', 'Flat') }));
    expect(res.report.added.products).toEqual([`${setCode}-${String(setProducts.length + 1).padStart(2, '0')}`]);
    expect(validateTransition(realDb, res.db)).toEqual([]);
  });

  it('erst nach der Weiterleitung erkannter Kreisel wird nicht doppelt angelegt', async () => {
    const db = clone();
    db.blades.push({ id: 'FooBar', name: 'Foo Bar', line: 'BX', type: 'attack', spin: 'right', verified: true } as (typeof db.blades)[number]);
    db.products.push({ code: 'G7777', name: 'Booster Foo Bar 3-60F', kind: 'booster', bladeId: 'FooBar', ratchetId: '3-60', bitId: 'F', region: 'hasbro', verified: true, imported: true } as (typeof db.products)[number]);
    const res = await mergeHasbro(db, parseHasbroList('|-\n|G7777\n|[[Baz Qux 3-60F]]\n'), async () => ({ title: 'FooBar 3-60F', wikitext: beyPage('Attack', 'Flat') }));
    expect(res.report.added.blades).toEqual([]);
    expect(res.report.added.products).toEqual([]);
    expect(res.report.existing).toBe(1);
  });

  it('bekannte Produkte: Prüfstatus und Daten bleiben; nur ein neuer US-Preis wird ergänzt, nie gelöscht', async () => {
    const db = clone();
    const p = db.products.find((x) => x.code === savage.code)!;
    p.verified = true;
    p.releaseJp = '2026-04-01';
    const withPrice = await mergeHasbro(db, parseHasbroList(`|-\n|${savage.code}\n|[[${savageTitle}]]\n|$12.99\n`), async () => null);
    const after = withPrice.db.products.find((x: { code: string }) => x.code === savage.code);
    expect(after).toMatchObject({ verified: true, releaseJp: '2026-04-01', bladeId: p.bladeId, bitId: p.bitId });
    const noPrice = await mergeHasbro(withPrice.db, savageEntries(), async () => null);
    expect(noPrice.db.products.find((x: { code: string }) => x.code === savage.code).priceUsd).toBe(after.priceUsd);
  });

  it('kompletter Lauf über alle Bestandsprodukte: keine neuen Einträge, keine Duplikate, idempotent', async () => {
    // Quelle wie heute: alle bekannten Hasbro-Produkte (Einzelprodukte und Sets) in Listenform
    const groups = new Map<string, (typeof realDb.products)[number][]>();
    for (const p of realDb.products.filter((x) => x.region === 'hasbro' && x.source)) {
      const base = p.code.replace(/-\d{2}$/, '');
      groups.set(base, [...(groups.get(base) ?? []), p]);
    }
    const list = [...groups].map(([c, ps]) => `|-\n|${c}\n|${ps.length > 1 ? 'Dual Pack ' : ''}${ps.map((p) => `[[${title(p)}]]`).join(' ')}\n`).join('');
    const page = async () => null;
    const a = await mergeHasbro(clone(), parseHasbroList(list), page);
    const b = await mergeHasbro(a.db, parseHasbroList(list), page);
    expect(a.report.added.products).toEqual([]);
    expect(a.db.products.length).toBe(realDb.products.length);
    expect(new Set(a.db.products.map((p: { code: string }) => p.code)).size).toBe(a.db.products.length);
    expect(JSON.stringify(b.db)).toBe(JSON.stringify(a.db));
    expect(validateTransition(realDb, a.db)).toEqual([]);
    // Geprüftes wird nicht verschlechtert: Prüfstatus, Typ, Drehrichtung und Gewicht aller Blades, Prüfstatus der Produkte
    const key = (b: { id: string; verified: boolean; type: string; spin: string; weightG?: number | null }) => `${b.id}|${b.verified}|${b.type}|${b.spin}|${b.weightG}`;
    expect(a.db.blades.map(key)).toEqual(realDb.blades.map(key));
    expect(a.db.products.map((p: { code: string; verified: boolean }) => `${p.code}|${p.verified}`)).toEqual(realDb.products.map((p) => `${p.code}|${p.verified}`));
  });
});

describe('Erfolgreiche und wiederholte Updates', () => {
  it('neue Produkte werden ergänzt, nichts Bestehendes geht verloren', async () => {
    const entries = parseList('|-\n|BX-90\n|[[NovaFalcon 3-60QZ]]\n');
    const res = await mergeCatalog(clone(), entries, async (t: string) => (t === 'NovaFalcon 3-60QZ' ? beyPage('Attack', 'Quartz') : null));
    expect(res.report.added.products).toEqual(['BX-90']);
    expect(res.report.added.blades).toEqual(['NovaFalcon']);
    expect(res.report.added.bits).toEqual(['QZ']);
    expect(validateTransition(realDb, res.db)).toEqual([]);
  });

  it('neues Hasbro-Produkt mit neuem Blade: ergänzt, Bestand bleibt', async () => {
    const entries = parseHasbroList('|-\n|G9998\n|[[Comet Owl 3-60F]]\n');
    const res = await mergeHasbro(clone(), entries, async (t: string) => ({ title: t, wikitext: beyPage('Stamina', 'Flat') }));
    expect(res.report.added.products).toContain('G9998');
    expect(validateTransition(realDb, res.db)).toEqual([]);
  });

  it('derselbe Import zweimal: zweiter Lauf ändert nichts (Katalog und Hasbro)', async () => {
    const entries = () => parseList('|-\n|BX-90\n|[[NovaFalcon 3-60QZ]]\n');
    const page = async (t: string) => (t === 'NovaFalcon 3-60QZ' ? beyPage('Attack', 'Quartz') : null);
    const a = await mergeCatalog(clone(), entries(), page);
    const b = await mergeCatalog(a.db, entries(), page);
    expect(JSON.stringify(b.db)).toBe(JSON.stringify(a.db));
    const h1 = await mergeHasbro(clone(), savageEntries(), async (t: string) => ({ title: t, wikitext: beyPage('Balance', 'Flat') }));
    const h2 = await mergeHasbro(h1.db, savageEntries(), async (t: string) => ({ title: t, wikitext: beyPage('Balance', 'Flat') }));
    expect(JSON.stringify(h2.db)).toBe(JSON.stringify(h1.db));
  });

  it('unveränderte Daten: nichts wird geschrieben', () => {
    const d = dataDir();
    const path = join(d.dir, 'db.json');
    const mtime = statSync(path).mtimeMs;
    expect(writeDbSafely(d.url, clone(), clone())).toBe(false);
    expect(statSync(path).mtimeMs).toBe(mtime);
  });
});

describe('Übergangsprüfung: plötzlich fehlende oder umbelegte Bestandsdaten', () => {
  it('fehlendes Produkt, Blade, Ratchet oder Bit wird erkannt', () => {
    const next = clone();
    next.products = next.products.filter((p) => p.code !== savage.code);
    next.blades = next.blades.filter((b) => b.id !== 'SavageBear');
    const errors = validateTransition(realDb, next);
    expect(errors.join('\n')).toContain(savage.code);
    expect(errors.join('\n')).toContain('SavageBear');
  });

  it('Massenverlust (alle Hasbro-Produkte weg) wird erkannt und nennt die Anzahl', () => {
    const next = clone();
    const n = next.products.filter((p) => p.region === 'hasbro').length;
    next.products = next.products.filter((p) => p.region !== 'hasbro');
    expect(validateTransition(realDb, next)[0]).toContain(`${n} Produkte würden verschwinden`);
  });

  it('Produktnummer mit anderen Teilen wird erkannt (gespeicherte Sammlungen würden umgedeutet)', () => {
    const next = clone();
    const p = next.products.find((x) => x.code === 'BX-01')!;
    p.bitId = 'LF';
    expect(validateTransition(realDb, next).join('\n')).toContain('Produkt BX-01 bekäme andere Teile');
  });

  it('verdächtiges Update wird abgelehnt: DataSafetyError, db.json bleibt byte-gleich', () => {
    const d = dataDir();
    const before = d.db();
    const next = clone();
    next.products = next.products.slice(0, 10);
    expect(() => writeDbSafely(d.url, clone(), next)).toThrow(DataSafetyError);
    expect(d.db()).toBe(before);
  });

  it('Kommandozeile (Workflow-Schranke): --previous meldet Datenverlust mit Exit-Code 1', () => {
    const d = dataDir();
    const prev = clone();
    prev.products.push({ ...prev.products[0]!, code: 'BX-999' });
    const prevPath = join(d.dir, 'prev.json');
    writeFileSync(prevPath, JSON.stringify(prev));
    let out = '';
    try {
      execFileSync('node', ['scripts/validate-data.mjs', '--previous', prevPath], { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      out = String((e as { stderr?: string }).stderr);
      expect((e as { status?: number }).status).toBe(1);
    }
    expect(out).toContain('Datenverlust-Schutz');
    expect(out).toContain('BX-999');
  });
});

describe('Kontrollierte Löschung und Umbenennung (retired.json)', () => {
  it('eingetragene Löschung und Umbenennung sind erlaubt, sonst nichts', () => {
    const next = clone();
    next.products = next.products.filter((p) => p.code !== savage.code);
    const retired = { products: { [savage.code]: null } };
    expect(validateTransition(realDb, next, retired)).toEqual([]);
    next.products = next.products.filter((p) => p.code !== 'BX-01');
    expect(validateTransition(realDb, next, retired).join('\n')).toContain('BX-01');
  });

  it('Korrektur einer Produktnummer nur mit Grund in `reassigned`', () => {
    const next = clone();
    next.products.find((x) => x.code === 'BX-01')!.bitId = 'LF';
    expect(validateTransition(realDb, next, { reassigned: { 'BX-01': 'Wiki-Korrektur: Bit war falsch' } })).toEqual([]);
  });

  it('retired.json selbst wird geprüft: Stillgelegtes darf nicht mehr da sein, Ziel muss existieren', () => {
    expect(validateRetired({ blades: { DranSword: null } }, realDb)[0]).toContain('steht aber noch in db.json');
    expect(validateRetired({ blades: { GoneBlade: 'NoSuchBlade' } }, realDb)[0]).toContain('gibt es nicht');
    expect(validateRetired({ blades: { GoneBlade: 'DranSword' } }, realDb)).toEqual([]);
    expect(validateRetired({ reassigned: { 'BX-01': '' } }, realDb)[0]).toContain('Grund fehlt');
  });

  it('Importe legen Stillgelegtes nicht wieder an', async () => {
    const entries = parseList('|-\n|BX-90\n|[[NovaFalcon 3-60QZ]]\n');
    const page = async () => beyPage('Attack', 'Quartz');
    const res = await mergeCatalog(clone(), entries, page, { retired: { products: { 'BX-90': null } } });
    expect(res.report.added.products).toEqual([]);
    const h = await mergeHasbro(clone(), parseHasbroList('|-\n|G9998\n|[[Comet Owl 3-60F]]\n'), async (t: string) => ({ title: t, wikitext: beyPage('Stamina', 'Flat') }), {
      retired: { blades: { CometOwl: null } },
    });
    expect(h.report.added.products).not.toContain('G9998');
  });
});

describe('Schutz bestehender IDs und gespeicherter Referenzen', () => {
  it('gespeicherte Kombo und Sammlung mit Hasbro-exklusivem Kreisel bleiben nach fehlerhaftem Import auflösbar', async () => {
    const combo = { id: 'c1', bladeId: 'SavageBear', ratchetId: savage.ratchetId, bitId: savage.bitId! };
    // Quelle liefert den Kreisel nicht mehr (leere Liste): Bestand bleibt
    const res = await mergeHasbro(clone(), [], async () => null);
    expect(resolveCombo(res.db as Database, combo)).not.toBeNull();
    expect(res.db.products.some((p: { code: string }) => p.code === savage.code)).toBe(true); // Sammlung: Produktnummer existiert weiter
  });

  it('atomares Schreiben: vollständige Datei, keine temporären Reste', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bx-atomic-'));
    const path = join(dir, 'x.json');
    writeFileAtomic(path, '{"a":1}\n');
    expect(readFileSync(path, 'utf8')).toBe('{"a":1}\n');
    expect(readdirSync(dir)).toEqual(['x.json']);
  });
});

describe('Befunde aus dem Review', () => {
  it('Umbenennung laut retired.json gilt auch für die Teile bestehender Produkte', () => {
    const next = clone();
    const old = next.blades.find((b) => b.id === 'SavageBear')!;
    next.blades = next.blades.filter((b) => b.id !== 'SavageBear');
    next.blades.push({ ...old, id: 'SavageGrizzly' });
    for (const p of next.products) if (p.bladeId === 'SavageBear') p.bladeId = 'SavageGrizzly';
    expect(validateTransition(realDb, next, { blades: { SavageBear: 'SavageGrizzly' } })).toEqual([]);
    expect(validateTransition(realDb, next).length).toBeGreaterThan(0); // ohne Eintrag: abgelehnt
  });

  it('Wiki-Antworten „gibt es nicht“ (invalidtitle …) gelten als fehlende Seite, Drosselung als Abruffehler', async () => {
    const wiki = (code: string) => (async () => json({ error: { code } })) as typeof fetch;
    await expect(wikitextOf(wiki('invalidtitle'), 'Bad|Title')).resolves.toBeNull();
    await expect(wikitextOf(wiki('missingtitle'), 'Nope')).resolves.toBeNull();
    await expect(wikitextOf(wiki('ratelimited'), 'X')).rejects.toThrow('ratelimited');
  });

  it('gescheitertes atomares Schreiben hinterlässt keine temporäre Datei', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bx-atomic-'));
    const target = join(dir, 'db.json');
    mkdirSync(join(target, 'blockiert'), { recursive: true }); // Ziel ist ein Ordner → Umbenennen scheitert
    expect(() => writeFileAtomic(target, '{}')).toThrow();
    expect(readdirSync(dir)).toEqual(['db.json']);
  });
});

describe('Phase 2: Hasbro-Namen (Heuristik) verschlechtern nichts', () => {
  const autoNamed = realDb.blades.filter((b) => b.hasbroName && b.hasbroNameAuto);

  it('Heuristik findet einen Namen nicht wieder: vorhandene Namen bleiben (kein Löschen, kein Überschreiben)', async () => {
    expect(autoNamed.length).toBeGreaterThan(0);
    const d = dataDir();
    const before = d.db();
    // Liste ohne verwertbare Namen
    const res = await runNames({ fetchFn: (async () => json({ parse: { title: 'List', wikitext: 'Keine Kreisel hier.' } })) as typeof fetch, dataDir: d.url });
    expect(res.status).toBe('ok');
    expect(res.changed).toBe(false);
    expect(d.db()).toBe(before);
  });

  it('Liste nicht abrufbar: Fehlerstatus statt „nichts gefunden“, db.json unverändert', async () => {
    const d = dataDir();
    const before = d.db();
    const res = await runNames({ fetchFn: (async () => http(503)) as typeof fetch, dataDir: d.url });
    expect(res.status).toBe('error');
    expect(res.error).toContain('HTTP 503');
    expect(d.db()).toBe(before);
  });
});

