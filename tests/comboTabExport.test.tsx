import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { AppContext, type AppCtx } from '../src/lib/context';
import { resolveCombo } from '../src/lib/analysis';
import { ComboParts, ComboStage } from '../src/components/ComboStage';
import { PartField } from '../src/components/PartPicker';
import { DeckExportSheet } from '../src/components/DeckExportSheet';
import { shareImageFile } from '../src/lib/deckImage';
import type { Database } from '../src/lib/types';

const db = JSON.parse(readFileSync(join(process.cwd(), 'public/data/db.json'), 'utf8')) as Database;
const images = JSON.parse(readFileSync(join(process.cwd(), 'public/data/images.json'), 'utf8'));
const combo = resolveCombo(db, { id: '', bladeId: 'AFC', ratchetId: '2-60', bitId: 'D' })!;

function Shell({ children }: { children: ComponentChildren }) {
  return (
    <AppContext.Consumer>
      {(base: AppCtx) => <AppContext.Provider value={{ ...base, images }}>{children}</AppContext.Provider>}
    </AppContext.Consumer>
  );
}

afterEach(cleanup);

describe('Kombo-Tab: einheitliche Produktfotos', () => {
  it('Bühne und Teileleiste nutzen die Freistellung – kein weißer Rahmen (.stage-photo / .bit-img)', () => {
    const { container } = render(<Shell><ComboStage resolved={combo} /><ComboParts resolved={combo} /></Shell>);
    expect(container.querySelector('.combo-stage .blade-photo.blade-photo-hero')).not.toBeNull();
    expect(container.querySelectorAll('.combo-parts .blade-photo')).toHaveLength(1);
    expect(container.querySelectorAll('.combo-parts .part-photo')).toHaveLength(2);
    expect(container.querySelector('.stage-photo, .bit-img')).toBeNull();
  });

  it('Planer-Felder zeigen dieselben freigestellten Fotos', () => {
    const { container } = render(
      <Shell>
        <PartField kind="blade" label="Blade" blades={db.blades} value="AFC" onChange={() => {}} />
        <PartField kind="ratchet" label="Ratchet" ratchets={db.ratchets} value="2-60" onChange={() => {}} />
        <PartField kind="bit" label="Bit" bits={db.bits} value="D" onChange={() => {}} />
      </Shell>,
    );
    expect(container.querySelectorAll('.part-art .blade-photo')).toHaveLength(1);
    expect(container.querySelectorAll('.part-art .part-photo')).toHaveLength(2);
    expect(container.querySelector('.part-art .bit-img, .part-art .bey-img')).toBeNull();
  });
});

describe('Bit-Beschriftung', () => {
  it('ist im Planer-Feld und in der Teileleiste gleich aufgebaut: Kürzel + Name, ohne erzwungenen Zeilenumbruch', () => {
    const { container } = render(
      <Shell>
        <PartField kind="bit" label="Bit" bits={db.bits} value="D" onChange={() => {}} />
        <ComboParts resolved={combo} />
      </Shell>,
    );
    const labels = [...container.querySelectorAll('.bit-name')];
    expect(labels).toHaveLength(2);
    for (const l of labels) {
      expect(l.querySelector('.bit-name-code')?.textContent).toBe('D');
      expect(l.querySelector('.bit-name-text')?.textContent).toBe('Dot');
    }
    // Früher: Name in <small> mit display:block → immer eigene Zeile
    expect(container.querySelector('.combo-part-name small')).toBeNull();
  });

  it('kompaktes Feld (Vergleich): „D Dot“ als Fließtext mit Leerzeichen – einzeilig mit Auslassungspunkten', () => {
    const { container } = render(<Shell><PartField compact kind="bit" label="Bit" bits={db.bits} value="D" onChange={() => {}} /></Shell>);
    expect(container.querySelector('.part-field.compact .part-main .bit-name')?.textContent).toBe('D Dot');
    // Bilder der kompakten Variante unverändert
    expect(container.querySelector('.part-field.compact .bit-img')).not.toBeNull();
  });
});

describe('Deck-Export', () => {
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'beyblade-deck.png', { type: 'image/png' });
  const nav = navigator as Navigator & { share?: unknown; canShare?: unknown };
  let shared: ShareData[] = [];
  let ua: PropertyDescriptor | undefined;
  const setUA = (v: string) => Object.defineProperty(navigator, 'userAgent', { value: v, configurable: true });
  beforeEach(() => {
    shared = [];
    ua = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    nav.canShare = (d: ShareData) => !!d.files?.length;
    nav.share = vi.fn(async (d: ShareData) => void shared.push(d));
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
    if (ua) Object.defineProperty(navigator, 'userAgent', ua);
    else delete (navigator as { userAgent?: string }).userAgent;
  });

  it('teilt nur die Bilddatei – ohne Titel oder Text, damit iOS sie als Bild behandelt', async () => {
    expect(await shareImageFile(file)).toBe('done');
    expect(shared).toHaveLength(1);
    expect(Object.keys(shared[0]!)).toEqual(['files']);
    expect(shared[0]!.files![0]!.type).toBe('image/png');
    nav.share = vi.fn(async () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })));
    expect(await shareImageFile(file)).toBe('cancelled');
  });

  it('iPhone: Vorschau mit „In Fotos sichern“, „Teilen“, „Schließen“ – und kein falsches „Gespeichert“', async () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    const onClose = vi.fn();
    render(<DeckExportSheet file={file} url="blob:deck" onClose={onClose} />);
    const sheet = within(document.querySelector<HTMLElement>('.deck-export')!);
    expect(sheet.getByRole('img', { name: 'Dein Deck als Bild' }).getAttribute('src')).toBe('blob:deck');
    expect(sheet.getAllByRole('button').map((b) => b.textContent?.trim()).filter(Boolean)).toEqual(['In Fotos sichern', 'Teilen', 'Schließen']);
    fireEvent.click(sheet.getByRole('button', { name: /In Fotos sichern/ }));
    // Synchron im Tipp – ohne Warten: ein await vor navigator.share würde die iOS-Geste brechen
    expect(nav.share).toHaveBeenCalledTimes(1);
    expect(Object.keys(shared[0]!)).toEqual(['files']);
    const msg = await sheet.findByRole('status');
    expect(msg.textContent).toContain('Falls du „Bild sichern“ gewählt hast');
    expect(msg.textContent).not.toMatch(/erfolgreich|gespeichert\./i);
  });

  it('meldet, wenn sich das Teilen-Menü nicht öffnen lässt, und öffnet es nicht doppelt', async () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    let reject: (e: Error) => void = () => {};
    nav.share = vi.fn(() => new Promise<void>((_, rej) => (reject = rej)));
    render(<DeckExportSheet file={file} url="blob:deck" onClose={() => {}} />);
    const sheet = within(document.querySelector<HTMLElement>('.deck-export')!);
    const btn = sheet.getByRole('button', { name: /In Fotos sichern/ });
    fireEvent.click(btn);
    fireEvent.click(btn); // zweiter Tipp, solange das Menü offen ist
    expect(nav.share).toHaveBeenCalledTimes(1);
    reject(Object.assign(new Error('nope'), { name: 'NotAllowedError' }));
    expect((await sheet.findByRole('status')).textContent).toContain('ließ sich nicht öffnen');
  });

  it('ohne Teilen-Funktion (Desktop): „Bild speichern“ lädt herunter, kein „In Fotos sichern“', async () => {
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createURL = vi.fn(() => 'blob:dl');
    const prevCreate = URL.createObjectURL;
    URL.createObjectURL = createURL;
    try {
      render(<DeckExportSheet file={file} url="blob:deck" onClose={() => {}} />);
      const sheet = within(document.querySelector<HTMLElement>('.deck-export')!);
      expect(sheet.queryByRole('button', { name: /In Fotos sichern/ })).toBeNull();
      expect(sheet.queryByRole('button', { name: /Teilen/ })).toBeNull();
      fireEvent.click(sheet.getByRole('button', { name: /Bild speichern/ }));
      await waitFor(() => expect(click).toHaveBeenCalled());
      expect(createURL).toHaveBeenCalledWith(file);
      // Kein behaupteter Erfolg – nur, dass der Download angestoßen wurde
      expect((await sheet.findByRole('status')).textContent).toBe('Download gestartet.');
    } finally {
      click.mockRestore();
      URL.createObjectURL = prevCreate;
    }
  });

  it('Schließen ruft onClose (über die Schließ-Animation)', async () => {
    const onClose = vi.fn();
    render(<DeckExportSheet file={file} url="blob:deck" onClose={onClose} />);
    const buttons = within(document.querySelector<HTMLElement>('.deck-export')!).getAllByRole('button', { name: 'Schließen' });
    expect(buttons).toHaveLength(2); // X in der Kopfzeile und Knopf unten
    fireEvent.click(buttons[1]!);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('Bild lässt sich vergrößern und wieder verkleinern', () => {
    render(<DeckExportSheet file={file} url="blob:deck" onClose={() => {}} />);
    const box = document.querySelector('.deck-preview')!;
    const zoom = within(box as HTMLElement).getByRole('button', { name: 'Bild vergrößern' });
    fireEvent.click(zoom);
    expect(box.className).toContain('is-zoomed');
    expect(zoom.getAttribute('aria-pressed')).toBe('true');
    // Vergrößerte Fläche ist per Tastatur erreichbar und verschiebbar
    expect(within(box as HTMLElement).getByRole('region', { name: /Vergrößertes Deck-Bild/ }).getAttribute('tabindex')).toBe('0');
    fireEvent.click(zoom);
    expect(box.className).not.toContain('is-zoomed');
    expect(zoom.getAttribute('aria-pressed')).toBe('false');
  });
});
