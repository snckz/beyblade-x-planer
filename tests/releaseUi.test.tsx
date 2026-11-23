// Freigabestatus in der Oberfläche: Kombo-Planer sperrt, Lexikon/Steckbrief zeigen an, gespeicherte Daten bleiben.
// Eigene kleine Datenbank, damit der Test nicht vom täglichen Daten-Update abhängt.
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/preact';
import type { Database } from '../src/lib/types';
import { EMPTY_STATE, type UserState } from '../src/lib/storage';
import { ComboBuilder } from '../src/components/ComboBuilder';
import { ComboPicker } from '../src/components/ComboPicker';
import { Lexikon } from '../src/components/Lexikon';
import { DetailSheet } from '../src/components/DetailSheet';

afterEach(cleanup);
// Länger als die Schließ-Animation (CLOSE_MS = 180 in lib/useModal.ts): Deren Timer darf nicht erst nach Testende laufen.
afterAll(() => new Promise((resolve) => setTimeout(resolve, 400)));

const db = {
  version: 1,
  updatedAt: '2026-11-18',
  blades: [
    { id: 'OldBlade', name: 'Old Blade', line: 'BX', type: 'attack', spin: 'right', verified: true },
    { id: 'NewBlade', name: 'New Blade', line: 'BX', type: 'attack', spin: 'right', verified: true, imported: true },
  ],
  ratchets: [
    { id: '3-60', contacts: 3, heightMm: 6 },
    { id: '9-90', contacts: 9, heightMm: 9, imported: true },
  ],
  bits: [
    { id: 'F', name: 'Flat', type: 'attack' },
    { id: 'NB', name: 'New Bit', type: 'attack', imported: true },
  ],
  products: [
    { code: 'BX-01', name: 'Starter Old Blade 3-60F', kind: 'starter', verified: true, bladeId: 'OldBlade', ratchetId: '3-60', bitId: 'F' },
    // angekündigt, Release weit in der Zukunft
    { code: 'BX-99', name: 'Booster New Blade 9-90NB', kind: 'booster', verified: false, imported: true, bladeId: 'NewBlade', ratchetId: '9-90', bitId: 'NB', releaseJp: '2099-01-01' },
  ],
} as unknown as Database;

let state: UserState;
const update = (fn: (s: UserState) => UserState) => (state = fn(state));

describe('Kombo-Planer', () => {
  it('12. Vorgabe/Direktlink mit gesperrtem Blade wird abgefangen und erklärt', () => {
    state = { ...EMPTY_STATE };
    const view = render(<ComboBuilder db={db} state={state} update={update} presetBladeId="NewBlade" presetBitId="F" presetKey={101} />);
    expect(view.container.textContent).toContain('Noch nicht im Kombo-Planer: New Blade');
    expect(view.container.querySelector('.combo-stage, .result')).toBeNull();
  });
  it('freigegebene Vorgabe wird übernommen', () => {
    state = { ...EMPTY_STATE };
    const view = render(<ComboBuilder db={db} state={state} update={update} presetBladeId="OldBlade" presetRatchetId="3-60" presetBitId="F" presetKey={102} />);
    expect(view.container.textContent).not.toContain('Noch nicht im Kombo-Planer');
    expect(view.container.textContent).toContain('Old Blade');
  });
  it('9. gespeicherte Kombo mit inzwischen gesperrtem Teil bleibt, ist nur gekennzeichnet', () => {
    state = { ...EMPTY_STATE, combos: [{ id: 'k1', name: 'Vorbestellt', bladeId: 'NewBlade', ratchetId: '9-90', bitId: 'NB' }], deck: ['k1'] };
    const view = render(<ComboBuilder db={db} state={state} update={update} />);
    expect(view.getByText('Vorbestellt')).toBeTruthy();
    expect(view.getByText('Enthält noch nicht freigegebene Teile')).toBeTruthy();
    expect(state.combos).toHaveLength(1);
    expect(state.deck).toEqual(['k1']);
  });
  it('Auswahlliste (Suche) enthält keine gesperrten Teile', () => {
    // Die Liste kommt aus dem Planer – dort ist NewBlade schon herausgefiltert; hier: was der Planer der Auswahl übergibt
    state = { ...EMPTY_STATE };
    const view = render(<ComboBuilder db={db} state={state} update={update} />);
    fireEvent.click(within(view.container.querySelector('.layers')!).getAllByRole('button')[0]!);
    const sheet = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(sheet).not.toBeNull();
    expect(sheet!.textContent).toContain('Old Blade');
    expect(sheet!.textContent).not.toContain('New Blade');
  });
});

describe('Weitere Auswahlwege', () => {
  it('ComboPicker (Gegner, Tagebuch, Vergleich): bestehender Eintrag bleibt sichtbar, Neues nur Freigegebenes', () => {
    const view = render(<ComboPicker db={db} value={{ id: 'o', bladeId: 'NewBlade', ratchetId: '9-90', bitId: 'NB' }} label="Gegner" onChange={() => {}} />);
    expect(view.container.textContent).toContain('New Blade');
  });
});

describe('Lexikon und Steckbrief', () => {
  it('1. angekündigtes Blade ist im Lexikon sichtbar und gekennzeichnet', () => {
    state = { ...EMPTY_STATE };
    const view = render(<Lexikon db={db} state={state} update={update} />);
    fireEvent.click(view.getByRole('tab', { name: 'Blades' }));
    const row = view.getByText('New Blade').closest('li')!;
    expect(within(row).getByText('angekündigt')).toBeTruthy();
    const old = view.getByText('Old Blade').closest('li')!;
    expect(within(old).queryByText('angekündigt')).toBeNull();
  });
  it('Steckbrief: Release-Hinweis statt „Im Kombo-Planer nutzen“', () => {
    const view = render(<DetailSheet db={db} events={[]} bladeId="NewBlade" onClose={() => {}} onUse={() => {}} />);
    expect(document.body.textContent).toContain('Angekündigt – erscheint am 2099-01-01');
    expect(view.queryByText('Im Kombo-Planer nutzen')).toBeNull();
    cleanup();
    render(<DetailSheet db={db} events={[]} bladeId="OldBlade" onClose={() => {}} onUse={() => {}} />);
    expect(document.body.textContent).toContain('Im Kombo-Planer nutzen');
  });
});
