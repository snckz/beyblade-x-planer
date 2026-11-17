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

describe('findImageInPage', () => {
  it('nimmt die Datei, deren Name zum Teil passt', async () => {
    // @ts-expect-error – JS-Modul ohne Typen
    const { findImageInPage } = await import('../scripts/update-images.mjs');
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        query: {
          pages: [
            { title: 'File:PegasusBlastATr.png', imageinfo: [{ thumburl: 'https://static.wikia.nocookie.net/beyblade/images/a/a1/PegasusBlastATr.png/revision/latest/scale-to-width-down/400' }] },
            { title: 'File:RatchetIntegratedBitTurbo.png', imageinfo: [{ thumburl: 'https://static.wikia.nocookie.net/beyblade/images/b/b2/RatchetIntegratedBitTurbo.png/revision/latest/scale-to-width-down/400' }] },
            { title: 'File:Turbo.gif', imageinfo: [{ thumburl: 'https://evil.example/x.gif' }] },
          ],
        },
      }),
    });
    const img = await findImageInPage(fetchFn, 'Ratchet Integrated Bit - Turbo', 'Turbo');
    expect(img?.thumb).toContain('RatchetIntegratedBitTurbo');
    expect(img?.page).toBe('https://beyblade.fandom.com/wiki/Ratchet_Integrated_Bit_-_Turbo');
  });
});

describe('Bit-Produktfotos', () => {
  it('erkennt Produktfotos am Dateinamen, nicht Episoden- oder Erklärbilder', async () => {
    // @ts-expect-error – JS-Modul ohne Typen
    const { isBitProductFile } = await import('../scripts/update-images.mjs');
    expect(isBitProductFile('File:BitFlat.png', 'Flat')).toBe(true);
    expect(isBitProductFile('File:RatchetBitTurbo.png', 'Turbo')).toBe(true);
    expect(isBitProductFile('File:RatchetIntegratedBitTurbo.png', 'Turbo')).toBe(true);
    expect(isBitProductFile('File:RatchetBitOperate (Defense Mode).png', 'Operate')).toBe(true);
    expect(isBitProductFile('File:Elevate (BX-00).png', 'Elevate')).toBe(true);
    expect(isBitProductFile('File:Turbo (CX-00).png', 'Turbo')).toBe(true);
    expect(isBitProductFile('File:BBX99 Turbo Bit retracts.png', 'Turbo')).toBe(false);
    expect(isBitProductFile('File:Operate bit in Attack Mode.png', 'Operate')).toBe(false);
    expect(isBitProductFile('File:Turbo - Heat Salamander S4 Info.png', 'Turbo')).toBe(false);
    expect(isBitProductFile('File:BitFlatGear.png', 'Gear Flat')).toBe(false);
  });

  it('holt das Bild neu, wenn sich die Wiki-Seite geändert hat, und nimmt kein falsches Ersatzbild', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'img-'));
    const old = { thumb: 'https://static.wikia.nocookie.net/beyblade/images/e/ea/BBX99_Turbo_Bit_retracts.png', page: 'https://beyblade.fandom.com/wiki/Ratchet_Integrated_Bit_-_Turbo', title: 'Ratchet Integrated Bit - Turbo' };
    const keep = { thumb: 'https://static.wikia.nocookie.net/beyblade/images/b/b0/BitFlat.png', page: 'https://beyblade.fandom.com/wiki/Bit_-_Flat', title: 'Bit - Flat' };
    const write = (bits: object[]) => {
      writeFileSync(join(dir, 'db.json'), JSON.stringify({ blades: [], bits }));
      writeFileSync(join(dir, 'images.json'), JSON.stringify({ blades: {}, bits: { ATr: old, F: keep }, ratchets: {} }));
    };
    const NEW = 'https://static.wikia.nocookie.net/beyblade/images/c/cf/RatchetBitTurbo.png';
    const calls: string[] = [];
    // Neue Seite hat ein Produktfoto als Seitenbild
    write([{ id: 'ATr', name: 'Turbo', wikiTitle: 'Ratchet-Integrated Bit - Turbo' }, { id: 'F', name: 'Flat' }]);
    await run({
      dataDir: pathToFileURL(dir + '/'),
      fetchFn: async (url: string) => {
        calls.push(new URL(url).searchParams.get('titles') ?? '');
        return { ok: true, status: 200, json: async () => ({ query: { pages: [{ title: 'Ratchet-Integrated Bit - Turbo', thumbnail: T(NEW) }] } }) };
      },
    });
    let out = JSON.parse(readFileSync(join(dir, 'images.json'), 'utf8'));
    expect(out.bits.ATr.thumb).toBe(NEW);
    expect(out.bits.F).toEqual(keep); // unverändert, nicht neu abgefragt
    expect(calls).toEqual(['Ratchet-Integrated Bit - Turbo']);
    // Neue Seite ohne Bild, und im Wiki gibt es nur Episodenbilder: altes Bild raus, kein falsches rein
    write([{ id: 'ATr', name: 'Turbo', wikiTitle: 'Ratchet-Integrated Bit - Turbo' }]);
    await run({
      dataDir: pathToFileURL(dir + '/'),
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ query: { pages: [{ title: 'File:BBX99 Turbo Bit retracts.png', imageinfo: [{ thumburl: old.thumb }] }] } }),
      }),
    });
    out = JSON.parse(readFileSync(join(dir, 'images.json'), 'utf8'));
    expect(out.bits.ATr).toBeUndefined();
  });
});
