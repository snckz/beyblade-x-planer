// Phase 1: Datenverlust bei automatischen Updates verhindern.
// Regressionstests für den Fehler, durch den der Hasbro-Import bei Abruffehlern Bestandsprodukte samt Blade löschte,
// sowie für die Übergangsprüfung (validateTransition), das sichere Schreiben (writeDbSafely) und retired.json.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error – JS-Modul ohne Typen
import { mergeHasbro, parseHasbroList, run as runHasbro } from '../scripts/import-hasbro.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { mergeCatalog, parseList, run as runCatalog } from '../scripts/import-catalog.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { validateRetired, validateTransition } from '../scripts/validate-data.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { DataSafetyError, writeDbSafely, writeFileAtomic } from '../scripts/data-safety.mjs';
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

describe('Root Cause: Abruffehler galten als „Seite fehlt“ und löschten Bestandsprodukte', () => {
  it('Regression: Netzwerkfehler beim Seitenabruf bricht den Hasbro-Import ab statt Produkt und Blade zu löschen', async () => {
    // Vorher: mergeHasbro lieferte ein gültiges Ergebnis OHNE das Produkt und OHNE das Blade SavageBear.
    await expect(
      mergeHasbro(clone(), savageEntries(), async () => {
        throw new Error('HTTP 503');
      }),
    ).rejects.toThrow('HTTP 503');
  });

  it('Regression end-to-end: HTTP 503 im Wiki → db.json bleibt byte-gleich, Bericht nennt den Fehler', async () => {
    const d = dataDir();
    const before = d.db();
    const list = `|-\n|${savage.code}\n|[[${savageTitle}]]\n`;
    const fetchFn = async (url: string) => (url.includes('List_of') || url.includes('List+of') ? json({ parse: { title: 'List', wikitext: list } }) : http(503));
    const res = await runHasbro({ fetchFn: fetchFn as typeof fetch, dataDir: d.url });
    expect(res.changed).toBe(false);
    expect(d.db()).toBe(before);
    const report = JSON.parse(readFileSync(join(d.dir, 'hasbro-report.json'), 'utf8'));
    expect(report.ok).toBe(false);
    expect(report.error).toContain('HTTP 503');
  });

  it('tatsächlich fehlende Seite ist keine Löschanweisung: Produkt und Blade bleiben, Bericht meldet „kept“', async () => {
    const res = await mergeHasbro(clone(), savageEntries(), async () => null);
    expect(codes(res.db).has(savage.code)).toBe(true);
    expect(res.db.blades.some((b: { id: string }) => b.id === 'SavageBear')).toBe(true);
    expect(res.report.kept).toContain(savage.code);
    expect(validateTransition(realDb, res.db)).toEqual([]);
  });
});

describe('Importquelle leer, unvollständig oder fehlerhaft', () => {
  it('leere Hasbro-Liste: alle Bestandsprodukte und Blades bleiben erhalten', async () => {
    const res = await mergeHasbro(clone(), [], async () => null);
    expect(codes(res.db)).toEqual(codes(realDb));
    expect(new Set(res.db.blades.map((b: { id: string }) => b.id))).toEqual(new Set(realDb.blades.map((b) => b.id)));
    expect(validateTransition(realDb, res.db)).toEqual([]);
  });

  it('Hasbro-Liste nicht abrufbar: Import bricht ab, db.json unverändert', async () => {
    const d = dataDir();
    const before = d.db();
    const res = await runHasbro({ fetchFn: (async () => http(502)) as typeof fetch, dataDir: d.url });
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
    // fehlende Seite (null): Import läuft durch, Bestand bleibt
    const res = await mergeHasbro(clone(), savageEntries(), async () => null);
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
