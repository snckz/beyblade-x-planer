import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/preact';
import { DuelScorer } from '../src/components/DuelScorer';
import { Transfer } from '../src/components/Transfer';
import { ConfirmSheet } from '../src/components/ConfirmSheet';
import { encodeState } from '../src/lib/transfer';
import { EMPTY_STATE, type UserState } from '../src/lib/storage';

afterEach(cleanup);
afterAll(() => new Promise((resolve) => setTimeout(resolve, 150)));

const sheet = () => document.querySelector<HTMLElement>('.confirm-sheet');

describe('Rückfragen im eigenen Fenster statt window.confirm', () => {
  it('Zähler: ohne Punkte sofort zu; mit Zwischenstand erst nachfragen – „Weiterzählen“ behält ihn', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const onClose = vi.fn();
    const view = render(<DuelScorer left="Ana" right="Ben" target={4} onDone={() => {}} onClose={onClose} />);
    const scorer = within(document.querySelector<HTMLElement>('.live')!);
    fireEvent.click(scorer.getAllByRole('button', { name: /Spin/ })[0]!);
    fireEvent.click(scorer.getByRole('button', { name: 'Schließen' }));
    expect(onClose).not.toHaveBeenCalled();
    const dlg = within(sheet()!);
    expect(dlg.getByRole('heading', { name: 'Zähler schließen?' })).toBeTruthy();
    expect(dlg.getByText('Der Zwischenstand geht verloren.')).toBeTruthy();
    fireEvent.click(dlg.getByRole('button', { name: 'Weiterzählen' }));
    await waitFor(() => expect(sheet()).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(scorer.getByRole('button', { name: 'Schließen' }));
    fireEvent.click(within(sheet()!).getByRole('button', { name: /^Schließen/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    view.unmount();
  });

  it('Import per Code: Fenster zeigt, was kommt; erst „Übernehmen“ führt zusammen', async () => {
    const incoming: UserState = { ...EMPTY_STATE, owned: { 'BX-01': 1, 'BX-02': 1 }, wishlist: ['BX-03'] };
    const code = await encodeState(incoming);
    let state: UserState = { ...EMPTY_STATE, owned: { 'BX-04': 1 } };
    const update = (fn: (s: UserState) => UserState) => (state = fn(state));
    Element.prototype.scrollIntoView ??= () => {}; // jsdom kennt es nicht
    const view = render(<Transfer state={state} update={update} onClose={() => {}} />);
    fireEvent.input(view.getByRole('textbox', { name: 'Übertragungs-Link einfügen' }), { target: { value: code } });
    fireEvent.click(view.getByRole('button', { name: 'Übernehmen' }));
    await waitFor(() => expect(sheet()).not.toBeNull());
    const dlg = within(sheet()!);
    expect(dlg.getByRole('heading', { name: 'Daten übernehmen?' })).toBeTruthy();
    expect(sheet()!.querySelector('.confirm-parts')!.textContent).toContain('2 Produkte');
    expect(Object.keys(state.owned)).toEqual(['BX-04']); // noch nichts übernommen
    fireEvent.click(dlg.getByRole('button', { name: /^Übernehmen/ }));
    expect(Object.keys(state.owned).sort()).toEqual(['BX-01', 'BX-02', 'BX-04']);
    await waitFor(() => expect(view.getByText('Daten übernommen.')).toBeTruthy());
  });

  it('Hinweis-Variante: nur ein Knopf, Fokus darauf', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmSheet title="Übernehmen ging nicht" confirmLabel="OK" cancelLabel={null} onConfirm={onConfirm} onClose={() => {}}>
        <p>Der Link ist beschädigt.</p>
      </ConfirmSheet>,
    );
    const dlg = within(sheet()!);
    expect(dlg.getAllByRole('button')).toHaveLength(1);
    expect(document.activeElement?.textContent).toContain('OK');
    fireEvent.click(dlg.getByRole('button', { name: /OK/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
