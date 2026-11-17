import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { AppContext, type AppCtx } from '../src/lib/context';
import { BitImage, RatchetImage } from '../src/components/BitImage';
import { cutoutBlocked } from '../src/lib/cutout';
import type { Bit, Ratchet } from '../src/lib/types';

const BIT: Bit = { id: 'LF', name: 'Low Flat', type: 'attack' };
const RATCHET: Ratchet = { id: '3-60', contacts: 3, heightMm: 6 };
const photo = (name: string) => ({ thumb: `https://img.example/${name}.png`, page: 'https://wiki.example', title: name });

function Shell({ children, withPhotos = false }: { children: ComponentChildren; withPhotos?: boolean }) {
  return (
    <AppContext.Consumer>
      {(base: AppCtx) => (
        <AppContext.Provider value={{ ...base, images: { source: 'test', blades: {}, bits: withPhotos ? { LF: photo('bit') } : {}, ratchets: withPhotos ? { '3-60': photo('ratchet') } : {} } }}>
          {children}
        </AppContext.Provider>
      )}
    </AppContext.Consumer>
  );
}

afterEach(cleanup);

describe('Kartenfoto von Ratchet und Bit', () => {
  it('zeigt ohne Foto das Kürzel des Bits in der Typfarbe', () => {
    const { container } = render(<Shell><BitImage bit={BIT} size="card" /></Shell>);
    const box = container.querySelector('.part-photo')!;
    expect(box.className).toBe('part-photo part-photo-bit is-fallback');
    expect(box.querySelector('.bit-plaque.type-fg-attack')?.textContent).toBe('LF');
    expect(box.querySelector('img')).toBeNull();
  });

  it('zeigt ohne Foto das Ratchet-Emblem mit so vielen Zacken, wie der Ratchet hat', () => {
    const { container } = render(<Shell><RatchetImage ratchet={RATCHET} size="card" /></Shell>);
    expect(container.querySelector('.part-photo.part-photo-ratchet.is-fallback')).not.toBeNull();
    expect(container.querySelectorAll('.ratchet-tooth')).toHaveLength(3);
  });

  it('lässt die kleinen Bilder (Planer, Lexikon) unverändert', () => {
    const { container } = render(<Shell withPhotos><BitImage bit={BIT} size="md" /><RatchetImage ratchet={RATCHET} /></Shell>);
    expect(container.querySelector('.bit-img.bit-img-md img')?.getAttribute('crossorigin')).toBeNull();
    expect(container.querySelector('.bit-img.bit-img-sm img')).not.toBeNull();
    expect(container.querySelector('.part-photo')).toBeNull();
  });

  it('lädt das Foto mit Lesefreigabe und bleibt beim unveränderten Foto, wenn es sich nicht freistellen lässt', async () => {
    const { container } = render(<Shell withPhotos><RatchetImage ratchet={RATCHET} size="card" /></Shell>);
    const box = container.querySelector('.part-photo')!;
    expect(box.className).toBe('part-photo part-photo-ratchet is-plate is-loading');
    const first = box.querySelector('img')!;
    expect(first.getAttribute('crossorigin')).toBe('anonymous');
    expect(first.getAttribute('alt')).toBe('');
    // In der Testumgebung gibt es keine Zeichenfläche: Freistellen scheitert wie bei einem ungeeigneten Foto.
    fireEvent.load(first);
    await waitFor(() => expect(box.querySelector('img')?.getAttribute('crossorigin')).toBeNull());
    fireEvent.load(box.querySelector('img')!);
    expect(box.className).toBe('part-photo part-photo-ratchet is-plate');
    expect(cutoutBlocked()).toBe(false);
  });

  it('fällt ohne Lesefreigabe auf das unveränderte Foto zurück und merkt sich das für alle Fotos', () => {
    const { container } = render(<Shell withPhotos><BitImage bit={BIT} size="card" /></Shell>);
    const box = container.querySelector('.part-photo')!;
    fireEvent.error(box.querySelector('img')!);
    const plain = box.querySelector('img')!;
    expect(plain.getAttribute('crossorigin')).toBeNull();
    expect(box.className).toContain('is-loading');
    fireEvent.load(plain);
    expect(box.className).toBe('part-photo part-photo-bit is-plate');
    expect(cutoutBlocked()).toBe(true);
  });

  it('zeigt das Kürzel, wenn das Foto gar nicht lädt', () => {
    // Freistellen ist seit dem vorigen Test für diese Sitzung gesperrt: Das Foto wird gleich normal geladen.
    const { container } = render(<Shell withPhotos><BitImage bit={{ ...BIT, id: 'F', name: 'Flat' }} size="card" /></Shell>);
    expect(container.querySelector('.part-photo.is-fallback .bit-plaque')?.textContent).toBe('F');
    cleanup();
    const again = render(<Shell withPhotos><BitImage bit={BIT} size="card" /></Shell>);
    const img = again.container.querySelector('.part-photo img')!;
    expect(img.getAttribute('crossorigin')).toBeNull();
    fireEvent.error(img);
    expect(again.container.querySelector('.part-photo.is-fallback .bit-plaque')?.textContent).toBe('LF');
  });
});
