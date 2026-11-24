import { tr } from '../lib/i18n';
import { createPortal } from 'preact/compat';
import { useRef, useState } from 'preact/hooks';
import { FINISH, type Finish } from '../lib/matches';
import { useModal } from '../lib/useModal';
import { LogOut, Undo2 } from 'lucide-preact';
import { ConfirmSheet } from './ConfirmSheet';

interface Props {
  left: string;
  right: string;
  target: 4 | 7;
  onDone: (left: number, right: number) => void;
  onClose: () => void;
}

/** Punktezähler für ein Turnier-Match zwischen zwei Spielern (ohne Kombos, ohne Tagebuch). */
function DuelScorerInner({ left, right, target, onDone, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [log, setLog] = useState<{ side: 0 | 1; finish: Finish }[]>([]);
  const score = (side: 0 | 1) => log.filter((l) => l.side === side).reduce((s, l) => s + FINISH[l.finish].points, 0);
  const l = score(0);
  const r = score(1);
  const over = l >= target || r >= target;
  // Mit Zwischenstand erst nachfragen (eigenes Fenster statt window.confirm)
  const [asking, setAsking] = useState(false);
  const close = () => (log.length ? setAsking(true) : onClose());
  useModal(ref, close);

  const side = (s: 0 | 1) => (
    <div class={`live-side ${s === 1 ? 'me' : 'them'}`}>
      <div class="live-head">
        <span class="live-combo">{s === 0 ? left : right}</span>
      </div>
      <span class="live-score" aria-live="polite">
        {s === 0 ? l : r}
        <small>/{target}</small>
      </span>
      <div class="live-btns" role="group" aria-label={tr('Punkte für {0}', s === 0 ? left : right)}>
        {(Object.keys(FINISH) as Finish[]).map((f) => (
          <button
            key={f}
            type="button"
            disabled={over}
            onClick={() => {
              setLog((x) => [...x, { side: s, finish: f }]);
              navigator.vibrate?.(30);
            }}
            aria-label={tr('{0}-Finish für {1}, {2} Punkte', FINISH[f].label, s === 0 ? left : right, FINISH[f].points)}
          >
            <strong>{FINISH[f].label}</strong>
            <small>+{FINISH[f].points}</small>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={ref} class="live" role="dialog" aria-modal="true" aria-label={tr('{0} gegen {1}', left, right)} tabIndex={-1}>
      <div class="live-bar">
        <button type="button" class="btn btn-sm" onClick={close}>
          {tr('Schließen')}
        </button>
        <span class="live-title">{tr('Turnier-Match')}</span>
        <span class="btn-sm" aria-hidden="true" />
      </div>
      {side(0)}
      <div class="live-mid">
        {over ? (
          <button type="button" class="btn btn-primary" onClick={() => onDone(l, r)}>
            {tr('Ergebnis')} {l}:{r} {tr('eintragen')}
          </button>
        ) : (
          <span class="muted">{tr('Runde')} {log.length + 1}</span>
        )}
        <button type="button" class="btn btn-sm" onClick={() => setLog((x) => x.slice(0, -1))} disabled={!log.length}>
          <Undo2 aria-hidden="true" /> {tr('Rückgängig')}
        </button>
      </div>
      {side(1)}
      {asking && (
        <ConfirmSheet
          title={over ? tr('Ergebnis nicht eingetragen') : tr('Zähler schließen?')}
          note={over ? tr('Das Ergebnis {0}:{1} wird dann nicht ins Turnier übernommen.', l, r) : tr('Der Zwischenstand geht verloren.')}
          confirmLabel={tr('Schließen')}
          cancelLabel={tr('Weiterzählen')}
          icon={LogOut}
          onConfirm={onClose}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
}

/**
 * Vollbild-Fenster direkt in <body> zeichnen: So bleibt es auch dann bildschirmfüllend, wenn ein
 * Elternelement (z. B. eine Karte mit Einblend-Animation) für position: fixed als Bezugsrahmen dient –
 * Safari auf dem iPhone macht das bei animierten Elementen.
 */
export function DuelScorer(props: Parameters<typeof DuelScorerInner>[0]) {
  return createPortal(<DuelScorerInner {...props} />, document.body);
}
