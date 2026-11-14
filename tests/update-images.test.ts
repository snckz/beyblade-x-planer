// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error – JS-Modul ohne Typen
import { pickBitPage, pickPage, pickRatchetPage, run } from '../scripts/update-images.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { validateImages } from '../scripts/validate-data.mjs';

const T = (src: string) => ({ source: src });
const IMG = 'https://static.wikia.nocookie.net/beyblade/images/a/ab/Glory.png';

describe('update-images', () => {
  it('wählt passende Seite mit Bild und erlaubtem Host', () => {
    const blade = { id: 'GloryValkyrie', name: 'Glory Valkyrie' };
    const pages = [
      { title: 'Valkyrie', thumbnail: T(IMG) },
      { title: 'Glory Valkyrie LF', thumbnail: T('https://evil.example/x.png') },
      { title: 'Blade - Glory', thumbnail: T(IMG) },
      { title: 'Glory Valkyrie LF', index: 2, thumbnail: T(IMG) },
    ];
    expect(pickPage(blade, pages)?.title).toBe('Glory Valkyrie LF');
    expect(pickPage(blade, [{ title: 'Unrelated', thumbnail: T(IMG) }])).toBeNull();
  });
  it('schreibt nur Links, bricht bei Ausfall sauber ab', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'img-'));
    writeFileSync(join(dir, 'db.json'), JSON.stringify({ blades: [{ id: 'GloryValkyrie', name: 'Glory Valkyrie' }, { id: 'DranSword', name: 'Dran Sword' }] }));
    const fetchFn = async (url: string) => {
      const q = new URL(url).searchParams.get('gsrsearch');
      const pages = q === 'Glory Valkyrie' ? [{ title: 'Glory Valkyrie LF', thumbnail: T(IMG) }] : [];
      return { ok: true, status: 200, json: async () => ({ query: { pages } }) };
    };
    const res = await run({ fetchFn, dataDir: pathToFileURL(dir + '/') });
    expect(res).toEqual({ changed: true, count: 1, bits: 0, ratchets: 0 });
    const out = JSON.parse(readFileSync(join(dir, 'images.json'), 'utf8'));
    expect(out.blades.GloryValkyrie.page).toBe('https://beyblade.fandom.com/wiki/Glory_Valkyrie_LF');
    expect(validateImages(out)).toEqual([]);
    const down = await run({ fetchFn: async () => { throw new Error('offline'); }, dataDir: pathToFileURL(dir + '/'), refreshAll: true });
    expect(down.changed).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, 'images.json'), 'utf8'))).toEqual(out);
  });
});

describe('pickBitPage', () => {
  it('nimmt nur exakte Bit-Titel, nicht ähnliche', () => {
    const bit = { id: 'F', name: 'Flat' };
    const pages = [
      { title: 'Low Flat', thumbnail: T(IMG) },
      { title: 'Flat', thumbnail: T(IMG) },
      { title: 'Bit - Flat', thumbnail: T(IMG) },
    ];
    expect(pickBitPage(bit, pages)?.title).toBe('Bit - Flat');
    expect(pickBitPage(bit, [{ title: 'Gear Flat', thumbnail: T(IMG) }])).toBeNull();
    expect(pickBitPage({ id: 'B', name: 'Ball' }, [{ title: 'Ball (Bit)', thumbnail: T(IMG) }])?.title).toBe('Ball (Bit)');
  });
});

describe('pickRatchetPage', () => {
  it('nimmt nur die exakte Ratchet-Bezeichnung', () => {
    const r = { id: '3-60' };
    const pages = [
      { title: 'Ratchet - 3-70', thumbnail: T(IMG) },
      { title: 'KnightLance 3-60LF', thumbnail: T(IMG) },
      { title: 'Ratchet - 3-60', thumbnail: T(IMG) },
      { title: 'Ratchet - 3-60', thumbnail: T('https://evil.example/x.png') },
    ];
    expect(pickRatchetPage(r, pages)?.title).toBe('Ratchet - 3-60');
    expect(pickRatchetPage({ id: '9-65' }, pages)).toBeNull();
  });
  it('verknüpft Ratchet-Bilder im Lauf', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'img-'));
    writeFileSync(join(dir, 'db.json'), JSON.stringify({ blades: [], ratchets: [{ id: '3-60' }, { id: '9-65' }] }));
    const fetchFn = async (url: string) => {
      const titles = new URL(url).searchParams.get('titles') ?? '';
      const pages = titles.includes('Ratchet - 3-60') ? [{ title: 'Ratchet - 3-60', thumbnail: T(IMG) }] : [];
      return { ok: true, status: 200, json: async () => ({ query: { pages } }) };
    };
    const res = await run({ fetchFn, dataDir: pathToFileURL(dir + '/') });
    expect(res.ratchets).toBe(1);
    const out = JSON.parse(readFileSync(join(dir, 'images.json'), 'utf8'));
    expect(out.ratchets['3-60'].page).toBe('https://beyblade.fandom.com/wiki/Ratchet_-_3-60');
    expect(validateImages(out)).toEqual([]);
  });
});
