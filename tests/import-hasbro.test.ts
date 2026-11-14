// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error – JS-Modul ohne Typen
import { beysInLinkName, hasbroLabel, kindOfHasbro, mergeHasbro, namesInLinkName, parseHasbroList, parseHasbroTitle } from '../scripts/import-hasbro.mjs';

const db = JSON.parse(readFileSync(new URL('../public/data/db.json', import.meta.url), 'utf8'));

// Format wie im Wiki (Stand Nov. 2026): Hasbro-benannte Seiten, US-Preis mit Flagge, Abschnitts-Überschriften
const WT = `{| class="wikitable sortable"
|-
! colspan="4" |Beyblade X Basic/Unique Line Starter Packs
|-
|F9580
|[[Sword Dran 3-60F]]
|[[File:Flag of Canada.png|20px]] May 30th, 2024<br>[[File:Flag of United States.png|20px]] June 1st, 2024
|[[File:Flag of Canada.png|20px]] $16.99<br>[[File:Flag of United States.png|20px]] $9.99
|-
|G1679
|[[Arc Wizard R 4-55LO]]
|
|[[File:Flag of United States.png|20px]] $12.99
|-
|G2738
|[[Stun Medusa 9-60GB]]
|
|[[File:Flag of United States.png|20px]] $9.99
|-
! colspan="4" |Dual Packs
|-
|G1686
|[[Pearl Tiger & Gill Shark Dual Pack]]
|
|[[File:Flag of United States.png|20px]] $19.99
|}`;

describe('Hasbro-Katalog', () => {
  it('liest Artikelnummern, Art, US-Preis und Hasbro-Namen', () => {
    const e = parseHasbroList(WT);
    expect(e.map((x: { code: string }) => x.code)).toEqual(['F9580', 'G1679', 'G2738', 'G1686']);
    expect(e[0].beys[0]).toMatchObject({ ratchet: '3-60', bit: 'F', hasbro: 'Sword Dran' });
    expect(e[0].usd).toBe(9.99);
    expect(e[1].beys[0]).toMatchObject({ blade: 'Arc Wizard', assist: 'R', ratchet: '4-55', bit: 'LO', hasbro: 'Arc Wizard' });
    expect(e[3].beys).toHaveLength(0);
    expect(kindOfHasbro(e[3].text)).toBe('set');
    expect(kindOfHasbro(e[0].text)).toBe('starter');
    expect(hasbroLabel('Glory Valkerion LF')).toBe('Glory Valkerion');
    expect(parseHasbroTitle('Glory Valkerion LF')).toMatchObject({ blade: 'Glory Valkerion', bit: 'LF', ratchet: undefined });
    expect(parseHasbroTitle('Xtreme Stadium')).toBeNull();
    // Produktseiten mit Kreisel im Namen
    expect(beysInLinkName('Cobalt Dragoon 2-60C Deluxe Left-Spin String Launcher Set')[0]).toMatchObject({ blade: 'Cobalt Dragoon', ratchet: '2-60', bit: 'C' });
    expect(beysInLinkName('Saber Samurai 2-70L Victory Grip Launcher Set')[0]).toMatchObject({ blade: 'Saber Samurai', ratchet: '2-70', bit: 'L' });
    expect(namesInLinkName('Gale Wyvern and Sword Dran Dual Pack')).toEqual(['Gale Wyvern', 'Sword Dran']);
    expect(namesInLinkName('Cobalt Dragoon Deluxe Left-Spin String Launcher Set')).toEqual(['Cobalt Dragoon']);
    expect(namesInLinkName('Bite Croc Deluxe String Launcher & Custom Grip Set')).toEqual(['Bite Croc']);
    expect(namesInLinkName('Xtreme Battle Set')).toEqual([]);
    expect(parseHasbroTitle('Wide Beystadium')).toBeNull();
  });
  it('liest Launcher-Sets und Battle Sets von der Produktseite (Text, nur Einleitung)', async () => {
    const wt = `{| class="wikitable"
|-
|G1491
|[[Cobalt Dragoon Deluxe Left-Spin String Launcher Set]]
|-
|F9588
|[[Xtreme Battle Set]]
|}`;
    const pages: Record<string, { title: string; wikitext: string }> = {
      'Cobalt Dragoon Deluxe Left-Spin String Launcher Set': { title: 'x', wikitext: "The set includes '''Cobalt Dragoon 2-60C'''.\n==Related==\n[[Cobalt Drake 4-60F]] [[Meteor Dragoon 3-70J]]" },
      // wie im Wiki: Inhalt im Abschnitt „Contents“, davor/danach fremde Kreisel
      'Xtreme Battle Set': {
        title: 'x',
        wikitext: 'Similar to [[Helm Knight 3-80N]].\n==Contents==\n*[[Dagger Dran 4-60R]]\n*[[Tusk Mammoth 3-60T]]\n*[[Blade - Circle Ghost|Circle Ghost]]\n*Beystadium\n==Gallery==\n[[Sword Dran 3-60F]]',
      },
    };
    const { db: out } = await mergeHasbro(db, parseHasbroList(wt), (t: string) => Promise.resolve(pages[t] ?? null));
    const p = (c: string) => out.products.find((x: { code: string }) => x.code === c);
    expect(p('G1491')).toMatchObject({ bladeId: 'CobaltDragoon', ratchetId: '2-60', bitId: 'C' });
    expect([p('F9588-01')?.bladeId, p('F9588-02')?.bladeId]).toEqual(['DranDagger', 'MammothTusk']);
    expect(p('F9588-03')).toBeUndefined();
    expect(p('F9588-01')?.kind).toBe('set');
    expect(p('G1491')?.kind).not.toBe('set');
  });

  it('löst Hasbro-Seiten per Weiterleitung auf, legt nur echte Hasbro-Kreisel neu an und ist wiederholbar', async () => {
    const pages: Record<string, { title: string; wikitext: string }> = {
      'Stun Medusa 9-60GB': { title: 'Stun Medusa 9-60GB', wikitext: `'''Stun Medusa''' is a Balance-Type Beyblade. [[Bit - Gear Ball]]` },
      'Pearl Tiger & Gill Shark Dual Pack': { title: 'Pearl Tiger & Gill Shark Dual Pack', wikitext: '[[Pearl Tiger 3-60U]] and [[Gill Shark 4-70O]]' },
      'Pearl Tiger 3-60U': { title: 'TigerWeiss 3-60U', wikitext: `'''Weiss Tiger''' is a Balance-Type Beyblade.` },
      'Gill Shark 4-70O': { title: 'SharkGill 4-70O', wikitext: `'''Shark Gill''' is an Attack-Type Beyblade.` },
    };
    const page = (t: string) => Promise.resolve(pages[t] ?? null);
    const { db: out, report } = await mergeHasbro(db, parseHasbroList(WT), page);
    const byCode = (c: string) => out.products.find((p: { code: string }) => p.code === c);
    expect(byCode('F9580')).toMatchObject({ bladeId: 'DranSword', region: 'hasbro', kind: 'starter', priceUsd: 9.99 });
    expect(byCode('G1679')?.bladeId).toBe('WizardArc'); // kein Duplikat „ArcWizardR“
    expect(out.blades.find((b: { id: string }) => b.id === 'StunMedusa')).toMatchObject({ type: 'balance' });
    // Dual Pack über die Produktseite, Hasbro-Namen per Weiterleitung den Takara-Blades zugeordnet
    expect(byCode('G1686-01')?.kind).toBe('set');
    const weiss = out.blades.find((b: { name: string }) => b.name === 'Weiss Tiger');
    if (weiss) expect(weiss.hasbroName).toBe('Pearl Tiger');
    expect(report.added.blades).not.toContain('ArcWizardR');
    // zweiter Lauf: gleiches Ergebnis, nichts doppelt
    const again = await mergeHasbro(out, parseHasbroList(WT), page);
    expect(JSON.stringify(again.db)).toBe(JSON.stringify(out));
  });
});
