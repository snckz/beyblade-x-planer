import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/preact';
import { useRef } from 'preact/hooks';
import { attachSheetDrag, dragCloses, resetSheetDrag } from '../src/lib/sheetDrag';
import { useModal } from '../src/lib/useModal';

const HEIGHT = 600;

/** Zeiger-Ereignis mit festem Zeitstempel (für die Geschwindigkeit beim Loslassen). */
function pointer(el: Element, type: string, y: number, t: number, x = 100) {
  const e = new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'touch' });
  Object.defineProperty(e, 'timeStamp', { value: t });
  el.dispatchEvent(e);
}

/** Zieht von y=20 in gleichmäßigen Schritten um `dy` Pixel nach unten; `ms` ist die Gesamtdauer. */
function dragDown(el: Element, dy: number, ms: number, steps = 10) {
  pointer(el, 'pointerdown', 20, 0);
  for (let i = 1; i <= steps; i++) pointer(el, 'pointermove', 20 + (dy * i) / steps, (ms * i) / steps);
}

function sheetDom() {
  document.body.innerHTML = `
    <div class="sheet-backdrop">
      <div class="sheet">
        <div class="sheet-grab"></div>
        <div class="win-head"><h2 class="win-title">Titel</h2><button class="win-close">x</button></div>
        <div class="picker-tools"><input type="search" /></div>
        <div class="win-scroll"><p class="content">Inhalt</p></div>
      </div>
    </div>`;
  const root = document.querySelector<HTMLElement>('.sheet')!;
  root.getBoundingClientRect = () => ({ height: HEIGHT }) as DOMRect;
  return {
    root,
    grab: root.querySelector('.sheet-grab')!,
    title: root.querySelector('.win-title')!,
    button: root.querySelector('.win-close')!,
    input: root.querySelector('input')!,
    content: root.querySelector('.content')!,
  };
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('dragCloses', () => {
  it('schließt ab 30 % der Fensterhöhe, höchstens 140 px', () => {
    expect(dragCloses(89, 0, 300)).toBe(false);
    expect(dragCloses(90, 0, 300)).toBe(true);
    expect(dragCloses(139, 0, 800)).toBe(false);
    expect(dragCloses(140, 0, 800)).toBe(true);
  });
  it('schließt bei schnellem Wisch schon nach kurzer Strecke', () => {
    expect(dragCloses(30, 0.8, 800)).toBe(true);
    expect(dragCloses(30, 0.3, 800)).toBe(false);
    expect(dragCloses(10, 2, 800)).toBe(false);
  });
  it('bleibt offen, wenn der Finger beim Loslassen wieder nach oben geht', () => {
    expect(dragCloses(300, -0.4, 800)).toBe(false);
    expect(dragCloses(0, 1, 800)).toBe(false);
    expect(dragCloses(-20, 1, 800)).toBe(false);
  });
});

describe('attachSheetDrag', () => {
  let close: ReturnType<typeof vi.fn<() => void>>;
  beforeEach(() => {
    close = vi.fn<() => void>();
  });

  it('folgt dem Finger und schließt nach langem Zug am Griff', () => {
    const { root, grab } = sheetDom();
    attachSheetDrag(root, close);
    dragDown(grab, 206, 1000);
    // Die ersten 6 px sind Anlauf (Tippen oder Ziehen?), danach folgt das Fenster 1:1.
    expect(root.style.transform).toBe('translateY(200px)');
    expect(root.classList.contains('is-dragging')).toBe(true);
    pointer(grab, 'pointerup', 226, 1200);
    expect(close).toHaveBeenCalledTimes(1);
    expect(root.style.getPropertyValue('--sink')).toBe('100%');
    expect(root.classList.contains('is-dragging')).toBe(false);
  });

  it('lässt sich auch an der Kopfzeile ziehen', () => {
    const { root, title } = sheetDom();
    attachSheetDrag(root, close);
    dragDown(title, 200, 1000);
    pointer(title, 'pointerup', 220, 1200);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('gleitet nach kurzem Zug zurück und bleibt offen', () => {
    vi.useFakeTimers();
    const { root, grab } = sheetDom();
    attachSheetDrag(root, close);
    dragDown(grab, 60, 1000);
    expect(root.style.transform).not.toBe('');
    pointer(grab, 'pointerup', 80, 1200);
    expect(close).not.toHaveBeenCalled();
    expect(root.style.transform).toBe('');
    expect(root.classList.contains('is-settling')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(root.classList.contains('is-settling')).toBe(false);
  });

  it('schließt bei schnellem Wisch trotz kurzer Strecke', () => {
    const { root, grab } = sheetDom();
    attachSheetDrag(root, close);
    dragDown(grab, 60, 60);
    pointer(grab, 'pointerup', 80, 62);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('schließt auch, wenn der Browser den Wisch in einem einzigen Ereignis meldet', () => {
    const { root, grab } = sheetDom();
    attachSheetDrag(root, close);
    pointer(grab, 'pointerdown', 20, 0);
    pointer(grab, 'pointermove', 110, 40);
    pointer(grab, 'pointerup', 110, 42);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('bleibt offen, wenn weit gezogen und dann wieder hochgeschoben wird', () => {
    const { root, grab } = sheetDom();
    attachSheetDrag(root, close);
    dragDown(grab, 300, 500);
    pointer(grab, 'pointermove', 250, 540);
    pointer(grab, 'pointermove', 200, 580);
    pointer(grab, 'pointerup', 190, 590);
    expect(close).not.toHaveBeenCalled();
    expect(root.style.transform).toBe('');
  });

  it('schiebt das Fenster nie über seine Position hinaus nach oben', () => {
    const { root, grab } = sheetDom();
    attachSheetDrag(root, close);
    dragDown(grab, 40, 200);
    pointer(grab, 'pointermove', -80, 300);
    expect(root.style.transform).toBe('translateY(0px)');
  });

  it('gleitet bei abgebrochener Geste zurück statt zu schließen', () => {
    const { root, grab } = sheetDom();
    attachSheetDrag(root, close);
    dragDown(grab, 300, 1000);
    pointer(grab, 'pointercancel', 320, 1001);
    expect(close).not.toHaveBeenCalled();
    expect(root.style.transform).toBe('');
  });

  it('lässt sich von einem zweiten Zeiger nicht aus der Geste bringen', () => {
    const { root, grab, title } = sheetDom();
    attachSheetDrag(root, close);
    dragDown(grab, 200, 1000);
    const before = root.style.transform;
    pointer(title, 'pointerdown', 40, 1100);
    expect(root.style.transform).toBe(before);
    pointer(grab, 'pointerup', 220, 1300);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('gleitet zurück, wenn das Fenster den Zeiger verliert – die Übergabe vom Griff zählt nicht', () => {
    const { root, grab } = sheetDom();
    attachSheetDrag(root, close);
    dragDown(grab, 200, 1000);
    pointer(grab, 'lostpointercapture', 220, 1001);
    expect(root.style.transform).not.toBe('');
    pointer(root, 'lostpointercapture', 220, 1002);
    expect(root.style.transform).toBe('');
    expect(close).not.toHaveBeenCalled();
  });

  it('reagiert nicht auf Knöpfe, Suchfeld und scrollenden Inhalt', () => {
    const { root, button, input, content } = sheetDom();
    attachSheetDrag(root, close);
    for (const el of [button, input, content]) {
      dragDown(el, 300, 300);
      expect(root.style.transform).toBe('');
      pointer(el, 'pointerup', 320, 320);
    }
    expect(close).not.toHaveBeenCalled();
  });

  it('ignoriert seitliche und aufwärts gerichtete Bewegungen', () => {
    const { root, grab } = sheetDom();
    attachSheetDrag(root, close);
    pointer(grab, 'pointerdown', 20, 0);
    pointer(grab, 'pointermove', 24, 20, 140);
    pointer(grab, 'pointermove', 300, 200, 140);
    pointer(grab, 'pointerup', 300, 220, 140);
    pointer(grab, 'pointerdown', 20, 300);
    pointer(grab, 'pointermove', 10, 320);
    pointer(grab, 'pointermove', 300, 500);
    pointer(grab, 'pointerup', 300, 520);
    expect(root.style.transform).toBe('');
    expect(close).not.toHaveBeenCalled();
  });

  it('lässt Tippen unberührt', () => {
    const { root, grab } = sheetDom();
    attachSheetDrag(root, close);
    pointer(grab, 'pointerdown', 20, 0);
    pointer(grab, 'pointermove', 22, 30);
    pointer(grab, 'pointerup', 22, 60);
    expect(root.style.transform).toBe('');
    expect(root.classList.contains('is-dragging')).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  it('gleitet mit „Bewegung reduzieren“ ohne Übergang zurück', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    const { root, grab } = sheetDom();
    attachSheetDrag(root, close);
    dragDown(grab, 60, 1000);
    pointer(grab, 'pointerup', 80, 1200);
    expect(root.style.transform).toBe('');
    expect(root.classList.contains('is-settling')).toBe(false);
  });

  it('hält die Seite nur während der Geste fest (iOS: kein Mitscrollen)', () => {
    const { root, grab, content } = sheetDom();
    attachSheetDrag(root, close);
    const touchmove = (el: Element) => {
      const e = new Event('touchmove', { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(touchmove(grab)).toBe(false);
    pointer(grab, 'pointerdown', 20, 0);
    expect(touchmove(grab)).toBe(true);
    expect(touchmove(content)).toBe(false);
    pointer(grab, 'pointerup', 20, 30);
    expect(touchmove(grab)).toBe(false);
  });

  it('tut nichts bei Fenstern ohne Griff und nach dem Aushängen', () => {
    const { root, grab, title } = sheetDom();
    const detach = attachSheetDrag(root, close);
    detach();
    dragDown(grab, 300, 300);
    expect(root.style.transform).toBe('');
    grab.remove();
    attachSheetDrag(root, close);
    dragDown(title, 300, 300);
    pointer(title, 'pointerup', 320, 320);
    expect(root.style.transform).toBe('');
    expect(close).not.toHaveBeenCalled();
  });

  it('resetSheetDrag setzt das Fenster zurück', () => {
    const { root } = sheetDom();
    root.style.transform = 'translateY(80px)';
    root.style.setProperty('--sink', '100%');
    root.classList.add('is-dragging', 'is-settling');
    resetSheetDrag(root);
    expect(root.style.transform).toBe('');
    expect(root.style.getPropertyValue('--sink')).toBe('');
    expect(root.className).toBe('sheet');
  });
});

describe('useModal mit Griff', () => {
  function Sheet({ onClose, grab = true }: { onClose: () => void; grab?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const close = useModal(ref, onClose, { animate: true });
    return (
      <div class="sheet-backdrop">
        <div ref={ref} class={grab ? 'sheet' : 'live'} role="dialog" aria-modal="true" tabIndex={-1}>
          {grab && <div class="sheet-grab" aria-hidden="true" />}
          <div class="win-head">
            <h2 class="win-title">Titel</h2>
            <button type="button" class="win-close" onClick={close}>
              Schließen
            </button>
          </div>
        </div>
      </div>
    );
  }
  const setup = (grab = true) => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 0));
    const onClose = vi.fn<() => void>();
    const { container } = render(<Sheet onClose={onClose} grab={grab} />);
    const root = container.querySelector<HTMLElement>('[role="dialog"]')!;
    root.getBoundingClientRect = () => ({ height: HEIGHT }) as DOMRect;
    return { onClose, root, host: container.querySelector('.sheet-backdrop')!, title: container.querySelector('.win-title')!, button: container.querySelector<HTMLElement>('.win-close')! };
  };

  it('schließt nach dem Ziehen über dieselbe Animation wie der Schließen-Knopf', () => {
    const { onClose, root, host } = setup();
    const grab = root.querySelector('.sheet-grab')!;
    dragDown(grab, 250, 1000);
    pointer(grab, 'pointerup', 270, 1200);
    expect(host.classList.contains('is-closing')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(180);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Bleibt das Fenster doch offen, steht es wieder an seinem Platz.
    vi.advanceTimersByTime(20);
    expect(host.classList.contains('is-closing')).toBe(false);
    expect(root.style.transform).toBe('');
    expect(root.style.getPropertyValue('--sink')).toBe('');
  });

  it('behält den Schließen-Knopf', () => {
    const { onClose, button } = setup();
    button.click();
    vi.advanceTimersByTime(180);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gibt Vollbild-Fenstern ohne Griff keine Ziehgeste', () => {
    const { onClose, root, title } = setup(false);
    dragDown(title, 300, 300);
    pointer(title, 'pointerup', 320, 320);
    vi.advanceTimersByTime(400);
    expect(root.style.transform).toBe('');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('schließt mit „Bewegung reduzieren“ sofort', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    const { onClose, root, host } = setup();
    const grab = root.querySelector('.sheet-grab')!;
    dragDown(grab, 250, 1000);
    pointer(grab, 'pointerup', 270, 1200);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(host.classList.contains('is-closing')).toBe(false);
  });
});
