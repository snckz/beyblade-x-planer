// Unterseiten in einer Hauptseite (Lexikon: Karten, Blades, Bits …): oben blättert der Wisch die Hauptseiten,
// unten (ab der Liste) die Unterseiten – an deren erster/letzter Seite geht er an die Hauptseiten weiter.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { TabPager } from '../src/components/TabPager';
import { attachCategorySwipe } from '../src/lib/categorySwipe';
import { Lexikon } from '../src/components/Lexikon';
import { EMPTY_STATE } from '../src/lib/storage';
import type { Database } from '../src/lib/types';

function touch(el: Element, type: 'touchstart' | 'touchmove' | 'touchend', x: number, y: number, time: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const t = { identifier: 1, clientX: x, clientY: y, target: el };
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [t] });
  Object.defineProperty(e, 'changedTouches', { value: [t] });
  Object.defineProperty(e, 'timeStamp', { value: time });
  el.dispatchEvent(e);
}
/** Zügiger waagrechter Wisch um `dx` px auf Höhe `y`, beginnend auf `el` */
function swipe(el: Element, dx: number, y = 300) {
  act(() => {
    touch(el, 'touchstart', 200, y, 0);
    for (let i = 1; i <= 5; i++) touch(el, 'touchmove', 200 + (dx * i) / 5, y, i * 16);
    touch(el, 'touchend', 200 + dx, y, 96);
  });
}
const later = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

/** jsdom kennt keine Maße: Der Kopf jeder Unterseite (`.filters`) endet hier bei 200 px, alles andere liegt bei 0. */
const HEAD_BOTTOM = 200;
const realRect = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const bottom = this.classList.contains('filters') ? HEAD_BOTTOM : 0;
    return { top: 0, bottom, left: 0, right: 0, width: 0, height: bottom, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Element.prototype.getBoundingClientRect = realRect;
  document.body.style.overflow = '';
});

const MAIN = ['a', 'b', 'c'] as const;
const SUB = ['x', 'y', 'z'] as const;
type Main = (typeof MAIN)[number];
type Sub = (typeof SUB)[number];

/** Hauptseite „b“ mit drei Unterseiten; meldet jede Unterseite nach außen */
function PageB({ active, start, onSub }: { active: boolean; start: Sub; onSub: (s: Sub) => void }) {
  const [sub, setSub] = useState<Sub>(start);
  return (
    <div>
      <p data-testid="b-title">Titel</p>
      <TabPager
        tabs={SUB}
        current={sub}
        render={(s) => (
          <div>
            <div class="filters">Suche {s}</div>
            <ul data-testid={`list-${s}`}>
              <li>Eintrag</li>
            </ul>
          </div>
        )}
        onChange={(s) => {
          onSub(s);
          setSub(s);
        }}
        swipeArea="#main"
        sub={{ enabled: active, below: '.filters' }}
      />
    </div>
  );
}

function Harness({ start = 'b' as Main, sub = 'y' as Sub, seen }: { start?: Main; sub?: Sub; seen: string[] }) {
  const [tab, setTab] = useState<Main>(start);
  return (
    <main id="main">
      <TabPager
        tabs={MAIN}
        current={tab}
        render={(t, active) => (t === 'b' ? <PageB active={active} start={sub} onSub={(s) => seen.push(`sub:${s}`)} /> : <p data-testid={`page-${t}`}>{t}</p>)}
        onChange={(t) => {
          seen.push(`main:${t}`);
          setTab(t);
        }}
        swipeArea="#main"
      />
      <p data-testid="fuss">Seitenende</p>
    </main>
  );
}

describe('Unterseiten in einer Hauptseite', () => {
  it('unten (ab der Liste) blättert der Wisch die Unterseiten, die Hauptseite bleibt', () => {
    const seen: string[] = [];
    const view = render(<Harness seen={seen} />);
    later(300);
    swipe(view.getByTestId('list-y'), -120, 300);
    later(600);
    expect(seen).toEqual(['sub:z']);
    later(300);
    swipe(view.getByTestId('list-z'), 120, 300);
    later(600);
    expect(seen).toEqual(['sub:z', 'sub:y']);
  });

  it('oben (Titel, Leiste, Suche) blättert der Wisch die Hauptseiten', () => {
    const seen: string[] = [];
    const view = render(<Harness seen={seen} />);
    later(300);
    swipe(view.getByTestId('b-title'), -120, 100);
    later(600);
    expect(seen).toEqual(['main:c']);
  });

  it('die Grenze ist die Unterkante des Kopfs: knapp darüber Hauptseiten, ab dort Unterseiten', () => {
    const seen: string[] = [];
    const view = render(<Harness seen={seen} />);
    later(300);
    swipe(view.getByTestId('list-y'), -120, HEAD_BOTTOM);
    later(600);
    expect(seen).toEqual(['sub:z']);
    later(300);
    swipe(view.getByTestId('b-title'), 120, HEAD_BOTTOM - 1);
    later(600);
    expect(seen).toEqual(['sub:z', 'main:a']);
  });

  it('der untere Bereich reicht bis zum Seitenende – auch unter einer kurzen Liste', () => {
    const seen: string[] = [];
    const view = render(<Harness seen={seen} />);
    later(300);
    swipe(view.getByTestId('fuss'), -120, 700);
    later(600);
    expect(seen).toEqual(['sub:z']);
  });

  it('an der letzten Unterseite geht es nach links weiter zur nächsten Hauptseite, an der ersten nach rechts zur vorherigen', () => {
    const last: string[] = [];
    const a = render(<Harness sub="z" seen={last} />);
    later(300);
    swipe(a.getByTestId('list-z'), -120, 300);
    later(600);
    expect(last).toEqual(['main:c']);
    cleanup();

    const first: string[] = [];
    const b = render(<Harness sub="x" seen={first} />);
    later(300);
    swipe(b.getByTestId('list-x'), 120, 300);
    later(600);
    expect(first).toEqual(['main:a']);
  });

  it('es blättert immer nur eine der beiden Spuren mit dem Finger', () => {
    const tracks = () => {
      const sub = document.querySelector('.tab-pager.is-sub')!;
      return { main: document.querySelector<HTMLElement>('#main > .tab-pager > .tab-track')!.style.transform, sub: sub.querySelector<HTMLElement>(':scope > .tab-track')!.style.transform };
    };
    const drag = (el: Element, dx: number) =>
      act(() => {
        touch(el, 'touchstart', 200, 300, 0);
        for (let i = 1; i <= 5; i++) touch(el, 'touchmove', 200 + (dx * i) / 5, 300, i * 16);
      });
    const release = (el: Element, dx: number) => act(() => touch(el, 'touchend', 200 + dx, 300, 96));

    // mitten in den Unterseiten: nur die Unterseiten gehen mit
    const mid = render(<Harness sub="y" seen={[]} />);
    later(300);
    drag(mid.getByTestId('list-y'), -120);
    expect(tracks().sub).toContain('-120px');
    expect(tracks().main).toBe('');
    release(mid.getByTestId('list-y'), -120);
    cleanup();

    // letzte Unterseite nach links: nur die Hauptseite geht mit, die Unterseiten geben nicht nach
    const last = render(<Harness sub="z" seen={[]} />);
    later(300);
    drag(last.getByTestId('list-z'), -120);
    expect(tracks().main).toContain('-120px');
    expect(tracks().sub).toBe('');
    release(last.getByTestId('list-z'), -120);
  });

  it('Nachbar-Unterseiten sind nur sichtbar, solange die Unterseiten selbst gewischt werden', () => {
    // Sie liegen dort, wo beim Wischen zwischen den Hauptseiten die nächste Hauptseite hereinkommt, und fahren mit
    // deren Spur ins Bild – ohne diese Regel liegt z. B. die Blades-Liste über der Battle-Seite.
    const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');
    expect(css).toMatch(/\.tab-pager\.is-sub:not\(\[data-swiping\]\) > \.tab-track > \.tab-page\.is-side \{ visibility: hidden; \}/);

    const view = render(<Harness seen={[]} />);
    later(300);
    const sub = () => document.querySelector<HTMLElement>('.tab-pager.is-sub')!;
    const drag = (el: Element, y: number) =>
      act(() => {
        touch(el, 'touchstart', 200, y, 0);
        for (let i = 1; i <= 5; i++) touch(el, 'touchmove', 200 - 24 * i, y, i * 16);
      });
    const release = (el: Element, y: number) => act(() => touch(el, 'touchend', 80, y, 96));
    expect(sub().hasAttribute('data-swiping')).toBe(false);

    // Hauptseiten wischen (oben): Nachbar-Unterseiten bleiben unsichtbar
    drag(view.getByTestId('b-title'), 100);
    expect(document.querySelector<HTMLElement>('#main > .tab-pager > .tab-track')!.style.transform).toContain('-120px');
    expect(sub().hasAttribute('data-swiping')).toBe(false);
    cleanup();

    // Unterseiten wischen (unten): sichtbar bis zum Einrasten, danach wieder nicht
    const again = render(<Harness seen={[]} />);
    later(300);
    drag(again.getByTestId('list-y'), 300);
    expect(sub().hasAttribute('data-swiping')).toBe(true);
    release(again.getByTestId('list-y'), 300);
    later(600);
    expect(sub().hasAttribute('data-swiping')).toBe(false);
  });

  it('als Nachbarseite ruhen die Unterseiten: Der Wisch gehört der Hauptseite, danach wieder den Unterseiten', () => {
    const seen: string[] = [];
    const view = render(<Harness start="a" seen={seen} />);
    later(300);
    // „b“ liegt fertig daneben (samt Unterseiten) – unten auf „a“ wischen blättert trotzdem die Hauptseite
    expect(document.querySelector('.tab-pager.is-sub')).toBeTruthy();
    swipe(view.getByTestId('page-a'), -120, 300);
    later(600);
    expect(seen).toEqual(['main:b']);
    later(300);
    swipe(view.getByTestId('list-y'), -120, 300);
    later(600);
    expect(seen).toEqual(['main:b', 'sub:z']);
  });

  it('ohne offenes Fenster – sonst wechselt nichts', () => {
    const seen: string[] = [];
    const view = render(<Harness seen={seen} />);
    later(300);
    document.body.style.overflow = 'hidden';
    swipe(view.getByTestId('list-y'), -120, 300);
    swipe(view.getByTestId('b-title'), -120, 100);
    later(600);
    expect(seen).toEqual([]);
  });

  it('Unterseiten bauen ihre Nachbarn wie die Hauptseiten: fertig daneben, nicht bedienbar', () => {
    render(<Harness seen={[]} />);
    later(300);
    const sub = document.querySelector('.tab-pager.is-sub')!;
    const pages = [...sub.querySelectorAll<HTMLElement>(':scope > .tab-track > .tab-page')].map((p) => `${p.dataset.tab}${p.dataset.dir ? `:${p.dataset.dir}` : ''}`);
    expect(pages).toEqual(['x:-1', 'y', 'z:1']);
    const side = sub.querySelector<HTMLElement>('.tab-page.is-side')!;
    expect(side.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Wischen auf Feldern im Seitenkopf', () => {
  const setup = (idleFields: boolean) => {
    const r = document.createElement('div');
    r.innerHTML = '<input id="suche" type="search"><input id="schalter" type="checkbox"><input id="regler" type="range"><select id="wahl"><option>a</option></select><p id="frei">x</p>';
    document.body.appendChild(r);
    const steps: number[] = [];
    const detach = attachCategorySwipe(r, (s) => steps.push(s), { idleFields });
    return { r, steps, detach };
  };
  afterEach(() => (document.body.innerHTML = ''));

  it('Standard (Auswahlfenster): auf Feldern beginnt kein Wisch', () => {
    const { r, steps, detach } = setup(false);
    swipe(r.querySelector('#suche')!, -120);
    swipe(r.querySelector('#schalter')!, -120);
    expect(steps).toEqual([]);
    detach();
  });

  it('Seiten: Suchfeld ohne Cursor und Schalter zählen – Feld mit Cursor, Schieberegler und Auswahlliste nicht', () => {
    const { r, steps, detach } = setup(true);
    swipe(r.querySelector('#suche')!, -120);
    swipe(r.querySelector('#schalter')!, 120);
    expect(steps).toEqual([1, -1]);
    r.querySelector<HTMLInputElement>('#suche')!.focus();
    swipe(r.querySelector('#suche')!, -120);
    swipe(r.querySelector('#regler')!, -120);
    swipe(r.querySelector('#wahl')!, -120);
    expect(steps).toEqual([1, -1]);
    detach();
  });
});

describe('Lexikon: Unterseiten wischen', () => {
  const db = {
    version: 1,
    updatedAt: '2026-11-23',
    blades: [{ id: 'DranSword', name: 'Dran Sword', hasbroName: 'Sword Dran', line: 'BX', type: 'attack', spin: 'right', verified: true }],
    ratchets: [{ id: '3-60', contacts: 3, heightMm: 6 }],
    bits: [{ id: 'F', name: 'Flat', type: 'attack' }],
    products: [{ code: 'BX-01', name: 'Starter Dran Sword 3-60F', kind: 'starter', verified: true, bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' }],
  } as unknown as Database;
  const selected = () => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
  const current = () => document.querySelector<HTMLElement>('.tab-pager.is-sub > .tab-track > .tab-page.is-current')!;

  it('auf der Liste nach links: Karten → Blades → Bits, nach rechts zurück; die Leiste zeigt die Unterseite', () => {
    render(
      <main id="main">
        <Lexikon db={db} state={{ ...EMPTY_STATE }} update={() => {}} />
      </main>,
    );
    later(300);
    expect(selected()).toBe('Karten');
    swipe(current().querySelector('.album')!, -120, 300);
    later(600);
    expect(selected()).toBe('Blades');
    expect(current().querySelector('.lex-grid')).toBeTruthy();
    later(300);
    swipe(current().querySelector('.lex-grid')!, -120, 300);
    later(600);
    expect(selected()).toBe('Bits');
    later(300);
    swipe(current().querySelector('.lex-list')!, 120, 300);
    later(600);
    expect(selected()).toBe('Blades');
  });

  it('oberhalb der Liste (Suche, Filter) wechselt die Unterseite nicht', () => {
    render(
      <main id="main">
        <Lexikon db={db} state={{ ...EMPTY_STATE }} update={() => {}} />
      </main>,
    );
    later(300);
    swipe(current().querySelector('.album-head')!, -120, HEAD_BOTTOM - 40);
    later(600);
    expect(selected()).toBe('Karten');
  });

  it('als Nachbarseite (nicht sichtbar) reagiert das Lexikon nicht auf Wische', () => {
    render(
      <main id="main">
        <Lexikon db={db} state={{ ...EMPTY_STATE }} update={() => {}} active={false} />
      </main>,
    );
    later(300);
    expect(document.querySelectorAll('.tab-pager.is-sub > .tab-track > .tab-page')).toHaveLength(1);
    swipe(current().querySelector('.album')!, -120, 300);
    later(600);
    expect(selected()).toBe('Karten');
  });

  it('Tippen auf die Leiste wechselt wie bisher, Suche und Typfilter bleiben über die Unterseiten erhalten', () => {
    render(
      <main id="main">
        <Lexikon db={db} state={{ ...EMPTY_STATE }} update={() => {}} />
      </main>,
    );
    later(300);
    act(() => [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((b) => b.textContent === 'Blades')!.click());
    const field = () => current().querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      field().value = 'dran';
      field().dispatchEvent(new Event('input', { bubbles: true }));
    });
    later(300);
    swipe(current().querySelector('.lex-grid')!, -120, 300);
    later(600);
    expect(selected()).toBe('Bits');
    expect(field().value).toBe('dran');
  });
});
