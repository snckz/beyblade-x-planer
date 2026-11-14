// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error – JS-Modul ohne Typen
import { pickPage, run } from '../scripts/update-images.mjs';
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
    expect(res).toEqual({ changed: true, count: 1 });
    const out = JSON.parse(readFileSync(join(dir, 'images.json'), 'utf8'));
    expect(out.blades.GloryValkyrie.page).toBe('https://beyblade.fandom.com/wiki/Glory_Valkyrie_LF');
    expect(validateImages(out)).toEqual([]);
    const down = await run({ fetchFn: async () => { throw new Error('offline'); }, dataDir: pathToFileURL(dir + '/'), refreshAll: true });
    expect(down.changed).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, 'images.json'), 'utf8'))).toEqual(out);
  });
});
