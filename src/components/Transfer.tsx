import { tr } from '../lib/i18n';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { UserState } from '../lib/storage';
import { decodeState, encodeState, extractCode, importError, isIosBrowserTab, mergeState, transferLink } from '../lib/transfer';
import { ImportConfirm } from './ImportConfirm';

/** Link + QR-Code, um Sammlung, Kombos, Wunschliste und Kämpfe auf ein anderes Gerät zu holen. */
export function Transfer({ state, update, onClose }: { state: UserState; update: (fn: (s: UserState) => UserState) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [paste, setPaste] = useState('');
  const [link, setLink] = useState('');
  const [svg, setSvg] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const url = transferLink(await encodeState(state));
      if (!alive) return;
      setLink(url);
      // Große QR-Codes lassen sich vom Bildschirm kaum scannen → ab ca. 1200 Zeichen nur Link.
      if (url.length <= 1200) {
        const { renderSVG } = await import('uqr');
        if (alive) setSvg(renderSVG(url, { border: 2, whiteColor: '#ffffff', blackColor: '#0b0c12' }));
      }
    })().catch(() => setMsg(tr('Link konnte nicht erstellt werden.')));
    return () => {
      alive = false;
    };
  }, [state]);

  // Panel ins Bild holen und fokussieren, sobald es aufgeht.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    ref.current?.focus();
  }, []);

  // Erst nach Rückfrage im eigenen Fenster zusammenführen
  const [incoming, setIncoming] = useState<UserState | null>(null);
  const doImport = async () => {
    const code = extractCode(paste);
    if (!code) {
      setMsg(tr('Das ist kein gültiger Link oder Code.'));
      return;
    }
    try {
      setIncoming(await decodeState(code));
    } catch (err) {
      setMsg(importError(err));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setMsg(tr('Link kopiert – auf dem anderen Gerät im Browser öffnen.'));
    } catch {
      setMsg(tr('Kopieren nicht möglich – halte den Link gedrückt und kopiere ihn manuell.'));
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: tr('Beyblade X Planer – meine Daten'), url: link });
    } catch {
      /* abgebrochen */
    }
  };

  return (
    <div ref={ref} tabIndex={-1} class="card glass stack-sm transfer" aria-label={tr('Auf anderes Gerät übertragen')}>
      <p class="row-title">{tr('Auf anderes Gerät übertragen')}</p>
      <p class="muted">{tr('Scanne den Code mit dem anderen Gerät oder schick dir den Link. Dort wird alles mit den vorhandenen Daten zusammengeführt.')}</p>
      {svg ? (
        // SVG stammt aus uqr (nur Pfade, kein Nutzer-HTML)
        <div class="qr" role="img" aria-label={tr('QR-Code mit deinen Daten')} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        link && <p class="fineprint">{tr('Deine Daten sind zu umfangreich für einen QR-Code – nutze den Link.')}</p>
      )}
      <div class="btn-row">
        <button type="button" class="btn btn-primary" onClick={copy} disabled={!link}>
          {tr('Link kopieren')}
        </button>
        {'share' in navigator && (
          <button type="button" class="btn" onClick={share} disabled={!link}>
            {tr('Teilen …')}
          </button>
        )}
        <button type="button" class="btn btn-ghost" onClick={onClose}>
          {tr('Fertig')}
        </button>
      </div>
      {msg && (
        <p class="muted" role="status">
          {msg}
        </p>
      )}
      <p class="fineprint">{tr('Der Link enthält deine Daten. Schick ihn nur an dich selbst.')}</p>
      <hr class="sep" />
      <p class="row-title">{tr('Code einfügen')}</p>
      <p class="muted">
        {tr('Hast du den Link von einem anderen Gerät kopiert? Füge ihn hier ein.')}
        {isIosBrowserTab() ? tr(' Tipp: Nutzt du die App vom Home-Bildschirm, mach das dort – Safari und die App haben getrennten Speicher.') : ''}
      </p>
      <input type="text" inputMode="url" autoComplete="off" placeholder={tr('Link oder Code einfügen …')} value={paste} onInput={(e) => setPaste(e.currentTarget.value)} aria-label={tr('Übertragungs-Link einfügen')} />
      <button type="button" class="btn" onClick={doImport} disabled={!paste.trim()}>
        {tr('Übernehmen')}
      </button>
      {incoming && (
        <ImportConfirm
          incoming={incoming}
          onConfirm={() => {
            update((s) => mergeState(s, incoming));
            setPaste('');
            setMsg(tr('Daten übernommen.'));
          }}
          onClose={() => setIncoming(null)}
        />
      )}
    </div>
  );
}
