import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
// Preact führt Effekte und deren Aufräumen leicht verzögert per Timer aus. Vor dem Abbau der Testumgebung abwarten,
// sonst laufen sie danach ohne window/document (sporadischer „window is not defined“ beim Ende der Datei).
afterAll(() => new Promise((resolve) => setTimeout(resolve, 150)));

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
  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const png = (name: string) => new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
  const file = png('beyblade-deck.png');
  const nav = navigator as Navigator & { share?: unknown; canShare?: unknown };
  let shared: ShareData[] = [];
  let ua: PropertyDescriptor | undefined;
  let urlN = 0;
  const prevCreate = URL.createObjectURL;
  const prevRevoke = URL.revokeObjectURL;
  const setUA = (v: string) => Object.defineProperty(navigator, 'userAgent', { value: v, configurable: true });
  const make = vi.fn(async (f: string) => png(`beyblade-deck-${f}.png`));
  const open = (onClose = () => {}) => {
    render(<DeckExportSheet initial={file} make={make} onClose={onClose} />);
    return within(document.querySelector<HTMLElement>('.deck-export')!);
  };
  beforeEach(() => {
    shared = [];
    urlN = 0;
    make.mockClear();
    ua = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    nav.canShare = (d: ShareData) => !!d.files?.length;
    nav.share = vi.fn(async (d: ShareData) => void shared.push(d));
    URL.createObjectURL = vi.fn(() => `blob:deck-${++urlN}`);
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
    if (ua) Object.defineProperty(navigator, 'userAgent', ua);
    else delete (navigator as { userAgent?: string }).userAgent;
    URL.createObjectURL = prevCreate;
    URL.revokeObjectURL = prevRevoke;
  });

  it('teilt nur die Bilddatei – ohne Titel oder Text', async () => {
    expect(await shareImageFile(file)).toBe('done');
    expect(Object.keys(shared[0]!)).toEqual(['files']);
    expect(shared[0]!.files![0]!.type).toBe('image/png');
    nav.share = vi.fn(async () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })));
    expect(await shareImageFile(file)).toBe('cancelled');
  });

  it('Format wählen: Hochformat, Quadrat, Story – jedes nur einmal erzeugt, Hochformat ohne Neuberechnung', async () => {
    const sheet = open();
    const group = sheet.getByRole('group', { name: 'Format' });
    const btn = (n: RegExp) => within(group).getByRole('button', { name: n });
    expect(btn(/Hochformat/).getAttribute('aria-pressed')).toBe('true');
    expect(sheet.getByRole('img', { name: /Hochformat 4:5/ }).getAttribute('src')).toBe('blob:deck-1');
    fireEvent.click(btn(/Story/));
    expect(await sheet.findByRole('img', { name: /Story 9:16/ })).toBeTruthy();
    fireEvent.click(btn(/Quadrat/));
    expect(await sheet.findByRole('img', { name: /Quadrat 1:1/ })).toBeTruthy();
    fireEvent.click(btn(/Story/));
    fireEvent.click(btn(/Hochformat/));
    expect(make.mock.calls.map((c) => c[0])).toEqual(['story', 'square']); // keine doppelte Erzeugung, post kam fertig
  });

  it('gibt alle Bild-Adressen beim Schließen frei', async () => {
    const sheet = open();
    fireEvent.click(within(sheet.getByRole('group', { name: 'Format' })).getByRole('button', { name: /Story/ }));
    await sheet.findByRole('img', { name: /Story/ });
    cleanup();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:deck-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:deck-2');
  });

  it('iPhone: „In Fotos sichern“ zeigt das Bild groß mit „Gedrückt halten → Zu Fotos hinzufügen“ – ohne Teilen-Menü und ohne „Gespeichert“', () => {
    setUA(IOS);
    const sheet = open();
    expect(sheet.getAllByRole('button').map((b) => b.textContent?.trim()).filter((t) => t && !/^(Hochformat|Quadrat|Story)/.test(t))).toEqual(['In Fotos sichern', 'Teilen', 'Schließen']);
    fireEvent.click(sheet.getByRole('button', { name: /In Fotos sichern/ }));
    expect(nav.share).not.toHaveBeenCalled();
    const hint = sheet.getByRole('status');
    expect(hint.textContent).toContain('drücken und halten');
    expect(hint.textContent).toContain('Kreisel oder eine freie Stelle');
    expect(hint.textContent).toContain('Zu Fotos hinzufügen');
    expect(hint.textContent).not.toMatch(/gespeichert|erfolgreich/i);
    expect(document.querySelector('.deck-export')!.className).toContain('is-photo-mode');
    expect(sheet.queryByRole('group', { name: 'Format' })).toBeNull();
    fireEvent.click(sheet.getByRole('button', { name: /Fertig/ }));
    expect(document.querySelector('.deck-export')!.className).not.toContain('is-photo-mode');
  });

  it('„Teilen“ startet synchron im Tipp, nur mit der Datei des gewählten Formats, nie doppelt', async () => {
    setUA(IOS);
    let reject: (e: Error) => void = () => {};
    const sheet = open();
    fireEvent.click(within(sheet.getByRole('group', { name: 'Format' })).getByRole('button', { name: /Story/ }));
    await sheet.findByRole('img', { name: /Story/ });
    nav.share = vi.fn((d: ShareData) => {
      shared.push(d);
      return new Promise<void>((_, rej) => (reject = rej));
    });
    const teilen = sheet.getByRole('button', { name: /Teilen/ });
    fireEvent.click(teilen);
    fireEvent.click(teilen); // zweiter Tipp, solange das Menü offen ist
    expect(nav.share).toHaveBeenCalledTimes(1); // ohne Warten: synchron im Tipp
    expect(Object.keys(shared[0]!)).toEqual(['files']);
    expect(shared[0]!.files![0]!.name).toBe('beyblade-deck-story.png');
    reject(Object.assign(new Error('nope'), { name: 'NotAllowedError' }));
    expect((await sheet.findByRole('status')).textContent).toContain('Teilen ging nicht');
  });

  it('ohne Teilen-Funktion (Desktop): „Bild speichern“ lädt die Datei des gewählten Formats herunter', async () => {
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      const sheet = open();
      expect(sheet.queryByRole('button', { name: /In Fotos sichern/ })).toBeNull();
      expect(sheet.queryByRole('button', { name: /Teilen/ })).toBeNull();
      fireEvent.click(within(sheet.getByRole('group', { name: 'Format' })).getByRole('button', { name: /Quadrat/ }));
      await sheet.findByRole('img', { name: /Quadrat/ });
      fireEvent.click(sheet.getByRole('button', { name: /Bild speichern/ }));
      await waitFor(() => expect(click).toHaveBeenCalled());
      expect((URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].name).toBe('beyblade-deck-square.png');
      expect((await sheet.findByRole('status')).textContent).toBe('Download gestartet.');
    } finally {
      click.mockRestore();
    }
  });

  it('Schließen ruft onClose (über die Schließ-Animation)', async () => {
    const onClose = vi.fn();
    const buttons = open(onClose).getAllByRole('button', { name: 'Schließen' });
    expect(buttons).toHaveLength(2); // X in der Kopfzeile und Knopf unten
    fireEvent.click(buttons[1]!);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('Bild lässt sich vergrößern und wieder verkleinern', () => {
    open();
    const box = document.querySelector<HTMLElement>('.deck-preview')!;
    const zoom = within(box).getByRole('button', { name: 'Bild vergrößern' });
    fireEvent.click(zoom);
    expect(box.className).toContain('is-zoomed');
    expect(zoom.getAttribute('aria-pressed')).toBe('true');
    expect(within(box).getByRole('region', { name: /Vergrößertes Deck-Bild/ }).getAttribute('tabindex')).toBe('0');
    fireEvent.click(zoom);
    expect(box.className).not.toContain('is-zoomed');
  });
});

describe('Deck-Bild: Formate', () => {
  it('jeder Aufbau passt ganz in seine Leinwand; Hochformat bleibt 1:1 der bisherige Aufbau', async () => {
    const { DECK_FORMATS, deckFile } = await import('../src/lib/deckImage');
    expect(DECK_FORMATS.post).toMatchObject({ w: 1080, h: 1350, scale: 1, dx: 0, dy: 0 });
    expect(DECK_FORMATS.square).toMatchObject({ w: 1080, h: 1080 });
    expect(DECK_FORMATS.story).toMatchObject({ w: 1080, h: 1920 });
    for (const f of Object.values(DECK_FORMATS)) {
      expect(f.dx).toBeGreaterThanOrEqual(0);
      expect(f.dy).toBeGreaterThanOrEqual(0);
      expect(f.dx * 2 + 1080 * f.scale).toBeCloseTo(f.w); // waagrecht mittig
      expect(f.dy * 2 + 1350 * f.scale).toBeLessThanOrEqual(f.h + 0.001);
    }
    expect(deckFile(new Blob(), 'post').name).toBe('beyblade-deck.png');
    expect(deckFile(new Blob(), 'story').name).toBe('beyblade-deck-story.png');
  });
});
