import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import { lockScroll } from './scrollLock';

/**
 * Vollbild-Dialog: Fokus rein und zurück, Escape schließt, Tab bleibt im Dialog, Hintergrund scrollt nicht.
 * Läuft nur beim Öffnen/Schließen (onClose per Ref). Ist ein weiteres Fenster darüber offen
 * (Teile-Auswahl, Scanner, Großansicht), kümmert sich dieses um die Tasten.
 */
export function useModal(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const unlock = lockScroll();
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const root = ref.current;
      if (!root) return;
      if ([...document.querySelectorAll('[aria-modal="true"]')].some((d) => d !== root)) return;
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const f = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
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
}
