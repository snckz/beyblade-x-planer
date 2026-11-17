import { describe, expect, it } from 'vitest';
import { removeBackground } from '../src/lib/cutout';

type RGBA = [number, number, number, number];

/** Baut ein Testbild: Hintergrund je Pixel, darauf eine farbige Scheibe in der Mitte. */
function image(size: number, bg: (x: number, y: number) => RGBA, disc: RGBA | null, radius = size * 0.42) {
  const px = new Uint8ClampedArray(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = disc && Math.hypot(x - c, y - c) <= radius;
      px.set(inside ? disc : bg(x, y), (y * size + x) * 4);
    }
  }
  return px;
}
const alpha = (px: Uint8ClampedArray, size: number, x: number, y: number) => px[(y * size + x) * 4 + 3];
const WHITE: RGBA = [255, 255, 255, 255];
const BLUE: RGBA = [30, 80, 200, 255];

describe('removeBackground', () => {
  it('entfernt weißen Hintergrund und lässt das Motiv stehen', () => {
    const px = image(64, () => WHITE, BLUE);
    const r = removeBackground(px, 64, 64);
    expect(r?.native).toBe(false);
    expect(r!.removed).toBeGreaterThan(0.4);
    expect(alpha(px, 64, 0, 0)).toBe(0);
    expect(alpha(px, 64, 62, 2)).toBe(0);
    expect(alpha(px, 64, 32, 32)).toBe(255);
  });

  it('folgt einem leicht getönten Verlauf (247 oben, 236 unten)', () => {
    const px = image(64, (_x, y) => {
      const v = Math.round(247 - (11 * y) / 63);
      return [v, v - 1, v + 4, 255];
    }, BLUE);
    expect(removeBackground(px, 64, 64)).not.toBeNull();
    expect(alpha(px, 64, 2, 2)).toBe(0);
    expect(alpha(px, 64, 2, 61)).toBe(0);
    expect(alpha(px, 64, 32, 32)).toBe(255);
  });

  it('lässt helle Stellen im Inneren stehen (Aufkleber, Glanzlicht)', () => {
    const px = image(64, () => WHITE, BLUE);
    for (let y = 29; y <= 35; y++) for (let x = 29; x <= 35; x++) px.set(WHITE, (y * 64 + x) * 4);
    removeBackground(px, 64, 64);
    expect(alpha(px, 64, 32, 32)).toBe(255);
  });

  it('läuft nicht durch eine dünne helle Linie ins Motiv', () => {
    const px = image(64, () => WHITE, BLUE);
    // 1 Pixel breiter weißer Strich vom Rand der Scheibe bis zu einem weißen Fleck in der Mitte
    for (let x = 32; x < 64; x++) px.set(WHITE, (32 * 64 + x) * 4);
    for (let y = 28; y <= 36; y++) for (let x = 24; x <= 32; x++) px.set(WHITE, (y * 64 + x) * 4);
    removeBackground(px, 64, 64);
    expect(alpha(px, 64, 28, 32)).toBe(255);
  });

  it('weicht die Kante auf, statt hart abzuschneiden', () => {
    const px = image(96, () => WHITE, BLUE);
    removeBackground(px, 96, 96);
    const row = Array.from({ length: 96 }, (_, x) => alpha(px, 96, x, 48)!);
    expect(row.some((a) => a > 0 && a < 255)).toBe(true);
  });

  it('fasst Fotos mit dunklem oder buntem Hintergrund nicht an', () => {
    const dark = image(64, () => [20, 22, 30, 255], BLUE);
    const before = dark.slice();
    expect(removeBackground(dark, 64, 64)).toBeNull();
    expect(dark).toEqual(before);
    const pink = image(64, () => [255, 200, 220, 255], BLUE);
    expect(removeBackground(pink, 64, 64)).toBeNull();
  });

  it('erkennt schon freigestellte Fotos und verändert sie nicht', () => {
    const px = image(64, () => [0, 0, 0, 0], BLUE);
    const before = px.slice();
    expect(removeBackground(px, 64, 64)).toEqual({ removed: 0, native: true });
    expect(px).toEqual(before);
  });

  it('gibt auf, wenn fast alles oder fast nichts Hintergrund wäre', () => {
    // ganz weißes Bild: alles wäre Hintergrund
    expect(removeBackground(image(64, () => WHITE, null), 64, 64)).toBeNull();
    // Motiv füllt das Bild bis auf einen dünnen hellen Rand
    const full = image(64, () => WHITE, null);
    for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) full.set(BLUE, (y * 64 + x) * 4);
    expect(removeBackground(full, 64, 64)).toBeNull();
  });

  it('lehnt zu kleine oder unvollständige Daten ab', () => {
    expect(removeBackground(new Uint8ClampedArray(16), 2, 2)).toBeNull();
    expect(removeBackground(new Uint8ClampedArray(10), 64, 64)).toBeNull();
  });
});
