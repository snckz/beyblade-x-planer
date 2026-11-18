import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { PartField } from '../src/components/PartPicker';
import type { Bit } from '../src/lib/types';

// Genug Bits für eine lange Liste, gemischte Typen für den Filter
const TYPES = ['attack', 'defense', 'stamina', 'balance'] as const;
const BITS: Bit[] = Array.from({ length: 40 }, (_, i) => ({ id: `B${i}`, name: `Bit ${i}`, type: TYPES[i % 4]! }));

afterEach(cleanup);

function openPicker() {
  const view = render(<PartField kind="bit" label="Bit" bits={BITS} value="" onChange={() => {}} />);
  fireEvent.click(view.getByRole('button', { name: /^Bit:/ }));
  const sheet = document.querySelector<HTMLElement>('.picker-sheet')!;
  const body = sheet.querySelector<HTMLElement>('.picker-body')!;
  return { sheet, body };
}

describe('Auswahlfenster: Liste nach Filter und Suche', () => {
  it('springt bei neuem Typfilter wieder an den Anfang', () => {
    const { sheet, body } = openPicker();
    body.scrollTop = 600;
    fireEvent.click(sheet.querySelector('.type-chip-stamina')!);
    expect(body.scrollTop).toBe(0);
    expect(sheet.querySelectorAll('.picker-body .tile.pick:not([hidden])')).toHaveLength(10);
  });

  it('springt bei neuer Suche wieder an den Anfang', () => {
    const { sheet, body } = openPicker();
    body.scrollTop = 600;
    fireEvent.input(sheet.querySelector('.search-field input')!, { target: { value: 'B1' } });
    expect(body.scrollTop).toBe(0);
  });

  it('lässt die Scrollposition beim Öffnen und ohne Änderung in Ruhe', () => {
    const { sheet, body } = openPicker();
    expect(body.scrollTop).toBe(0);
    body.scrollTop = 300;
    // Gleicher Filter wie vorher („Alle“): keine Änderung → keine Sprungbewegung
    fireEvent.click(sheet.querySelector('.type-chip-all')!);
    expect(body.scrollTop).toBe(300);
  });

  it('zeigt die Kante unter der Leiste nur, solange die Liste gescrollt ist', () => {
    const { sheet, body } = openPicker();
    expect(sheet.classList.contains('list-scrolled')).toBe(false);
    body.scrollTop = 120;
    fireEvent.scroll(body);
    expect(sheet.classList.contains('list-scrolled')).toBe(true);
    body.scrollTop = 0;
    fireEvent.scroll(body);
    expect(sheet.classList.contains('list-scrolled')).toBe(false);
  });
});
