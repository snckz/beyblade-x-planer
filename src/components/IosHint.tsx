import { useState } from 'preact/hooks';
import { isIosBrowserTab } from '../lib/transfer';

const KEY = 'bxplaner:ios-hint';

/**
 * iPhone/iPad in Safari: Hinweis, die App zum Home-Bildschirm hinzuzufügen.
 * Wichtig, weil Safari Website-Daten nach 7 Tagen ohne Besuch löschen kann – als Home-Bildschirm-App nicht.
 */
export function IosHint({ hasData }: { hasData: boolean }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  if (hidden || !isIosBrowserTab()) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* privat-Modus */
    }
  };
  return (
    <div class="card glass ios-hint" role="note">
      <p class="row-title">Als App auf den Home-Bildschirm</p>
      <p class="muted">
        Tippe unten auf{' '}
        <span class="share-ico" aria-label="Teilen">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" />
          </svg>
        </span>{' '}
        <strong>Teilen</strong> → <strong>„Zum Home-Bildschirm“</strong>. Dann startet die App im Vollbild, schneller und auch offline.
      </p>
      {hasData && <p class="muted">Wichtig: In Safari können deine Daten nach 7 Tagen ohne Besuch gelöscht werden. Als App bleiben sie erhalten – übertrag sie danach mit „Auf anderes Gerät“.</p>}
      <button type="button" class="btn btn-sm" onClick={close}>
        Verstanden
      </button>
    </div>
  );
}
