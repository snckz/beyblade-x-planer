import { describe, expect, it } from 'vitest';
import { opaqueBounds, removeBackground } from '../src/lib/cutout';

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

/** Ring (Ratchet von oben): Scheibe mit Loch, durch das der Hintergrund scheint. */
function ring(size: number, bg: RGBA, colour: RGBA, outer: number, hole: number) {
  const px = image(size, () => bg, colour, outer);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (Math.hypot(x - c, y - c) <= hole) px.set(bg, (y * size + x) * 4);
  return px;
}
const BLACK: RGBA = [28, 28, 32, 255];

describe('removeBackground mit Optionen für Ratchets und Bits', () => {
  it('lässt das Loch eines Rings ohne Option stehen – Blade-Fotos behalten helle Stellen im Inneren', () => {
    const px = ring(96, WHITE, BLACK, 40, 14);
    expect(removeBackground(px, 96, 96)).not.toBeNull();
    expect(alpha(px, 96, 48, 48)).toBe(255);
  });

  it('entfernt mit `holes` auch den Hintergrund im Loch', () => {
    const px = ring(96, WHITE, BLACK, 40, 14);
    expect(removeBackground(px, 96, 96, { holes: true })).not.toBeNull();
    expect(alpha(px, 96, 48, 48)).toBe(0);
    expect(alpha(px, 96, 48, 20)).toBe(255); // der Ring selbst bleibt
    expect(alpha(px, 96, 0, 0)).toBe(0);
  });

  it('lässt kleine helle Flecken im Motiv trotz `holes` stehen (Glanzlicht, Aufdruck)', () => {
    const px = image(96, () => WHITE, BLACK, 40);
    for (let y = 46; y < 50; y++) for (let x = 46; x < 50; x++) px.set(WHITE, (y * 96 + x) * 4);
    expect(removeBackground(px, 96, 96, { holes: true })).not.toBeNull();
    expect(alpha(px, 96, 47, 47)).toBe(255);
  });

  it('lässt ein beschattetes Loch stehen – nur genau die Hintergrundfarbe zählt als Loch', () => {
    const px = ring(96, WHITE, BLACK, 40, 14);
    const c = 47.5;
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (Math.hypot(x - c, y - c) <= 14) px.set([214, 214, 216, 255], (y * 96 + x) * 4);
    expect(removeBackground(px, 96, 96, { holes: true })).not.toBeNull();
    expect(alpha(px, 96, 48, 48)).toBe(255);
  });

  it('erlaubt mit `maxRemoved` schlanke Motive mit viel Rand (Bit von der Seite)', () => {
    const slim = () => image(96, () => WHITE, BLUE, 20); // rund 86 % Hintergrund
    expect(removeBackground(slim(), 96, 96)).toBeNull();
    const px = slim();
    const r = removeBackground(px, 96, 96, { maxRemoved: 0.88 });
    expect(r!.removed).toBeGreaterThan(0.8);
    expect(alpha(px, 96, 48, 48)).toBe(255);
    expect(alpha(px, 96, 4, 48)).toBe(0);
  });

  /** Dunkle Scheibe mit hellgrauem Übergangsring – so sieht die geglättete Kante eines Fotos aus. */
  function fringed(inner: RGBA) {
    const px = image(96, () => WHITE, [205, 205, 207, 255], 40);
    const c = 47.5;
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (Math.hypot(x - c, y - c) <= 38) px.set(inner, (y * 96 + x) * 4);
    return px;
  }

  it('trägt mit `defringe` den hellen Saum an dunklen Kanten ab', () => {
    const plain = fringed(BLACK);
    expect(removeBackground(plain, 96, 96)).not.toBeNull();
    expect(alpha(plain, 96, 48, 9)).toBeGreaterThan(150); // ohne Option bleibt der Saum (bis auf die weiche Kante) deckend und hell
    expect(plain[(9 * 96 + 48) * 4]).toBe(205);

    const px = fringed(BLACK);
    expect(removeBackground(px, 96, 96, { defringe: true })).not.toBeNull();
    expect(alpha(px, 96, 48, 9)).toBeLessThan(60); // Saum fast durchsichtig …
    expect(px[(9 * 96 + 48) * 4]).toBe(28); // … und in der Farbe des Motivs
    expect(alpha(px, 96, 48, 20)).toBe(255); // das Motiv selbst bleibt deckend
    expect(px[(20 * 96 + 48) * 4]).toBe(28);
  });

  it('lässt helle Motive bei `defringe` unberührt', () => {
    const px = fringed([232, 232, 236, 255]);
    const before = px.slice();
    expect(removeBackground(px, 96, 96, { defringe: true })).not.toBeNull();
    for (const y of [9, 11, 20, 48]) {
      const i = (y * 96 + 48) * 4;
      expect([...px.slice(i, i + 3)]).toEqual([...before.slice(i, i + 3)]);
    }
  });

  it('lässt dünne Stege ohne Inneres bei `defringe` stehen', () => {
    // 5 Pixel breiter dunkler Balken quer durchs Bild: kein Pixel liegt tiefer als der Saum.
    const px = image(96, () => WHITE, null);
    for (let y = 46; y < 51; y++) for (let x = 10; x < 86; x++) px.set(BLACK, (y * 96 + x) * 4);
    expect(removeBackground(px, 96, 96, { defringe: true, maxRemoved: 0.99 })).not.toBeNull();
    expect(alpha(px, 96, 48, 48)).toBe(255);
    expect(px[(48 * 96 + 48) * 4]).toBe(28);
  });
});

describe('opaqueBounds', () => {
  it('findet das Rechteck um das Motiv, mit etwas Luft', () => {
    const px = new Uint8ClampedArray(100 * 100 * 4);
    for (let y = 30; y < 70; y++) for (let x = 40; x < 60; x++) px.set(BLUE, (y * 100 + x) * 4);
    expect(opaqueBounds(px, 100, 100)).toEqual({ x: 38, y: 28, w: 24, h: 44 });
  });

  it('übergeht fast durchsichtige Pixel (weiche Kante)', () => {
    const px = new Uint8ClampedArray(100 * 100 * 4);
    for (let y = 30; y < 70; y++) for (let x = 40; x < 60; x++) px.set(BLUE, (y * 100 + x) * 4);
    px.set([0, 0, 0, 12], (5 * 100 + 5) * 4);
    expect(opaqueBounds(px, 100, 100)).toEqual({ x: 38, y: 28, w: 24, h: 44 });
  });

  it('gibt null zurück, wenn nichts sichtbar ist oder das Motiv das Bild schon füllt', () => {
    expect(opaqueBounds(new Uint8ClampedArray(20 * 20 * 4), 20, 20)).toBeNull();
    const full = new Uint8ClampedArray(20 * 20 * 4).fill(255);
    expect(opaqueBounds(full, 20, 20)).toBeNull();
  });
});
