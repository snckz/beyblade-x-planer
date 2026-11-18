/**
 * Freistellen im Browser: Foto laden, Hintergrund entfernen (lib/cutoutCore.ts), als Bild-Adresse zurückgeben.
 * Gerechnet wird im Hintergrund-Thread (lib/cutout.worker.ts), sonst im Haupt-Thread.
 */
import { opaqueBounds, removeBackground, type CutoutOptions } from './cutoutCore';
import type { CutoutJob, CutoutReply } from './cutout.worker';

export { opaqueBounds, removeBackground };
export type { CutoutOptions, CutoutResult } from './cutoutCore';

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
export function cutoutFromImage(img: HTMLImageElement, src: string, options: CutoutOptions = {}): Promise<string | null> {
  const known = cache.get(src);
  if (known !== undefined) return Promise.resolve(known);
  // Dasselbe Foto nur einmal rechnen (Karte und Vorladen können gleichzeitig fragen)
  let job = pending.get(src);
  if (!job) {
    // Ergebnis erst nach einer laufenden Geste ausliefern: Die Karte tauscht dann ihr Bild aus – unter dem Finger
    // würde das die Geste abreißen (iOS schickt die weiteren Touch-Ereignisse an das entfernte Bild).
    job = queued(() => computeCutout(img, src, options))
      .then(async (r) => (await resumed(), r))
      .finally(() => pending.delete(src));
    pending.set(src, job);
  }
  return job;
}

// ---- Warteschlange: Freistellen kostet Rechenzeit im Hauptthread ----------------------------------------------------
// Immer nur ein Foto zur Zeit, mit einer Pause dazwischen (der Browser kann zeichnen und auf Finger reagieren).
// Während einer Geste (Wischen, Einrasten) ruht die Schlange ganz – sonst ruckelt die Bewegung.

const pending = new Map<string, Promise<string | null>>();
const waiting: (() => void)[] = [];
let busy = false;
let paused = false;

function pump() {
  if (busy || paused || !waiting.length) return;
  busy = true;
  // Pause vor jedem Foto: Zeichnen und Eingaben gehen vor
  setTimeout(() => {
    if (paused) {
      busy = false;
      return;
    }
    waiting.shift()!();
  }, 0);
}

function queued<T>(work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    waiting.push(() => {
      work()
        .then(resolve, reject)
        .finally(() => {
          busy = false;
          pump();
        });
    });
    pump();
  });
}

/** Freistellen anhalten (`true`) oder fortsetzen (`false`) – z. B. solange eine Wischgeste läuft. */
export function pauseCutouts(on: boolean): void {
  paused = on;
  if (on) return;
  resumeWaiters.splice(0).forEach((go) => go());
  pump();
}
const resumeWaiters: (() => void)[] = [];
/** Wartet, bis keine Geste mehr läuft. */
const resumed = (): Promise<void> => (paused ? new Promise((go) => resumeWaiters.push(go)) : Promise.resolve());

/**
 * Foto im Hintergrund laden und freistellen, damit es später sofort fertig dasteht (z. B. die Nachbarseite beim
 * Blättern). Dieselbe Abrufart wie die Karte (mit Lesefreigabe, ohne Referrer) – so teilen sie sich den Zwischenspeicher.
 * Nichts tun, wenn das Ergebnis schon bekannt ist oder das Wiki das Freistellen nicht erlaubt.
 */
export function prefetchCutout(src: string, options: CutoutOptions = {}): void {
  if (cache.has(src) || pending.has(src) || prefetching.has(src) || cutoutBlocked() || typeof Image === 'undefined') return;
  prefetching.add(src);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  img.decoding = 'async';
  img.onload = () => void cutoutFromImage(img, src, options).finally(() => prefetching.delete(src));
  // Fehler: Die Karte entscheidet beim eigenen Laden selbst (normales Foto statt freigestellt)
  img.onerror = () => prefetching.delete(src);
  img.src = src;
}
const prefetching = new Set<string>();

// ---- Hintergrund-Thread ---------------------------------------------------------------------------------------------
// Wo möglich rechnet ein Worker (OffscreenCanvas). Fehlt etwas davon, rechnet wie bisher der Haupt-Thread.

let worker: Worker | null | undefined;
let nextJob = 1;
/** Längste Wartezeit auf den Worker je Foto (ms) */
const WORKER_TIMEOUT_MS = 8000;
const jobs = new Map<number, (r: CutoutReply) => void>();

function cutoutWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return worker;
  try {
    worker = new Worker(new URL('./cutout.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<CutoutReply>) => {
      jobs.get(e.data.id)?.(e.data);
      jobs.delete(e.data.id);
    };
    // Worker lässt sich nicht starten: offene Aufträge im Haupt-Thread rechnen, künftig nur noch dort
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      jobs.forEach((done, id) => done({ id, kind: 'unsupported' }));
      jobs.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

async function cutoutInWorker(w: Worker, img: HTMLImageElement, width: number, height: number, options: CutoutOptions): Promise<CutoutReply> {
  // Dekodieren für die Übergabe läuft ebenfalls außerhalb des Haupt-Threads
  const bitmap = await createImageBitmap(img);
  const id = nextJob++;
  return new Promise<CutoutReply>((resolve) => {
    // Antwortet der Worker nicht (z. B. von iOS beendet), darf die Warteschlange nicht für immer stehen:
    // dann im Haupt-Thread rechnen.
    const timer = setTimeout(() => {
      if (!jobs.delete(id)) return;
      resolve({ id, kind: 'unsupported' });
    }, WORKER_TIMEOUT_MS);
    jobs.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    const job: CutoutJob = { id, bitmap, w: width, h: height, options };
    w.postMessage(job, [bitmap]);
  });
}

async function computeCutout(img: HTMLImageElement, src: string, options: CutoutOptions): Promise<string | null> {
  const known = cache.get(src);
  if (known !== undefined) return known;
  let result: string | null = null;
  const off = cutoutWorker();
  if (off) {
    try {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const r = await cutoutInWorker(off, img, Math.max(1, Math.round(img.naturalWidth * scale)), Math.max(1, Math.round(img.naturalHeight * scale)), options);
      if (r.kind !== 'unsupported') {
        result = r.kind === 'blob' ? URL.createObjectURL(r.blob) : r.kind === 'native' ? src : null;
        cache.set(src, result);
        return result;
      }
      worker?.terminate();
      worker = null; // künftig im Haupt-Thread
    } catch {
      // z. B. Foto ohne Lesefreigabe: wie im Haupt-Thread „nicht freistellbar“
      cache.set(src, null);
      return null;
    }
  }
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
