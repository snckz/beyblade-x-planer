// Kauf-Check: Navigationsstapel (Zurück, Neuer Check, Schließen) und Rückmeldungen der Erkennung.
// Die Erkennung selbst ist hier ersetzt (eigene Tests in packRecognition.test.ts); geprüft wird, was die Oberfläche daraus macht.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/preact';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Database, Product } from '../src/lib/types';
import { EMPTY_STATE, type UserState } from '../src/lib/storage';
import type { PhotoResult } from '../src/lib/photo';

const recognize = vi.fn<(...args: unknown[]) => Promise<PhotoResult>>();
vi.mock('../src/lib/photo', async (orig) => ({ ...(await orig<typeof import('../src/lib/photo')>()), recognizePhoto: (...a: unknown[]) => recognize(...a) }));
const { PhotoCheck } = await import('../src/components/PhotoCheck');

const db = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/db.json'), 'utf8')) as Database;
const prod = (code: string) => db.products.find((p) => p.code === code) as Product;
const result = (r: Partial<PhotoResult>): PhotoResult => ({ products: [], barcode: null, barcodeFrom: null, text: '', via: 'none', sure: false, ...r });

let state: UserState;
const update = (fn: (s: UserState) => UserState) => (state = fn(state));

function open(onClose = vi.fn(), initialCode?: string) {
  const view = render(<PhotoCheck db={db} state={state} update={update} meta={null} onClose={onClose} initialCode={initialCode} />);
  const root = document.querySelector<HTMLElement>('.live.shop')!;
  const top = () => within(root.querySelector<HTMLElement>('.kc-page:not(.kc-under)')!);
  const bar = within(root.querySelector<HTMLElement>('.live-bar')!);
  return { view, root, top, bar, onClose };
}
const pickPhoto = (root: HTMLElement) => {
  const input = root.querySelector<HTMLInputElement>('input[type=file]:not([capture])')!;
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })], configurable: true });
  fireEvent.change(input);
};

beforeEach(() => {
  state = { ...EMPTY_STATE };
  recognize.mockReset();
  // Bewegung reduzieren: Übergänge sofort (Logik bleibt dieselbe)
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(cleanup);

describe('Kauf-Check: Navigation', () => {
  it('Suche → Ergebnis → Zurück: Eingabe mit Suchtext, Kauf-Check bleibt offen', async () => {
    const { top, bar, onClose } = open();
    expect(bar.getByRole('button', { name: 'Schließen' })).toBeTruthy();
    fireEvent.input(top().getByRole('searchbox'), { target: { value: 'BX-01' } });
    fireEvent.click(top().getAllByRole('button').find((b) => b.textContent?.includes('BX-01'))!);
    expect(document.querySelector('.kc-page:not(.kc-under) .photo-result')).toBeTruthy();
    fireEvent.click(bar.getByRole('button', { name: 'Zurück' }));
    await waitFor(() => expect(document.querySelector('.kc-page:not(.kc-under) .photo-result')).toBeNull());
    expect((top().getByRole('searchbox') as HTMLInputElement).value).toBe('BX-01');
    expect(bar.getByRole('button', { name: 'Schließen' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Neuer Check: zurück auf leere Eingabe; nur „Schließen“ schließt', async () => {
    const { top, bar, onClose } = open();
    fireEvent.input(top().getByRole('searchbox'), { target: { value: 'BX-01' } });
    fireEvent.click(top().getAllByRole('button').find((b) => b.textContent?.includes('BX-01'))!);
    fireEvent.click(bar.getByRole('button', { name: 'Neuer Check' }));
    expect((top().getByRole('searchbox') as HTMLInputElement).value).toBe('');
    expect(top().getByRole('button', { name: 'Foto machen' })).toBeTruthy();
    expect(top().getByRole('button', { name: 'Aus der Galerie wählen' })).toBeTruthy();
    expect(top().getByRole('button', { name: /Barcode live scannen/ })).toBeTruthy();
    fireEvent.click(bar.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('„Kaufen?“-Einstieg: Ergebnis ist die erste Ebene, oben links „Schließen“', () => {
    const { bar, onClose } = open(vi.fn(), 'BX-01');
    expect(document.querySelector('.photo-result')).toBeTruthy();
    fireEvent.click(bar.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Mehrere Treffer → Ergebnis → Zurück → Auswahl → Zurück → Eingabe', async () => {
    recognize.mockResolvedValue(result({ products: [prod('F9580'), prod('BX-01')], via: 'name', sure: true }));
    const { root, top, bar } = open();
    pickPhoto(root);
    await waitFor(() => expect(top().getByText('Mehrere Treffer – welche ist es?')).toBeTruthy());
    fireEvent.click(top().getAllByRole('button').find((b) => b.textContent?.includes('F9580'))!);
    expect(document.querySelector('.kc-page:not(.kc-under) .photo-result')).toBeTruthy();
    fireEvent.click(bar.getByRole('button', { name: 'Zurück' }));
    await waitFor(() => expect(top().getByText('Mehrere Treffer – welche ist es?')).toBeTruthy());
    fireEvent.click(bar.getByRole('button', { name: 'Zurück' }));
    await waitFor(() => expect(top().getByRole('button', { name: 'Foto machen' })).toBeTruthy());
  });

  it('Zurück während der Erkennung: kein veraltetes Ergebnis danach', async () => {
    let finish!: (r: PhotoResult) => void;
    recognize.mockReturnValue(new Promise((r) => (finish = r)));
    const { root, top, bar } = open();
    pickPhoto(root);
    await waitFor(() => expect(top().getByRole('status')).toBeTruthy());
    fireEvent.click(bar.getByRole('button', { name: 'Zurück' }));
    await waitFor(() => expect(top().getByRole('button', { name: 'Foto machen' })).toBeTruthy());
    finish(result({ products: [prod('BX-01')], via: 'code', sure: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelector('.photo-result')).toBeNull();
    expect(top().getByRole('button', { name: 'Foto machen' })).toBeTruthy();
  });
});

describe('Kauf-Check: Rückmeldung der Erkennung', () => {
  it('gelesener, unbekannter Barcode: Nummer sichtbar, „nicht zugeordnet“ – Auswahl lernt ihn', async () => {
    recognize.mockResolvedValue(result({ barcode: '4904810912347', barcodeFrom: 'scan' }));
    const { root, top } = open();
    pickPhoto(root);
    await waitFor(() => expect(top().getByText('Barcode gelesen – aber noch keinem Produkt zugeordnet.')).toBeTruthy());
    expect(root.querySelector('.barcode-note')!.textContent).toContain('4904810912347');
    fireEvent.input(top().getByRole('textbox', { name: 'Packung suchen' }), { target: { value: 'BX-03' } });
    fireEvent.click(top().getAllByRole('button').find((b) => b.textContent?.includes('BX-03'))!);
    expect(state.barcodes['4904810912347']).toBe('BX-03');
  });

  it('unbekannter Barcode → „Vorderseite fotografieren“: Produktnummer gelesen, Barcode dazu gemerkt', async () => {
    recognize.mockResolvedValueOnce(result({ barcode: '4904810912347', barcodeFrom: 'scan' }));
    const { root, top } = open();
    pickPhoto(root);
    await waitFor(() => expect(top().getByRole('button', { name: /Vorderseite fotografieren/ })).toBeTruthy());
    // Foto der Vorderseite: kein Barcode darauf, aber die Produktnummer
    recognize.mockResolvedValueOnce(result({ products: [prod('BX-05')], via: 'code', sure: true }));
    fireEvent.click(top().getByRole('button', { name: /Vorderseite fotografieren/ }));
    const cam = root.querySelector<HTMLInputElement>('input[type=file][capture]')!;
    Object.defineProperty(cam, 'files', { value: [new File(['x'], 'vorne.jpg', { type: 'image/jpeg' })], configurable: true });
    fireEvent.change(cam);
    await waitFor(() => expect(document.querySelector('.kc-page:not(.kc-under) .photo-result')).toBeTruthy());
    expect(state.barcodes['4904810912347']).toBe('BX-05');
  });

  it('Vorderseite nicht lesbar: Rückmeldung, der Barcode bleibt zum Zuordnen stehen', async () => {
    recognize.mockResolvedValueOnce(result({ barcode: '4904810912347', barcodeFrom: 'scan' }));
    const { root, top } = open();
    pickPhoto(root);
    await waitFor(() => expect(top().getByRole('button', { name: /Vorderseite fotografieren/ })).toBeTruthy());
    recognize.mockResolvedValueOnce(result({}));
    fireEvent.click(top().getByRole('button', { name: /Vorderseite fotografieren/ }));
    const cam = root.querySelector<HTMLInputElement>('input[type=file][capture]')!;
    Object.defineProperty(cam, 'files', { value: [new File(['x'], 'vorne.jpg', { type: 'image/jpeg' })], configurable: true });
    fireEvent.change(cam);
    await waitFor(() => expect(top().getByText(/Auf dem Foto war keine Produktnummer lesbar/)).toBeTruthy());
    expect(root.querySelector('.kc-page:not(.kc-under) .barcode-note')!.textContent).toContain('4904810912347');
    fireEvent.input(top().getByRole('textbox', { name: 'Packung suchen' }), { target: { value: 'BX-03' } });
    fireEvent.click(top().getAllByRole('button').find((b) => b.textContent?.includes('BX-03'))!);
    expect(state.barcodes['4904810912347']).toBe('BX-03');
  });

  it('ein normales Foto danach übernimmt keinen alten Barcode', async () => {
    recognize.mockResolvedValueOnce(result({ barcode: '4904810912347', barcodeFrom: 'scan' }));
    const { root, top, bar } = open();
    pickPhoto(root);
    await waitFor(() => expect(top().getByRole('button', { name: /Vorderseite fotografieren/ })).toBeTruthy());
    // angetippt, Kamera aber abgebrochen → neuer Check mit einem ganz anderen Foto
    fireEvent.click(top().getByRole('button', { name: /Vorderseite fotografieren/ }));
    fireEvent.click(bar.getByRole('button', { name: 'Neuer Check' }));
    recognize.mockResolvedValueOnce(result({ products: [prod('BX-05')], via: 'code', sure: true }));
    fireEvent.click(top().getByRole('button', { name: 'Aus der Galerie wählen' }));
    pickPhoto(root);
    await waitFor(() => expect(document.querySelector('.kc-page:not(.kc-under) .photo-result')).toBeTruthy());
    expect(state.barcodes).toEqual({});
  });

  it('Etikett des Ladens: Hinweis, kein „Vorderseite fotografieren“, die Nummer wird nie gemerkt', async () => {
    recognize.mockResolvedValue(result({ barcode: '2000000123455', barcodeFrom: 'scan' }));
    const { root, top } = open();
    pickPhoto(root);
    await waitFor(() => expect(top().getByText('Das ist ein Etikett des Ladens.')).toBeTruthy());
    expect(root.querySelector('.barcode-note')!.textContent).toContain('kein Barcode des Herstellers');
    expect(top().queryByRole('button', { name: /Vorderseite fotografieren/ })).toBeNull();
    fireEvent.input(top().getByRole('textbox', { name: 'Packung suchen' }), { target: { value: 'BX-03' } });
    fireEvent.click(top().getAllByRole('button').find((b) => b.textContent?.includes('BX-03'))!);
    expect(document.querySelector('.kc-page:not(.kc-under) .photo-result')).toBeTruthy();
    expect(state.barcodes).toEqual({});
  });

  it('nichts lesbar: „Keine Packung erkannt“ (kein Barcode genannt)', async () => {
    recognize.mockResolvedValue(result({}));
    const { root, top } = open();
    pickPhoto(root);
    await waitFor(() => expect(top().getByText('Keine Packung erkannt.')).toBeTruthy());
    expect(root.querySelector('.barcode-note')).toBeNull();
  });

  it('aus dem Text gelesene Barcode-Ziffern werden nie gelernt', async () => {
    recognize.mockResolvedValue(result({ barcode: '4904810912347', barcodeFrom: 'text' }));
    const { root, top } = open();
    pickPhoto(root);
    await waitFor(() => expect(root.querySelector('.barcode-note')).toBeTruthy());
    fireEvent.input(top().getByRole('textbox', { name: 'Packung suchen' }), { target: { value: 'BX-03' } });
    fireEvent.click(top().getAllByRole('button').find((b) => b.textContent?.includes('BX-03'))!);
    expect(state.barcodes['4904810912347']).toBeUndefined();
  });

  it('unsicherer Namens-Treffer (nur Teilname + Kombo) wird nie direkt übernommen', async () => {
    recognize.mockResolvedValue(result({ products: [prod('BX-01')], via: 'name', sure: false }));
    const { root, top } = open();
    pickPhoto(root);
    await waitFor(() => expect(top().getByText('Ist es eine dieser Packungen?')).toBeTruthy());
    expect(document.querySelector('.photo-result')).toBeNull();
  });

  it('sicherer Produktcode mit gescanntem Barcode → Ergebnis, Barcode gelernt', async () => {
    recognize.mockResolvedValue(result({ products: [prod('BX-05')], via: 'code', sure: true, barcode: '4904810912347', barcodeFrom: 'scan' }));
    const { root } = open();
    pickPhoto(root);
    await waitFor(() => expect(document.querySelector('.photo-result')).toBeTruthy());
    expect(state.barcodes['4904810912347']).toBe('BX-05');
  });
});
