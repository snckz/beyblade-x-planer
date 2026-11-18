import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { PartField } from '../src/components/PartPicker';
import { ComboBuilder } from '../src/components/ComboBuilder';
import { swipeStep } from '../src/lib/categorySwipe';
import { EMPTY_STATE, type UserState } from '../src/lib/storage';
import type { Database } from '../src/lib/types';

const db = JSON.parse(readFileSync(join(process.cwd(), 'public/data/db.json'), 'utf8')) as Database;

afterEach(cleanup);
// Preact führt Effekte per Timer aus – vor dem Abbau der Testumgebung abwarten (siehe comboTabExport.test.tsx)
afterAll(() => new Promise((resolve) => setTimeout(resolve, 150)));

let t = 1000;
function pointer(el: Element, type: string, x: number, y: number) {
  const e = new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, isPrimary: true, pointerType: 'touch' });
  Object.defineProperty(e, 'timeStamp', { value: t });
  el.dispatchEvent(e);
}
/** Wisch über `el`: dx/dy in px in `steps` Schritten über `ms` Millisekunden */
function swipe(el: Element, dx: number, dy = 0, ms = 200, steps = 8) {
  t += 1000;
  const x0 = 200;
  const y0 = 300;
  act(() => {
    pointer(el, 'pointerdown', x0, y0);
    for (let i = 1; i <= steps; i++) {
      t += ms / steps;
      pointer(el, 'pointermove', x0 + (dx * i) / steps, y0 + (dy * i) / steps);
    }
    pointer(el, 'pointerup', x0 + dx, y0 + dy);
  });
}

function openPicker(kind: 'blade' | 'bit' | 'ratchet', value = '') {
  const onChange = vi.fn();
  const props = kind === 'blade' ? { blades: db.blades } : kind === 'bit' ? { bits: db.bits } : { ratchets: db.ratchets };
  const label = kind === 'blade' ? 'Blade' : kind === 'bit' ? 'Bit' : 'Ratchet';
  const view = render(<PartField kind={kind} label={label} value={value} onChange={onChange} {...props} />);
  fireEvent.click(view.getByRole('button', { name: new RegExp(`^${label}:`) }));
  const sheet = document.querySelector<HTMLElement>('.picker-sheet')!;
  return {
    sheet,
    ui: within(sheet),
    body: sheet.querySelector<HTMLElement>('.picker-body')!,
    active: () => [...sheet.querySelectorAll('.picker-tools .chip-on')].map((c) => c.textContent?.trim()),
    onChange,
  };
}

describe('Wischgeste: Entscheidung', () => {
  it('wechselt bei waagrechtem Wisch – auch mit leichtem Daumenbogen', () => {
    expect(swipeStep(-80, 5, 200)).toBe(1); // nach links → nächste
    expect(swipeStep(80, -5, 200)).toBe(-1); // nach rechts → vorherige
    expect(swipeStep(-90, 50, 250)).toBe(1); // Bogen: waagrecht überwiegt
    expect(swipeStep(-42, 0, 400)).toBe(1); // ab 40 px auch langsam
    expect(swipeStep(-28, 0, 60)).toBe(1); // kurzer, schneller Wisch
    expect(swipeStep(-28, 0, 400)).toBe(0); // kurz und langsam
    expect(swipeStep(-60, 70, 200)).toBe(0); // eher senkrecht
    expect(swipeStep(-80, 0, 1200)).toBe(0); // zu langsam (Herumschieben)
    expect(swipeStep(0, 200, 200)).toBe(0); // senkrecht
  });
});

describe('Kategorie per Wischen (Blade/Bit)', () => {
  it('links → nächste, rechts → vorherige Kategorie; Chip und Liste folgen', () => {
    const { body, active, sheet } = openPicker('bit');
    expect(active()).toEqual(['Alle']);
    swipe(body, -90);
    expect(active()).toEqual(['Attack']);
    expect([...sheet.querySelectorAll('.tile.pick .mini-badge-type')].every((b) => b.textContent === 'Attack')).toBe(true);
    swipe(body, -90);
    expect(active()).toEqual(['Defense']);
    swipe(body, 90);
    expect(active()).toEqual(['Attack']);
  });

  it('geht nicht über die erste und letzte Kategorie hinaus', () => {
    const { body, active } = openPicker('blade');
    swipe(body, 90); // schon bei „Alle“
    expect(active()).toEqual(['Alle']);
    for (let i = 0; i < 6; i++) swipe(body, -90);
    expect(active()).toEqual(['Balance']);
  });

  it('senkrechtes Scrollen wechselt nichts', () => {
    const { body, active } = openPicker('bit');
    swipe(body, -30, -260);
    swipe(body, 20, 300);
    expect(active()).toEqual(['Alle']);
  });

  it('blockiert das Mitscrollen nur, wenn die Geste waagrecht ist', () => {
    const { body } = openPicker('bit');
    const touchMove = () => {
      const e = new Event('touchmove', { bubbles: true, cancelable: true });
      body.dispatchEvent(e);
      return e.defaultPrevented;
    };
    t += 1000;
    pointer(body, 'pointerdown', 200, 300);
    t += 16;
    pointer(body, 'pointermove', 188, 304); // waagrecht entschieden
    expect(touchMove()).toBe(true);
    pointer(body, 'pointerup', 120, 310);
    t += 1000;
    pointer(body, 'pointerdown', 200, 300);
    t += 16;
    pointer(body, 'pointermove', 203, 312); // senkrecht → Browser scrollt
    expect(touchMove()).toBe(false);
    pointer(body, 'pointerup', 205, 420);
  });

  it('springt beim Wechsel an den Listenanfang', () => {
    const { body } = openPicker('blade');
    body.scrollTop = 500;
    swipe(body, -90);
    expect(body.scrollTop).toBe(0);
  });

  it('Suche und gewählte Karte bleiben erhalten; der Wisch wählt keine Karte aus', () => {
    const { body, ui, sheet, active, onChange } = openPicker('bit', 'B');
    fireEvent.input(ui.getByRole('searchbox'), { target: { value: 'b' } });
    swipe(body, -90); // Attack
    swipe(body, -90); // Defense
    swipe(body, -90); // Stamina – hier liegt „B Ball“
    expect(active()).toEqual(['Stamina']);
    expect((ui.getByRole('searchbox') as HTMLInputElement).value).toBe('b');
    expect(sheet.querySelector('.tile.pick.selected .tile-name')?.textContent).toBe('B');
    // Klick direkt nach dem Wisch (Finger landet auf einer Karte) wird verworfen
    const card = sheet.querySelector<HTMLElement>('.tile.pick')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(click, 'timeStamp', { value: t + 50 });
    card.dispatchEvent(click);
    expect(onChange).not.toHaveBeenCalled();
    expect(document.querySelector('.picker-sheet')).not.toBeNull(); // Fenster bleibt offen
  });
});

describe('Kategorie per Wischen (Ratchet)', () => {
  it('folgt der Zacken-Reihenfolge inklusive Sonderform; Höhe und Suche bleiben', () => {
    const { body, ui, active } = openPicker('ratchet');
    fireEvent.click(ui.getByRole('button', { name: '8,0 mm' }));
    expect(active()).toEqual(['Alle', '8,0 mm']);
    swipe(body, -90);
    expect(active()).toEqual(['1–3Zacken', '8,0 mm']);
    for (let i = 0; i < 5; i++) swipe(body, -90);
    expect(active()).toEqual(['0 / MSonderform', '8,0 mm']); // letzte Kategorie, nicht darüber hinaus
    swipe(body, 90);
    expect(active()).toEqual(['6+Zacken', '8,0 mm']);
  });

  it('die waagrecht scrollbare Höhenleiste löst keinen Kategorienwechsel aus', () => {
    const { sheet, active } = openPicker('ratchet');
    swipe(sheet.querySelector('.height-filter')!, -120);
    swipe(sheet.querySelector('.height-chip')!, -120);
    expect(active()).toEqual(['Alle', 'Jede Höhe']);
  });
});

describe('Kombo löschen mit Bestätigung', () => {
  const combos = [
    { id: 'a', name: 'Meine Erste', bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' },
    { id: 'b', name: 'Zweite', bladeId: 'WizardRod', ratchetId: '5-70', bitId: 'DB' },
  ];
  function setup() {
    let current: UserState = { ...EMPTY_STATE, combos, deck: ['a', 'b'] };
    function Harness() {
      const [s, set] = useState(current);
      current = s;
      return <ComboBuilder db={db} state={s} update={(fn) => set((x) => (current = fn(x)))} />;
    }
    const view = render(<Harness />);
    const deleteBtn = (name: string) => view.getByRole('button', { name: `Kombo ${name} löschen` });
    return { view, deleteBtn, state: () => current };
  }

  it('Löschen erst nach Bestätigung – genau die gewählte Kombo, auch aus dem Deck', async () => {
    const { deleteBtn, state } = setup();
    fireEvent.click(deleteBtn('Zweite'));
    expect(state().combos).toHaveLength(2); // noch nichts gelöscht
    const dlg = within(document.querySelector<HTMLElement>('.confirm-sheet')!);
    expect(dlg.getByRole('heading', { name: 'Kombo löschen?' })).toBeTruthy();
    expect(dlg.getByText('Zweite')).toBeTruthy();
    expect(document.querySelector('.confirm-parts')?.textContent).toContain('5-70');
    expect(dlg.getByText('Das lässt sich nicht rückgängig machen.')).toBeTruthy();
    fireEvent.click(dlg.getByRole('button', { name: /^Löschen/ }));
    expect(state().combos.map((c) => c.id)).toEqual(['a']);
    expect(state().deck).toEqual(['a']);
    await waitFor(() => expect(document.querySelector('.confirm-sheet')).toBeNull());
  });

  it('Abbrechen, Escape und Hintergrund ändern nichts', async () => {
    const { deleteBtn, state } = setup();
    const before = JSON.stringify(state());
    for (const how of ['cancel', 'escape', 'backdrop'] as const) {
      fireEvent.click(deleteBtn('Meine Erste'));
      const sheet = document.querySelector<HTMLElement>('.confirm-sheet')!;
      if (how === 'cancel') fireEvent.click(within(sheet).getByRole('button', { name: 'Abbrechen' }));
      if (how === 'escape') fireEvent.keyDown(document, { key: 'Escape' });
      if (how === 'backdrop') fireEvent.click(document.querySelector('.confirm-backdrop')!);
      await waitFor(() => expect(document.querySelector('.confirm-sheet')).toBeNull());
      expect(JSON.stringify(state())).toBe(before);
    }
  });

  it('verhindert versehentliches Löschen: Fokus auf „Abbrechen“, Doppeltipp löscht nur einmal', async () => {
    const { deleteBtn, state } = setup();
    fireEvent.click(deleteBtn('Meine Erste'));
    const sheet = document.querySelector<HTMLElement>('.confirm-sheet')!;
    expect(sheet.getAttribute('role')).toBe('alertdialog');
    expect(document.activeElement?.textContent).toBe('Abbrechen');
    const del = within(sheet).getByRole('button', { name: /^Löschen/ });
    fireEvent.click(del);
    fireEvent.click(del);
    expect(state().combos.map((c) => c.id)).toEqual(['b']);
    await waitFor(() => expect(document.querySelector('.confirm-sheet')).toBeNull());
  });
});
