import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { ComboBuilder } from '../src/components/ComboBuilder';
import { Collection } from '../src/components/Collection';
import { UndoToast } from '../src/components/UndoToast';
import { dismissUndo } from '../src/lib/undo';
import { EMPTY_STATE, type UserState } from '../src/lib/storage';
import type { Database } from '../src/lib/types';

const db = JSON.parse(readFileSync(join(process.cwd(), 'public/data/db.json'), 'utf8')) as Database;

afterEach(() => {
  cleanup();
  dismissUndo();
});
afterAll(() => new Promise((resolve) => setTimeout(resolve, 400)));

let t = 1000;
/** Touch-Ereignis mit einem Finger (jsdom hat keinen Touch-Konstruktor) */
function touch(el: Element, type: 'touchstart' | 'touchmove' | 'touchend', x: number, y: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const point = { identifier: 3, clientX: x, clientY: y, target: el };
  const list = (items: object[]) => Object.assign(items, { item: (i: number) => items[i] ?? null });
  Object.defineProperty(e, 'touches', { value: list(type === 'touchend' ? [] : [point]) });
  Object.defineProperty(e, 'changedTouches', { value: list([point]) });
  Object.defineProperty(e, 'timeStamp', { value: t });
  el.dispatchEvent(e);
}
/** Waagrecht wischen über `el` (dx px, über `ms`) */
function swipe(el: Element, dx: number, dy = 0, ms = 240) {
  t += 1000;
  act(() => {
    touch(el, 'touchstart', 300, 300);
    for (let i = 1; i <= 8; i++) {
      t += ms / 8;
      touch(el, 'touchmove', 300 + (dx * i) / 8, 300 + (dy * i) / 8);
    }
    touch(el, 'touchend', 300 + dx, 300 + dy);
  });
}

function combos() {
  let current: UserState = {
    ...EMPTY_STATE,
    combos: [
      { id: 'a', name: 'Erste', bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' },
      { id: 'b', name: 'Zweite', bladeId: 'WizardRod', ratchetId: '5-70', bitId: 'DB' },
      { id: 'c', name: 'Dritte', bladeId: 'DranSword', ratchetId: '4-60', bitId: 'F' },
    ],
    deck: ['a', 'b'],
  };
  function Harness() {
    const [s, set] = useState(current);
    current = s;
    return (
      <>
        <ComboBuilder db={db} state={s} update={(fn) => set((x) => (current = fn(x)))} />
        <UndoToast />
      </>
    );
  }
  const view = render(<Harness />);
  const row = (name: string) => view.getByText(name).closest<HTMLElement>('.swipe-row')!;
  return { view, row, state: () => current };
}

describe('Wischen zum Löschen (wie iOS)', () => {
  it('nach links öffnet den Papierkorb; Tipp darauf löscht; „Rückgängig“ stellt die Kombo samt Deck-Platz wieder her', async () => {
    const { row, state } = combos();
    const r = row('Zweite');
    const trash = r.querySelector<HTMLButtonElement>('.swipe-delete')!;
    expect(r.classList.contains('is-open')).toBe(false); // zu: Papierkorb nicht zu sehen
    swipe(r, -120);
    expect(r.classList.contains('is-open')).toBe(true);
    expect(r.querySelector<HTMLElement>('.swipe-content')!.style.transform).toContain('-84px');
    expect(state().combos).toHaveLength(3); // nur geöffnet, noch nichts gelöscht
    fireEvent.click(trash);
    await waitFor(() => expect(state().combos.map((c) => c.id)).toEqual(['a', 'c']));
    expect(state().deck).toEqual(['a']);
    const toast = within(document.querySelector<HTMLElement>('.undo-toast')!);
    expect(toast.getByText('Kombo „Zweite“ gelöscht')).toBeTruthy();
    fireEvent.click(toast.getByRole('button', { name: /Rückgängig/ }));
    expect(state().combos.map((c) => c.id)).toEqual(['a', 'b', 'c']); // an alter Stelle
    expect(state().deck).toEqual(['a', 'b']);
    await waitFor(() => expect(document.querySelector('.undo-toast')).toBeNull());
  });

  it('ganz durchwischen löscht direkt', async () => {
    const { row, state } = combos();
    swipe(row('Dritte'), -320);
    await waitFor(() => expect(state().combos.map((c) => c.id)).toEqual(['a', 'b']));
  });

  it('eine Berührung während des Hinausgleitens bricht das Löschen nicht ab', async () => {
    const { row, state } = combos();
    const r = row('Dritte');
    swipe(r, -320); // ganz durchgewischt – gleitet hinaus
    act(() => touch(r, 'touchstart', 200, 300)); // sofort wieder angefasst
    act(() => touch(r, 'touchend', 200, 300));
    await waitFor(() => expect(state().combos.map((c) => c.id)).toEqual(['a', 'b']));
  });

  it('Tipp auf einen anderen Eintrag schließt den offenen nur und löst dort nichts aus', () => {
    const { row, state } = combos();
    swipe(row('Erste'), -120);
    const other = within(row('Zweite')).getByRole('button', { name: 'Im Deck' });
    t += 1000;
    act(() => {
      touch(other, 'touchstart', 200, 400);
      t += 60;
      touch(other, 'touchend', 200, 400);
    });
    fireEvent.click(other);
    expect(row('Erste').classList.contains('is-open')).toBe(false);
    expect(state().deck).toEqual(['a', 'b']); // nicht umgeschaltet
    // Der nächste, eigene Tipp wirkt wieder
    t += 1000;
    act(() => touch(other, 'touchstart', 200, 400));
    act(() => touch(other, 'touchend', 200, 400));
    fireEvent.click(other);
    expect(state().deck).toEqual(['a']);
  });

  it('kurz oder senkrecht wischen löscht nichts und öffnet nichts; nach rechts schließt wieder', () => {
    const { row, state } = combos();
    const r = row('Erste');
    swipe(r, -25, 0, 600); // zu kurz und langsam
    expect(r.classList.contains('is-open')).toBe(false);
    swipe(r, -40, -160); // senkrecht: Scrollen
    expect(r.classList.contains('is-open')).toBe(false);
    swipe(r, -120);
    expect(r.classList.contains('is-open')).toBe(true);
    swipe(r, 120);
    expect(r.classList.contains('is-open')).toBe(false);
    expect(state().combos).toHaveLength(3);
  });

  it('nur ein Eintrag offen; Antippen eines offenen Eintrags schließt ihn, ohne etwas auszulösen', () => {
    const { row, view, state } = combos();
    swipe(row('Erste'), -120);
    swipe(row('Zweite'), -120);
    expect(row('Erste').classList.contains('is-open')).toBe(false);
    expect(row('Zweite').classList.contains('is-open')).toBe(true);
    // Tipp auf „+ Deck“ der offenen Zeile: schließt nur
    const deckBtn = within(row('Zweite')).getByRole('button', { name: 'Im Deck' });
    t += 1000;
    act(() => {
      touch(deckBtn, 'touchstart', 200, 300);
      t += 60;
      touch(deckBtn, 'touchend', 200, 300);
    });
    fireEvent.click(deckBtn);
    expect(row('Zweite').classList.contains('is-open')).toBe(false);
    expect(state().deck).toEqual(['a', 'b']); // nichts umgeschaltet
    expect(view.getAllByRole('button', { name: 'Kombo Zweite löschen' })).toHaveLength(1); // nur das ×
  });
});

describe('Sammlung: Entfernen im eigenen Fenster und per Wischen', () => {
  const code = db.products.find((p) => p.bladeId)!.code;
  function collection(owned: Record<string, number>) {
    let current: UserState = { ...EMPTY_STATE, owned };
    function Harness() {
      const [s, set] = useState(current);
      current = s;
      return (
        <>
          <Collection db={db} state={s} update={(fn) => set((x) => (current = fn(x)))} />
          <UndoToast />
        </>
      );
    }
    const view = render(<Harness />);
    return { view, state: () => current };
  }

  it('× bei Anzahl 1 fragt im eigenen Fenster (kein window.confirm); Abbrechen lässt alles, Entfernen entfernt', async () => {
    const { view, state } = collection({ [code]: 1 });
    fireEvent.click(view.getByRole('button', { name: 'Bearbeiten' }));
    const product = db.products.find((p) => p.code === code)!;
    fireEvent.click(view.getByRole('button', { name: `${product.name} aus der Sammlung entfernen` }));
    let dlg = within(document.querySelector<HTMLElement>('.confirm-sheet')!);
    expect(dlg.getByRole('heading', { name: 'Aus der Sammlung entfernen?' })).toBeTruthy();
    fireEvent.click(dlg.getByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(document.querySelector('.confirm-sheet')).toBeNull());
    expect(state().owned[code]).toBe(1);
    fireEvent.click(view.getByRole('button', { name: `${product.name} aus der Sammlung entfernen` }));
    dlg = within(document.querySelector<HTMLElement>('.confirm-sheet')!);
    fireEvent.click(dlg.getByRole('button', { name: /Entfernen/ }));
    expect(state().owned[code]).toBeUndefined();
  });

  it('Wunschliste: kein × mehr – Papierkorb erst nach dem Wischen, ohne Geste per Tastatur erreichbar', async () => {
    const wish = db.products.filter((p) => p.bladeId).slice(1, 3).map((p) => p.code);
    let current: UserState = { ...EMPTY_STATE, owned: { [code]: 1 }, wishlist: wish };
    function Harness() {
      const [s, set] = useState(current);
      current = s;
      return <Collection db={db} state={s} update={(fn) => set((x) => (current = fn(x)))} />;
    }
    const view = render(<Harness />);
    const rows = [...view.container.querySelectorAll<HTMLElement>('.wish-card .swipe-row')];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !r.textContent?.includes('×') && !r.querySelector('.icon-btn'))).toBe(true);
    const name = db.products.find((p) => p.code === wish[0])!.name;
    const trash = view.getByRole('button', { name: `${name} von der Wunschliste nehmen` });
    act(() => trash.focus());
    expect(rows[0]!.classList.contains('is-open')).toBe(true);
    fireEvent.click(trash);
    await waitFor(() => expect(current.wishlist).toEqual([wish[1]]));
  });

  it('Produkt wegwischen entfernt alle Exemplare; „Rückgängig“ bringt sie zurück', async () => {
    const { view, state } = collection({ [code]: 2 });
    const tile = view.container.querySelector<HTMLElement>('.tiles .swipe-row')!;
    swipe(tile, -330);
    await waitFor(() => expect(state().owned[code]).toBeUndefined());
    fireEvent.click(within(document.querySelector<HTMLElement>('.undo-toast')!).getByRole('button', { name: /Rückgängig/ }));
    expect(state().owned[code]).toBe(2);
  });
});
