// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error – JS-Modul ohne Typen
import { hasbroLabel, kindOfHasbro, mergeHasbro, parseHasbroList } from '../scripts/import-hasbro.mjs';

const db = JSON.parse(readFileSync(new URL('../public/data/db.json', import.meta.url), 'utf8'));

const WT = `{| class="wikitable"
|-
| G1670 || Booster || [[DranDagger 4-70Q|Dagger Dran 4-70Q]]
|-
| G1686 || Dual Pack || [[TigerWeiss 3-60U|Pearl Tiger 3-60U]] & [[SharkGill 4-80LF|Gill Shark 4-80LF]]
|-
| G9999 || Booster || [[KongYell 3-60GB|Yell Kong 3-60GB]]
|}`;

describe('Hasbro-Katalog', () => {
  it('liest Artikelnummern, Art und Hasbro-Namen aus den Links', () => {
    const e = parseHasbroList(WT);
    expect(e.map((x: { code: string }) => x.code)).toEqual(['G1670', 'G1686', 'G9999']);
    expect(e[0].beys[0]).toMatchObject({ bladeId: 'DranDagger', ratchet: '4-70', bit: 'Q', hasbro: 'Dagger Dran' });
    expect(e[1].beys).toHaveLength(2);
    expect(kindOfHasbro(e[1].text)).toBe('set');
    expect(hasbroLabel('Sword Dran 3-60F')).toBe('Sword Dran');
    expect(hasbroLabel('Glory Valkerion LF')).toBe('Glory Valkerion');
  });
  it('verknüpft vorhandene Blades und legt Hasbro-Kreisel neu an', async () => {
    const page = (t: string) => Promise.resolve(t.startsWith('KongYell') ? `'''Kong Yell''' is a Balance-Type Beyblade. [[Bit - Gear Ball]]` : null);
    const { db: out, report } = await mergeHasbro(db, parseHasbroList(WT), page);
    const g = out.products.find((p: { code: string }) => p.code === 'G1670');
    expect(g).toMatchObject({ bladeId: 'DranDagger', region: 'hasbro', kind: 'booster' });
    const kong = out.blades.find((b: { id: string }) => b.id === 'KongYell');
    expect(kong).toMatchObject({ hasbroName: 'Yell Kong', type: 'balance' });
    expect(out.products.some((p: { code: string }) => p.code === 'G9999')).toBe(true);
    // ein zweiter Lauf ändert nichts
    const again = await mergeHasbro(out, parseHasbroList(WT), page);
    expect(again.report.added.products).toEqual([]);
    expect(report.added.products.length).toBeGreaterThan(0);
  });
});
