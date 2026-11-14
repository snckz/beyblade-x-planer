// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error – JS-Modul ohne Typen
import { kindOf, mergeCatalog, parseBeyPage, parseBeyTitle, parseList } from '../scripts/import-catalog.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { validateDb } from '../scripts/validate-data.mjs';

const db = JSON.parse(readFileSync(new URL('../public/data/db.json', import.meta.url), 'utf8'));

describe('parseBeyTitle', () => {
  it('zerlegt Basic-, Unique- und Custom-Line-Titel', () => {
    expect(parseBeyTitle('DranSword 3-60F')).toMatchObject({ bladeId: 'DranSword', ratchet: '3-60', bit: 'F' });
    expect(parseBeyTitle('PerseusDark B6-80W')).toMatchObject({ bladeId: 'PerseusDark', assist: 'B', ratchet: '6-80', bit: 'W' });
    expect(parseBeyTitle('BulletGriffon H')).toMatchObject({ bladeId: 'BulletGriffon', ratchet: undefined, bit: 'H' });
    expect(parseBeyTitle('SolEclipse D5-70TK')).toMatchObject({ assist: 'D', ratchet: '5-70', bit: 'TK' });
    expect(parseBeyTitle('Lightning L-Drago 1-60F (Upper Type)')).toMatchObject({ bladeId: 'LightningLDrago', ratchet: '1-60', bit: 'F' });
  });
  it('ignoriert Links, die keine Kreisel sind', () => {
    for (const t of ['Beyblade X', 'Takara Tomy', 'Xtreme Stadium', 'Ratchet - 3-60', 'Bit - Flat', 'BX-01']) expect(parseBeyTitle(t)).toBeNull();
  });
});

describe('parseList', () => {
  it('ordnet Kreisel der vorangehenden Produktnummer zu (Tabelle und Liste)', () => {
    const wt = `{| class="wikitable"
|-
| BX-05 || Booster || [[WizardArrow 4-80B|WizardArrow]]
|-
| BX-10 || [[Xtreme Stadium]]
|-
| BX-24 || Random Booster Vol. 2
* [[WyvernGale 3-60T]]
* [[File:X.png]] [[KnightMail 3-85BS]]
|}`;
    const list = parseList(wt);
    expect(list.map((e: { code: string }) => e.code)).toEqual(['BX-05', 'BX-24']);
    expect(list[1].beys.map((b: { title: string }) => b.title)).toEqual(['WyvernGale 3-60T', 'KnightMail 3-85BS']);
    expect(kindOf(list[1].text)).toBe('random-booster');
  });
});

describe('parseBeyPage', () => {
  it('liest Typ, Drehrichtung und Bit-Namen', () => {
    const wt = `{{Infobox|type=x}}'''CobaltDragoon 2-60C''' is an [[Attack Type]] Beyblade released by Takara Tomy. It is a Left-Spin Beyblade.
== Blade ==
Main article: [[Bit - Cyclone]]`;
    expect(parseBeyPage(wt)).toMatchObject({ type: 'attack', spin: 'left', bitName: 'Cyclone', isBey: true });
  });
});

describe('mergeCatalog', () => {
  it('ergänzt neue Kreisel ungeprüft, lässt Gepflegtes unangetastet und bleibt gültig', async () => {
    const entries = [
      { code: 'BX-01', text: 'Starter', beys: [{ ...parseBeyTitle('DranSword 3-60F'), page: 'DranSword 3-60F' }] },
      { code: 'CX-09', text: 'Starter', beys: [{ ...parseBeyTitle('SolEclipse D5-70TK'), page: 'SolEclipse D5-70TK' }] },
      { code: 'BX-24', text: 'Random Booster', beys: [
        { ...parseBeyTitle('WyvernGale 3-60T'), page: 'WyvernGale 3-60T' },
        { ...parseBeyTitle('Fake Thing 1-23Q'), page: 'Fake Thing 1-23Q' },
      ] },
    ];
    const pages: Record<string, string> = {
      'SolEclipse D5-70TK': "'''SolEclipse''' is a Balance Type Beyblade. [[Bit - Turbo]]",
      'Fake Thing 1-23Q': 'Irgendein Text ohne Bezug.',
    };
    const res = await mergeCatalog(db, entries, async (t: string) => pages[t] ?? null);
    expect(res.report.added.products).toEqual(['CX-09', 'BX-24-01']);
    expect(res.report.added.bits).toEqual(['TK']);
    const sol = res.db.blades.find((b: { id: string }) => b.id === 'SolEclipse');
    expect(sol).toMatchObject({ type: 'balance', spin: 'right', verified: false, imported: true, line: 'CX' });
    expect(res.db.bits.find((b: { id: string }) => b.id === 'TK')).toMatchObject({ name: 'Turbo', uncertain: true, wikiTitle: 'Bit - Turbo' });
    expect(res.report.skipped.map((s: { title: string }) => s.title)).toEqual(['Fake Thing 1-23Q']);
    expect(res.db.products.filter((p: { code: string }) => p.code === 'BX-01')).toHaveLength(1);
    expect(validateDb(res.db)).toEqual([]);
    expect(db.products.length).toBe(31); // Original nicht verändert
  });
});
