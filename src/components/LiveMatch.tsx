import { useEffect, useRef, useState } from 'preact/hooks';
import type { Combo, Database } from '../lib/types';
import type { UserState } from '../lib/storage';
import { newId } from '../lib/storage';
import { nb, resolveCombo } from '../lib/analysis';
import { displayName } from '../lib/names';
import { FINISH, type Finish, type Match } from '../lib/matches';
import { ComboPicker } from './ComboPicker';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  onClose: () => void;
}

type Part = Omit<Combo, 'id' | 'name'>;
const part = (c: Combo): Part => ({ bladeId: c.bladeId, ratchetId: c.ratchetId, bitId: c.bitId });
const same = (a: Part, b: Part) => a.bladeId === b.bladeId && (a.ratchetId ?? '') === (b.ratchetId ?? '') && a.bitId === b.bitId;
/** Nächster Kreisel der Rotation – abgeleitet aus dem aktuellen, damit Handwahl und Rückgängig nie aus dem Takt kommen. */
const nextIn = (list: Combo[], cur: Part) => {
  const i = list.findIndex((c) => same(part(c), cur));
  return part(list[(i + 1) % list.length]!);
};

function fallback(db: Database, preferred: Part, skipBlade?: string): Part {
  if (resolveCombo(db, { id: '', ...preferred })) return preferred;
  const blade = db.blades.find((b) => b.id !== skipBlade && resolveCombo(db, { id: '', bladeId: b.id, ratchetId: b.integratedRatchet ? undefined : db.ratchets[0]?.id, bitId: db.bits[0]?.id ?? '' }));
  return { bladeId: blade?.id ?? '', ratchetId: blade?.integratedRatchet ? undefined : db.ratchets[0]?.id, bitId: db.bits[0]?.id ?? '' };
}

/**
 * Live-Punktezähler fürs Stadion: Punkte nach WBO (Spin 1, Over 2, Burst 2, Xtreme 3), Ziel 4 oder 7.
 * Jede Runde landet automatisch im Battle-Tagebuch. Mit eigenem Deck rotieren die Kreisel Runde für Runde.
 */
export function LiveMatch({ db, state, update, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const deck = state.deck.map((id) => state.combos.find((c) => c.id === id)).filter((c): c is Combo => !!c && !!resolveCombo(db, c));
  const oppDeck = state.opponent.filter((c) => resolveCombo(db, c));
  const [target, setTarget] = useState<4 | 7>(4);
  const [mine, setMine] = useState<Part>(() => (deck[0] ? part(deck[0]) : fallback(db, { bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' })));
  const [opp, setOpp] = useState<Part>(() => (oppDeck[0] ? part(oppDeck[0]) : fallback(db, { bladeId: 'WizardRod', ratchetId: '1-60', bitId: 'H' }, 'DranSword')));
  const [rotate, setRotate] = useState(deck.length === 3);
  const [log, setLog] = useState<Match[]>([]);
  const [setup, setSetup] = useState(true);

  const me = log.filter((m) => m.won).reduce((s, m) => s + FINISH[m.finish].points, 0);
  const them = log.filter((m) => !m.won).reduce((s, m) => s + FINISH[m.finish].points, 0);
  const over = me >= target || them >= target;

  // Schließen mit Rückfrage, wenn ein Match läuft (die Runden selbst sind schon im Tagebuch).
  const running = log.length > 0 && !over;
  const close = () => {
    if (running && !window.confirm('Match beenden? Die bisherigen Runden bleiben im Tagebuch.')) return;
    onClose();
  };
  // Per Ref, damit der Effekt nur beim Öffnen/Schließen läuft und nicht bei jeder Runde (Fokus, Wake-Lock).
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    // Bildschirm während des Matches anlassen (wo unterstützt).
    let lock: { release: () => Promise<void> } | null = null;
    let disposed = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request('screen')
      .then((l) => (disposed ? void l.release().catch(() => undefined) : (lock = l)))
      .catch(() => undefined);
    const prev = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    ref.current?.focus();
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      const root = ref.current;
      if (!root) return;
      // Ein offenes Unter-Fenster (Teile-Auswahl, Großansicht) behandelt seine Tasten selbst.
      const nested = [...document.querySelectorAll('[aria-modal="true"]')].some((d) => d !== root);
      if (nested) return;
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        // Fokus im Dialog halten
        const f = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      disposed = true;
      void lock?.release().catch(() => undefined);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);

  const label = (c: Part) => {
    const r = resolveCombo(db, { id: '', ...c });
    return r ? nb(`${displayName(r.blade)} ${r.ratchet?.id ?? ''}${r.bit.id}`) : '–';
  };

  const score = (won: boolean, finish: Finish) => {
    if (over || !resolveCombo(db, { id: '', ...mine }) || !resolveCombo(db, { id: '', ...opp })) return;
    const m: Match = { id: newId(), date: new Date().toISOString(), mine, opp, won, finish };
    setLog((l) => [...l, m]);
    update((s) => ({ ...s, matches: [...s.matches, m].slice(-500) }));
    navigator.vibrate?.(won ? 40 : [20, 40, 20]);
    // Turnier-Rotation: nächster Kreisel aus dem Deck
    if (rotate && deck.length === 3) setMine(nextIn(deck, mine));
    if (oppDeck.length > 1) setOpp(nextIn(oppDeck, opp));
  };
  const undo = () => {
    const last = log[log.length - 1];
    if (!last) return;
    setLog((l) => l.slice(0, -1));
    update((s) => ({ ...s, matches: s.matches.filter((m) => m.id !== last.id) }));
    setMine(last.mine);
    setOpp(last.opp);
  };
  const restart = () => {
    setLog([]);
    if (deck[0]) setMine(part(deck[0]));
    if (oppDeck[0]) setOpp(part(oppDeck[0]));
  };

  const pad = (won: boolean) => (
    <div class={`live-side ${won ? 'me' : 'them'}`}>
      <div class="live-head">
        <span class="live-who">{won ? 'Du' : 'Gegner'}</span>
        <span class="live-combo">{label(won ? mine : opp)}</span>
      </div>
      <span class="live-score" aria-live="polite">
        {won ? me : them}
        <small>/{target}</small>
      </span>
      <div class="live-btns" role="group" aria-label={won ? 'Punkte für dich' : 'Punkte für den Gegner'}>
        {(Object.keys(FINISH) as Finish[]).map((f) => (
          <button key={f} type="button" onClick={() => score(won, f)} disabled={over} aria-label={`${FINISH[f].label}-Finish für ${won ? 'dich' : 'den Gegner'}, ${FINISH[f].points} Punkte`}>
            <strong>{FINISH[f].label}</strong>
            <small>+{FINISH[f].points}</small>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div ref={ref} class="live" role="dialog" aria-modal="true" aria-label="Live-Match" tabIndex={-1}>
      <div class="live-bar">
        <button type="button" class="btn btn-sm" onClick={close}>
          Schließen
        </button>
        <span class="live-title">Live-Match</span>
        <button type="button" class="btn btn-sm" onClick={() => setSetup(!setup)} aria-expanded={setup}>
          {setup ? 'Fertig' : 'Kreisel'}
        </button>
      </div>

      {setup ? (
        <div class="live-setup stack-sm">
          <p class="eyebrow">Ziel</p>
          <div class="segmented seg-2" role="group" aria-label="Punkteziel">
            <button type="button" class={target === 4 ? 'on' : ''} aria-pressed={target === 4} onClick={() => setTarget(4)}>
              4 Punkte (Vorrunde)
            </button>
            <button type="button" class={target === 7 ? 'on' : ''} aria-pressed={target === 7} onClick={() => setTarget(7)}>
              7 Punkte (Finale)
            </button>
          </div>
          <p class="eyebrow">Dein Kreisel</p>
          {deck.length === 3 && (
            <label class="toggle">
              <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.currentTarget.checked)} />
              <span>Deck-Rotation (3on3): nach jeder Runde der nächste Kreisel</span>
            </label>
          )}
          <ComboPicker db={db} value={{ id: 'mine', ...mine }} label="Dein Kreisel" onChange={(c) => setMine(part(c))} />
          <p class="eyebrow">Gegner{oppDeck.length > 1 ? ' (rotiert durch dein eingetragenes Gegner-Deck)' : ''}</p>
          <ComboPicker db={db} value={{ id: 'opp', ...opp }} label="Gegner" onChange={(c) => setOpp(part(c))} />
          <button type="button" class="btn btn-primary" onClick={() => setSetup(false)}>
            Los geht's
          </button>
        </div>
      ) : (
        <>
          {pad(false)}
          <div class="live-mid">
            {over ? (
              <>
                <strong class={me >= target ? 'win' : 'lose'}>{me >= target ? 'Du gewinnst!' : 'Gegner gewinnt'}</strong>
                <button type="button" class="btn btn-primary btn-sm" onClick={restart}>
                  Neues Match
                </button>
              </>
            ) : (
              <span class="muted">Runde {log.length + 1}</span>
            )}
            <button type="button" class="btn btn-sm" onClick={undo} disabled={!log.length}>
              ↶ Rückgängig
            </button>
          </div>
          {pad(true)}
        </>
      )}
    </div>
  );
}
