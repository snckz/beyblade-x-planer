/**
 * Stellt ein Produktfoto im Browser frei: Der helle, einfarbige Hintergrund wird vom Bildrand her entfernt.
 * Das Foto bleibt beim Wiki (nur verlinkt) – gerechnet wird ausschließlich im Gerät des Nutzers.
 *
 * Grenzen: Es wird nur entfernt, was mit dem Rand zusammenhängt. Helle Stellen im Inneren (Aufkleber, Glanzlichter)
 * bleiben. Fotos ohne hellen, gleichmäßigen Rand (dunkler oder bunter Hintergrund) werden nicht angefasst.
 */

/** Ab dieser Helligkeit (kleinster Farbkanal, 0–255) gilt ein Pixel als möglicher Hintergrund. */
const LIGHT = 198;
/** Größter erlaubter Unterschied zwischen den Farbkanälen: Hintergrund ist farblos. */
const CHROMA = 16;
/** So weit darf ein Pixel von der Randfarbe abweichen. */
const TOLERANCE = 12;
/** Weiche Schatten: hell, farblos und ohne Kante (Helligkeitssprung zum Nachbarn höchstens so groß). */
const SMOOTH = 4;
/** Anteil des Bildes, der als Hintergrund wegfallen darf. Darunter oder darüber stimmt etwas nicht. */
const MIN_REMOVED = 0.06;
const MAX_REMOVED = 0.62;

export interface CutoutResult {
  /** Anteil der entfernten Pixel (0–1) */
  removed: number;
  /** true: Das Foto war schon freigestellt (durchsichtiger Rand) und blieb unverändert. */
  native: boolean;
}

/**
 * Entfernt den Hintergrund direkt in den RGBA-Daten (`px` wird verändert).
 * Rückgabe `null`: nicht freistellbar – die Daten bleiben unverändert.
 */
export function removeBackground(px: Uint8ClampedArray, w: number, h: number): CutoutResult | null {
  const n = w * h;
  if (w < 8 || h < 8 || px.length < n * 4) return null;

  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);

  // Schon freigestellt? Dann ist der Rand durchsichtig.
  let clear = 0;
  for (const i of border) if (px[i * 4 + 3]! < 24) clear++;
  if (clear >= border.length * 0.5) return { removed: 0, native: true };

  const light = (i: number) => {
    const r = px[i * 4]!, g = px[i * 4 + 1]!, b = px[i * 4 + 2]!;
    const mn = Math.min(r, g, b);
    return px[i * 4 + 3]! >= 250 && mn >= LIGHT && Math.max(r, g, b) - mn <= CHROMA;
  };

  // Randfarbe: Median der hellen Randpixel. Ist der Rand nicht überwiegend hell, gibt es nichts freizustellen.
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (const i of border) {
    if (!light(i)) continue;
    rs.push(px[i * 4]!);
    gs.push(px[i * 4 + 1]!);
    bs.push(px[i * 4 + 2]!);
  }
  if (rs.length < border.length * 0.6) return null;
  const median = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1]!;
  const ref = [median(rs), median(gs), median(bs)] as const;

  // Kandidaten: nah an der Randfarbe – oder weicher Schatten (hell, farblos, keine Kante).
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = (px[i * 4]! + px[i * 4 + 1]! + px[i * 4 + 2]!) / 3;
  const cand = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const near =
        px[i * 4 + 3]! >= 250 &&
        Math.abs(px[i * 4]! - ref[0]) <= TOLERANCE &&
        Math.abs(px[i * 4 + 1]! - ref[1]) <= TOLERANCE &&
        Math.abs(px[i * 4 + 2]! - ref[2]) <= TOLERANCE;
      if (near) {
        cand[i] = 1;
        continue;
      }
      if (!light(i)) continue;
      const gx = x > 0 && x < w - 1 ? Math.abs(lum[i + 1]! - lum[i - 1]!) : 0;
      const gy = y > 0 && y < h - 1 ? Math.abs(lum[i + w]! - lum[i - w]!) : 0;
      if (Math.max(gx, gy) <= SMOOTH) cand[i] = 1;
    }
  }

  // Um 1 Pixel schrumpfen: Durch dünne helle Linien (Glanzkanten) läuft die Füllung nicht ins Motiv.
  const open = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!cand[i]) continue;
      if ((x > 0 && !cand[i - 1]) || (x < w - 1 && !cand[i + 1]) || (y > 0 && !cand[i - w]) || (y < h - 1 && !cand[i + w])) continue;
      open[i] = 1;
    }
  }

  // Vom Rand her füllen.
  let bg = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  for (const i of border) {
    if (open[i] && !bg[i]) {
      bg[i] = 1;
      stack[top++] = i;
    }
  }
  while (top > 0) {
    const i = stack[--top]!;
    const x = i % w;
    if (x > 0 && open[i - 1] && !bg[i - 1]) { bg[i - 1] = 1; stack[top++] = i - 1; }
    if (x < w - 1 && open[i + 1] && !bg[i + 1]) { bg[i + 1] = 1; stack[top++] = i + 1; }
    if (i >= w && open[i - w] && !bg[i - w]) { bg[i - w] = 1; stack[top++] = i - w; }
    if (i < n - w && open[i + w] && !bg[i + w]) { bg[i + w] = 1; stack[top++] = i + w; }
  }

  // Zwei Pixel zurückwachsen: gleicht das Schrumpfen aus und nimmt den hellen Saum an der Motivkante mit.
  for (let pass = 0; pass < 2; pass++) {
    const grown = new Uint8Array(bg);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (bg[i]) continue;
        if ((x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w])) grown[i] = 1;
      }
    }
    bg = grown;
  }

  let removedCount = 0;
  for (let i = 0; i < n; i++) removedCount += bg[i]!;
  const removed = removedCount / n;
  if (removed < MIN_REMOVED || removed > MAX_REMOVED) return null;

  // Kante weichzeichnen (3×3), damit sie auf dunklem Grund nicht ausfranst.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let sum = 0, cnt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += bg[yy * w + xx]!;
          cnt++;
        }
      }
      if (sum === 0) continue;
      const keep = 1 - sum / cnt;
      px[i * 4 + 3] = Math.round(px[i * 4 + 3]! * keep);
    }
  }
  return { removed, native: false };
}

// ---- Browser-Teil: Foto laden, freistellen, als Bild-Adresse zurückgeben -------------------------------------------

/** Ergebnis je Foto-Adresse: Adresse des freigestellten Bildes oder `null` (nicht freistellbar). */
const cache = new Map<string, string | null>();
/**
 * Das Wiki erlaubt das Auslesen der Bilddaten nicht (kein CORS) – dann gar nicht erst versuchen.
 * Gemerkt nur für diese Sitzung: Beim nächsten Start der App wird es erneut probiert.
 */
const BLOCKED_KEY = 'bxplaner:cutout-blocked';
let blocked: boolean | null = null;
let canvas: HTMLCanvasElement | null = null;

export function cutoutBlocked(): boolean {
  if (blocked === null) {
    try {
      blocked = sessionStorage.getItem(BLOCKED_KEY) === '1';
    } catch {
      blocked = false;
    }
  }
  return blocked;
}
/**
 * Vom Aufrufer zu melden: Das Foto lädt normal, aber nicht mit Lesefreigabe.
 * Ohne Netz zählt das nicht – dann kam das Foto nur aus dem Zwischenspeicher.
 */
export function markCutoutBlocked(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  blocked = true;
  try {
    sessionStorage.setItem(BLOCKED_KEY, '1');
  } catch {
    /* Speicher blockiert: gilt dann bis zum Neuladen */
  }
}
export const cachedCutout = (src: string): string | null | undefined => cache.get(src);

/** Größte Kantenlänge, die gerechnet wird (größere Fotos werden dafür verkleinert). */
const MAX_SIDE = 720;

/**
 * Stellt ein fertig geladenes Bild (mit `crossorigin="anonymous"`) frei.
 * Rückgabe: Adresse des freigestellten Bildes; `null`, wenn es nicht freistellbar ist oder der Browser es nicht zulässt.
 */
export async function cutoutFromImage(img: HTMLImageElement, src: string): Promise<string | null> {
  const known = cache.get(src);
  if (known !== undefined) return known;
  let result: string | null = null;
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas ??= document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      const done = removeBackground(data.data, w, h);
      if (done?.native) {
        result = src; // schon freigestellt: Original verwenden
      } else if (done) {
        ctx.putImageData(data, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) => canvas!.toBlob(resolve, 'image/png'));
        result = blob ? URL.createObjectURL(blob) : null;
      }
    }
  } catch {
    // Bilddaten nicht lesbar (Sicherheitsfehler) oder Speicher knapp: beim normalen Foto bleiben.
    result = null;
  }
  cache.set(src, result);
  return result;
}
