import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useModal } from '../lib/useModal';
import { canShareFile, DECK_FORMATS, isIOS, shareImageFile, type DeckFormat } from '../lib/deckImage';
import { inAndroidApp, saveBlob } from '../lib/download';
import { Check, Download, Hand, ImageDown, Maximize2, Minimize2, Share, X } from 'lucide-preact';

interface Props {
  /** Fertiges Bild im Hochformat (4:5) */
  initial: File;
  /** Erzeugt das Bild in einem anderen Format (gleicher Inhalt, andere Leinwand) */
  make: (format: DeckFormat) => Promise<File>;
  onClose: () => void;
}

const ORDER: DeckFormat[] = ['post', 'square', 'story'];

/**
 * Vorschau der Deck-Grafik: Seitenverhältnis wählen, dann „In Fotos sichern“, „Teilen“ oder „Schließen“.
 * Gleiches Fenster-System wie die Auswahl (useModal, Kopfzeile, Griff, Schließgesten).
 *
 * Was eine Website darf: Direkt in die Fotomediathek schreiben kann sie unter iOS nicht. Der direkteste Weg ist
 * das Gedrückthalten des Bildes → „Zu Fotos hinzufügen“ (ohne Umweg über Dateien oder das Teilen-Menü).
 * „In Fotos sichern“ zeigt deshalb das Bild groß mit genau diesem Hinweis. Ob gespeichert wurde, meldet iOS nicht –
 * es gibt keine „Gespeichert“-Bestätigung. Android-App: Speichern über die App. Sonst: Download.
 */
function DeckExportSheetInner({ initial, make, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = useModal(ref, () => closeRef.current(), { animate: true });
  const [zoom, setZoom] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [msg, setMsg] = useState('');

  // Bilder je Format: nur einmal erzeugen; Objekt-URLs gehören diesem Fenster und werden beim Schließen freigegeben.
  const [format, setFormat] = useState<DeckFormat>('post');
  const [images, setImages] = useState<Partial<Record<DeckFormat, { file: File; url: string }>>>(() => ({ post: { file: initial, url: URL.createObjectURL(initial) } }));
  const [loading, setLoading] = useState<DeckFormat | null>(null);
  const urls = useRef<string[]>([]);
  urls.current = Object.values(images).map((i) => i!.url);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const choose = async (f: DeckFormat) => {
    setMsg('');
    setFormat(f);
    if (images[f] || loading === f) return;
    setLoading(f);
    try {
      const file = await make(f);
      if (!alive.current) return;
      setImages((m) => (m[f] ? m : { ...m, [f]: { file, url: URL.createObjectURL(file) } }));
    } catch {
      if (alive.current) setMsg('Dieses Format konnte nicht erstellt werden.');
    } finally {
      if (alive.current) setLoading((l) => (l === f ? null : l));
    }
  };

  const current = images[format];
  const ios = isIOS();
  const shareable = !!current && canShareFile(current.file);
  const android = inAndroidApp();

  // Ein Teilen-Menü zur Zeit: Ein zweiter Tipp, solange es offen ist, würde mit InvalidStateError scheitern.
  const busy = useRef(false);
  const share = async () => {
    if (!current || busy.current) return;
    busy.current = true;
    setMsg('');
    try {
      // Kein await davor: navigator.share muss direkt im Tipp starten, sonst blockt iOS.
      const res = await shareImageFile(current.file);
      if (res === 'failed') setMsg('Teilen ging nicht. Halte das Bild gedrückt, um es zu sichern oder zu teilen.');
    } finally {
      busy.current = false;
    }
  };
  const download = async () => {
    if (!current) return;
    setMsg('');
    try {
      const viaApp = await saveBlob(current.file, current.file.name);
      // Die Seite weiß nur, dass der Download angestoßen wurde – nicht, ob der Browser ihn ausgeführt hat.
      setMsg(viaApp ? '' : 'Download gestartet.');
    } catch {
      setMsg('Speichern ging nicht. Halte das Bild gedrückt oder klicke es mit der rechten Maustaste an, um es zu sichern.');
    }
  };

  const meta = DECK_FORMATS[format];
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={ref} class={`sheet glass deck-export${photoMode ? ' is-photo-mode' : ''}`} role="dialog" aria-modal="true" aria-label="Deck-Bild" tabIndex={-1}>
        <div class="sheet-grab" aria-hidden="true" />
        <div class="win-head">
          <div class="win-heading">
            <h2 class="win-title">Deck-Bild</h2>
            <p class="win-sub win-sub-plain">{photoMode ? 'In Fotos sichern' : 'Format wählen, dann sichern oder teilen.'}</p>
          </div>
          <button type="button" class="icon-btn win-close" onClick={close} aria-label="Schließen">
            <X aria-hidden="true" />
          </button>
        </div>
        <div class="win-scroll deck-export-body">
          {!photoMode && (
            <div class="deck-formats" role="group" aria-label="Format">
              {ORDER.map((f) => (
                <button key={f} type="button" class={`chip deck-format deck-format-${f}${format === f ? ' chip-on' : ''}`} aria-pressed={format === f} onClick={() => void choose(f)}>
                  <span class="deck-format-shape" aria-hidden="true" />
                  <span class="deck-format-label">{DECK_FORMATS[f].label}</span>
                  <span class="deck-format-ratio">{DECK_FORMATS[f].ratio}</span>
                </button>
              ))}
            </div>
          )}
          {photoMode && (
            <p class="deck-photo-hint" role="status">
              <Hand aria-hidden="true" />
              <span>
                <strong>Auf einen Kreisel oder eine freie Stelle drücken und halten</strong>, dann „Zu Fotos hinzufügen“ wählen. Auf Schrift
                markiert iOS sonst nur den Text.
              </span>
            </p>
          )}
          <div class={`deck-preview deck-preview-${format}${zoom ? ' is-zoomed' : ''}${current ? '' : ' is-loading'}`} style={current ? undefined : { aspectRatio: `${meta.w} / ${meta.h}` }}>
            {current ? (
              <div class="deck-preview-scroll" tabIndex={zoom ? 0 : undefined} role={zoom ? 'region' : undefined} aria-label={zoom ? 'Vergrößertes Deck-Bild, verschiebbar' : undefined}>
                <img src={current.url} alt={`Dein Deck als Bild (${meta.label} ${meta.ratio})`} width={meta.w} height={meta.h} />
              </div>
            ) : (
              <span class="deck-preview-wait" role="status">
                <span class="spinner" aria-hidden="true" /> {meta.label} wird erstellt …
              </span>
            )}
            {current && !photoMode && (
              <button type="button" class="icon-btn deck-preview-zoom" onClick={() => setZoom((z) => !z)} aria-pressed={zoom} aria-label="Bild vergrößern">
                {zoom ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
              </button>
            )}
          </div>
          <div class="deck-export-actions">
            {photoMode ? (
              <button type="button" class="btn btn-primary" onClick={() => setPhotoMode(false)}>
                <Check aria-hidden="true" /> Fertig
              </button>
            ) : ios ? (
              <button
                type="button"
                class="btn btn-primary"
                disabled={!current}
                onClick={() => {
                  setMsg('');
                  setZoom(false);
                  setPhotoMode(true);
                }}
              >
                <ImageDown aria-hidden="true" /> In Fotos sichern
              </button>
            ) : (
              <button type="button" class="btn btn-primary" disabled={!current} onClick={() => void download()}>
                <Download aria-hidden="true" /> {android ? 'Speichern' : 'Bild speichern'}
              </button>
            )}
            {!photoMode && shareable && (
              <button type="button" class="btn" onClick={() => void share()}>
                <Share aria-hidden="true" /> Teilen
              </button>
            )}
            {!photoMode && (
              <button type="button" class="btn btn-ghost" onClick={close}>
                Schließen
              </button>
            )}
          </div>
          {msg && (
            <p class="muted deck-export-msg" role="status">
              {msg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function DeckExportSheet(props: Props) {
  return createPortal(<DeckExportSheetInner {...props} />, document.body);
}
