// Foto-Check: Packung fotografieren → Produkt erkennen (alles auf dem Gerät).
// 1. Barcode auf dem Foto (mitgelieferte Liste + selbst zugeordnete)
// 2. Texterkennung (Tesseract): Barcode-Ziffern, Produktcode wie „BX-05“ oder Hasbro-Nummer „G4568“
// 3. sonst Blade-Name + Kombo im Text („SWORD DRAN 3-60F“), mit den Schreibweisen aus dem ID-Register
// Das ist Texterkennung (OCR), keine Bilderkennung: Ein Packungsbild ohne lesbaren Text wird nicht erkannt.
import type { Database, Product } from './types';
import { createDetector, normalizeGtin, validGtin } from './barcode';
import { resolveId } from './idRegister';
import type { IdRegister } from './idRegister';

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
  // Hasbro-Materialnummer, z. B. „G4568“ oder „F9588EU4“ (steht auf jeder Hasbro-Packung beim Barcode)
  for (const m of text.toUpperCase().matchAll(/\b([A-H])\s?([0-9OIL|SB]{4})(?![0-9])/g)) {
    const raw = digits(m[2]!);
    if (!/^\d{4}$/.test(raw)) continue;
    const code = `${m[1]}${raw}`;
    for (const p of db.products) if (BUYABLE.has(p.kind) && (p.code === code || p.code.startsWith(`${code}-`)) && !found.includes(p)) found.push(p);
  }
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

/**
 * Barcode-Ziffern im erkannten Text (die Zahl unter jedem Barcode, z. B. „5 010996 256607“).
 * Nur 12/13 Stellen mit gültiger Prüfziffer – eine Fehllesung fällt so fast immer heraus.
 */
export function findBarcodeDigits(text: string): string[] {
  const out: string[] = [];
  const runs = [...text.matchAll(/(?<![\d])\d(?:[ ]?\d){11,12}(?![\d])/g), ...text.matchAll(/(?<![\d])\d{12,13}(?![\d])/g)];
  for (const m of runs) {
    const code = m[0].replace(/ /g, '');
    if ((code.length === 12 || code.length === 13) && validGtin(code)) {
      const gtin = normalizeGtin(code);
      if (!out.includes(gtin)) out.push(gtin);
    }
  }
  return out;
}

/** Levenshtein-Abstand, abgebrochen sobald er größer als `max` wird. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]!);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length]! <= max;
}

/** Typische OCR-Verwechslungen angleichen (0/O, 1/I/L, 5/S, 8/B) – für Vergleiche, nicht für die Anzeige. */
const skeleton = (s: string) => s.toUpperCase().replace(/O/g, '0').replace(/[IL|!]/g, '1').replace(/S/g, '5').replace(/B/g, '8');

/** Hinweise auf die Packungsausgabe (nur zum Sortieren, nie zum Ausschließen). */
const HASBRO_HINT = /\bHASBRO\b|\bINCLUDES\b|\bATTAQUE\b|\bROTATION\b|\bRESISTENCIA\b|\b(?:ATTACK|DEFENSE|STAMINA|BALANCE)\s+TYPE\b|\bSPINS\s+(?:RIGHT|LEFT)\b/;
// „TOMY“ allein steht auch im Copyright der Hasbro-Packungen – nur „TAKARA“ zählt.
const TAKARA_HINT = /\bTAKARA\b/;

export interface NameMatch {
  products: Product[];
  /** true: ein Blade-Name stand vollständig im Text. false: nur ein Namensteil + passende Kombo („DRAN 3-60F“) → nachfragen */
  sure: boolean;
}

/**
 * Packungstext → Produkte über Blade-Namen (Takara Tomy, Hasbro und die Schreibweisen aus dem ID-Register)
 * und die Kombo-Angabe auf der Packung („3-60F“, „5-80O“).
 * Tolerant gegenüber einzelnen OCR-Fehlern in langen Wörtern („SWORO“ → Sword), aber nie „ähnliche“ Blades raten:
 * Ein Teilname allein reicht nicht, er braucht die passende Kombo dazu. Sets mit mehreren erkannten Blades kommen nach vorn.
 */
export function matchPackText(text: string, db: Pick<Database, 'products' | 'blades'>, register?: IdRegister | null): NameMatch {
  const upper = text.toUpperCase();
  // Wörter des Texts, dazu je zwei benachbarte zusammengesetzt („SWO RD“ → „sword“)
  const raw = upper.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const tokens = new Set<string>();
  raw.forEach((w, i) => {
    if (w.length >= 3) tokens.add(w);
    const next = raw[i + 1];
    if (next && w.length + next.length >= 4) tokens.add(w + next);
  });
  const fuzzy = [...tokens].filter((t) => t.length >= 4);
  const hit = (word: string) => tokens.has(word) || (word.length >= 5 && fuzzy.some((t) => within(t, word, 1)));
  const flat = skeleton(upper.replace(/\s+/g, ' '));

  // Alle Schreibweisen je Blade: Name, Hasbro-Name, Aliase und alte IDs aus dem Register
  const spellings = new Map<string, string[]>();
  for (const b of db.blades) spellings.set(b.id, [b.name, ...(b.hasbroName ? [b.hasbroName] : [])]);
  if (register) {
    const exists = (id: string) => spellings.has(id);
    for (const section of [register.aliases.blades, register.retired.blades] as Record<string, unknown>[]) {
      for (const key of Object.keys(section ?? {})) {
        const id = resolveId(register, 'blades', key, exists);
        if (id) spellings.get(id)!.push(key);
      }
    }
  }

  const full = new Set<string>();
  const partial = new Set<string>();
  for (const [id, names] of spellings) {
    for (const n of names) {
      const w = words(n);
      if (w.length >= 2 && w.every(hit)) full.add(id);
      else if (w.some((x) => x.length >= 4 && hit(x))) partial.add(id);
    }
  }
  if (!full.size && !partial.size) return { products: [], sure: false };

  // Kombo der Packung im Text? („3-60F“, auch „3-60 F“; Ratchet und Bit stehen direkt hinter dem Namen)
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const comboAt = (p: Product) => {
    if (!p.ratchetId || !p.bitId) return false;
    return new RegExp(`(?<![0-9A-Z])${esc(skeleton(p.ratchetId))} ?${esc(skeleton(p.bitId))}(?![0-9A-Z])`).test(flat);
  };
  const hasbro = HASBRO_HINT.test(upper);
  const takara = !hasbro && TAKARA_HINT.test(upper);
  const scored = db.products
    .filter((p) => BUYABLE.has(p.kind) && p.bladeId && (full.has(p.bladeId) || partial.has(p.bladeId)))
    .map((p) => {
      const combo = comboAt(p);
      // Teilname nur zusammen mit der passenden Kombo
      if (!full.has(p.bladeId!) && !combo) return null;
      let score = (full.has(p.bladeId!) ? 3 : 1) + (combo ? 2 : 0);
      if (p.kind === 'set') {
        const mates = db.products.filter((x) => x.kind === 'set' && x.code !== p.code && x.code.replace(/-\d{2}$/, '') === p.code.replace(/-\d{2}$/, ''));
        if (mates.some((x) => x.bladeId && (full.has(x.bladeId) || partial.has(x.bladeId)))) score += 3;
      }
      const region = (hasbro && p.region === 'hasbro') || (takara && p.region !== 'hasbro') ? 0.5 : 0;
      return { p, score, region, sure: full.has(p.bladeId!) };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (!scored.length) return { products: [], sure: false };
  const top = Math.max(...scored.map((x) => x.score));
  const best = scored.filter((x) => x.score === top).sort((a, b) => b.region - a.region);
  return { products: best.map((x) => x.p), sure: best.every((x) => x.sure) };
}

export interface PhotoResult {
  products: Product[];
  /** gelesener Barcode (normalisiert) – auch wenn er noch keinem Produkt zugeordnet ist */
  barcode: string | null;
  /** 'scan' = vom Barcode-Leser (darf gelernt werden), 'text' = aus den Ziffern darunter gelesen (nur zum Nachschlagen) */
  barcodeFrom: 'scan' | 'text' | null;
  text: string;
  via: 'barcode' | 'code' | 'name' | 'none';
  /** false: unsicherer Namens-Treffer → immer zur Auswahl, nie direkt übernehmen */
  sure: boolean;
}

/** Foto laden und drehen (EXIF). Volle Auflösung bleibt für den Barcode, höchstens 4096 px. */
async function load(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => createImageBitmap(file));
  const c = scaled(bmp, 4096);
  bmp.close?.();
  return c;
}

/** Verkleinerte Kopie (längste Seite höchstens `max`). */
function scaled(src: CanvasImageSource & { width: number; height: number }, max: number): HTMLCanvasElement {
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * scale);
  c.height = Math.round(src.height * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, c.width, c.height);
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

/**
 * Nur helle, ungesättigte Schrift (weiß/silber) als Schwarz auf Weiß – Packungsnamen stehen oft weiß auf
 * bunten Flächen, die das Graubild verschluckt.
 */
function whiteText(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const mx = Math.max(d[i]!, d[i + 1]!, d[i + 2]!);
    const mn = Math.min(d[i]!, d[i + 1]!, d[i + 2]!);
    d[i] = d[i + 1] = d[i + 2] = mn > 150 && mx - mn < 60 ? 0 : 255;
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

/** Barcode auf dem Bild lesen (erst volle Auflösung – verkleinert gehen dünne Striche verloren). */
async function readBarcode(full: HTMLCanvasElement): Promise<string | null> {
  try {
    const det = await createDetector();
    for (const img of full.width * full.height > 2400 * 1800 ? [full, scaled(full, 2400)] : [full]) {
      const raw = (await det.detect(img)).map((r) => r.rawValue.trim()).find(validGtin);
      if (raw) return normalizeGtin(raw);
    }
  } catch {
    /* kein Barcode-Leser – weiter mit Text */
  }
  return null;
}

/**
 * Packung auf einem Foto erkennen – alles lokal auf dem Gerät, nichts wird hochgeladen. Reihenfolge:
 * 1. Barcode (Barcode-Leser) → bekannte Zuordnung
 * 2. Texterkennung: Barcode-Ziffern, Produktnummer (BX-05, G4568), Blade-Name + Kombo (mit ID-Register)
 * Die Texterkennung läuft in zwei Durchgängen (Graubild, dann helle Schrift) und hört auf, sobald eine Nummer eindeutig ist.
 */
export async function recognizePhoto(
  file: Blob,
  db: Database,
  barcodes: Record<string, string>,
  onStep?: (step: 'barcode' | 'ocr', p?: number) => void,
  register?: IdRegister | null,
): Promise<PhotoResult> {
  const full = await load(file);

  onStep?.('barcode');
  let barcode = await readBarcode(full);
  let barcodeFrom: PhotoResult['barcodeFrom'] = barcode ? 'scan' : null;
  const byBarcode = (code: string) => db.products.find((x) => x.code === barcodes[code]);
  if (barcode && byBarcode(barcode)) return { products: [byBarcode(barcode)!], barcode, barcodeFrom, text: '', via: 'barcode', sure: true };

  onStep?.('ocr', 0);
  const w = await loadOcr((p) => onStep?.('ocr', p));
  onStep?.('ocr', 1); // geladen – ab jetzt „Lese die Packung …“
  const small = scaled(full, 1800);
  let text = '';
  for (const pass of [grayscale, whiteText]) {
    const { data } = await w.recognize(pass(small));
    text += `${data.text ?? ''}\n`;
    // Barcode-Ziffern unter dem Strichcode, falls der Leser ihn nicht entziffern konnte
    if (!barcode) {
      const digits = findBarcodeDigits(text);
      const known = digits.find((d) => byBarcode(d));
      if (known) return { products: [byBarcode(known)!], barcode: known, barcodeFrom: 'text', text, via: 'barcode', sure: true };
      if (digits[0]) {
        barcode = digits[0];
        barcodeFrom = 'text';
      }
    }
    const byCode = findByCode(text, db);
    if (byCode.length) return { products: byCode, barcode, barcodeFrom, text, via: 'code', sure: true };
    const byName = matchPackText(text, db, register);
    // Voller Name im ersten Durchgang reicht; sonst den zweiten Durchgang abwarten
    if (byName.products.length && (byName.sure || pass === whiteText)) return { products: byName.products, barcode, barcodeFrom, text, via: 'name', sure: byName.sure };
  }
  return { products: [], barcode, barcodeFrom, text, via: 'none', sure: false };
}
