/**
 * Freistellen im Hintergrund-Thread: Die eigentliche Rechenarbeit (Pixel lesen, Hintergrund entfernen, PNG erzeugen)
 * läuft hier statt im Haupt-Thread – Wischen, Scrollen und Antippen bleiben dabei flüssig.
 * Dieselben Funktionen wie im Haupt-Thread (lib/cutoutCore.ts), also dasselbe Ergebnis.
 */
import { opaqueBounds, removeBackground, type CutoutOptions } from './cutoutCore';

export interface CutoutJob {
  id: number;
  bitmap: ImageBitmap;
  w: number;
  h: number;
  options: CutoutOptions;
}
export type CutoutReply =
  | { id: number; kind: 'blob'; blob: Blob }
  /** schon freigestellt: Original verwenden */
  | { id: number; kind: 'native' }
  /** nicht freistellbar (oder Bilddaten nicht lesbar) */
  | { id: number; kind: 'none' }
  /** Hintergrund-Thread kann es nicht (z. B. kein OffscreenCanvas) – im Haupt-Thread rechnen */
  | { id: number; kind: 'unsupported' };

const reply = (r: CutoutReply) => (self as unknown as Worker).postMessage(r);

self.onmessage = async (e: MessageEvent<CutoutJob>) => {
  const { id, bitmap, w, h, options } = e.data;
  if (typeof OffscreenCanvas === 'undefined') {
    bitmap.close();
    return reply({ id, kind: 'unsupported' });
  }
  try {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return reply({ id, kind: 'unsupported' });
    ctx.drawImage(bitmap, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const done = removeBackground(data.data, w, h, options);
    const box = done && options.trim ? opaqueBounds(data.data, w, h) : null;
    if (!done) return reply({ id, kind: 'none' });
    if (done.native && !box) return reply({ id, kind: 'native' });
    const out = box ? new OffscreenCanvas(box.w, box.h) : canvas;
    const octx = box ? out.getContext('2d') : ctx;
    if (!octx) return reply({ id, kind: 'unsupported' });
    octx.putImageData(data, box ? -box.x : 0, box ? -box.y : 0);
    reply({ id, kind: 'blob', blob: await out.convertToBlob({ type: 'image/png' }) });
  } catch {
    // Bilddaten nicht lesbar (Sicherheitsfehler) oder Speicher knapp
    reply({ id, kind: 'none' });
  } finally {
    bitmap.close();
  }
};
