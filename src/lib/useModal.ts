import { useCallback, useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import { lockScroll } from './scrollLock';

/** Dauer der Schließ-Animation – muss zu `--dur-close` in styles.css passen. */
const CLOSE_MS = 180;

/**
 * Vollbild-Dialog: Fokus rein und zurück, Escape schließt, Tab bleibt im Dialog, Hintergrund scrollt nicht.
 * Läuft nur beim Öffnen/Schließen (onClose per Ref). Ist ein weiteres Fenster darüber offen
 * (Teile-Auswahl, Scanner, Großansicht), kümmert sich dieses um die Tasten.
 *
 * Gibt `close` zurück: schließt mit kurzer Animation (Klasse `is-closing` am Fenster bzw. seinem Hintergrund)
 * und ruft erst danach `onClose`. Mit „Bewegung reduzieren“ schließt es sofort.
 * `animate: true` lässt auch Escape so schließen – nicht für Fenster, deren `onClose` erst nachfragt.
 */
export function useModal(ref: RefObject<HTMLElement | null>, onClose: () => void, { animate = false }: { animate?: boolean } = {}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closing = useRef(false);
  const close = useCallback(() => {
    const root = ref.current;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!root || reduce) return closeRef.current();
    if (closing.current) return;
    closing.current = true;
    const host = (root.closest('.sheet-backdrop') as HTMLElement | null) ?? root;
    host.classList.add('is-closing');
    window.setTimeout(() => {
      closing.current = false;
      closeRef.current();
      // Bleibt das Fenster doch offen, soll es nicht ausgeblendet hängen bleiben.
      requestAnimationFrame(() => host.isConnected && host.classList.remove('is-closing'));
    }, CLOSE_MS);
  }, []);
  const escRef = useRef(close);
  escRef.current = animate ? close : () => closeRef.current();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const unlock = lockScroll();
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const root = ref.current;
      if (!root) return;
      // Nur das vorderste Fenster reagiert: ein Fenster darin oder später im Dokument liegt darüber.
      const above = [...document.querySelectorAll('[aria-modal="true"]')].some(
        (d) => d !== root && root.compareDocumentPosition(d) & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY) && !d.contains(root),
      );
      if (above) return;
      if (e.key === 'Escape') escRef.current();
      if (e.key === 'Tab') {
        const f = [...root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      unlock();
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return close;
}
