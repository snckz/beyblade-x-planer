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

export interface CutoutOptions {
  /** Auch eingeschlossene Hintergrundflächen entfernen – das Loch in der Mitte eines Rings (Ratchet). */
  holes?: boolean;
  /** Höchster Anteil, der als Hintergrund wegfallen darf. Schlanke Teile (Bits) lassen mehr Rand frei als eine Blade. */
  maxRemoved?: number;
  /**
   * Hellen Saum an dunklen Kanten abtragen: Randpixel, in denen sich Motiv und Hintergrund (oder ein Schatten) mischen,
   * werden entsprechend durchsichtig und bekommen die Farbe des Motivs. Helle Motive bleiben unberührt.
   */
  defringe?: boolean;
  /** Nur `cutoutFromImage`: durchsichtigen Rand abschneiden, damit jedes Teil seinen Rahmen gleich groß füllt. */
  trim?: boolean;
}

/** Saum: so viele Pixel tief wird die Kante geprüft; das Motiv dahinter liefert die Vergleichsfarbe. */
const FRINGE = 3;
/** Saum wird nur abgetragen, wenn das Motiv mindestens so viel dunkler ist als der Hintergrund … */
const FRINGE_CONTRAST = 40;
/** … und das Randpixel mindestens so viel heller als das Motiv dahinter. */
const FRINGE_LIGHTER = 16;

/** Eingeschlossene Fläche gilt erst ab diesem Anteil des Bildes als Loch (kleinere helle Flecken sind Glanzlichter). */
const MIN_HOLE = 0.004;

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
export function removeBackground(px: Uint8ClampedArray, w: number, h: number, options: CutoutOptions = {}): CutoutResult | null {
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
  const exact = options.holes ? new Uint8Array(n) : null; // nur „nah an der Randfarbe“, ohne Schatten
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
        if (exact) exact[i] = 1;
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

  // Löcher: eingeschlossene Flächen in genau der Randfarbe (kein Schatten), die groß genug für ein Loch sind.
  if (exact) {
    const seen = new Uint8Array(n);
    const minHole = Math.max(16, Math.round(n * MIN_HOLE));
    for (let start = 0; start < n; start++) {
      if (seen[start] || bg[start] || !open[start] || !exact[start]) continue;
      let len = 0;
      seen[start] = 1;
      stack[len++] = start;
      for (let at = 0; at < len; at++) {
        const i = stack[at]!;
        const x = i % w;
        const visit = (j: number) => {
          if (!seen[j] && !bg[j] && open[j] && exact[j]) {
            seen[j] = 1;
            stack[len++] = j;
          }
        };
        if (x > 0) visit(i - 1);
        if (x < w - 1) visit(i + 1);
        if (i >= w) visit(i - w);
        if (i < n - w) visit(i + w);
      }
      if (len >= minHole) for (let k = 0; k < len; k++) bg[stack[k]!] = 1;
    }
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
  if (removed < MIN_REMOVED || removed > (options.maxRemoved ?? MAX_REMOVED)) return null;

  if (options.defringe) defringe(px, w, h, bg, lum, (ref[0] + ref[1] + ref[2]) / 3);

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

/**
 * Trägt den hellen Saum ab, der beim Freistellen an dunklen Kanten stehen bleibt (Kantenglättung des Fotos, Schattenrest).
 * Für jedes Pixel bis FRINGE tief wird das nächste Pixel im Inneren des Motivs gesucht. Liegt die Helligkeit des Randpixels
 * zwischen Motiv und Hintergrund, ist es eine Mischung: Es wird anteilig durchsichtig und nimmt die Motivfarbe an.
 */
function defringe(px: Uint8ClampedArray, w: number, h: number, bg: Uint8Array, lum: Float32Array, bgLum: number): void {
  const n = w * h;
  // Abstand zum Hintergrund (1 … FRINGE + 1), 0 = Hintergrund, 255 = tiefer im Motiv
  const dist = new Uint8Array(n).fill(255);
  const neighbours = (i: number, visit: (j: number) => void) => {
    const x = i % w;
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (i >= w) visit(i - w);
    if (i < n - w) visit(i + w);
  };
  // Start: nur die Hintergrundpixel direkt an der Motivkante.
  let frontier: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!bg[i]) continue;
    dist[i] = 0;
    const x = i % w;
    if ((x > 0 && !bg[i - 1]) || (x < w - 1 && !bg[i + 1]) || (i >= w && !bg[i - w]) || (i < n - w && !bg[i + w])) frontier.push(i);
  }
  const band: number[] = [];
  for (let d = 1; d <= FRINGE + 1; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      neighbours(i, (j) => {
        if (dist[j] !== 255) return;
        dist[j] = d;
        next.push(j);
        if (d <= FRINGE) band.push(j);
      });
    }
    frontier = next;
  }
  // Vom Inneren (Abstand FRINGE + 1) zurück zur Kante: jedes Randpixel merkt sich sein nächstes Pixel im Motiv.
  const inner = new Int32Array(n).fill(-1);
  for (const i of frontier) inner[i] = i;
  for (let d = FRINGE; d >= 1; d--) {
    const next: number[] = [];
    for (const i of frontier) {
      neighbours(i, (j) => {
        if (dist[j] !== d || inner[j]! >= 0) return;
        inner[j] = inner[i]!;
        next.push(j);
      });
    }
    frontier = next;
  }
  for (const i of band) {
    const k = inner[i]!;
    if (k < 0) continue; // dünner Steg ohne Inneres: nicht anfassen
    const span = bgLum - lum[k]!;
    if (span < FRINGE_CONTRAST || lum[i]! < lum[k]! + FRINGE_LIGHTER) continue;
    const keep = Math.max(0, Math.min(1, (bgLum - lum[i]!) / span));
    px[i * 4] = px[k * 4]!;
    px[i * 4 + 1] = px[k * 4 + 1]!;
    px[i * 4 + 2] = px[k * 4 + 2]!;
    px[i * 4 + 3] = Math.round(px[i * 4 + 3]! * keep);
  }
}

/**
 * Rechteck um alles Sichtbare (Deckkraft über 8 %), mit etwas Luft. `null`, wenn nichts sichtbar ist
 * oder das Motiv das Bild ohnehin fast füllt (Abschneiden lohnt nicht).
 */
export function opaqueBounds(px: Uint8ClampedArray, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3]! <= 20) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const pad = Math.ceil(Math.max(x1 - x0 + 1, y1 - y0 + 1) * 0.03);
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  if (bw * bh > w * h * 0.94) return null;
  return { x: x0, y: y0, w: bw, h: bh };
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
 * Das Ergebnis wird je Foto-Adresse gemerkt – dieselbe Adresse also immer mit denselben Optionen freistellen.
 */
export async function cutoutFromImage(img: HTMLImageElement, src: string, options: CutoutOptions = {}): Promise<string | null> {
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
      const done = removeBackground(data.data, w, h, options);
      const box = done && options.trim ? opaqueBounds(data.data, w, h) : null;
      if (done?.native && !box) {
        result = src; // schon freigestellt: Original verwenden
      } else if (done) {
        if (box) {
          // Auf das Motiv zuschneiden: Die Leinwand bekommt die Größe des Ausschnitts.
          canvas.width = box.w;
          canvas.height = box.h;
          ctx.putImageData(data, -box.x, -box.y);
        } else {
          ctx.putImageData(data, 0, 0);
        }
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
