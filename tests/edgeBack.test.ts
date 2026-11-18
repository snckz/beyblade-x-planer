import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EDGE, attachEdgeBack, edgeGoesBack, slideBack } from '../src/lib/edgeBack';

const WIDTH = 390;

function pointer(el: Element, type: string, x: number, y: number, t: number) {
  const e = new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'touch' });
  Object.defineProperty(e, 'timeStamp', { value: t });
  el.dispatchEvent(e);
}
/** Zieht von (x0, 300) gleichmäßig um dx/dy in `ms` und lässt los */
function swipe(el: Element, x0: number, dx: number, ms: number, dy = 0, steps = 10) {
  pointer(el, 'pointerdown', x0, 300, 0);
  for (let i = 1; i <= steps; i++) pointer(el, 'pointermove', x0 + (dx * i) / steps, 300 + (dy * i) / steps, (ms * i) / steps);
  pointer(el, 'pointerup', x0 + dx, 300 + dy, ms + 5);
}

describe('Zurückwischen: Entscheidung beim Loslassen', () => {
  it('weit genug oder schnell genug → zurück', () => {
    expect(edgeGoesBack(WIDTH * 0.5, 0, WIDTH)).toBe(true);
    expect(edgeGoesBack(60, 0.8, WIDTH)).toBe(true);
    expect(edgeGoesBack(60, 0.1, WIDTH)).toBe(false);
    expect(edgeGoesBack(10, 2, WIDTH)).toBe(false); // zu kurz, auch wenn schnell
    expect(edgeGoesBack(WIDTH * 0.6, -0.5, WIDTH)).toBe(false); // zurückgezogen
    expect(edgeGoesBack(-40, 1, WIDTH)).toBe(false);
  });
});

describe('Zurückwischen: Geste', () => {
  let root: HTMLElement;
  let page: HTMLElement;
  let under: HTMLElement;
  let detach: () => void;
  let canBack = true;
  const back = vi.fn();
  const cancel = vi.fn();
  const start = vi.fn(() => ({ page, under }));

  beforeEach(() => {
    // „Bewegung reduzieren“: Animationen enden sofort, die Entscheidung bleibt dieselbe
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as never;
    document.body.innerHTML = '<div class="live shop"><div class="under"></div><div class="page"><input /><p class="text">Text</p></div></div>';
    root = document.querySelector('.live')!;
    page = root.querySelector('.page')!;
    under = root.querySelector('.under')!;
    Object.defineProperty(root, 'clientWidth', { value: WIDTH, configurable: true });
    root.setPointerCapture = () => {};
    canBack = true;
    back.mockClear();
    cancel.mockClear();
    start.mockClear();
    detach = attachEdgeBack(root, { canBack: () => canBack, start, back, cancel });
  });
  afterEach(() => detach());

  it('vom linken Rand weit genug → eine Ebene zurück', async () => {
    swipe(page.querySelector('.text')!, 8, 220, 300);
    expect(start).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(page.style.transform).toBe(''); // im nächsten Bild aufgeräumt
  });
  it('kurz und langsam → bleibt, Ebene zurück an ihren Platz', () => {
    swipe(page, 8, 60, 600);
    expect(back).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(page.style.transform).toBe('');
  });
  it('schneller kurzer Wisch → zurück', () => {
    swipe(page, 8, 70, 60);
    expect(back).toHaveBeenCalledTimes(1);
  });
  it('nicht am Rand (z. B. in der Bildmitte) → nichts', () => {
    swipe(page, EDGE + 40, 250, 200);
    expect(start).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });
  it('senkrecht am Rand (Scrollen) → nichts', () => {
    swipe(page, 8, 10, 200, 260);
    expect(start).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });
  it('in Eingabefeldern und während gesperrt (Kamera) → nichts', () => {
    swipe(page.querySelector('input')!, 8, 250, 200);
    canBack = false;
    swipe(page, 8, 250, 200);
    expect(start).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });
  it('folgt dem Finger und zeigt die vorige Ebene versetzt darunter', () => {
    pointer(page, 'pointerdown', 8, 300, 0);
    pointer(page, 'pointermove', 108, 300, 50);
    expect(page.style.transform).toMatch(/^translate3d\(100px, 0(px)?, 0(px)?\)$/);
    expect(under.style.transform).toMatch(/^translate3d\(-\d+px, 0(px)?, 0(px)?\)$/);
    expect(root.classList.contains('edge-dragging')).toBe(true);
    pointer(page, 'pointercancel', 108, 300, 60);
    expect(back).not.toHaveBeenCalled();
    expect(root.classList.contains('edge-dragging')).toBe(false);
  });
  it('Maus löst die Geste nicht aus', () => {
    const e = new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 300, pointerId: 2, isPrimary: true, pointerType: 'mouse' });
    page.dispatchEvent(e);
    pointer(page, 'pointermove', 200, 300, 50);
    expect(start).not.toHaveBeenCalled();
  });
  it('Zurück-Knopf: dieselbe Aktion (mit reduzierter Bewegung sofort)', async () => {
    const commit = vi.fn();
    await slideBack(async () => ({ page, under }), commit);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
