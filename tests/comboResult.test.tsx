// Kombo-Ergebnis nach Referenz: Aktuelle Kombo (Balken + Summe), Leistungsbewertung (Netz), Fazit (Stärken/Schwächen).
// Eigene kleine Datenbank, damit der Test nicht vom täglichen Daten-Update abhängt.
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/preact';
import type { Database } from '../src/lib/types';
import { EMPTY_STATE, type UserState } from '../src/lib/storage';
import { analyze, resolveCombo } from '../src/lib/analysis';
import { AppContext } from '../src/lib/context';
import { ComboBuilder } from '../src/components/ComboBuilder';
import { ComboNow, Performance, Verdict } from '../src/components/ComboResult';
import { CompareCombos } from '../src/components/CompareCombos';
import { Lexikon } from '../src/components/Lexikon';
import { useContext } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

afterEach(cleanup);
afterAll(() => new Promise((resolve) => setTimeout(resolve, 150)));

const db = {
  version: 1,
  updatedAt: '2026-11-23',
  blades: [
    { id: 'DranSword', name: 'Dran Sword', hasbroName: 'Sword Dran', line: 'BX', type: 'attack', spin: 'right', verified: true, weightG: 34.6 },
    { id: 'WizardRod', name: 'Wizard Rod', line: 'UX', type: 'stamina', spin: 'right', verified: true, weightG: 35.3, note: 'Sehr schwer.' },
    { id: 'CobaltDragoon', name: 'Cobalt Dragoon', line: 'BX', type: 'attack', spin: 'left', verified: false },
  ],
  ratchets: [
    { id: '3-60', contacts: 3, heightMm: 6 },
    { id: '1-60', contacts: 1, heightMm: 6 },
    { id: '9-60', contacts: 9, heightMm: 6 },
  ],
  bits: [
    { id: 'F', name: 'Flat', type: 'attack' },
    { id: 'H', name: 'Hexa', type: 'balance' },
    { id: 'B', name: 'Ball', type: 'stamina' },
  ],
  products: [
    { code: 'BX-01', name: 'Starter Dran Sword 3-60F', kind: 'starter', verified: true, bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' },
    { code: 'UX-03', name: 'Booster Wizard Rod 1-60H', kind: 'booster', verified: true, bladeId: 'WizardRod', ratchetId: '1-60', bitId: 'H' },
    { code: 'BX-34', name: 'Starter Cobalt Dragoon 9-60B', kind: 'starter', verified: true, bladeId: 'CobaltDragoon', ratchetId: '9-60', bitId: 'B' },
  ],
} as unknown as Database;

const combo = (bladeId: string, ratchetId: string, bitId: string) => {
  const resolved = resolveCombo(db, { id: 'x', bladeId, ratchetId, bitId })!;
  return { resolved, result: analyze(resolved) };
};
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('Aktuelle Kombo', () => {
  it('zeigt Name, Linie, Typ, die vier Richtwerte als Balken und ihre Summe', () => {
    const { resolved, result } = combo('DranSword', '3-60', 'F');
    const view = render(<ComboNow resolved={resolved} result={result} />);
    const card = view.container.querySelector('.combo-now')!;
    expect(within(card as HTMLElement).getByRole('heading', { name: 'Aktuelle Kombo' })).toBeTruthy();
    expect(text(card.querySelector('.combo-name'))).toBe('SwordDran 3‑60F');
    expect(text(card.querySelector('.combo-now-badges'))).toBe('BXAttack');
    const bars = [...card.querySelectorAll('.combo-bar:not(.combo-bar-total)')].map((b) => [text(b.querySelector('dt')), Number(text(b.querySelector('dd')))]);
    expect(bars).toEqual([
      ['Angriff', result.profile.attack],
      ['Verteidigung', result.profile.defense],
      ['Ausdauer', result.profile.stamina],
      ['Burst-Schutz', result.profile.burstResistance],
    ]);
    // Balkenlänge = Wert in Prozent
    const widths = [...card.querySelectorAll<HTMLElement>('.combo-bar-fill')].map((f) => f.style.width);
    expect(widths).toEqual(bars.map(([, v]) => `${v}%`));
    const sum = result.profile.attack + result.profile.defense + result.profile.stamina + result.profile.burstResistance;
    expect(text(card.querySelector('.combo-bar-total'))).toBe(`Gesamt${sum} / 400`);
  });

  it('Linksdreher wird gekennzeichnet, Aktionen stehen in der Karte', () => {
    const { resolved, result } = combo('CobaltDragoon', '9-60', 'B');
    const view = render(
      <ComboNow resolved={resolved} result={result}>
        <button type="button">Speichern</button>
      </ComboNow>,
    );
    expect(text(view.container.querySelector('.combo-now-badges'))).toContain('Links');
    expect(within(view.container.querySelector('.combo-now') as HTMLElement).getByRole('button', { name: 'Speichern' })).toBeTruthy();
  });
});

describe('Leistungsbewertung', () => {
  it('Netzdiagramm mit vier Achsen, Werten und Textalternative', () => {
    const { resolved, result } = combo('DranSword', '3-60', 'F');
    const view = render(<Performance result={result} weightG={resolved.blade.weightG} />);
    const chart = view.getByRole('img');
    const p = result.profile;
    expect(chart.getAttribute('aria-label')).toBe(`Leistungsbewertung von 0 bis 100: Angriff ${p.attack}, Verteidigung ${p.defense}, Ausdauer ${p.stamina}, Burst-Schutz ${p.burstResistance}`);
    expect(chart.querySelector('.perf-shape')!.getAttribute('points')!.split(' ')).toHaveLength(4);
    expect(chart.querySelectorAll('.perf-dot')).toHaveLength(4);
    expect([...chart.querySelectorAll('.perf-label')].map(text)).toEqual(['Angriff', 'Verteidigung', 'Ausdauer', 'Burst-Schutz']);
    expect([...chart.querySelectorAll('.perf-value')].map((v) => Number(text(v)))).toEqual([p.attack, p.defense, p.stamina, p.burstResistance]);
    // ehrlich beschriftet: Schätzwerte, keine Messwerte
    expect(text(view.container)).toContain('Schätzwerte');
    expect(text(view.container)).toContain('keine Messwerte');
    expect(text(view.container)).toContain('34,6 g');
  });

  it('ohne Blade-Gewicht wird keines behauptet', () => {
    const { result } = combo('CobaltDragoon', '9-60', 'B');
    expect(text(render(<Performance result={result} />).container)).not.toContain('Blade-Gewicht');
  });
});

describe('Fazit', () => {
  it('Einordnung, Stärken und Schwächen aus den Werten, Warnungen und Tipps bleiben erhalten', () => {
    const { result } = combo('CobaltDragoon', '9-60', 'B');
    const view = render(<Verdict result={result} />);
    const t = text(view.container);
    expect(t).toContain('Fazit');
    expect(t).toContain('Stärken');
    expect(t).toContain('Schwächen');
    expect(t).toContain('Hoher Burst-Schutz'); // 9 Zacken
    for (const w of result.warnings) expect(t).toContain(w);
    for (const tip of result.tips) expect(t).toContain(tip);
    expect(result.warnings.length + result.tips.length).toBeGreaterThan(0);
  });

  it('ausgeglichen: sagt, dass nichts heraussticht, statt etwas zu erfinden', () => {
    const { result } = combo('DranSword', '3-60', 'F');
    const flat = { ...result, profile: { attack: 50, defense: 50, stamina: 50, burstResistance: 50 }, warnings: [], tips: [] };
    const t = text(render(<Verdict result={flat} />).container);
    expect(t).toContain('Kein Wert sticht heraus.');
    expect(t).toContain('Keine auffällige Schwäche.');
    expect(render(<Verdict result={flat} />).container.querySelector('.fazit-notes')).toBeNull();
  });
});

describe('Kombo-Planer mit neuem Ergebnis', () => {
  let state: UserState;
  const update = (fn: (s: UserState) => UserState) => (state = fn(state));

  it('zeigt die drei Karten, Speichern funktioniert wie bisher', () => {
    state = { ...EMPTY_STATE };
    const view = render(<ComboBuilder db={db} state={state} update={update} presetBladeId="DranSword" presetRatchetId="3-60" presetBitId="F" presetKey={9001} />);
    const stack = view.container.querySelector('.result-stack') as HTMLElement;
    expect(stack).toBeTruthy();
    expect([...stack.querySelectorAll('.ref-card > .block-h, .ref-card .block-head .block-h')].map(text)).toEqual(['Aktuelle Kombo', 'Leistungsbewertung', 'Fazit']);
    for (const name of ['Verbessern', 'Vergleichen', 'Speichern']) expect(within(stack).getByRole('button', { name })).toBeTruthy();
    fireEvent.click(within(stack).getByRole('button', { name: 'Speichern' }));
    expect(state.combos).toHaveLength(1);
    expect(state.combos[0]).toMatchObject({ bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' });
  });

  it('gespeicherte Kombos als Zeilen mit Foto-Fläche, Linie und Typ; Deck-Knopf bleibt', () => {
    state = { ...EMPTY_STATE, combos: [{ id: 'a', bladeId: 'WizardRod', ratchetId: '1-60', bitId: 'H', name: 'Mein Dauerläufer' }] };
    const view = render(<ComboBuilder db={db} state={state} update={update} />);
    const row = view.container.querySelector('.saved-row') as HTMLElement;
    expect(row.querySelector('.saved-art')).toBeTruthy();
    expect(text(row.querySelector('.row-title'))).toBe('Mein Dauerläufer');
    expect(text(row.querySelector('.saved-badges'))).toBe('UXStamina');
    fireEvent.click(within(row).getByRole('button', { name: '+ Deck' }));
    expect(state.deck).toEqual(['a']);
  });
});

describe('Kombi-Vergleich', () => {
  it('Tabelle mit den vier Werten, Summe und Kennzahlen; die bessere Summe ist hervorgehoben', () => {
    const view = render(<CompareCombos db={db} initial={{ bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' }} />);
    fireEvent.click(view.getByRole('button', { name: 'Öffnen' }));
    const table = view.container.querySelector('.vs-table') as HTMLElement;
    expect(table).toBeTruthy();
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map(text));
    expect(rows.map((r) => r[0])).toEqual(['Angriff', 'Verteidigung', 'Ausdauer', 'Burst-Schutz', 'Gesamt', 'Blade-Gewicht', 'Ratchet-Höhe']);
    const a = combo('DranSword', '3-60', 'F').result.profile;
    const b = combo('WizardRod', '1-60', 'H').result.profile;
    const sum = (p: typeof a) => p.attack + p.defense + p.stamina + p.burstResistance;
    expect(rows[4]).toEqual(['Gesamt', String(sum(a)), String(sum(b))]);
    expect(rows[5]).toEqual(['Blade-Gewicht', '34,6 g', '35,3 g']);
    expect(rows[6]).toEqual(['Ratchet-Höhe', '6,0 mm', '6,0 mm']);
    const best = [...table.querySelectorAll('.vs-total td')].map((td) => td.classList.contains('best'));
    expect(best).toEqual(sum(a) === sum(b) ? [false, false] : [sum(a) > sum(b), sum(b) > sum(a)]);
    // Höhe ist je nach Stil Vor- oder Nachteil: nie als „besser“ markiert
    expect(table.querySelectorAll('.vs-fact:last-child td.best')).toHaveLength(0);
    expect([...table.querySelectorAll('thead th')].map(text)).toEqual(['Kombo ASword Dran 3‑60FAttack', 'Kombo BWizard Rod 1‑60HStamina']);
  });
});

describe('Lexikon', () => {
  function Probe({ children, openBlade, openImage }: { children: ComponentChildren; openBlade: (id: string) => void; openImage: (id: string, kind?: string) => void }) {
    const base = useContext(AppContext);
    const images = { source: '', blades: {}, bits: { F: { thumb: 'https://example.invalid/f.png', page: '' } } };
    return <AppContext.Provider value={{ ...base, images, openBlade, openImage } as unknown as typeof base}>{children}</AppContext.Provider>;
  }
  const open = (view: ReturnType<typeof render>, tab: string) => fireEvent.click(view.getByRole('tab', { name: tab }));
  const noop = (s: UserState) => s;

  it('Blades als Karten: Name öffnet die Detailansicht, Linie/Typ/Linksdreher stehen als Chips', () => {
    const openBlade = vi.fn();
    const view = render(
      <Probe openBlade={openBlade} openImage={vi.fn()}>
        <Lexikon db={db} state={{ ...EMPTY_STATE }} update={() => noop} />
      </Probe>,
    );
    open(view, 'Blades');
    const cards = [...view.container.querySelectorAll('.lex-card')] as HTMLElement[];
    expect(cards).toHaveLength(3);
    expect(text(cards[0]!.querySelector('.lex-card-name'))).toBe('Sword Dran');
    expect(text(cards[0]!.querySelector('.lex-card-sub'))).toContain('Dran Sword');
    expect(text(cards[0]!.querySelector('.lex-card-badges'))).toBe('BXAttack');
    expect(within(cards[2]!).getByRole('img', { name: 'Linksdreher' })).toBeTruthy();
    expect(text(cards[2]!)).toContain('ungeprüft');
    expect(text(cards[1]!.querySelector('.lex-card-note'))).toBe('Sehr schwer.');
    fireEvent.click(within(cards[1]!).getByRole('button', { name: /Wizard Rod/ }));
    expect(openBlade).toHaveBeenCalledWith('WizardRod');
  });

  it('Typfilter mit „Alle“ und Suche wirken wie bisher', () => {
    const view = render(<Lexikon db={db} state={{ ...EMPTY_STATE }} update={() => noop} />);
    open(view, 'Blades');
    const names = () => [...view.container.querySelectorAll('.lex-card-name')].map(text);
    fireEvent.click(view.getByRole('button', { name: 'Stamina' }));
    expect(names()).toEqual(['Wizard Rod']);
    fireEvent.click(view.getByRole('button', { name: 'Alle' }));
    expect(names()).toHaveLength(3);
    fireEvent.input(view.getByRole('searchbox', { name: 'Suchen' }), { target: { value: 'cobalt' } });
    expect(names().map((n) => n.replace(/ ungeprüft.*/, ''))).toEqual(['Cobalt Dragoon']);
  });

  it('Bits: Zeile klappt die Erklärung auf, das Foto öffnet nur die Großansicht', () => {
    const openImage = vi.fn();
    const view = render(
      <Probe openBlade={vi.fn()} openImage={openImage}>
        <Lexikon db={db} state={{ ...EMPTY_STATE }} update={() => noop} />
      </Probe>,
    );
    open(view, 'Bits');
    const rows = [...view.container.querySelectorAll('details.lex-row')] as HTMLDetailsElement[];
    expect(rows.map((r) => text(r.querySelector('.lex-row-title')))).toEqual(['F Flat', 'H Hexa', 'B Ball']);
    expect(text(rows[0]!.querySelector('.lex-text'))).toContain('flache Spitze');
    const zoom = within(rows[0]!).getByRole('button', { name: 'Bit F: Bild vergrößern' });
    fireEvent.click(zoom);
    expect(openImage).toHaveBeenCalledWith('F', 'bit');
    expect(rows[0]!.open).toBe(false);
    // ohne Foto kein Vergrößern-Knopf
    expect(within(rows[1]!).queryByRole('button')).toBeNull();
  });

  it('Ratchets und Begriffe als Zeilen, Höhe mit Komma', () => {
    const view = render(<Lexikon db={db} state={{ ...EMPTY_STATE }} update={() => noop} />);
    open(view, 'Ratchets');
    const rows = [...view.container.querySelectorAll('.lex-row')];
    expect(rows.map((r) => text(r.querySelector('.lex-row-title')))).toEqual(['3-60', '1-60', '9-60']);
    expect(text(rows[0]!.querySelector('.lex-row-sub'))).toContain('6,0 mm hoch');
    open(view, 'Begriffe');
    expect(view.container.querySelectorAll('details.lex-row').length).toBeGreaterThan(5);
  });
});
