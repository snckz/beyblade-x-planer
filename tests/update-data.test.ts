// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error – JS-Modul ohne Typen
import { highestCodes, mergeNews, run, wikiUrl } from '../scripts/update-data.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { validateDb } from '../scripts/validate-data.mjs';

const dataDir = new URL('../public/data/', import.meta.url);

function tmpData() {
  const dir = mkdtempSync(join(tmpdir(), 'bx-'));
  // Nur die von Hand gepflegten Daten – der Katalog-Import ändert die echte db.json laufend.
  const db = JSON.parse(readFileSync(new URL('db.json', dataDir), 'utf8'));
  for (const k of ['blades', 'ratchets', 'bits', 'products']) db[k] = db[k].filter((x: { imported?: boolean }) => !x.imported);
  writeFileSync(join(dir, 'db.json'), JSON.stringify(db));
  writeFileSync(join(dir, 'news.json'), JSON.stringify({ updatedAt: null, lastRunOk: true, items: [] }));
  return { dir, url: pathToFileURL(dir + '/') };
}

function fakeFetch(handler: (params: URLSearchParams) => unknown) {
  return async (url: string) => {
    const params = new URL(url).searchParams;
    return { ok: true, status: 200, json: async () => handler(params) };
  };
}

describe('update-data', () => {
  it('ermittelt höchste Codes je Linie', () => {
    expect(highestCodes(['BX-52', 'UX-20', 'CX-14', 'BX-07', 'TBA-x'])).toEqual({ BX: 52, UX: 20, CX: 14 });
  });
  it('baut Wiki-URLs', () => {
    expect(wikiUrl('Beyblade X - BX-53 Starter')).toBe('https://beyblade.fandom.com/wiki/Beyblade_X_-_BX-53_Starter');
  });
  it('übernimmt neue Produktnummern aus der Suche, ignoriert bekannte und Unpassendes', async () => {
    const { dir, url } = tmpData();
    const fetchFn = fakeFetch((p) => {
      if (p.get('list') === 'recentchanges') {
        return { query: { recentchanges: [{ pageid: 9, title: 'UX-20 Glory Valkyrie' }, { pageid: 10, title: 'CX-15 Starter Foo 3-60F' }] } };
      }
      const q = p.get('srsearch');
      if (q === '"BX-53"') return { query: { search: [{ pageid: 1, title: 'Beyblade X - BX-53 Starter NewBlade 5-60F', snippet: '' }] } };
      if (q === '"UX-21"') return { query: { search: [{ pageid: 2, title: 'Irgendwas', snippet: 'erwähnt <span>UX-210</span>' }] } };
      return { query: { search: [] } };
    });
    const res = await run({ fetchFn, dataDir: url, now: '2026-11-14T06:00:00.000Z' });
    expect(res).toEqual({ changed: true, ok: true });
    const news = JSON.parse(readFileSync(join(dir, 'news.json'), 'utf8'));
    expect(news.items.map((i: { code: string }) => i.code).sort()).toEqual(['BX-53', 'CX-15']);
    // Zweiter Lauf: nichts Neues → keine Änderung
    const res2 = await run({ fetchFn, dataDir: url, now: '2026-11-15T06:00:00.000Z' });
    expect(res2.changed).toBe(false);
  });
  it('lässt news.json bei Netzwerkfehler unverändert', async () => {
    const { dir, url } = tmpData();
    const before = readFileSync(join(dir, 'news.json'), 'utf8');
    const res = await run({ fetchFn: async () => { throw new Error('offline'); }, dataDir: url });
    expect(res).toEqual({ changed: false, ok: false });
    expect(readFileSync(join(dir, 'news.json'), 'utf8')).toBe(before);
  });
  it('mergeNews liefert null ohne Neues', () => {
    expect(mergeNews({ items: [] }, [], [], 'now')).toBeNull();
  });
  it('Seed-Datenbank ist konsistent', () => {
    expect(validateDb(JSON.parse(readFileSync(new URL('db.json', dataDir), 'utf8')))).toEqual([]);
  });
});
