import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { PartField, setProgressiveForTests } from '../src/components/PartPicker';
import { ComboBuilder } from '../src/components/ComboBuilder';
import { swipeStep } from '../src/lib/categorySwipe';
import { EMPTY_STATE, type UserState } from '../src/lib/storage';
import type { Database } from '../src/lib/types';

const db = JSON.parse(readFileSync(join(process.cwd(), 'public/data/db.json'), 'utf8')) as Database;

afterEach(cleanup);
// Preact führt Effekte per Timer aus – vor dem Abbau der Testumgebung abwarten (siehe comboTabExport.test.tsx)
afterAll(() => new Promise((resolve) => setTimeout(resolve, 150)));

let t = 1000;
const TYPES: Record<string, string> = { pointerdown: 'touchstart', pointermove: 'touchmove', pointerup: 'touchend' };
/** Touch-Ereignis mit einem Finger (jsdom hat keinen Touch-Konstruktor – Felder werden nachgebildet) */
function pointer(el: Element, type: string, x: number, y: number) {
  const name = TYPES[type] ?? type;
  const e = new Event(name, { bubbles: true, cancelable: true });
  const point = { identifier: 7, clientX: x, clientY: y, target: el };
  const list = (items: object[]) => Object.assign(items, { item: (i: number) => items[i] ?? null });
  Object.defineProperty(e, 'touches', { value: list(name === 'touchend' ? [] : [point]) });
  Object.defineProperty(e, 'changedTouches', { value: list([point]) });
  Object.defineProperty(e, 'timeStamp', { value: t });
  el.dispatchEvent(e);
  return e;
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
    expect(swipeStep(-32, 0, 400)).toBe(1); // ab 30 px auch langsam
    expect(swipeStep(-20, 0, 60)).toBe(1); // kurzer, schneller Wisch
    expect(swipeStep(-24, 0, 400)).toBe(0); // kurz und langsam
    expect(swipeStep(-5, 0, 40)).toBe(0); // Tipp mit leichtem Verrutschen
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
    expect([...sheet.querySelectorAll('.picker-page.is-current .tile.pick .mini-badge-type')].every((b) => b.textContent === 'Attack')).toBe(true);
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
    t += 1000;
    pointer(body, 'pointerdown', 200, 300);
    t += 16;
    expect(pointer(body, 'pointermove', 188, 304).defaultPrevented).toBe(true); // waagrecht entschieden
    act(() => void pointer(body, 'pointerup', 190, 304));
    t += 1000;
    pointer(body, 'pointerdown', 200, 300);
    t += 16;
    expect(pointer(body, 'pointermove', 203, 312).defaultPrevented).toBe(false); // senkrecht → Browser scrollt
    expect(pointer(body, 'pointermove', 205, 360).defaultPrevented).toBe(false);
    pointer(body, 'pointerup', 205, 420);
  });

  it('blättert: die Spur folgt dem Finger, die nächste Kategorie liegt fertig daneben; am Rand nur gebremst', async () => {
    const { body } = openPicker('bit');
    const track = () => body.querySelector<HTMLElement>('.picker-track')!;
    const next = () => body.querySelector<HTMLElement>('.picker-page[data-page="1"]')!;
    const offset = (el: HTMLElement) => Number(/translate(?:3d|X)\((-?[\d.]+)px/.exec(el.style.transform)?.[1] ?? 0);
    // Nachbar wird kurz nach dem Öffnen gebaut und liegt dann rechts daneben bereit
    await waitFor(() => expect(next()?.classList.contains('is-side')).toBe(true));
    expect(next().dataset.dir).toBe('1');
    expect(next().getAttribute('aria-hidden')).toBe('true');
    t += 1000;
    pointer(body, 'pointerdown', 200, 300);
    t += 50;
    pointer(body, 'pointermove', 140, 302); // 60 px nach links: es gibt eine nächste Kategorie
    const normal = offset(track());
    expect(normal).toBe(-60); // 1:1 mit dem Finger
    t += 50;
    act(() => void pointer(body, 'pointerup', 190, 302)); // zurückgezogen: kein Wechsel
    expect(track().style.transform).toBe('');
    t += 1000;
    pointer(body, 'pointerdown', 200, 300);
    t += 50;
    pointer(body, 'pointermove', 260, 302); // 60 px nach rechts bei „Alle“: Rand
    expect(Math.abs(offset(track()))).toBeLessThan(Math.abs(normal));
    expect(offset(track())).toBeGreaterThan(0);
    act(() => void pointer(body, 'pointerup', 260, 302));
    expect(track().style.transform).toBe('');
  });

  it('Chip schaltet beim Loslassen sofort um, die Seite nach dem Einrasten; ein Chip-Tipp dabei hat Vorrang', async () => {
    const { body, sheet, ui, active } = openPicker('bit');
    // Echte Seitenbreite vortäuschen (jsdom ordnet nichts an) – dann federt die Seite animiert ein
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!;
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 360 });
    try {
      const current = () => sheet.querySelector('.picker-page.is-current')?.getAttribute('data-page');
      await waitFor(() => expect(sheet.querySelector('.picker-page[data-page="1"]')).not.toBeNull());
      swipe(body, -120);
      expect(active()).toEqual(['Attack']); // sofort
      expect(current()).toBe('0'); // Seite rastet noch ein
      await waitFor(() => expect(current()).toBe('1'));
      expect(active()).toEqual(['Attack']);

      swipe(body, -120); // → Defense, rastet ein …
      expect(active()).toEqual(['Defense']);
      fireEvent.click(ui.getByRole('button', { name: /Stamina/ })); // … Tipp auf Stamina hat Vorrang
      // Einrasten sofort beendet: nichts gleitet mehr über die neue Seite
      expect(sheet.querySelector<HTMLElement>('.picker-track')!.style.transform).toBe('');
      await new Promise((r) => setTimeout(r, 400));
      expect(active()).toEqual(['Stamina']);
      expect(sheet.querySelector('.picker-page.is-current .mini-badge-type')?.textContent).toBe('Stamina');
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', original);
    }
  });

  it('räumt eine liegengebliebene Geste bei der nächsten Berührung auf', async () => {
    const { body, active } = openPicker('bit');
    await waitFor(() => expect(body.querySelector('.picker-page[data-page="1"]')).not.toBeNull());
    t += 1000;
    pointer(body, 'pointerdown', 200, 300);
    t += 50;
    pointer(body, 'pointermove', 120, 301); // waagrecht gezogen – das Ende kommt nie an
    expect(body.querySelector<HTMLElement>('.picker-track')!.style.transform).not.toBe('');
    t += 500;
    act(() => void pointer(body, 'pointerdown', 200, 300)); // neue Berührung
    expect(body.querySelector<HTMLElement>('.picker-track')!.style.transform).toBe('');
    expect(active()).toEqual(['Alle']);
    act(() => void pointer(body, 'pointerup', 200, 300));
  });

  it('baut lange Listen in Häppchen auf: sofort die sichtbaren Karten, dann nach und nach alle', async () => {
    setProgressiveForTests(6, 20);
    try {
      const { sheet } = openPicker('blade');
      const cards = () => sheet.querySelectorAll('.picker-page.is-current .tile.pick').length;
      expect(cards()).toBe(6);
      await waitFor(() => expect(cards()).toBe(db.blades.length), { timeout: 2000 });
    } finally {
      setProgressiveForTests(null);
    }
  });

  it('bricht ab, wenn der Finger zum Schluss deutlich zurückzieht', () => {
    const { body, active } = openPicker('bit');
    t += 1000;
    act(() => {
      pointer(body, 'pointerdown', 200, 300);
      t += 100;
      pointer(body, 'pointermove', 100, 301); // weit nach links …
      t += 30;
      pointer(body, 'pointermove', 130, 301); // … dann zügig zurück
      t += 30;
      pointer(body, 'pointerup', 160, 301);
    });
    expect(active()).toEqual(['Alle']);
  });

  it('baut Seiten beim Blättern nicht neu auf – zurück sind Karten und Fotos sofort da', () => {
    const { body, sheet } = openPicker('blade');
    const cards = () => [...sheet.querySelectorAll<HTMLElement>('.picker-page.is-current .tile.pick')];
    const before = cards();
    expect(before.length).toBe(db.blades.length);
    swipe(body, -80); // → Attack
    const attack = cards();
    expect(attack.length).toBe(db.blades.filter((b) => b.type === 'attack').length);
    expect(attack.length).toBeGreaterThan(0);
    swipe(body, 80); // zurück zu „Alle“
    const after = cards();
    expect(after.length).toBe(before.length);
    expect(after.every((c, i) => c === before[i])).toBe(true); // dieselben Elemente
    // Nicht sichtbare Seiten sind für Tastatur und Vorlesen gesperrt
    expect(sheet.querySelectorAll('.picker-page:not(.is-current)[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('zählt das Tempo am Ende: langsam ansetzen, schnell wegwischen wechselt', () => {
    const { body, active } = openPicker('bit');
    t += 1000;
    act(() => {
      pointer(body, 'pointerdown', 200, 300);
      t += 500;
      pointer(body, 'pointermove', 192, 301); // 8 px in 500 ms
      t += 20;
      pointer(body, 'pointermove', 184, 301); // dann zügig …
      t += 20;
      pointer(body, 'pointerup', 176, 301); // … insgesamt nur 24 px, aber zuletzt 0,4 px/ms
    });
    expect(active()).toEqual(['Attack']);
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
    expect(sheet.querySelector('.picker-page.is-current .tile.pick.selected .tile-name')?.textContent).toBe('B');
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

describe('Kombo löschen: nur per Papierkorb (wie iOS), mit Rückgängig', () => {
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
    return { view, state: () => current };
  }

  it('kein × in der Zeile – der Papierkorb ist der einzige Lösch-Knopf und erst nach dem Wischen zu sehen', () => {
    const { view } = setup();
    const row = view.getByText('Zweite').closest<HTMLElement>('.swipe-row')!;
    expect(row.querySelector('.icon-btn')).toBeNull();
    expect(row.textContent).not.toContain('×');
    expect(row.classList.contains('is-open')).toBe(false);
    expect(view.getAllByRole('button', { name: 'Kombo Zweite löschen' })).toHaveLength(1);
  });

  it('ohne Wischen erreichbar (VoiceOver/Tastatur): Ansteuern öffnet, Antippen löscht genau diese Kombo – auch aus dem Deck', async () => {
    const { view, state } = setup();
    const trash = view.getByRole('button', { name: 'Kombo Zweite löschen' });
    const row = trash.closest<HTMLElement>('.swipe-row')!;
    act(() => trash.focus());
    expect(row.classList.contains('is-open')).toBe(true);
    fireEvent.click(trash);
    await waitFor(() => expect(state().combos.map((c) => c.id)).toEqual(['a']));
    expect(state().deck).toEqual(['a']);
    expect(document.querySelector('.confirm-sheet')).toBeNull(); // kein Rückfrage-Fenster mehr
  });

  it('Fokus verlässt die Zeile: sie schließt wieder, nichts gelöscht', () => {
    const { view, state } = setup();
    const trash = view.getByRole('button', { name: 'Kombo Meine Erste löschen' });
    act(() => trash.focus());
    act(() => view.getAllByRole('button', { name: /Deck/ })[1]!.focus());
    expect(trash.closest('.swipe-row')!.classList.contains('is-open')).toBe(false);
    expect(state().combos).toHaveLength(2);
  });
});
