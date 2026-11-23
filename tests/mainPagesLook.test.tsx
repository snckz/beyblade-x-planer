// Optik der Hauptseiten: Sammlung (Produktkarten, lose Teile im Bild, Teile als Chips) und Battle (Deck, Tabelle, Tausch).
// Eigene kleine Datenbank, damit der Test nicht vom täglichen Daten-Update abhängt.
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/preact';
import type { Database } from '../src/lib/types';
import { EMPTY_STATE, type UserState } from '../src/lib/storage';
import { Collection } from '../src/components/Collection';
import { Battle } from '../src/components/Battle';

afterEach(cleanup);
// Länger als die Schließ-Animation (CLOSE_MS = 180 in lib/useModal.ts): Deren Timer darf nicht erst nach Testende laufen.
afterAll(() => new Promise((resolve) => setTimeout(resolve, 400)));

const db = {
  version: 1,
  updatedAt: '2026-11-23',
  blades: [
    { id: 'DranSword', name: 'Dran Sword', hasbroName: 'Sword Dran', line: 'BX', type: 'attack', spin: 'right', verified: true },
    { id: 'WizardRod', name: 'Wizard Rod', line: 'UX', type: 'stamina', spin: 'right', verified: true },
    { id: 'KnightShield', name: 'Knight Shield', line: 'BX', type: 'defense', spin: 'right', verified: true },
    { id: 'PhoenixWing', name: 'Phoenix Wing', line: 'BX', type: 'attack', spin: 'right', verified: true },
    { id: 'HellsScythe', name: 'Hells Scythe', line: 'BX', type: 'balance', spin: 'right', verified: true },
  ],
  ratchets: [
    { id: '3-60', contacts: 3, heightMm: 6 },
    { id: '5-70', contacts: 5, heightMm: 7 },
    { id: '9-60', contacts: 9, heightMm: 6 },
    { id: '3-80', contacts: 3, heightMm: 8 },
    { id: '4-60', contacts: 4, heightMm: 6 },
    { id: '9-65', contacts: 9, heightMm: 6.5 },
  ],
  bits: [
    { id: 'F', name: 'Flat', type: 'attack' },
    { id: 'B', name: 'Ball', type: 'stamina' },
    { id: 'N', name: 'Needle', type: 'defense' },
    { id: 'T', name: 'Taper', type: 'balance' },
    { id: 'GF', name: 'Gear Flat', type: 'attack' },
    { id: 'DB', name: 'Disc Ball', type: 'stamina' },
    { id: 'MN', name: 'Metal Needle', type: 'defense' },
  ],
  products: [
    { code: 'BX-01', name: 'Starter Dran Sword 3-60F', kind: 'starter', verified: true, bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' },
    { code: 'G3195-04', name: 'Set Ratchet 9-65 + Bit B', kind: 'set', region: 'hasbro', verified: true, ratchetId: '9-65', bitId: 'B' },
    { code: 'G3195-05', name: 'Set Bit MN', kind: 'set', region: 'hasbro', verified: true, bitId: 'MN' },
  ],
} as unknown as Database;

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const noop = () => {};

describe('Sammlung', () => {
  const state: UserState = { ...EMPTY_STATE, owned: { 'BX-01': 1, 'G3195-04': 1, 'G3195-05': 2 } };
  const tiles = () => {
    const view = render(<Collection db={db} events={[]} state={state} update={noop} meta={null} />);
    return { view, tile: (name: RegExp) => [...view.container.querySelectorAll<HTMLElement>('.tile-bey')].find((t) => name.test(text(t)))! };
  };

  it('Kreisel: freigestelltes Foto, Name, Typ-Chip und Artikelnummer', () => {
    const { tile } = tiles();
    const t = tile(/Dran/);
    expect(t.querySelector('.tile-art .blade-photo')).toBeTruthy();
    expect(text(t.querySelector('.tile-name'))).toContain('3‑60F');
    expect(text(t.querySelector('.tile-meta .mini-badge-type'))).toBe('Attack');
    expect(text(t.querySelector('.owned-code'))).toBe('BX-01');
  });

  it('lose Teile aus Sets: Ratchet und Bit im Bild statt nur der Nummer', () => {
    const { tile } = tiles();
    const both = tile(/Set Ratchet/);
    expect(both.querySelectorAll('.tile-parts > *')).toHaveLength(2);
    expect(both.querySelector('.tile-art .code')).toBeNull();
    expect(text(both.querySelector('.owned-code'))).toBe('G3195-04');
    expect(both.querySelector('.mini-badge-type')).toBeNull();
    const bitOnly = tile(/Bit MN/);
    expect(bitOnly.querySelectorAll('.tile-parts > *')).toHaveLength(1);
    expect(text(bitOnly.querySelector('.count'))).toBe('2×');
  });

  it('Teile zum Kombinieren stehen als Chips mit Anzahl', () => {
    const { view } = tiles();
    const ratchets = view.getByRole('list', { name: 'Ratchets' });
    expect([...ratchets.querySelectorAll('li')].map(text)).toEqual(['3-60', '9-65']);
    expect([...view.getByRole('list', { name: 'Bits' }).querySelectorAll('li')].map(text)).toEqual(['B', 'F', 'MN']);
    expect(text(ratchets.parentElement!.querySelector('.eyebrow'))).toBe('Ratchets 2');
  });
});

describe('Battle', () => {
  const combos = [
    { id: 'a', bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' },
    { id: 'b', bladeId: 'WizardRod', ratchetId: '5-70', bitId: 'B', name: 'Mein Dauerläufer' },
  ];
  const base: UserState = { ...EMPTY_STATE, combos, deck: ['a', 'b'] };

  it('Deck-Zeilen zeigen Platz, Foto, Name, Linie und Typ', () => {
    const view = render(<Battle db={db} state={base} update={noop} goToBuilder={noop} />);
    const rows = [...view.container.querySelectorAll<HTMLElement>('.deck-slot')];
    expect(rows).toHaveLength(2);
    expect(text(rows[0]!.querySelector('.slot-no'))).toBe('1');
    expect(rows[0]!.querySelector('.saved-art .blade-photo')).toBeTruthy();
    expect(text(rows[0]!.querySelector('.saved-badges'))).toBe('BXAttack');
    expect(text(rows[1]!.querySelector('.row-title'))).toBe('Mein Dauerläufer');
    expect(within(rows[1]!).getByRole('button', { name: 'Nach oben' })).toBeTruthy();
  });

  it('Tabelle gegen typische Gegner: Spalten zeigen den Typ, der volle Name bleibt vorlesbar', () => {
    const view = render(<Battle db={db} state={base} update={noop} goToBuilder={noop} />);
    const heads = [...view.container.querySelectorAll('.matrix thead th')].slice(1);
    expect(heads.map((h) => text(h.querySelector('.matrix-name [aria-hidden="true"]')))).toEqual(['Attack', 'Stamina', 'Defense', 'Balance']);
    expect(heads.map((h) => text(h.querySelector('.sr-only')))).toEqual(['Typischer Angreifer', 'Typischer Ausdauer-Kreisel', 'Typischer Verteidiger', 'Typischer Allrounder']);
    expect(view.container.querySelectorAll('.matrix tbody td')).toHaveLength(8);
    expect(view.container.querySelector('.duel-verdict .verdict-score')).toBeTruthy();
  });

  it('eigene Gegner behalten ihren Namen in der Spalte', () => {
    const state = { ...base, opponent: [{ id: 'o', bladeId: 'KnightShield', ratchetId: '3-80', bitId: 'N' }] };
    const view = render(<Battle db={db} state={state} update={noop} goToBuilder={noop} />);
    const head = view.container.querySelectorAll('.matrix thead th')[1]!;
    expect(text(head.querySelector('.matrix-name'))).toContain('KnightShield');
  });

  it('Tausch-Vorschlag: altes und neues Teil, Gewinn und ein echter Knopf, der den Tausch übernimmt', () => {
    let state = base;
    const update = (fn: (s: UserState) => UserState) => (state = fn(state));
    const view = render(<Battle db={db} state={state} update={update} goToBuilder={noop} />);
    const item = view.container.querySelector<HTMLElement>('.suggestion');
    // Ohne Vorschlag (Deck schon gut eingestellt) gibt es hier nichts zu prüfen – dann steht der Hinweis da.
    if (!item) return void expect(text(view.container)).toContain('Kein Tausch bringt einen klaren Vorteil');
    const badges = [...item.querySelectorAll('.suggestion-swap .mini-badge')].map(text);
    expect(badges).toHaveLength(2);
    expect(text(item.querySelector('.gain'))).toMatch(/^\+\d+ Punkte$/);
    const before = JSON.stringify(state.combos);
    fireEvent.click(within(item).getByRole('button', { name: new RegExp(`${badges[0]} durch ${badges[1]} ersetzen`) }));
    expect(JSON.stringify(state.combos)).not.toBe(before);
    expect(JSON.stringify(state.combos)).toContain(badges[1]!);
  });
});
