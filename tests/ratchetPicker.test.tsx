import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, within } from '@testing-library/preact';
import { PartField } from '../src/components/PartPicker';
import { filterRatchets, heightLabel, matchRatchetQuery, ratchetHeights, teethGroups } from '../src/lib/ratchetFilter';
import type { Database, Ratchet } from '../src/lib/types';

const db = JSON.parse(readFileSync(join(process.cwd(), 'public/data/db.json'), 'utf8')) as Database;
const ALL = db.ratchets;
const ids = (list: Ratchet[]) => list.map((r) => r.id).sort();

afterEach(cleanup);

describe('Ratchet-Filter (Daten)', () => {
  it('leitet Zackengruppen und Höhen aus den Daten ab', () => {
    expect(teethGroups(ALL).map((g) => g.id)).toEqual(['low', 'mid', 'high', 'special']);
    const heights = ratchetHeights(ALL);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(new Set(heights)).toEqual(new Set(ALL.map((r) => r.heightMm).filter((h) => h != null)));
    expect(heightLabel(8.5)).toBe('8,5 mm');
    expect(heightLabel(6)).toBe('6,0 mm');
    // Keine Sonderform-Gruppe, wenn es keine Sonderformen gibt
    expect(teethGroups(ALL.filter((r) => r.contacts != null)).map((g) => g.id)).not.toContain('special');
  });

  it('jeder Ratchet liegt in genau einer Zackengruppe', () => {
    const groups = teethGroups(ALL);
    for (const r of ALL) expect(groups.filter((g) => g.test(r)), r.id).toHaveLength(1);
  });

  it('findet 3-60 über den vollständigen Code und Teilbezeichnungen, ohne Groß-/Kleinschreibung', () => {
    expect(ids(filterRatchets(ALL, { query: '3-60' }))).toEqual(['3-60']);
    expect(ids(filterRatchets(ALL, { query: ' 3 - 60 ' }))).toEqual(['3-60']);
    expect(ids(filterRatchets(ALL, { query: '360' }))).toEqual(['3-60']);
    expect(ids(filterRatchets(ALL, { query: 'm-8' }))).toEqual(['M-85']);
    expect(ids(filterRatchets(ALL, { query: 'M' }))).toEqual(['M-65', 'M-85']);
    expect(filterRatchets(ALL, { query: '-60' }).every((r) => r.id.endsWith('-60'))).toBe(true);
    expect(matchRatchetQuery(ALL[0]!, '')).toBe(true);
  });

  it('kombiniert Zacken, Höhe und Suche', () => {
    expect(ids(filterRatchets(ALL, { teeth: 'low', height: 8 }))).toEqual(['1-80', '2-80', '3-80']);
    expect(filterRatchets(ALL, { teeth: 'high', height: 8 }).every((r) => r.contacts! >= 6 && r.heightMm === 8)).toBe(true);
    expect(ids(filterRatchets(ALL, { teeth: 'high', height: 8, query: '7' }))).toEqual(['7-80']);
    expect(filterRatchets(ALL, { teeth: 'mid', height: 8.5 })).toEqual([]);
  });

  it('behandelt Sonderformen (ohne Zackenzahl) als eigene Gruppe', () => {
    const special = filterRatchets(ALL, { teeth: 'special' });
    expect(ids(special)).toEqual(ids(ALL.filter((r) => r.contacts == null)));
    expect(ids(special)).toEqual(expect.arrayContaining(['0-70', '0-80']));
    expect(filterRatchets(ALL, { teeth: 'low' }).some((r) => r.contacts == null)).toBe(false);
    expect(ids(filterRatchets(ALL, { teeth: 'special', height: 7 }))).toEqual(['0-70']);
  });
});

function openPicker(value = '') {
  let picked = '';
  const view = render(<PartField kind="ratchet" label="Ratchet" ratchets={ALL} value={value} onChange={(id) => (picked = id)} />);
  fireEvent.click(view.getByRole('button', { name: /^Ratchet:/ }));
  const sheet = document.querySelector<HTMLElement>('.picker-sheet')!;
  const ui = within(sheet);
  const cards = () => [...sheet.querySelectorAll('.picker-body .tile.pick .tile-name')].map((n) => n.textContent);
  return { sheet, ui, cards, picked: () => picked };
}

describe('Ratchet-Auswahl (Fenster)', () => {
  it('hat Suchfeld, Zacken- und Höhenfilter wie Blade und Bit', () => {
    const { ui, cards } = openPicker();
    expect(ui.getByRole('searchbox', { name: 'Suchen' }).getAttribute('placeholder')).toBe('Ratchet suchen (z. B. 3-60) …');
    expect(ui.getByRole('group', { name: 'Nach Zacken filtern' })).toBeTruthy();
    expect(ui.getByRole('group', { name: 'Nach Höhe filtern' })).toBeTruthy();
    expect(ui.getByRole('button', { name: '0 / M Sonderform' })).toBeTruthy();
    expect(cards()).toHaveLength(ALL.length);
    // Keine erfundenen Typ-Kategorien
    expect(ui.queryByRole('button', { name: /Attack|Defense|Stamina|Balance/ })).toBeNull();
  });

  it('filtert sofort beim Tippen und kombiniert mit Zacken und Höhe', () => {
    const { ui, cards } = openPicker();
    fireEvent.input(ui.getByRole('searchbox'), { target: { value: '3-60' } });
    expect(cards()).toEqual(['3-60']);
    fireEvent.input(ui.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.click(ui.getByRole('button', { name: '1–3 Zacken' }));
    fireEvent.click(ui.getByRole('button', { name: '8,0 mm' }));
    expect(cards()).toEqual(['1-80', '2-80', '3-80']);
    expect(ui.getByRole('button', { name: '1–3 Zacken' }).getAttribute('aria-pressed')).toBe('true');
    // Erneut tippen hebt den Filter auf
    fireEvent.click(ui.getByRole('button', { name: '8,0 mm' }));
    expect(ui.getByRole('button', { name: 'Jede Höhe' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('zeigt einen verständlichen Leerzustand und setzt Suche und Filter zurück', () => {
    const { ui, cards, sheet } = openPicker();
    fireEvent.click(ui.getByRole('button', { name: '4–5 Zacken' }));
    fireEvent.input(ui.getByRole('searchbox'), { target: { value: 'xyz' } });
    expect(cards()).toEqual([]);
    const empty = sheet.querySelector('.picker-empty')!;
    expect(empty.textContent).toContain('Kein Ratchet gefunden');
    expect(empty.textContent).toContain('Zu „xyz“ passt kein Ratchet mit den gewählten Filtern.');
    fireEvent.click(ui.getByRole('button', { name: 'Suche und Filter zurücksetzen' }));
    expect(cards()).toHaveLength(ALL.length);
    expect((ui.getByRole('searchbox') as HTMLInputElement).value).toBe('');
    expect(ui.getByRole('button', { name: 'Alle' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('übernimmt die Auswahl; Filterwechsel löscht sie nicht', () => {
    const { ui, sheet, picked } = openPicker('2-70');
    const selected = () => [...sheet.querySelectorAll('.tile.pick.selected .tile-name')].map((n) => n.textContent);
    expect(selected()).toEqual(['2-70']);
    fireEvent.click(ui.getByRole('button', { name: '6+ Zacken' }));
    expect(selected()).toEqual([]); // nicht sichtbar …
    fireEvent.click(ui.getByRole('button', { name: 'Alle' }));
    expect(selected()).toEqual(['2-70']); // … aber weiterhin gewählt
    fireEvent.click(ui.getByRole('button', { name: /^3-60/ }));
    expect(picked()).toBe('3-60');
  });

  it('springt bei Zacken- oder Höhenwechsel an den Listenanfang', () => {
    const { ui, sheet } = openPicker();
    const body = sheet.querySelector<HTMLElement>('.picker-body')!;
    body.scrollTop = 400;
    fireEvent.click(ui.getByRole('button', { name: '6+ Zacken' }));
    expect(body.scrollTop).toBe(0);
    body.scrollTop = 200;
    fireEvent.click(ui.getByRole('button', { name: '7,0 mm' }));
    expect(body.scrollTop).toBe(0);
  });
});
