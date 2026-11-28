// Kauf-Check als der eine Einstieg: scannen → Bewertung → in die Sammlung.
// Kamera und Texterkennung sind ersetzt – geprüft wird, was die Oberfläche aus einem gelesenen Barcode macht.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/preact';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useContext } from 'preact/hooks';
import type { BarcodeFeed, Database, Product } from '../src/lib/types';
import { EMPTY_STATE, type UserState } from '../src/lib/storage';
import type { PhotoResult } from '../src/lib/photo';
import type { CameraHandlers } from '../src/lib/barcodeCamera';
import { knownBarcodes } from '../src/lib/data';
import { AppContext } from '../src/lib/context';
import { OVERALL_LABEL } from '../src/lib/rate';

const recognize = vi.fn<(...args: unknown[]) => Promise<PhotoResult>>();
vi.mock('../src/lib/photo', async (orig) => ({ ...(await orig<typeof import('../src/lib/photo')>()), recognizePhoto: (...a: unknown[]) => recognize(...a) }));
let cam: CameraHandlers | null = null;
vi.mock('../src/lib/barcodeCamera', () => ({
  cameraGranted: () => Promise.resolve(false),
  useBarcodeCamera: (_video: unknown, on: boolean, _round: number, handlers: CameraHandlers) => {
    cam = on ? handlers : null;
  },
}));
const { PhotoCheck } = await import('../src/components/PhotoCheck');
const { Collection } = await import('../src/components/Collection');
const { ShopMode } = await import('../src/components/ShopMode');

const read = <T,>(f: string) => JSON.parse(readFileSync(resolve(process.cwd(), 'public/data', f), 'utf8')) as T;
const db = read<Database>('db.json');
const shipped = knownBarcodes(read<BarcodeFeed>('barcodes.json'), db.products);
const prod = (code: string) => db.products.find((p) => p.code === code) as Product;
const result = (r: Partial<PhotoResult>): PhotoResult => ({ products: [], barcode: null, barcodeFrom: null, text: '', via: 'none', sure: false, ...r });

const G2750 = '5010996431189'; // Hasbro: Booster Hurricane Enlil 7-55T
const BX01 = '4904810910381'; // Takara Tomy: Starter Dran Sword
const BX24 = '4904810913108'; // Random Booster Vol.2 (6 mögliche Kreisel)
const UNKNOWN = '4904810999997';

let state: UserState;
const update = (fn: (s: UserState) => UserState) => (state = fn(state));
function Host({ start }: { start?: 'live' }) {
  const base = useContext(AppContext);
  return (
    <AppContext.Provider value={{ ...base, barcodes: shipped }}>
      <PhotoCheck db={db} state={state} update={update} meta={null} start={start} onClose={() => {}} />
    </AppContext.Provider>
  );
}
function open(start?: 'live') {
  const view = render(<Host start={start} />);
  const root = document.querySelector<HTMLElement>('.live.shop')!;
  const top = () => within(root.querySelector<HTMLElement>('.kc-page:not(.kc-under)')!);
  const bar = within(root.querySelector<HTMLElement>('.live-bar')!);
  const refresh = () => view.rerender(<Host start={start} />);
  /** Die Kamera hat einen Barcode gelesen */
  const read = async (gtin: string, frame: Blob | null = null) => {
    await waitFor(() => expect(cam).toBeTruthy());
    await act(async () => cam!.onCode(gtin, frame));
    refresh();
  };
  const scan = async (gtin: string, frame: Blob | null = null) => {
    fireEvent.click(top().getByRole('button', { name: /Barcode scannen/ }));
    await read(gtin, frame);
  };
  const verdict = () => root.querySelector('.kc-page:not(.kc-under) .photo-verdict')?.textContent ?? '';
  return { root, top, bar, refresh, read, scan, verdict };
}

beforeEach(() => {
  state = { ...EMPTY_STATE };
  cam = null;
  recognize.mockReset();
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(cleanup);

describe('Kauf-Check: ein Einstieg, drei Wege', () => {
  it('Startseite: scannen (zuerst), fotografieren, eintippen', () => {
    const { top } = open();
    const ways = [...document.querySelectorAll('.kc-page:not(.kc-under) .scan-choice')].map((b) => b.querySelector('strong')!.textContent);
    expect(ways).toEqual(['Barcode scannen', 'Packung fotografieren']);
    expect(document.querySelector('.kc-page:not(.kc-under) .scan-choice.primary')!.textContent).toContain('Barcode scannen');
    expect(top().getByRole('searchbox')).toBeTruthy();
    expect(top().getByRole('button', { name: 'Aus der Galerie wählen' })).toBeTruthy();
  });

  it('beim Eintippen machen die Wege Platz für die Treffer', () => {
    const { top } = open();
    fireEvent.input(top().getByRole('searchbox'), { target: { value: 'BX-01' } });
    expect(document.querySelector('.kc-page:not(.kc-under) .scan-choice')).toBeNull();
    expect(top().getAllByRole('button').some((b) => b.textContent?.includes('BX-01'))).toBe(true);
  });

  it('Sammlung: nur noch ein Knopf – „Kauf-Check“ (kein eigenes „Packung scannen“)', () => {
    render(<Collection db={db} events={[]} state={state} update={update} meta={null} />);
    const ctas = [...document.querySelectorAll('.scan-cta')].map((b) => b.querySelector('strong')!.textContent);
    expect(ctas).toEqual(['Kauf-Check']);
    expect(document.body.textContent).not.toContain('Packung scannen');
    fireEvent.click(document.querySelector('.scan-cta')!);
    expect(document.querySelector('.live.shop')).toBeTruthy();
  });

  it('Einkaufsmodus: „Scannen“ öffnet den Kauf-Check gleich mit der Kamera, Zurück führt zur Auswahl', async () => {
    render(<ShopMode db={db} state={state} update={update} meta={null} onClose={() => {}} />);
    fireEvent.click(within(document.querySelector<HTMLElement>('.live-bar')!).getByRole('button', { name: 'Scannen' }));
    await waitFor(() => expect(cam).toBeTruthy());
    const check = [...document.querySelectorAll<HTMLElement>('.live.shop')].pop()!;
    expect(check.getAttribute('aria-label')).toBe('Kauf-Check');
    expect(check.querySelector('.kc-page:not(.kc-under) .scan-cam')).toBeTruthy();
    fireEvent.click(within(check.querySelector<HTMLElement>('.live-bar')!).getByRole('button', { name: 'Zurück' }));
    await waitFor(() => expect(check.querySelector('.kc-page:not(.kc-under) .scan-choice')).toBeTruthy());
  });
});

describe('Kauf-Check: nach dem Scan steht die Bewertung da', () => {
  it('Hasbro-Barcode (G2750): Urteil „kaufen oder nicht“ mit Gründen – nicht nur der Name', async () => {
    const { top, scan, verdict, refresh } = open();
    await scan(G2750);
    expect(top().getByText('G2750')).toBeTruthy();
    expect(Object.values(OVERALL_LABEL)).toContain(verdict());
    expect(document.querySelectorAll('.kc-page:not(.kc-under) .photo-reasons li').length).toBeGreaterThan(0);
    expect(document.querySelector('.kc-page:not(.kc-under) .rate-meters')).toBeTruthy();
    expect(recognize).not.toHaveBeenCalled();
    // von dort direkt in die Sammlung
    fireEvent.click(top().getByRole('button', { name: 'Gekauft – in die Sammlung' }));
    refresh();
    expect(state.owned.G2750).toBe(1);
    expect(verdict()).toBe(OVERALL_LABEL.owned);
  });

  it('Takara-Tomy-Barcode: ebenfalls sofort bewertet', async () => {
    const { top, scan, verdict } = open();
    await scan(BX01);
    expect(top().getByText('BX-01')).toBeTruthy();
    expect(Object.values(OVERALL_LABEL)).toContain(verdict());
  });

  it('auf der Wunschliste: Das Ergebnis sagt es', async () => {
    state = { ...EMPTY_STATE, wishlist: ['G2750'] };
    const { top, scan } = open();
    await scan(G2750);
    expect(top().getByText('Steht auf deiner Wunschliste')).toBeTruthy();
    expect(top().queryByRole('button', { name: /Merken/ })).toBeNull();
  });

  it('„Nächste Packung scannen“: gleich wieder die Kamera, darunter die Auswahl', async () => {
    const { top, bar, scan, read, verdict } = open();
    await scan(G2750);
    fireEvent.click(top().getByRole('button', { name: /Nächste Packung scannen/ }));
    await waitFor(() => expect(document.querySelector('.kc-page:not(.kc-under) .scan-cam')).toBeTruthy());
    await read(BX01);
    expect(top().getByText('BX-01')).toBeTruthy();
    expect(Object.values(OVERALL_LABEL)).toContain(verdict());
    // Zurück: nicht zur vorigen Packung, sondern zur Auswahl
    fireEvent.click(bar.getByRole('button', { name: 'Zurück' }));
    await waitFor(() => expect(document.querySelector('.kc-page:not(.kc-under) .scan-choice')).toBeTruthy());
  });

  it('eingetippt oder fotografiert: kein „Nächste Packung scannen“', async () => {
    const { top, root } = open();
    fireEvent.input(top().getByRole('searchbox'), { target: { value: 'BX-01' } });
    fireEvent.click(top().getAllByRole('button').find((b) => b.textContent?.includes('BX-01'))!);
    expect(root.querySelector('.kc-page:not(.kc-under) .photo-result')).toBeTruthy();
    expect(top().queryByRole('button', { name: /Nächste Packung scannen/ })).toBeNull();
    expect(top().queryByRole('button', { name: /Falsches Produkt/ })).toBeNull();
  });

  it('direkt mit der Kamera gestartet (start="live"): Scan → Bewertung', async () => {
    const { top, read, verdict } = open('live');
    expect(document.querySelector('.kc-page:not(.kc-under) .scan-cam')).toBeTruthy();
    await read(G2750);
    expect(top().getByText('G2750')).toBeTruthy();
    expect(Object.values(OVERALL_LABEL)).toContain(verdict());
  });
});

describe('Kauf-Check: Random Booster', () => {
  const contents = db.products.filter((p) => p.kind === 'random-booster' && p.code.startsWith('BX-24-'));

  it('Barcode → Packung bewertet; welche möglichen Kreisel schon da sind, steht dabei', async () => {
    state = { ...EMPTY_STATE, owned: { 'BX-24-02': 1 } };
    const { top, scan, verdict } = open();
    await scan(BX24);
    expect(top().getByText('BX-24 · Random Booster')).toBeTruthy();
    expect(Object.values(OVERALL_LABEL)).toContain(verdict());
    expect(top().getByText(`1 von ${contents.length} möglichen Kreiseln hast du schon.`)).toBeTruthy();
    const rows = [...document.querySelectorAll<HTMLElement>('.kc-page:not(.kc-under) details .row-btn')];
    expect(rows).toHaveLength(contents.length);
    expect(rows.find((r) => r.textContent!.includes('BX-24-02'))!.textContent).toContain('hast du schon');
    expect(rows.find((r) => r.textContent!.includes('BX-24-03'))!.textContent).not.toContain('hast du schon');
  });

  it('gekauft und geöffnet: Der gewählte Kreisel kommt in die Sammlung, der Barcode bleibt bei der Packung', async () => {
    const { scan, refresh } = open();
    await scan(BX24);
    fireEvent.click([...document.querySelectorAll<HTMLElement>('.kc-page:not(.kc-under) details .row-btn')].find((r) => r.textContent!.includes('BX-24-03'))!);
    refresh();
    expect(state.owned).toEqual({ 'BX-24-03': 1 });
    expect(state.barcodes).toEqual({});
  });
});

describe('Kauf-Check: Barcode falsch oder unbekannt', () => {
  it('„Falsches Produkt? Neu zuordnen“: neu gewählt gilt ab dann – auch gegen die mitgelieferte Liste', async () => {
    const { top, scan, read, refresh } = open();
    await scan(G2750);
    fireEvent.click(top().getByRole('button', { name: /Falsches Produkt\? Neu zuordnen/ }));
    refresh();
    expect(document.querySelector('.kc-page:not(.kc-under) .barcode-note')!.textContent).toContain(G2750);
    fireEvent.input(top().getByRole('textbox', { name: 'Packung suchen' }), { target: { value: 'BX-03' } });
    fireEvent.click(top().getAllByRole('button').find((b) => b.textContent?.includes('BX-03'))!);
    refresh();
    expect(state.barcodes).toEqual({ [G2750]: 'BX-03' });
    expect(top().getByText('BX-03')).toBeTruthy();
    // nächster Scan desselben Barcodes: die eigene Zuordnung gewinnt
    fireEvent.click(top().getByRole('button', { name: /Nächste Packung scannen/ }));
    await read(G2750);
    expect(top().getByText('BX-03')).toBeTruthy();
  });

  it('eigene falsche Zuordnung löschen: Danach gilt wieder die mitgelieferte Liste', async () => {
    state = { ...EMPTY_STATE, barcodes: { [G2750]: 'BX-03' } };
    const { top, scan, refresh } = open();
    await scan(G2750);
    expect(top().getByText('BX-03')).toBeTruthy();
    fireEvent.click(top().getByRole('button', { name: /Falsches Produkt\? Neu zuordnen/ }));
    refresh();
    expect(state.barcodes).toEqual({});
  });

  it('unbekannter Barcode im Live-Scan: Produktnummer auf demselben Bild genügt → Bewertung, Barcode gemerkt', async () => {
    recognize.mockResolvedValue(result({ products: [prod('BX-05')], via: 'code', sure: true }));
    const { top, scan, refresh, verdict } = open();
    await scan(UNKNOWN, new Blob(['x'], { type: 'image/jpeg' }));
    await waitFor(() => expect(document.querySelector('.kc-page:not(.kc-under) .photo-result')).toBeTruthy());
    refresh();
    expect(top().getByText('BX-05')).toBeTruthy();
    expect(Object.values(OVERALL_LABEL)).toContain(verdict());
    expect(state.barcodes).toEqual({ [UNKNOWN]: 'BX-05' });
    expect(top().getByRole('button', { name: /Nächste Packung scannen/ })).toBeTruthy();
  });

  it('unbekannter Barcode ohne lesbare Nummer: Vorderseite fotografieren – danach Bewertung, weiter mit der Kamera', async () => {
    const { root, top, scan, refresh } = open();
    await scan(UNKNOWN);
    expect(root.querySelector('.kc-page:not(.kc-under) .barcode-note')!.textContent).toContain(UNKNOWN);
    recognize.mockResolvedValue(result({ products: [prod('BX-05')], via: 'code', sure: true }));
    fireEvent.click(top().getByRole('button', { name: /Vorderseite fotografieren/ }));
    const input = root.querySelector<HTMLInputElement>('input[type=file][capture]')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'vorne.jpg', { type: 'image/jpeg' })], configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(root.querySelector('.kc-page:not(.kc-under) .photo-result')).toBeTruthy());
    refresh();
    expect(state.barcodes).toEqual({ [UNKNOWN]: 'BX-05' });
    // Das Foto der Vorderseite gehört zum selben Scan: Es geht mit der Kamera weiter
    expect(top().getByRole('button', { name: /Nächste Packung scannen/ })).toBeTruthy();
  });
});
