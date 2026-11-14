import { useState } from 'preact/hooks';
import type { BeyType } from '../lib/types';
import { useApp } from '../lib/context';

interface Props {
  bladeId: string;
  type: BeyType;
  size?: 'sm' | 'md' | 'lg';
  alt: string;
  /** Antippen vergrößert das Bild (nur wenn ein Foto vorhanden ist) */
  zoomable?: boolean;
}

/**
 * Zeigt das Bild der Blade direkt vom Beyblade Wiki (nur verlinkt, nicht kopiert).
 * Ohne Bild oder bei Ladefehler: eigenes, generisches Kreisel-Emblem in der Typ-Farbe.
 */
export function BeyImage({ bladeId, type, size = 'md', alt, zoomable = true }: Props) {
  const { images, openImage } = useApp();
  const img = images.blades[bladeId];
  const [failed, setFailed] = useState(false);

  if (img && !failed) {
    const pic = <img src={img.thumb} alt={alt} loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setFailed(true)} />;
    if (!zoomable) return <span class={`bey-img bey-img-${size} has-photo`}>{pic}</span>;
    return (
      <button type="button" class={`bey-img bey-img-${size} has-photo zoom`} onClick={() => openImage(bladeId)} aria-label={`${alt}: Bild vergrößern`}>
        {pic}
      </button>
    );
  }
  return (
    <span class={`bey-img bey-img-${size} bey-emblem type-fg-${type}`} role="img" aria-label={alt}>
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
    </span>
  );
}

export function ImageCredit({ bladeId }: { bladeId: string }) {
  const { images } = useApp();
  const img = images.blades[bladeId];
  if (!img) return null;
  return (
    <a class="credit" href={img.page} target="_blank" rel="noopener noreferrer">
      Bild: Beyblade Wiki ↗
    </a>
  );
}
