// @vitest-environment node
import { describe, expect, it } from 'vitest';
// @ts-expect-error – JS-Modul ohne Typen
import { parseBitType, parseRelease, verifyCatalog } from '../scripts/verify-catalog.mjs';
// @ts-expect-error – JS-Modul ohne Typen
import { validateDb } from '../scripts/validate-data.mjs';

const today = new Date('2026-11-14T12:00:00Z');

describe('parseRelease', () => {
  it('erkennt Datum und ob schon erschienen', () => {
    expect(parseRelease("'''X''' is an Attack Type Beyblade released by Takara Tomy. It was released as a Starter in Japan on July 13th, 2024 for 2,321円.", today)).toEqual({ released: true, date: '2024-07-13' });
    expect(parseRelease('It will be released as a Starter in Japan on December 26th, 2026.', today)).toEqual({ released: false, date: '2026-12-26' });
    expect(parseRelease('It was released in [[Japan]] on December 26th, 2026 for 2,000円.', today)).toEqual({ released: false, date: '2026-12-26' });
    expect(parseRelease('Nothing here.', today).released).toBe(false);
  });
});

describe('parseBitType', () => {
  it('liest den Typ von Bit- und RIB-Seiten', () => {
    expect(parseBitType("'''Glide''' (G) is a Stamina Type Bit released by Takara Tomy.")).toBe('stamina');
    expect(parseBitType('Operate is a Balance Type Ratchet Integrated Bit, and the second released')).toBe('balance');
    expect(parseBitType('Turbo is an [[Attack Type]] Bit')).toBe('attack');
    expect(parseBitType('{{BitInfobox\n| name = Jolt\n| type = Attack\n}}')).toBe('attack');
    expect(parseBitType('used on an Attack Type Beyblade')).toBeNull();
  });
});

describe('verifyCatalog', () => {
  const base = {
    version: 1,
    updatedAt: '2026-11-14',
    blades: [
      { id: 'SolEclipse', name: 'Sol Eclipse', line: 'CX', type: 'balance', spin: 'right', verified: false },
      { id: 'LusterDragoon', name: 'Luster Dragoon', line: 'BX', type: 'attack', spin: 'left', verified: false },
      { id: 'VanishLucifer', name: 'Vanish Lucifer', line: 'UX', type: 'defense', spin: 'right', verified: false, integratedRatchet: true },
    ],
    ratchets: [{ id: '5-70', contacts: 5, heightMm: 7 }, { id: '6-60', contacts: 6, heightMm: 6 }],
    bits: [
      { id: 'TK', name: 'Trans Kick', type: 'balance', uncertain: true },
      { id: 'LC', name: 'Low Cyclone', type: 'attack' },
      { id: 'WW', name: 'Wall Wedge', type: 'defense', uncertain: true },
    ],
    products: [
      { code: 'CX-09', name: 'Starter Sol Eclipse D5-70TK', kind: 'starter', bladeId: 'SolEclipse', ratchetId: '5-70', bitId: 'TK', verified: false, source: 'https://beyblade.fandom.com/wiki/SolEclipse_D5-70TK' },
      { code: 'BX-52', name: 'Starter Luster Dragoon 6-60LC', kind: 'starter', bladeId: 'LusterDragoon', ratchetId: '6-60', bitId: 'LC', verified: false },
      { code: 'UX-22', name: 'Starter Vanish Lucifer WW', kind: 'starter', bladeId: 'VanishLucifer', bitId: 'WW', verified: false },
    ],
  };
  const pages: Record<string, string> = {
    'SolEclipse D5-70TK': "'''SolEclipse D5-70TK''' is a Balance Type Beyblade released by Takara Tomy. It was released as a Starter in Japan on June 7th, 2025 for 2,200円.",
    'LusterDragoon 6-60LC': "'''LusterDragoon 6-60LC''' is an Attack Type Beyblade released by Takara Tomy. It was released in Japan on October 10th, 2026 for 2,300円.",
    'VanishLucifer WW': "'''VanishLucifer WW''' is a Defense Type Beyblade. It will be released in Japan on December 26th, 2026.",
    'Bit - Trans Kick': "'''Trans Kick''' is an Attack Type Bit.",
  };
  it('bestätigt nur Passendes und Erschienenes, meldet Abweichungen statt sie zu übernehmen', async () => {
    const res = await verifyCatalog(base, async (t: string) => pages[t] ?? null, today);
    const blade = (id: string) => res.db.blades.find((b: { id: string }) => b.id === id);
    expect(blade('SolEclipse').verified).toBe(true);
    // Luster Dragoon dreht links, die Seite sagt das aber nicht → Abweichung, bleibt ungeprüft
    expect(blade('LusterDragoon').verified).toBe(false);
    expect(res.report.mismatches.map((m: { blade?: string }) => m.blade)).toContain('LusterDragoon');
    expect(blade('VanishLucifer').verified).toBe(false);
    expect(res.report.unreleased[0]).toMatch(/^VanishLucifer/);
    // Bit-Typ von der Bit-Seite übernommen
    expect(res.db.bits.find((b: { id: string }) => b.id === 'TK')).toMatchObject({ type: 'attack' });
    expect(res.db.bits.find((b: { id: string }) => b.id === 'TK').uncertain).toBeUndefined();
    expect(res.db.bits.find((b: { id: string }) => b.id === 'WW').uncertain).toBe(true);
    expect(res.db.products.find((p: { code: string }) => p.code === 'CX-09').verified).toBe(true);
    expect(res.db.products.find((p: { code: string }) => p.code === 'UX-22').verified).toBe(false);
    expect(res.db.products.find((p: { code: string }) => p.code === 'UX-22').releaseJp).toBe('2026-12-26');
    expect(res.db.products.find((p: { code: string }) => p.code === 'CX-09').releaseJp).toBe('2025-06-07');
    expect(validateDb(res.db)).toEqual([]);
    expect(base.blades[0]!.verified).toBe(false); // Original unverändert
  });
  it('bricht bei Netzwerkfehlern ab, ohne etwas zu bestätigen', async () => {
    await expect(verifyCatalog(base, async () => { throw new Error('offline'); }, today)).rejects.toThrow('offline');
  });
});
