// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error – JS-Modul ohne Typen
import { hasbroLabel, kindOfHasbro, mergeHasbro, parseHasbroList, parseHasbroTitle } from '../scripts/import-hasbro.mjs';

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
    expect(parseHasbroTitle('Wide Beystadium')).toBeNull();
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
