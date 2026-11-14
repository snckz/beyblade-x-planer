// Foto-Check: Packung fotografieren → Produkt erkennen.
// 1. Barcode auf dem Foto (nur wenn er schon einmal einem Produkt zugeordnet wurde)
// 2. Texterkennung (Tesseract, läuft auf dem Gerät): Produktcode wie „BX-05“ (Takara Tomy)
// 3. sonst Blade-Namen im Text („SWORD DRAN“ – z. B. auf Hasbro-Packungen ohne BX-Code)
import type { Database, Product } from './types';
import { createDetector, normalizeGtin, validGtin } from './barcode';

const BUYABLE = new Set<Product['kind']>(['starter', 'booster', 'random-booster', 'set']);

/** OCR liest gern O statt 0, I/l statt 1, S statt 5, B statt 8 – nur innerhalb der Ziffern korrigieren. */
const digits = (s: string) => s.replace(/[Oo]/g, '0').replace(/[IiLl|]/g, '1').replace(/S/g, '5').replace(/B/g, '8');

/** Produktcodes im erkannten Text, z. B. „BX-05“, „UX 12“, „CX-O3“ → Produkte aus der Datenbank. */
export function findByCode(text: string, db: Pick<Database, 'products'>): Product[] {
  const found: Product[] = [];
  // „8“ statt „B“ nur mit direktem Bindestrich („8X-05“), sonst passen Maßangaben wie „8 x 14“.
  const re = /\b(?:([BUC])\s*[X×]\s*[-–—_.:]?\s*|(8)[X×][-–—_.:]\s*)([0-9OIL|SB]{2,3})(?:\s*[-–]\s*([0-9OIL]{2}))?(?![0-9])/g;
  const lookup = (code: string, sub: string | null) =>
    db.products.filter((p) => BUYABLE.has(p.kind) && (sub ? p.code === sub : p.code === code || p.code.startsWith(`${code}-`)));
  for (const m of text.toUpperCase().matchAll(re)) {
    const series = `${m[1] ?? 'B'}X`;
    const raw = digits(m[3]!);
    if (!/^\d{2,3}$/.test(raw)) {
      // z. B. „BX-05B“ (Leerzeichen vor „BOOSTER“ verschluckt) → die ersten zwei Zeichen probieren
      if (!/^\d{2}/.test(raw)) continue;
    }
    const sub = m[4] ? digits(m[4]) : null;
    let hits = /^\d{2,3}$/.test(raw) ? lookup(`${series}-${raw}`, sub ? `${series}-${raw}-${sub}` : null) : [];
    // 3-stellig ohne Treffer („BX-015“ aus „BX-01S“) → mit 2 Stellen nochmal
    if (!hits.length && raw.length === 3) hits = lookup(`${series}-${raw.slice(0, 2)}`, null);
    for (const p of hits) if (!found.includes(p)) found.push(p);
  }
  return found;
}

const words = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);

/** Blade-Namen (japanisch oder Hasbro) im Text: alle Wörter des Namens müssen vorkommen. */
export function findByName(text: string, db: Pick<Database, 'products' | 'blades'>): Product[] {
  const seen = new Set(words(text));
  const blades = db.blades.filter((b) =>
    [b.name, b.hasbroName].some((n) => {
      const w = n ? words(n) : [];
      return w.length >= 2 && w.every((x) => seen.has(x));
    }),
  );
  return db.products.filter((p) => BUYABLE.has(p.kind) && blades.some((b) => b.id === p.bladeId));
}

export interface PhotoResult {
  products: Product[];
  barcode: string | null;
  text: string;
  via: 'barcode' | 'code' | 'name' | 'none';
}

/** Foto laden, drehen (EXIF), verkleinern und kontrastreicher machen – Tesseract liest so deutlich besser. */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => createImageBitmap(file));
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

function grayscale(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    const v = Math.max(0, Math.min(255, (y - 128) * 1.5 + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

type OcrWorker = { recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string } }>; setParameters: (p: Record<string, string>) => Promise<unknown> };
let worker: Promise<OcrWorker> | null = null;

const ocrBase = () => new URL(__OCR_DIR__, document.baseURI).href;

// Fortschritt über eine Modul-Variable – so bekommt auch ein später geöffneter Foto-Check die Ladeanzeige.
let progressCb: ((p: number) => void) | undefined;

/** Texterkennung einmalig starten (lädt beim ersten Mal ca. 7 MB, danach aus dem Speicher). */
export function loadOcr(onProgress?: (p: number) => void): Promise<OcrWorker> {
  progressCb = onProgress;
  worker ??= (async () => {
    const { createWorker } = await import('tesseract.js');
    const base = ocrBase();
    const w = await createWorker('eng', 1, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: base.replace(/\/$/, ''),
      gzip: true,
      workerBlobURL: false,
      logger: (m: { status: string; progress: number }) => {
        if (m.status.startsWith('loading') || m.status.startsWith('initializ')) progressCb?.(m.progress);
      },
    });
    // 11 = verstreuter Text (Packungen haben viele kleine Textblöcke)
    await w.setParameters({ tessedit_pageseg_mode: '11' as never });
    return w as unknown as OcrWorker;
  })().catch((err) => {
    worker = null;
    throw err;
  });
  return worker;
}

export const OCR_CACHE = 'xplaner-ocr';

/** Genau der Kern, den Tesseract auf diesem Gerät nimmt (gleiche Erkennung wie tesseract.js). */
async function coreFile(): Promise<string> {
  const { simd, relaxedSimd } = await import('wasm-feature-detect');
  if (await relaxedSimd().catch(() => false)) return 'tesseract-core-relaxedsimd-lstm.wasm.js';
  if (await simd().catch(() => false)) return 'tesseract-core-simd-lstm.wasm.js';
  return 'tesseract-core-lstm.wasm.js';
}

/**
 * Texterkennung in den Offline-Speicher holen (z. B. vor der Reise im WLAN, ca. 7 MB).
 * 'ok' nur, wenn die Dateien wirklich im Cache liegen; 'nosw' = ohne aktiven Service Worker nicht möglich.
 */
export async function prefetchOcr(): Promise<'ok' | 'nosw' | 'fail'> {
  if (!('caches' in window) || !navigator.serviceWorker?.controller) return 'nosw';
  const base = ocrBase();
  try {
    const urls = ['worker.min.js', await coreFile(), 'eng.traineddata.gz'].map((f) => base + f);
    const res = await Promise.all(urls.map((u) => fetch(u)));
    if (!res.every((r) => r.ok)) return 'fail';
    await Promise.all(res.map((r) => r.arrayBuffer()));
    // Der Service Worker legt die Dateien im Hintergrund ab – kurz warten und nachsehen.
    for (let i = 0; i < 20; i++) {
      const cache = await caches.open(OCR_CACHE);
      const hits = await Promise.all(urls.map((u) => cache.match(u)));
      if (hits.every(Boolean)) return 'ok';
      await new Promise((r) => setTimeout(r, 250));
    }
    return 'fail';
  } catch {
    return 'fail';
  }
}

export async function recognizePhoto(file: Blob, db: Database, barcodes: Record<string, string>, onStep?: (step: 'barcode' | 'ocr', p?: number) => void): Promise<PhotoResult> {
  const canvas = await prepare(file);

  onStep?.('barcode');
  let barcode: string | null = null;
  try {
    const det = await createDetector();
    const raw = (await det.detect(canvas)).map((r) => r.rawValue.trim()).find(validGtin);
    if (raw) {
      barcode = normalizeGtin(raw);
      const p = db.products.find((x) => x.code === barcodes[barcode!]);
      if (p) return { products: [p], barcode, text: '', via: 'barcode' };
    }
  } catch {
    /* kein Barcode-Leser – weiter mit Text */
  }

  onStep?.('ocr', 0);
  const w = await loadOcr((p) => onStep?.('ocr', p));
  onStep?.('ocr', 1); // geladen – ab jetzt „Lese die Packung …“
  const { data } = await w.recognize(grayscale(canvas));
  const text = data.text ?? '';
  const byCode = findByCode(text, db);
  if (byCode.length) return { products: byCode, barcode, text, via: 'code' };
  const byName = findByName(text, db);
  if (byName.length) return { products: byName, barcode, text, via: 'name' };
  return { products: [], barcode, text, via: 'none' };
}
