import { useEffect, useRef } from 'preact/hooks';
import type { Database } from '../lib/types';
import { useApp } from '../lib/context';

/** Großansicht eines Blade-Fotos. Antippen irgendwo oder Escape schließt. */
export function Lightbox({ db, bladeId, onClose }: { db: Database; bladeId: string; onClose: () => void }) {
  const { images } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const img = images.blades[bladeId];
  const blade = db.blades.find((b) => b.id === bladeId);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    // Capture-Phase + stopImmediatePropagation: Escape schließt nur die Lightbox, nicht das Fenster darunter.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);

  if (!img) return null;
  // Größere Variante vom Wiki anfordern (Thumbnail-Breite in der URL anpassen, falls vorhanden).
  const large = img.thumb.replace(/scale-to-width-down\/\d+/, 'scale-to-width-down/900');
  return (
    <div ref={ref} class="lightbox" role="dialog" aria-modal="true" aria-label={blade?.name ?? 'Bild'} tabIndex={-1} onClick={onClose}>
      <img src={large} alt={blade?.name ?? ''} referrerpolicy="no-referrer" />
      <p class="lightbox-cap">
        <strong>{blade?.name}</strong>
        <a href={img.page} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          Bild: Beyblade Wiki ↗
        </a>
      </p>
      <button type="button" class="icon-btn lightbox-close" aria-label="Schließen" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
