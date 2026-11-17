import { useEffect, useRef, useState } from 'preact/hooks';
import type { BeyType, Blade } from '../lib/types';
import { largeUrl } from '../lib/images';
import { cachedCutout, cutoutBlocked, cutoutFromImage, markCutoutBlocked } from '../lib/cutout';
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
/**
 * Freigestelltes Foto anzeigen (Auswahlkarten von Blade, Ratchet und Bit, Steckbrief).
 * War das Wiki-Foto schon freigestellt, ist `cut` die Original-Adresse: Dann mit derselben Lesefreigabe laden wie
 * beim Freistellen. Safari behandelt denselben Abruf mit und ohne `crossorigin` im Zwischenspeicher getrennt, ein
 * zweiter, anderer Abruf kann dort scheitern. Scheitert die Anzeige trotzdem, meldet `onFail` es – der Aufrufer zeigt
 * dann das unveränderte Foto statt eines Platzhalters für ein kaputtes Bild.
 */
export function CutImg({ cut, src, common, onFail }: { cut: string; src: string; common: { alt: string; decoding: 'async'; referrerpolicy: 'no-referrer' }; onFail: () => void }) {
  return <img src={cut} {...common} crossorigin={cut === src ? 'anonymous' : undefined} onError={onFail} />;
}

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

/**
 * Foto-Bühne: das ganze Blade-Foto (unbeschnitten) auf hellem Sockel – für Termine und das Kombo-Ergebnis.
 * Während des Ladens dunkel, bei Fehler oder ohne Foto das Emblem in der Typ-Farbe.
 * `sharp` lädt für große Darstellung zusätzlich die größere Fassung desselben Fotos.
 * `noteFor` kann aus dem Bildtitel einen Hinweis machen (z. B. „Abb. ähnlich“).
 */
export function BladeStage({
  blade,
  name,
  size = 'sm',
  sharp = false,
  noteFor,
}: {
  blade: Pick<Blade, 'id' | 'type'>;
  name: string;
  size?: 'sm' | 'lg' | 'xl';
  sharp?: boolean;
  noteFor?: (imageTitle: string) => string | null;
}) {
  const { images, openImage } = useApp();
  const img = images.blades[blade.id];
  const photo = usePhotoState(img?.thumb);
  const wrap = `stage-wrap stage-${size}`;
  if (!img || photo.status === 'failed') {
    return (
      <span class={wrap}>
        <span class={`stage-photo stage-fallback type-fg-${blade.type}`} role="img" aria-label={`${name} (kein Foto verfügbar)`}>
          <BeyEmblem />
        </span>
      </span>
    );
  }
  const note = photo.status === 'ok' ? (noteFor?.(img.title) ?? null) : null;
  return (
    <span class={wrap}>
      <button type="button" class={`stage-photo${photo.status === 'ok' ? ' is-loaded' : ''}`} onClick={() => openImage(blade.id)} aria-label={`${name}: Bild vergrößern`}>
        <img
          src={img.thumb}
          srcset={sharp ? `${img.thumb} 392w, ${largeUrl(img.thumb)} 700w` : undefined}
          sizes={sharp ? '(max-width: 380px) 148px, 176px' : undefined}
          alt={name}
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          {...photo.imgProps}
        />
      </button>
      {note && <span class="stage-note">{note}</span>}
    </span>
  );
}

/**
 * Großes Blade-Foto für Auswahlkarte und Steckbrief: wenn möglich freigestellt (ohne Hintergrund), sonst als runder Ausschnitt.
 *
 * Ablauf: Das Foto wird mit Lesefreigabe geladen und im Gerät freigestellt (siehe lib/cutout). Erlaubt das Wiki das
 * nicht oder hat das Foto keinen hellen, gleichmäßigen Hintergrund, erscheint es wie bisher rund beschnitten.
 * Ohne Foto oder bei Ladefehler: Emblem in der Typ-Farbe.
 * `sharp` nimmt die größere Fassung desselben Fotos; `zoomable` öffnet beim Antippen die Großansicht.
 */
export function BladePhoto({
  blade,
  alt,
  variant,
  sharp = false,
  zoomable = false,
}: {
  blade: Pick<Blade, 'id' | 'type'>;
  alt: string;
  variant: 'card' | 'hero';
  sharp?: boolean;
  zoomable?: boolean;
}) {
  const { images, openImage } = useApp();
  const img = images.blades[blade.id];
  const src = img ? (sharp ? largeUrl(img.thumb) : img.thumb) : undefined;
  // Foto-Adresse, deren Laden mit Lesefreigabe gescheitert ist – dann normal laden.
  const [noAccess, setNoAccess] = useState<string | null>(null);
  // Foto-Adresse, deren freigestelltes Bild nicht angezeigt werden konnte – dann der runde Ausschnitt.
  const [cutFailed, setCutFailed] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const plain = usePhotoState(src);

  const base = `blade-photo blade-photo-${variant}`;
  if (!src || plain.status === 'failed') {
    return (
      <span class={`${base} is-emblem type-fg-${blade.type}`} role="img" aria-label={alt || undefined} aria-hidden={alt ? undefined : 'true'}>
        <BeyEmblem />
      </span>
    );
  }

  const cut = cutFailed === src ? null : cachedCutout(src);
  const mode: 'cut' | 'round' | 'try' = cut ? 'cut' : cut === null || cutoutBlocked() || noAccess === src ? 'round' : 'try';
  const common = { alt, decoding: 'async' as const, referrerpolicy: 'no-referrer' as const };
  let pic;
  if (mode === 'cut') {
    pic = <CutImg key="cut" cut={cut!} src={src} common={common} onFail={() => setCutFailed(src)} />;
  } else if (mode === 'try') {
    pic = (
      <img
        key="try"
        src={src}
        {...common}
        crossorigin="anonymous"
        loading="lazy"
        onLoad={(e) => void cutoutFromImage(e.currentTarget, src).then(() => alive.current && redraw((n) => n + 1))}
        onError={() => setNoAccess(src)}
      />
    );
  } else {
    pic = (
      <img
        key="round"
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
  const loading = mode === 'try' || (mode === 'round' && plain.status === 'loading');
  const cls = `${base} is-${mode === 'try' ? 'round' : mode}${loading ? ' is-loading' : ''}`;
  if (!zoomable) return <span class={cls}>{pic}</span>;
  return (
    <button type="button" class={`${cls} zoom`} onClick={() => openImage(blade.id)} aria-label={`${alt}: Bild vergrößern`}>
      {pic}
    </button>
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
