import { createPortal } from 'preact/compat';
import { useRef, useState } from 'preact/hooks';
import { useModal } from '../lib/useModal';
import { canShareFile, isIOS, shareImageFile } from '../lib/deckImage';
import { inAndroidApp, saveBlob } from '../lib/download';
import { Download, ImageDown, Maximize2, Minimize2, Share, X } from 'lucide-preact';

interface Props {
  file: File;
  /** Objekt-URL der Datei (gehört dem Aufrufer, der sie auch wieder freigibt) */
  url: string;
  onClose: () => void;
}

/**
 * Vorschau der fertigen Deck-Grafik mit „In Fotos sichern“, „Teilen“ und „Schließen“.
 * Gleiches Fenster-System wie die Auswahl (useModal, Kopfzeile, Griff, Schließgesten).
 *
 * Was eine Website darf: Direkt in die Fotomediathek schreiben kann sie unter iOS nicht. Der kürzeste Weg ist das
 * Teilen-Menü mit der Bilddatei – dort „Bild sichern“. Ob der Nutzer das gewählt hat, meldet iOS nicht zurück,
 * deshalb gibt es keine „Gespeichert“-Bestätigung. Android-App: Speichern über die App. Sonst: Download.
 */
function DeckExportSheetInner({ file, url, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = useModal(ref, () => closeRef.current(), { animate: true });
  const [zoom, setZoom] = useState(false);
  const [msg, setMsg] = useState('');

  const ios = isIOS();
  const shareable = canShareFile(file);
  const android = inAndroidApp();

  const share = async (forPhotos: boolean) => {
    setMsg('');
    const res = await shareImageFile(file);
    if (res === 'failed') setMsg(forPhotos ? 'Das Teilen-Menü ließ sich nicht öffnen. Halte das Bild gedrückt und wähle „Zu Fotos hinzufügen“.' : 'Teilen ging nicht. Halte das Bild gedrückt, um es zu sichern oder zu teilen.');
    // 'done': iOS sagt nicht, welche Aktion gewählt wurde – daher kein „Gespeichert“.
    else if (res === 'done' && forPhotos) setMsg('Falls du „Bild sichern“ gewählt hast, liegt das Bild jetzt in Fotos.');
  };
  const download = async () => {
    setMsg('');
    const viaApp = await saveBlob(file, file.name);
    setMsg(viaApp ? '' : 'Das Bild wurde heruntergeladen.');
  };

  // Hauptaktion je nach Gerät: iPhone/iPad → Teilen-Menü („Bild sichern“), Android-App → App, sonst Download
  const photos = ios && shareable;
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={ref} class="sheet glass deck-export" role="dialog" aria-modal="true" aria-label="Deck-Bild" tabIndex={-1}>
        <div class="sheet-grab" aria-hidden="true" />
        <div class="win-head">
          <div class="win-heading">
            <h2 class="win-title">Deck-Bild</h2>
            <p class="win-sub win-sub-plain">Fertig zum Sichern und Teilen.</p>
          </div>
          <button type="button" class="icon-btn win-close" onClick={close} aria-label="Schließen">
            <X aria-hidden="true" />
          </button>
        </div>
        <div class="win-scroll deck-export-body">
          <div class={`deck-preview${zoom ? ' is-zoomed' : ''}`}>
            <div class="deck-preview-scroll">
              <img src={url} alt="Dein Deck als Bild" width={1080} height={1350} />
            </div>
            <button type="button" class="icon-btn deck-preview-zoom" onClick={() => setZoom((z) => !z)} aria-pressed={zoom} aria-label={zoom ? 'Bild verkleinern' : 'Bild vergrößern'}>
              {zoom ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            </button>
          </div>
          <div class="deck-export-actions">
            {photos ? (
              <button type="button" class="btn btn-primary" onClick={() => void share(true)}>
                <ImageDown aria-hidden="true" /> In Fotos sichern
              </button>
            ) : (
              <button type="button" class="btn btn-primary" onClick={() => void download()}>
                <Download aria-hidden="true" /> {android ? 'Speichern' : 'Bild speichern'}
              </button>
            )}
            {shareable && (
              <button type="button" class="btn" onClick={() => void share(false)}>
                <Share aria-hidden="true" /> Teilen
              </button>
            )}
            <button type="button" class="btn btn-ghost" onClick={close}>
              Schließen
            </button>
          </div>
          {msg ? (
            <p class="muted deck-export-msg" role="status">
              {msg}
            </p>
          ) : (
            photos && <p class="fineprint deck-export-msg">„In Fotos sichern“ öffnet das Teilen-Menü – dort „Bild sichern“ wählen. Alternativ: Bild gedrückt halten → „Zu Fotos hinzufügen“.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function DeckExportSheet(props: Props) {
  return createPortal(<DeckExportSheetInner {...props} />, document.body);
}
