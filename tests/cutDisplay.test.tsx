import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { AppContext, type AppCtx } from '../src/lib/context';
import { BitImage, RatchetImage } from '../src/components/BitImage';
import { BladePhoto } from '../src/components/BeyImage';

// Freistell-Zwischenspeicher nachbilden: Ratchet-Foto war schon freigestellt (Original-Adresse),
// Bit- und Blade-Foto wurden im Gerät freigestellt (blob:-Adresse).
const RATCHET_SRC = 'https://img.example/ratchet.png';
const BIT_SRC = 'https://img.example/bit.png';
const BLADE_SRC = 'https://img.example/blade.png';
vi.mock('../src/lib/cutout', async (orig) => ({
  ...(await orig<typeof import('../src/lib/cutout')>()),
  cachedCutout: (src: string) => (src === RATCHET_SRC ? RATCHET_SRC : src === BIT_SRC ? 'blob:bit' : src === BLADE_SRC ? 'blob:blade' : undefined),
}));

const photo = (thumb: string) => ({ thumb, page: 'https://wiki.example', title: 'x' });
function Shell({ children }: { children: ComponentChildren }) {
  return (
    <AppContext.Consumer>
      {(base: AppCtx) => (
        <AppContext.Provider value={{ ...base, images: { source: 'test', blades: { DranSword: photo(BLADE_SRC) }, bits: { LF: photo(BIT_SRC) }, ratchets: { '3-60': photo(RATCHET_SRC) } } }}>
          {children}
        </AppContext.Provider>
      )}
    </AppContext.Consumer>
  );
}

afterEach(cleanup);

describe('Freigestelltes Foto anzeigen', () => {
  it('lädt ein schon freigestelltes Wiki-Foto mit derselben Lesefreigabe wie beim Freistellen', () => {
    const { container } = render(<Shell><RatchetImage ratchet={{ id: '3-60', contacts: 3, heightMm: 6 }} size="card" /></Shell>);
    const img = container.querySelector('.part-photo.is-cut img')!;
    expect(img.getAttribute('src')).toBe(RATCHET_SRC);
    expect(img.getAttribute('crossorigin')).toBe('anonymous');
  });

  it('zeigt ein im Gerät freigestelltes Bild ohne Lesefreigabe-Attribut', () => {
    const { container } = render(<Shell><BitImage bit={{ id: 'LF', name: 'Low Flat', type: 'attack' }} size="card" /></Shell>);
    const img = container.querySelector('.part-photo.is-cut img')!;
    expect(img.getAttribute('src')).toBe('blob:bit');
    expect(img.getAttribute('crossorigin')).toBeNull();
  });

  it('Ratchet/Bit: lässt sich das freigestellte Bild nicht anzeigen, kommt das unveränderte Foto statt eines kaputten Bildes', () => {
    const { container } = render(<Shell><RatchetImage ratchet={{ id: '3-60', contacts: 3, heightMm: 6 }} size="card" /></Shell>);
    fireEvent.error(container.querySelector('.part-photo.is-cut img')!);
    const box = container.querySelector('.part-photo')!;
    expect(box.className).toContain('is-plate');
    const plain = box.querySelector('img')!;
    expect(plain.getAttribute('src')).toBe(RATCHET_SRC);
    expect(plain.getAttribute('crossorigin')).toBeNull();
    // Scheitert auch das, bleibt das Emblem – nie ein Platzhalter für ein kaputtes Bild
    fireEvent.error(plain);
    expect(container.querySelector('.part-photo.is-fallback')).not.toBeNull();
  });

  it('Blade: lässt sich das freigestellte Bild nicht anzeigen, kommt der runde Ausschnitt', () => {
    const { container } = render(<Shell><BladePhoto blade={{ id: 'DranSword', type: 'attack' }} alt="" variant="card" /></Shell>);
    fireEvent.error(container.querySelector('.blade-photo.is-cut img')!);
    const box = container.querySelector('.blade-photo')!;
    expect(box.className).toContain('is-round');
    expect(box.querySelector('img')?.getAttribute('src')).toBe(BLADE_SRC);
  });
});
