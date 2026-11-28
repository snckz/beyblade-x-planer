// „Packung scannen“: Was passiert nach dem Lesen eines Barcodes?
// Kamera und Texterkennung sind ersetzt – geprüft wird, was die Oberfläche aus einem gelesenen Barcode macht:
// bekannte Packung, Random Booster (Inhalt wählen), unbekannter Barcode (Vorderseite fotografieren), Etikett des Ladens.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/preact';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BarcodeFeed, Database, Product } from '../src/lib/types';
import { EMPTY_STATE, type UserState } from '../src/lib/storage';
import type { PhotoResult } from '../src/lib/photo';
import type { CameraHandlers } from '../src/lib/barcodeCamera';
import { knownBarcodes } from '../src/lib/data';
import { AppContext } from '../src/lib/context';
import { useContext } from 'preact/hooks';

const recognize = vi.fn<(...args: unknown[]) => Promise<PhotoResult>>();
vi.mock('../src/lib/photo', async (orig) => ({ ...(await orig<typeof import('../src/lib/photo')>()), recognizePhoto: (...a: unknown[]) => recognize(...a) }));
let cam: CameraHandlers | null = null;
vi.mock('../src/lib/barcodeCamera', () => ({
  cameraGranted: () => Promise.resolve(false),
  useBarcodeCamera: (_video: unknown, on: boolean, _round: number, handlers: CameraHandlers) => {
    cam = on ? handlers : null;
  },
}));
const { Scanner } = await import('../src/components/Scanner');

const read = <T,>(f: string) => JSON.parse(readFileSync(resolve(process.cwd(), 'public/data', f), 'utf8')) as T;
const db = read<Database>('db.json');
const shipped = knownBarcodes(read<BarcodeFeed>('barcodes.json'), db.products);
const prod = (code: string) => db.products.find((p) => p.code === code) as Product;
const result = (r: Partial<PhotoResult>): PhotoResult => ({ products: [], barcode: null, barcodeFrom: null, text: '', via: 'none', sure: false, ...r });

const BX01 = '4904810910381'; // Starter Dran Sword
const BX24 = '4904810913108'; // Random Booster Vol.2 (6 mögliche Kreisel)
const UNKNOWN = '4904810999997'; // Hersteller-Barcode, den niemand kennt
const STORE = '2000000123455'; // Etikett eines Ladens (Präfix 2)

let state: UserState;
function Host() {
  const base = useContext(AppContext);
  return (
    <AppContext.Provider value={{ ...base, barcodes: shipped }}>
      <Scanner db={db} state={state} update={(fn) => (state = fn(state))} onClose={() => {}} />
    </AppContext.Provider>
  );
}
function open() {
  const view = render(<Host />);
  const sheet = () => within(document.querySelector<HTMLElement>('.scan-sheet')!);
  const live = async () => {
    fireEvent.click(sheet().getByRole('button', { name: /Live scannen/ }));
    await waitFor(() => expect(cam).toBeTruthy());
  };
  /** Die Kamera hat einen Barcode gelesen (`frame`: Standbild für die Texterkennung, wenn er unbekannt ist) */
  const scan = async (gtin: string, frame: Blob | null = null) => {
    await live();
    await act(async () => cam!.onCode(gtin, frame));
    view.rerender(<Host />);
  };
  const photo = () => {
    const input = document.querySelector<HTMLInputElement>('.scan-sheet input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'vorne.jpg', { type: 'image/jpeg' })], configurable: true });
    fireEvent.change(input);
  };
  const refresh = () => view.rerender(<Host />);
  return { sheet, scan, photo, refresh };
}

beforeEach(() => {
  state = { ...EMPTY_STATE };
  cam = null;
  recognize.mockReset();
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(cleanup);

describe('Packung scannen: mitgelieferte Barcodes', () => {
  it('Takara-Tomy-Barcode: Produkt steht sofort da – ohne Zuordnen, ohne Texterkennung', async () => {
    const { sheet, scan } = open();
    await scan(BX01);
    expect(sheet().getByText('BX-01')).toBeTruthy();
    expect(recognize).not.toHaveBeenCalled();
    fireEvent.click(sheet().getByRole('button', { name: 'In die Sammlung' }));
    expect(state.owned['BX-01']).toBe(1);
    expect(state.barcodes).toEqual({});
  });

  it('die Kamera braucht für bekannte Barcodes kein Standbild', async () => {
    const { scan } = open();
    await scan(BX01);
    cleanup();
    const again = open();
    fireEvent.click(again.sheet().getByRole('button', { name: /Live scannen/ }));
    await waitFor(() => expect(cam).toBeTruthy());
    expect(cam!.needFrame!(BX01)).toBe(false);
    expect(cam!.needFrame!(BX24)).toBe(false);
    expect(cam!.needFrame!(UNKNOWN)).toBe(true);
  });
});

describe('Packung scannen: Random Booster', () => {
  const contents = db.products.filter((p) => p.kind === 'random-booster' && p.code.startsWith('BX-24-'));

  it('der Barcode steht für die Packung: Die App fragt, welcher Kreisel drin ist', async () => {
    expect(contents.length).toBeGreaterThan(1);
    const { sheet, scan, refresh } = open();
    await scan(BX24);
    expect(sheet().getByText('Welcher Kreisel ist drin?')).toBeTruthy();
    expect(sheet().getByText('BX-24 · Random Booster')).toBeTruthy();
    // noch nichts zum Eintragen – erst der Inhalt
    expect(sheet().queryByRole('button', { name: 'In die Sammlung' })).toBeNull();
    for (const p of contents) expect(sheet().getByText(p.code)).toBeTruthy();

    fireEvent.click(sheet().getByText('BX-24-03').closest('button')!);
    fireEvent.click(sheet().getByRole('button', { name: 'In die Sammlung' }));
    refresh();
    expect(state.owned).toEqual({ 'BX-24-03': 1 });
    // Der Barcode bleibt bei der Packung – die nächste Packung kann etwas anderes enthalten
    expect(state.barcodes).toEqual({});
  });

  it('zeigt bei jedem möglichen Inhalt, ob er schon in der Sammlung ist', async () => {
    state = { ...EMPTY_STATE, owned: { 'BX-24-02': 1 } };
    const { sheet, scan } = open();
    await scan(BX24);
    expect(sheet().getByText(/BX-24-02/).closest('button')!.textContent).toContain('hast du schon');
    expect(sheet().getByText('BX-24-03').closest('button')!.textContent).not.toContain('hast du schon');
  });

  it('auch ein früher auf einen einzelnen Kreisel zugeordneter Barcode fragt nach dem Inhalt', async () => {
    state = { ...EMPTY_STATE, barcodes: { [UNKNOWN]: 'BX-24-03' } };
    const { sheet, scan } = open();
    await scan(UNKNOWN);
    expect(sheet().getByText('Welcher Kreisel ist drin?')).toBeTruthy();
  });

  it('selbst zugeordnet über die Suche: gemerkt wird die Packung, gezeigt der gewählte Kreisel', async () => {
    const { sheet, scan, refresh } = open();
    await scan(UNKNOWN);
    fireEvent.input(sheet().getByRole('searchbox', { name: 'Produkt suchen' }), { target: { value: 'BX-24-02' } });
    fireEvent.click(sheet().getByText('BX-24-02').closest('button')!);
    refresh();
    expect(state.barcodes).toEqual({ [UNKNOWN]: 'BX-24-01' });
    expect(sheet().queryByText('Welcher Kreisel ist drin?')).toBeNull();
    expect(sheet().getByRole('button', { name: 'In die Sammlung' })).toBeTruthy();
  });
});

describe('Packung scannen: unbekannter Barcode', () => {
  it('Vorderseite fotografieren: Die Produktnummer wird gelesen, der Barcode dazu gemerkt', async () => {
    const { sheet, scan, photo, refresh } = open();
    await scan(UNKNOWN);
    expect(document.querySelector('.scan-sheet')!.textContent).toContain(UNKNOWN);
    expect(sheet().getByText(/Vorne steht die Produktnummer/)).toBeTruthy();
    recognize.mockResolvedValue(result({ products: [prod('BX-05')], via: 'code', sure: true }));
    fireEvent.click(sheet().getByRole('button', { name: /Vorderseite fotografieren/ }));
    photo();
    await waitFor(() => expect(sheet().getByText('BX-05')).toBeTruthy());
    refresh();
    expect(state.barcodes).toEqual({ [UNKNOWN]: 'BX-05' });
    expect(sheet().getByRole('button', { name: 'In die Sammlung' })).toBeTruthy();
  });

  it('Vorderseite nicht lesbar: klare Rückmeldung, der Barcode bleibt – die Suche ordnet ihn zu', async () => {
    const { sheet, scan, photo, refresh } = open();
    await scan(UNKNOWN);
    recognize.mockResolvedValue(result({}));
    fireEvent.click(sheet().getByRole('button', { name: /Vorderseite fotografieren/ }));
    photo();
    await waitFor(() => expect(sheet().getByText(/Auf dem Foto war keine Produktnummer lesbar/)).toBeTruthy());
    expect(document.querySelector('.scan-sheet')!.textContent).toContain(UNKNOWN);
    fireEvent.input(sheet().getByRole('searchbox', { name: 'Produkt suchen' }), { target: { value: 'BX-03' } });
    fireEvent.click(sheet().getByText('BX-03').closest('button')!);
    refresh();
    expect(state.barcodes).toEqual({ [UNKNOWN]: 'BX-03' });
  });

  it('Foto ohne vorherigen Scan ordnet keinen alten Barcode zu', async () => {
    const { sheet, scan, refresh } = open();
    await scan(UNKNOWN);
    // Vorderseite angetippt, Kamera aber abgebrochen → „Nächste Packung“ … hier: Produkt über die Suche, dann neue Packung
    fireEvent.click(sheet().getByRole('button', { name: /Vorderseite fotografieren/ }));
    fireEvent.input(sheet().getByRole('searchbox', { name: 'Produkt suchen' }), { target: { value: 'BX-03' } });
    fireEvent.click(sheet().getByText('BX-03').closest('button')!);
    fireEvent.click(sheet().getByRole('button', { name: 'In die Sammlung' }));
    refresh();
    cleanup();
    state = { ...state, barcodes: {} };
    const next = open();
    recognize.mockResolvedValue(result({ products: [prod('BX-05')], via: 'code', sure: true }));
    fireEvent.click(next.sheet().getByRole('button', { name: /Packung fotografieren/ }));
    next.photo();
    await waitFor(() => expect(next.sheet().getByText('BX-05')).toBeTruthy());
    next.refresh();
    expect(state.barcodes).toEqual({});
  });

  it('Etikett des Ladens (Nummer beginnt mit 2): Hinweis statt Zuordnen – die Nummer wird nie gemerkt', async () => {
    const { sheet, scan, refresh } = open();
    await scan(STORE);
    expect(sheet().getByText(/ist ein Etikett des Ladens, kein Barcode des Herstellers/)).toBeTruthy();
    expect(sheet().queryByRole('button', { name: /Vorderseite fotografieren/ })).toBeNull();
    fireEvent.input(sheet().getByRole('searchbox', { name: 'Produkt suchen' }), { target: { value: 'BX-03' } });
    fireEvent.click(sheet().getByText('BX-03').closest('button')!);
    refresh();
    expect(sheet().getByRole('button', { name: 'In die Sammlung' })).toBeTruthy();
    expect(state.barcodes).toEqual({});
  });

  it('unbekannter Barcode mit Standbild: Die Produktnummer auf demselben Bild genügt', async () => {
    const { sheet, scan, refresh } = open();
    recognize.mockResolvedValue(result({ products: [prod('BX-05')], via: 'code', sure: true }));
    await scan(UNKNOWN, new Blob(['x'], { type: 'image/jpeg' }));
    await waitFor(() => expect(sheet().getByText('BX-05')).toBeTruthy());
    refresh();
    expect(state.barcodes).toEqual({ [UNKNOWN]: 'BX-05' });
  });
});
