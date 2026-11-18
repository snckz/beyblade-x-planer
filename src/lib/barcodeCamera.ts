// Live-Kamera mit Barcode-Leser – gemeinsam für „Packung scannen“ und den Kauf-Check.
import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import { createDetector, normalizeGtin, validGtin } from './barcode';

/** Pause zwischen zwei Leseversuchen (ms) */
const TICK_MS = 180;

/** Aktuelles Kamerabild als JPEG – für die Texterkennung, wenn der Barcode noch unbekannt ist. */
export function grabFrame(v: HTMLVideoElement): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  if (!c.width || !c.height) return Promise.resolve(null);
  c.getContext('2d')!.drawImage(v, 0, 0);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
}

/** Kamera schon freigegeben? Dann direkt live scannen, sonst erst fragen (iPhone fragt sonst bei jedem App-Start). */
export async function cameraGranted(): Promise<boolean> {
  try {
    const st = await navigator.permissions?.query({ name: 'camera' as PermissionName });
    return st?.state === 'granted';
  } catch {
    return false;
  }
}

export interface CameraHandlers {
  /** Kamera läuft, Leser ist bereit */
  onReady: () => void;
  /** Derselbe gültige Barcode zweimal hintereinander gelesen. Kamera ist danach aus; `frame` = Bild dazu (für die Texterkennung). */
  onCode: (gtin: string, frame: Blob | null) => void;
  /** Braucht `onCode` für diesen Barcode ein Standbild? (false = schon bekannt; Standard: ja) */
  needFrame?: (gtin: string) => boolean;
  /** 'nocam' = keine Kamera/abgelehnt, 'noreader' = Barcode-Leser nicht ladbar (offline?) */
  onFail: (why: 'nocam' | 'noreader') => void;
}

/**
 * Kamera starten, solange `active` true ist; mit jeder neuen `round` von vorn (z. B. „Nächste Packung“).
 * Beim Ausschalten, Neustart oder Schließen wird die Kamera sofort freigegeben – kein Ergebnis kommt danach noch an.
 */
export function useBarcodeCamera(video: RefObject<HTMLVideoElement | null>, active: boolean, round: number, handlers: CameraHandlers): void {
  const h = useRef(handlers);
  h.current = handlers;
  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    let last = '';
    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocam');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      if (stopped) return stop();
      const v = video.current;
      if (!v) return stop();
      v.srcObject = stream;
      await v.play();
      let detector;
      try {
        detector = await createDetector();
      } catch {
        throw new Error('noreader');
      }
      if (stopped) return;
      h.current.onReady();
      const tick = async () => {
        if (stopped) return;
        try {
          if (v.readyState >= 2) {
            const found = (await detector.detect(v)).map((r) => r.rawValue.trim()).find(validGtin);
            if (stopped) return;
            if (found) {
              // Erst übernehmen, wenn derselbe Code zweimal hintereinander gelesen wurde.
              if (found === last) {
                navigator.vibrate?.(60);
                const gtin = normalizeGtin(found);
                // Standbild nur, wenn es gebraucht wird (unbekannter Barcode → Texterkennung)
                const frame = h.current.needFrame?.(gtin) === false ? null : await grabFrame(v);
                if (stopped) return;
                stop();
                h.current.onCode(gtin, frame);
                return;
              }
              last = found;
            }
          }
        } catch {
          /* einzelner Fehlversuch, weiter scannen */
        }
        timer = window.setTimeout(tick, TICK_MS);
      };
      void tick();
    })().catch((err: unknown) => {
      if (stopped) return;
      stop();
      h.current.onFail(err instanceof Error && err.message === 'noreader' ? 'noreader' : 'nocam');
    });
    return stop;
  }, [round, active]);
}
