import { describe, expect, it } from 'vitest';
import db from '../public/data/db.json';
import type { Database } from '../src/lib/types';
import { analyze, checkDeck, deriveType, parseRatchet, resolveCombo } from '../src/lib/analysis';

const DB = db as Database;
const r = (bladeId: string, ratchetId: string | undefined, bitId: string) => resolveCombo(DB, { id: 'x', bladeId, ratchetId, bitId })!;

describe('parseRatchet', () => {
  it('liest Zacken und Höhe', () => {
    expect(parseRatchet('3-60')).toEqual({ id: '3-60', contacts: 3, heightMm: 6 });
    expect(parseRatchet('0-70')?.contacts).toBeNull();
    expect(parseRatchet('abc')).toBeNull();
  });
});

describe('analyze', () => {
  it('erkennt eine gültige Attack-Kombo', () => {
    const a = analyze(r('DranSword', '3-60', 'F'));
    expect(a.valid).toBe(true);
    expect(a.type).toBe('attack');
    expect(a.label).toBe('DranSword 3-60F');
    expect(a.heightMm).toBe(6);
  });
  it('lehnt Ratchet bei integrierter Blade ab', () => {
    const a = analyze(r('GloryValkyrie', '3-60', 'LF'));
    expect(a.valid).toBe(false);
    expect(a.warnings[0]).toMatch(/integrierten Ratchet/);
  });
  it('akzeptiert integrierte Blade ohne Ratchet', () => {
    const a = analyze(r('GloryValkyrie', undefined, 'LF'));
    expect(a.valid).toBe(true);
    expect(a.label).toBe('GloryValkyrie LF');
  });
  it('verlangt Ratchet bei normaler Blade', () => {
    expect(analyze(r('DranSword', undefined, 'F')).valid).toBe(false);
  });
  it('gibt Linksdreher-Hinweis', () => {
    expect(analyze(r('CobaltDragoon', '2-60', 'C')).tips.join(' ')).toMatch(/Linksdreher/);
  });
  it('hält Profilwerte im Bereich 0–100', () => {
    for (const b of DB.blades) for (const t of DB.bits) {
      const p = analyze(r(b.id, b.integratedRatchet ? undefined : '9-80', t.id)).profile;
      for (const v of Object.values(p)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
  it('Bit bestimmt den Typ, Balance-Bit übernimmt Blade-Typ', () => {
    const blade = DB.blades.find((b) => b.id === 'WizardRod')!;
    expect(deriveType(blade, DB.bits.find((b) => b.id === 'F')!)).toBe('attack');
    expect(deriveType(blade, DB.bits.find((b) => b.id === 'T')!)).toBe('stamina');
  });
});

describe('checkDeck', () => {
  it('akzeptiert ein sauberes 3er-Deck', () => {
    const res = checkDeck(DB, [
      { id: '1', bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' },
      { id: '2', bladeId: 'WizardRod', ratchetId: '5-70', bitId: 'DB' },
      { id: '3', bladeId: 'KnightShield', ratchetId: '3-80', bitId: 'N' },
    ]);
    expect(res).toMatchObject({ ok: true, problems: [] });
  });
  it('findet doppelte Teile und falsche Größe', () => {
    const res = checkDeck(DB, [
      { id: '1', bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' },
      { id: '2', bladeId: 'DranSword', ratchetId: '3-60', bitId: 'B' },
    ]);
    expect(res.ok).toBe(false);
    expect(res.problems.join(' ')).toMatch(/genau 3/);
    expect(res.problems.join(' ')).toMatch(/Blade „DranSword“ ist doppelt/);
    expect(res.problems.join(' ')).toMatch(/Ratchet „3-60“ ist doppelt/);
  });
});
