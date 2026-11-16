import { useState } from 'preact/hooks';
import type { BeyType } from '../lib/types';
import { useApp } from '../lib/context';
import { ArrowUpRight } from 'lucide-preact';

interface Props {
  bladeId: string;
  type: BeyType;
  size?: 'sm' | 'md' | 'lg';
  alt: string;
  /** Antippen vergrößert das Bild (nur wenn ein Foto vorhanden ist) */
  zoomable?: boolean;
}

/** Eigenes, generisches Kreisel-Emblem in der Typ-Farbe – der Ersatz, wenn kein Foto da ist oder es nicht lädt. */
export function BeyEmblem() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" class="em-ring" />
      <g class="em-wings">
        {[0, 120, 240].map((r) => (
          <path key={r} d="M50 8 C68 10 82 24 84 40 L62 46 C60 36 56 30 50 28 Z" transform={`rotate(${r} 50 50)`} />
        ))}
      </g>
      <circle cx="50" cy="50" r="14" class="em-core" />
      <circle cx="50" cy="50" r="5" class="em-dot" />
    </svg>
  );
}

/**
 * Ladezustand eines Wiki-Fotos: „loading“ bis das Bild wirklich da ist, „failed“ bei Fehler.
 * Je Bildadresse gemerkt – wechselt die Blade, beginnt es von vorn.
 */
export function usePhotoState(src: string | undefined) {
  const [state, setState] = useState<{ src: string; s: 'ok' | 'failed' } | null>(null);
  const status: 'loading' | 'ok' | 'failed' = src && state?.src === src ? state.s : 'loading';
  return {
    status,
    imgProps: {
      onLoad: () => src && setState({ src, s: 'ok' }),
      onError: () => src && setState({ src, s: 'failed' }),
      // Bild kam schon aus dem Cache, bevor die Handler hingen
      ref: (el: HTMLImageElement | null) => {
        if (el && src && el.complete && el.naturalWidth > 0 && status === 'loading') setState({ src, s: 'ok' });
      },
    },
  };
}

/**
 * Zeigt das Bild der Blade direkt vom Beyblade Wiki (nur verlinkt, nicht kopiert).
 * Während des Ladens: dunkle Scheibe (kein weißer Fleck). Ohne Bild oder bei Ladefehler: Emblem in der Typ-Farbe.
 */
export function BeyImage({ bladeId, type, size = 'md', alt, zoomable = true }: Props) {
  const { images, openImage } = useApp();
  const img = images.blades[bladeId];
  const photo = usePhotoState(img?.thumb);

  if (img && photo.status !== 'failed') {
    const cls = `bey-img bey-img-${size} has-photo${photo.status === 'loading' ? ' is-loading' : ''}`;
    const pic = <img src={img.thumb} alt={alt} loading="lazy" decoding="async" referrerpolicy="no-referrer" {...photo.imgProps} />;
    if (!zoomable) return <span class={cls}>{pic}</span>;
    return (
      <button type="button" class={`${cls} zoom`} onClick={() => openImage(bladeId)} aria-label={`${alt}: Bild vergrößern`}>
        {pic}
      </button>
    );
  }
  return (
    <span class={`bey-img bey-img-${size} bey-emblem type-fg-${type}`} role="img" aria-label={alt}>
      <BeyEmblem />
    </span>
  );
}

export function ImageCredit({ bladeId }: { bladeId: string }) {
  const { images } = useApp();
  const img = images.blades[bladeId];
  if (!img) return null;
  return (
    <a class="credit" href={img.page} target="_blank" rel="noopener noreferrer">
      Bild: Beyblade Wiki <ArrowUpRight aria-hidden="true" />
    </a>
  );
}
