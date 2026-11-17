import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Bit, Ratchet } from '../lib/types';
import { cachedCutout, cutoutBlocked, cutoutFromImage, markCutoutBlocked, type CutoutOptions } from '../lib/cutout';
import { useApp, type ImageKind } from '../lib/context';
import { CutImg, usePhotoState } from './BeyImage';

/** `card`: großes Foto für die Auswahlkarte – freigestellt, wenn möglich (siehe CardPhoto). */
type Size = 'sm' | 'md' | 'card';

/** Foto eines Teils vom Beyblade Wiki (verlinkt); bei Ladefehler greift der Fallback. */
interface PhotoProps {
  src?: string;
  alt: string;
  size: 'sm' | 'md';
  fallback: ComponentChildren;
  /** Wenn gesetzt: Antippen öffnet das Foto groß */
  zoom?: { id: string; kind: ImageKind };
}

function PartPhoto({ src, alt, size, fallback, zoom }: PhotoProps) {
  const { openImage } = useApp();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && failedSrc !== src) {
    const pic = <img src={src} alt={zoom ? '' : alt} loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setFailedSrc(src)} />;
    if (!zoom) return <span class={`bit-img bit-img-${size}`}>{pic}</span>;
    return (
      <button
        type="button"
        class={`bit-img bit-img-${size} zoom`}
        aria-label={`${alt}: Bild vergrößern`}
        onClick={(e) => {
          // Liegt das Bild in einem <summary>, soll Antippen nur vergrößern, nicht auf-/zuklappen.
          e.preventDefault();
          e.stopPropagation();
          openImage(zoom.id, zoom.kind);
        }}
      >
        {pic}
      </button>
    );
  }
  return <>{fallback}</>;
}

/** Ratchets sind Ringe: Auch der Hintergrund im Loch muss weg. Bits sind schlank und lassen viel Rand frei. */
const RATCHET_CUTOUT: CutoutOptions = { holes: true, maxRemoved: 0.85, defringe: true, trim: true };
const BIT_CUTOUT: CutoutOptions = { maxRemoved: 0.88, defringe: true, trim: true };

/**
 * Foto für die Auswahlkarte von Ratchet und Bit – derselbe Ablauf wie beim Blade-Foto (BladePhoto in BeyImage.tsx):
 * Das Foto wird mit Lesefreigabe geladen und im Gerät freigestellt und auf das Teil zugeschnitten (lib/cutout).
 * Erlaubt das Wiki das nicht oder ist der Hintergrund nicht hell und gleichmäßig, liegt das unveränderte Foto
 * auf einer runden, hellen Lichtfläche. Ohne Foto oder bei Ladefehler greift der Fallback.
 */
function CardPhoto({ src, kind, cutout, fallback }: { src?: string; kind: 'ratchet' | 'bit'; cutout: CutoutOptions; fallback: ComponentChildren }) {
  // Foto-Adresse, deren Laden mit Lesefreigabe gescheitert ist – dann normal laden.
  const [noAccess, setNoAccess] = useState<string | null>(null);
  // Foto-Adresse, deren freigestelltes Bild nicht angezeigt werden konnte – dann das unveränderte Foto.
  const [cutFailed, setCutFailed] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const plain = usePhotoState(src);

  const base = `part-photo part-photo-${kind}`;
  if (!src || plain.status === 'failed') return <span class={`${base} is-fallback`}>{fallback}</span>;

  const cut = cutFailed === src ? null : cachedCutout(src);
  const mode: 'cut' | 'plate' | 'try' = cut ? 'cut' : cut === null || cutoutBlocked() || noAccess === src ? 'plate' : 'try';
  const common = { alt: '', decoding: 'async' as const, referrerpolicy: 'no-referrer' as const };
  let pic;
  if (mode === 'cut') {
    pic = <CutImg cut={cut!} src={src} common={common} onFail={() => setCutFailed(src)} />;
  } else if (mode === 'try') {
    pic = (
      <img
        key="try"
        src={src}
        {...common}
        crossorigin="anonymous"
        loading="lazy"
        onLoad={(e) => void cutoutFromImage(e.currentTarget, src, cutout).then(() => alive.current && redraw((n) => n + 1))}
        onError={() => setNoAccess(src)}
      />
    );
  } else {
    pic = (
      <img
        key="plate"
        src={src}
        {...common}
        loading="lazy"
        {...plain.imgProps}
        onLoad={() => {
          // Lädt normal, aber nicht mit Lesefreigabe: Das Wiki erlaubt das Freistellen nicht – für alle Fotos merken.
          if (noAccess === src) markCutoutBlocked();
          plain.imgProps.onLoad();
        }}
      />
    );
  }
  const loading = mode === 'try' || (mode === 'plate' && plain.status === 'loading');
  return <span class={`${base} is-${mode === 'try' ? 'plate' : mode}${loading ? ' is-loading' : ''}`}>{pic}</span>;
}

/** Foto eines Bits; ohne Foto das Kürzel als Plakette. */
export function BitImage({ bit, size = 'sm', zoomable = false }: { bit: Bit; size?: Size; zoomable?: boolean }) {
  const { images } = useApp();
  if (size === 'card') {
    return <CardPhoto src={images.bits?.[bit.id]?.thumb} kind="bit" cutout={BIT_CUTOUT} fallback={<span class={`bit-plaque type-fg-${bit.type}`}>{bit.id}</span>} />;
  }
  return (
    <PartPhoto
      src={images.bits?.[bit.id]?.thumb}
      alt={bit.name}
      size={size}
      zoom={zoomable ? { id: bit.id, kind: 'bit' } : undefined}
      fallback={<span class={`bit-img bit-img-${size} bit-fallback type-fg-${bit.type}`}>{bit.id}</span>}
    />
  );
}

/** Eigenes Ratchet-Emblem: Ring mit so vielen Zacken, wie der Ratchet hat. */
function RatchetEmblem({ contacts }: { contacts: number }) {
  const n = Math.max(0, Math.min(12, contacts));
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x="17" y="3.5" width="6" height="8" rx="1.5" class="ratchet-tooth" transform={`rotate(${(360 / n) * i} 20 20)`} />
      ))}
      <circle cx="20" cy="20" r="11" class="ratchet-ring" />
      <circle cx="20" cy="20" r="4.5" class="ratchet-hub" />
    </svg>
  );
}

/** Foto eines Ratchets; ohne Foto ein gezeichnetes Emblem. */
export function RatchetImage({ ratchet, size = 'sm', zoomable = false }: { ratchet: Ratchet; size?: Size; zoomable?: boolean }) {
  const { images } = useApp();
  if (size === 'card') {
    return <CardPhoto src={images.ratchets?.[ratchet.id]?.thumb} kind="ratchet" cutout={RATCHET_CUTOUT} fallback={<RatchetEmblem contacts={ratchet.contacts ?? 0} />} />;
  }
  return (
    <PartPhoto
      src={images.ratchets?.[ratchet.id]?.thumb}
      alt={`Ratchet ${ratchet.id}`}
      size={size}
      zoom={zoomable ? { id: ratchet.id, kind: 'ratchet' } : undefined}
      fallback={
        <span class={`bit-img bit-img-${size} ratchet-fallback`}>
          <RatchetEmblem contacts={ratchet.contacts ?? 0} />
        </span>
      }
    />
  );
}
