import { lockScroll } from '../lib/scrollLock';
import { useEffect, useRef, useState } from 'preact/hooks';
import { largeUrl } from '../lib/images';
import type { Database } from '../lib/types';
import { useApp, type ImageKind } from '../lib/context';

/** Anzeigename eines Teils für die Bildunterschrift. */
function partName(db: Database, id: string, kind: ImageKind): string {
  if (kind === 'bit') {
    const bit = db.bits.find((b) => b.id === id);
    return bit ? `${bit.id} · ${bit.name}` : id;
  }
  if (kind === 'ratchet') return `Ratchet ${id}`;
  return db.blades.find((b) => b.id === id)?.name ?? id;
}

/** Großansicht eines Teile-Fotos (Blade, Bit, Ratchet). Antippen irgendwo oder Escape schließt. */
export function Lightbox({ db, id, kind = 'blade', onClose }: { db: Database; id: string; kind?: ImageKind; onClose: () => void }) {
  const { images } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const store = kind === 'bit' ? images.bits : kind === 'ratchet' ? images.ratchets : images.blades;
  const img = store?.[id];
  const name = partName(db, id, kind);
  const [ready, setReady] = useState(false);

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
    const unlock = lockScroll();
    return () => {
      unlock();
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);

  if (!img) return null;
  const large = largeUrl(img.thumb);
  const cls = kind === 'blade' ? '' : ' lightbox-part';
  return (
    <div ref={ref} class="lightbox" role="dialog" aria-modal="true" aria-label={name} tabIndex={-1} onClick={onClose}>
      {/* Sofort das (schon geladene) kleine Bild zeigen, das große blendet darüber ein, sobald es da ist. */}
      <div class="lightbox-pic">
        {!ready && <img src={img.thumb} alt="" aria-hidden="true" referrerpolicy="no-referrer" class={`lightbox-ph${cls}`} />}
        <img src={large} alt={name} referrerpolicy="no-referrer" class={`lightbox-full${cls}${ready ? ' ready' : ''}`} onLoad={() => setReady(true)} />
      </div>
      <p class="lightbox-cap">
        <strong>{name}</strong>
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
