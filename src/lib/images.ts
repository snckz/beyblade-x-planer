import type { ImageIndex } from './types';

/** Größere Wiki-Variante für die Großansicht (Thumbnail-Breite in der URL anpassen, falls vorhanden). */
export function largeUrl(thumb: string): string {
  return thumb.replace(/scale-to-width-down\/\d+/, 'scale-to-width-down/700');
}

/** Alle URLs, die vorgeladen werden sollen: zuerst Blades (werden am häufigsten vergrößert), dann Bits und Ratchets. */
export function preloadList(index: ImageIndex): string[] {
  const groups = [index.blades, index.bits ?? {}, index.ratchets ?? {}];
  const urls: string[] = [];
  for (const g of groups) for (const img of Object.values(g)) urls.push(largeUrl(img.thumb));
  return [...new Set(urls)];
}

/**
 * Lädt die großen Fotos im Hintergrund in den Browser-Cache, damit die Großansicht sofort erscheint.
 * Startet erst, wenn die App ruhig ist, lädt höchstens `parallel` Bilder gleichzeitig und
 * respektiert den Datensparmodus. Rückgabe: Funktion zum Abbrechen.
 */
export function preloadImages(index: ImageIndex, { parallel = 3, delayMs = 2500 } = {}): () => void {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; type?: string } };
  if (nav.connection?.saveData || nav.connection?.type === 'cellular' || /(^|-)2g$/.test(nav.connection?.effectiveType ?? '')) return () => {};
  // Höchstens einmal pro Woche: danach liegen die Bilder im Browser-Cache – spart mobiles Datenvolumen (Roaming).
  const STAMP = 'bxplaner:preloaded';
  try {
    const last = Number(localStorage.getItem(STAMP) ?? 0);
    if (Date.now() - last < 7 * 864e5) return () => {};
  } catch {
    /* Speicher blockiert: trotzdem vorladen */
  }
  const queue = preloadList(index);
  if (typeof navigator.onLine === 'boolean' && !navigator.onLine) return () => {};
  let stopped = false;
  let timer = 0;
  let loaded = 0;
  const total = queue.length;
  const next = () => {
    if (stopped) return;
    const url = queue.shift();
    if (!url) {
      // Nur merken, wenn die meisten Bilder wirklich geladen wurden (nicht bei Funkloch)
      if (loaded < total * 0.8) return;
      try {
        localStorage.setItem(STAMP, String(Date.now()));
      } catch {
        /* egal */
      }
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
    img.onload = () => {
      loaded++;
      next();
    };
    img.onerror = () => next();
    img.src = url;
  };
  const start = () => {
    for (let i = 0; i < parallel; i++) next();
  };
  timer = window.setTimeout(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(start, { timeout: 3000 });
    else start();
  }, delayMs);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}
