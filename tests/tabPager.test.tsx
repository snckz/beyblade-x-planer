import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { TabPager } from '../src/components/TabPager';
import { blocksTabSwipe, rememberTab, rowOwnsStep } from '../src/lib/tabSwipe';
import { attachCategorySwipe } from '../src/lib/categorySwipe';
import { News } from '../src/components/News';
import type { UserState } from '../src/lib/storage';

function touch(el: Element, type: 'touchstart' | 'touchmove' | 'touchend', x: number, y: number, time: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const t = { identifier: 1, clientX: x, clientY: y, target: el };
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [t] });
  Object.defineProperty(e, 'changedTouches', { value: [t] });
  Object.defineProperty(e, 'timeStamp', { value: time });
  el.dispatchEvent(e);
}
/** Zügiger waagrechter Wisch um `dx` px, beginnend auf `el` */
function swipe(el: Element, dx: number) {
  act(() => {
    touch(el, 'touchstart', 200, 300, 0);
    for (let i = 1; i <= 5; i++) touch(el, 'touchmove', 200 + (dx * i) / 5, 300, i * 16);
    touch(el, 'touchend', 200 + dx, 300, 96);
  });
}

const TABS = ['a', 'b', 'c'] as const;
type Tab = (typeof TABS)[number];

/** Seite mit eigenem Zustand: zeigt, ob sie frisch aufgebaut wurde */
function Page({ tab, active }: { tab: Tab; active: boolean }) {
  const [n, setN] = useState(0);
  return (
    <button type="button" data-testid={`page-${tab}`} data-active={String(active)} onClick={() => setN(n + 1)}>
      {tab}:{n}
    </button>
  );
}

function Harness({ start = 'a' as Tab, onChange = () => {} }: { start?: Tab; onChange?: (t: Tab) => void }) {
  const [tab, setTab] = useState<Tab>(start);
  return (
    <TabPager
      tabs={TABS}
      current={tab}
      render={(t, active) => <Page tab={t} active={active} />}
      onChange={(t) => {
        onChange(t);
        setTab(t);
      }}
    />
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.style.overflow = '';
});

const pages = () => [...document.querySelectorAll<HTMLElement>('.tab-page')].map((p) => `${p.dataset.tab}${p.dataset.dir ? `:${p.dataset.dir}` : ''}`);
const later = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('Hauptseiten zum Blättern (TabPager)', () => {
  it('baut zuerst nur die aktuelle Seite, die Nachbarn kurz danach – nicht bedienbar', () => {
    render(<Harness start="b" />);
    expect(pages()).toEqual(['b']);
    later(300);
    expect(pages()).toEqual(['a:-1', 'b', 'c:1']);
    const side = document.querySelector<HTMLElement>('.tab-page[data-dir="1"]')!;
    expect(side.getAttribute('aria-hidden')).toBe('true');
    expect(side.inert ?? side.hasAttribute('inert')).toBeTruthy();
    expect(side.querySelector('[data-testid="page-c"]')!.getAttribute('data-active')).toBe('false');
    const current = document.querySelector<HTMLElement>('.tab-page.is-current')!;
    expect(current.hasAttribute('aria-hidden')).toBe(false);
    expect(current.querySelector('button')!.getAttribute('data-active')).toBe('true');
  });

  it('erste und letzte Seite haben nur einen Nachbarn', () => {
    render(<Harness start="a" />);
    later(300);
    expect(pages()).toEqual(['a', 'b:1']);
  });

  it('wischt nach links zur nächsten Seite, nach rechts zur vorherigen – mit den Werten der Auswahlfenster', () => {
    const seen: Tab[] = [];
    render(<Harness start="b" onChange={(t) => seen.push(t)} />);
    later(300);
    const pager = document.querySelector('.tab-pager')!;
    swipe(pager.querySelector('.tab-page.is-current button')!, -120);
    later(600);
    expect(seen).toEqual(['c']);
    expect(document.querySelector<HTMLElement>('.tab-page.is-current')!.dataset.tab).toBe('c');
    later(300);
    swipe(pager.querySelector('.tab-page.is-current button')!, 120);
    later(600);
    expect(seen).toEqual(['c', 'b']);
  });

  it('wechselt am Rand nicht (letzte Seite nach links) und nicht bei zu kurzem, langsamem Wisch', () => {
    const seen: Tab[] = [];
    render(<Harness start="c" onChange={(t) => seen.push(t)} />);
    later(300);
    const el = document.querySelector('.tab-page.is-current button')!;
    swipe(el, -150);
    later(600);
    touch(el, 'touchstart', 200, 300, 0);
    touch(el, 'touchmove', 190, 300, 200);
    touch(el, 'touchmove', 178, 300, 600);
    touch(el, 'touchend', 178, 300, 900);
    later(600);
    expect(seen).toEqual([]);
  });

  it('die neue Seite behält ihren Aufbau, die verlassene beginnt frisch', () => {
    render(<Harness start="a" />);
    later(300);
    const a = document.querySelector<HTMLElement>('[data-testid="page-a"]')!;
    act(() => a.click());
    expect(a.textContent).toBe('a:1');
    const b = document.querySelector<HTMLElement>('[data-testid="page-b"]')!;
    swipe(a, -120);
    // b war schon als Nachbar gebaut: dasselbe Element, jetzt aktiv
    expect(document.querySelector('[data-testid="page-b"]')).toBe(b);
    expect(b.getAttribute('data-active')).toBe('true');
    // a ist sofort weg und kommt als Nachbar frisch zurück (Zähler wieder 0)
    expect(pages()).toEqual(['b']);
    later(300);
    expect(document.querySelector('[data-testid="page-a"]')!.textContent).toBe('a:0');
  });

  it('Nachbarseiten bekommen Änderungen gesammelt und verzögert, die sichtbare sofort', () => {
    function Live() {
      const [v, setV] = useState(0);
      return (
        <>
          <button type="button" data-testid="bump" onClick={() => setV(v + 1)} />
          <TabPager tabs={TABS} current="a" render={(t) => <span data-testid={`v-${t}`}>{v}</span>} onChange={() => {}} />
        </>
      );
    }
    const view = render(<Live />);
    later(300);
    act(() => view.getByTestId('bump').click());
    expect(view.getByTestId('v-a').textContent).toBe('1');
    expect(view.getByTestId('v-b').textContent).toBe('0');
    later(600);
    expect(view.getByTestId('v-b').textContent).toBe('1');
  });
});

describe('Wischen vom Rand', () => {
  it('zählt auch, wenn der Finger im Rand neben den Seiten aufsetzt', () => {
    const seen: string[] = [];
    const view = render(
      <main id="main">
        <p data-testid="rand">Rand</p>
        <TabPager tabs={TABS} current="a" render={(t) => <span>{t}</span>} onChange={(t) => seen.push(t)} swipeArea="#main" />
      </main>,
    );
    later(300);
    swipe(view.getByTestId('rand'), -120);
    later(600);
    expect(seen).toEqual(['b']);
  });
});

describe('Wo das Wischen zwischen den Seiten nicht gilt', () => {
  const root = () => {
    const r = document.createElement('div');
    document.body.appendChild(r);
    return r;
  };
  afterEach(() => (document.body.innerHTML = ''));

  it('nicht bei offenem Fenster, nicht auf Schiebereglern, nicht in waagrecht scrollenden Leisten', () => {
    const r = root();
    r.innerHTML = '<p id="text">x</p><input id="range" type="range"><div id="strip" style="overflow-x:auto"><span id="chip">y</span></div><div id="wide"><span id="inner">z</span></div>';
    const strip = r.querySelector('#strip')!;
    Object.defineProperty(strip, 'scrollWidth', { value: 900 });
    Object.defineProperty(strip, 'clientWidth', { value: 300 });
    // breiter Inhalt ohne eigenes Scrollen (z. B. die Spur selbst) blockiert nicht
    const wide = r.querySelector('#wide')!;
    Object.defineProperty(wide, 'scrollWidth', { value: 900 });
    Object.defineProperty(wide, 'clientWidth', { value: 300 });
    expect(blocksTabSwipe(r.querySelector('#text')!, r)).toBe(false);
    expect(blocksTabSwipe(r.querySelector('#inner')!, r)).toBe(false);
    expect(blocksTabSwipe(r.querySelector('#range')!, r)).toBe(true);
    expect(blocksTabSwipe(r.querySelector('#chip')!, r)).toBe(true);
    document.body.style.overflow = 'hidden';
    expect(blocksTabSwipe(r.querySelector('#text')!, r)).toBe(true);
  });

  it('Einträge mit Wischen-zum-Löschen: nach links gehört die Geste dem Eintrag, nach rechts der Seite', () => {
    const r = root();
    r.innerHTML = '<div class="swipe-row" id="zu"><b>a</b></div><div class="swipe-row is-open" id="offen"><b>b</b></div><p id="frei">c</p>';
    const inRow = (id: string) => r.querySelector(`#${id} b`)!;
    expect(rowOwnsStep(inRow('zu'), 1)).toBe(true);
    expect(rowOwnsStep(inRow('zu'), -1)).toBe(false);
    expect(rowOwnsStep(inRow('offen'), -1)).toBe(true);
    expect(rowOwnsStep(r.querySelector('#frei')!, 1)).toBe(false);
  });

  it('die Wischgeste beachtet beide Regeln', () => {
    const r = root();
    r.innerHTML = '<div class="swipe-row"><b id="row">a</b></div><p id="frei">c</p><p id="aus">d</p>';
    const steps: number[] = [];
    const detach = attachCategorySwipe(r, (s) => steps.push(s), { ignore: (t) => t.id === 'aus', ownsStep: rowOwnsStep });
    swipe(r.querySelector('#aus')!, -120);
    swipe(r.querySelector('#row')!, -120);
    expect(steps).toEqual([]);
    swipe(r.querySelector('#row')!, 120);
    swipe(r.querySelector('#frei')!, -120);
    expect(steps).toEqual([-1, 1]);
    detach();
  });
});

describe('Termine als Nachbarseite', () => {
  it('markiert Meldungen erst als gelesen, wenn die Seite sichtbar ist', () => {
    const news = { updatedAt: null, lastRunOk: true, items: [{ id: 'n1', title: 'Neu', url: 'https://example.org', date: '2026-11-01', source: 'wiki' }] };
    const state = { seenNews: [] as string[] } as unknown as UserState;
    const update = vi.fn();
    const view = render(<News news={news as never} state={state} update={update} active={false} />);
    expect(update).not.toHaveBeenCalled();
    view.rerender(<News news={news as never} state={state} update={update} active />);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('Seite in der Adresse merken', () => {
  const ua = (value: string) => Object.defineProperty(navigator, 'userAgent', { value, configurable: true });
  const original = navigator.userAgent;
  afterEach(() => ua(original));

  it('iPhone: kein neuer Eintrag im Verlauf (sonst blättert iOS vom Rand selbst durch den Verlauf)', () => {
    ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');
    const before = history.length;
    rememberTab('battle');
    rememberTab('events');
    expect(location.hash).toBe('#events');
    expect(history.length).toBe(before);
  });

  it('Android und PC: ein Eintrag je Wechsel, die Zurück-Taste geht zur vorherigen Seite', () => {
    ua('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
    const before = history.length;
    rememberTab('parts');
    rememberTab('collection');
    expect(location.hash).toBe('#collection');
    expect(history.length).toBe(before + 2);
  });
});
