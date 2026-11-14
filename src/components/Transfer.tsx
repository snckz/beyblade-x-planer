import { useEffect, useState } from 'preact/hooks';
import type { UserState } from '../lib/storage';
import { encodeState, transferLink } from '../lib/transfer';

/** Link + QR-Code, um Sammlung, Kombos, Wunschliste und Kämpfe auf ein anderes Gerät zu holen. */
export function Transfer({ state, onClose }: { state: UserState; onClose: () => void }) {
  const [link, setLink] = useState('');
  const [svg, setSvg] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const url = transferLink(await encodeState(state));
      if (!alive) return;
      setLink(url);
      // QR-Codes fassen nur begrenzt Daten; sehr große Sammlungen → nur Link.
      if (url.length <= 2300) {
        const { renderSVG } = await import('uqr');
        if (alive) setSvg(renderSVG(url, { border: 2, whiteColor: '#ffffff', blackColor: '#0b0c12' }));
      }
    })().catch(() => setMsg('Link konnte nicht erstellt werden.'));
    return () => {
      alive = false;
    };
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setMsg('Link kopiert – auf dem anderen Gerät im Browser öffnen.');
    } catch {
      setMsg('Kopieren nicht möglich – halte den Link gedrückt und kopiere ihn manuell.');
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Beyblade X Planer – meine Daten', url: link });
    } catch {
      /* abgebrochen */
    }
  };

  return (
    <div class="card glass stack-sm transfer">
      <p class="row-title">Auf anderes Gerät übertragen</p>
      <p class="muted">Scanne den Code mit dem anderen Gerät oder schick dir den Link. Dort wird alles mit den vorhandenen Daten zusammengeführt.</p>
      {svg ? (
        // SVG stammt aus uqr (nur Pfade, kein Nutzer-HTML)
        <div class="qr" role="img" aria-label="QR-Code mit deinen Daten" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        link && <p class="fineprint">Deine Daten sind zu umfangreich für einen QR-Code – nutze den Link.</p>
      )}
      <div class="btn-row">
        <button type="button" class="btn btn-primary" onClick={copy} disabled={!link}>
          Link kopieren
        </button>
        {'share' in navigator && (
          <button type="button" class="btn" onClick={share} disabled={!link}>
            Teilen …
          </button>
        )}
        <button type="button" class="btn btn-ghost" onClick={onClose}>
          Fertig
        </button>
      </div>
      {msg && (
        <p class="muted" role="status">
          {msg}
        </p>
      )}
      <p class="fineprint">Der Link enthält deine Daten. Schick ihn nur an dich selbst.</p>
    </div>
  );
}
