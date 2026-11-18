import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useModal } from '../lib/useModal';
import type { Combo, Database } from '../lib/types';
import type { UserState } from '../lib/storage';
import { newId } from '../lib/storage';
import { nb, resolveCombo } from '../lib/analysis';
import { displayName } from '../lib/names';
import { FINISH, type Finish, type Match } from '../lib/matches';
import { DeckPicker, DEFAULT_DECK, toPart, type Part } from './DeckPicker';
import { Flag, Undo2 } from 'lucide-preact';
import { ConfirmSheet } from './ConfirmSheet';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  onClose: () => void;
}

const valid = (db: Database, p: Part) => !!resolveCombo(db, { id: '', ...p });

/**
 * Live-Punktezähler fürs Stadion: Punkte nach WBO (Spin 1, Over 2, Burst 2, Xtreme 3), Ziel 4 oder 7.
 * Zwei Arten: nur Punkte zählen (ohne Kreisel) oder mit Kreiseln – dann landet jede Runde im Battle-Tagebuch.
 * Mit 3er-Deck kommt Runde für Runde der nächste Kreisel dran (wie im Turnier).
 */
function LiveMatchInner({ db, state, update, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const savedDeck = state.deck.map((id) => state.combos.find((c) => c.id === id)).filter((c): c is Combo => !!c && valid(db, c));
  const savedOpp = state.opponent.filter((c) => valid(db, c));
  const [target, setTarget] = useState<4 | 7>(4);
  const [withBeys, setWithBeys] = useState(savedDeck.length > 0);
  const [mineDeck, setMineDeck] = useState<Part[]>(() =>
    savedDeck.length === 3 ? savedDeck.map(toPart) : savedDeck.length ? [toPart(savedDeck[0]!)] : [DEFAULT_DECK[0]!],
  );
  const [oppDeck, setOppDeck] = useState<Part[]>(() => (savedOpp.length ? savedOpp.map(toPart) : [{ bladeId: 'WizardRod', ratchetId: '1-60', bitId: 'H' }]));
  const [saveDeck, setSaveDeck] = useState(savedDeck.length < 3);
  const [log, setLog] = useState<{ won: boolean; finish: Finish; id?: string }[]>([]);
  const [setup, setSetup] = useState(true);

  // Rotation aus der Rundenzahl: Rückgängig bringt automatisch den richtigen Kreisel zurück.
  const mine = mineDeck[log.length % mineDeck.length]!;
  const opp = oppDeck[log.length % oppDeck.length]!;
  const me = log.filter((m) => m.won).reduce((s, m) => s + FINISH[m.finish].points, 0);
  const them = log.filter((m) => !m.won).reduce((s, m) => s + FINISH[m.finish].points, 0);
  const over = me >= target || them >= target;
  const ready = !withBeys || (mineDeck.every((p) => valid(db, p)) && oppDeck.every((p) => valid(db, p)));

  // Schließen mit Rückfrage, wenn ein Match läuft.
  const running = log.length > 0 && !over;
  const [asking, setAsking] = useState(false);
  const close = () => (running ? setAsking(true) : onClose());
  useModal(ref, close);

  // Bildschirm während des Matches anlassen (wo unterstützt).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let disposed = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request('screen')
      .then((l) => (disposed ? void l.release().catch(() => undefined) : (lock = l)))
      .catch(() => undefined);
    return () => {
      disposed = true;
      void lock?.release().catch(() => undefined);
    };
  }, []);

  const label = (c: Part) => {
    const r = resolveCombo(db, { id: '', ...c });
    return r ? nb(`${displayName(r.blade)} ${r.ratchet?.id ?? ''}${r.bit.id}`) : '–';
  };

  const score = (won: boolean, finish: Finish) => {
    if (over) return;
    navigator.vibrate?.(won ? 40 : [20, 40, 20]);
    if (!withBeys) {
      setLog((l) => [...l, { won, finish }]);
      return;
    }
    const m: Match = { id: newId(), date: new Date().toISOString(), mine, opp, won, finish };
    setLog((l) => [...l, { won, finish, id: m.id }]);
    update((s) => ({ ...s, matches: [...s.matches, m].slice(-500) }));
  };
  const undo = () => {
    const last = log[log.length - 1];
    if (!last) return;
    setLog((l) => l.slice(0, -1));
    if (last.id) update((s) => ({ ...s, matches: s.matches.filter((m) => m.id !== last.id) }));
  };
  const restart = () => setLog([]);
  const start = () => {
    if (!ready) return;
    // Gewähltes 3er-Deck auf Wunsch als „Mein Deck“ speichern
    if (withBeys && saveDeck && mineDeck.length === 3) {
      update((s) => {
        const ids: string[] = [];
        const combos = [...s.combos];
        mineDeck.forEach((p, i) => {
          const found = combos.find((c) => c.bladeId === p.bladeId && (c.ratchetId ?? '') === (p.ratchetId ?? '') && c.bitId === p.bitId);
          if (found) ids.push(found.id);
          else {
            const c = { id: newId(), name: `Deck ${i + 1}`, ...p };
            combos.unshift(c);
            ids.push(c.id);
          }
        });
        return { ...s, combos, deck: ids };
      });
      setSaveDeck(false);
    }
    setSetup(false);
  };

  const pad = (won: boolean) => (
    <div class={`live-side ${won ? 'me' : 'them'}`}>
      <div class="live-head">
        <span class="live-who">
          {won ? 'Du' : 'Gegner'}
          {withBeys && (won ? mineDeck : oppDeck).length > 1 && <small> · Kreisel {(log.length % (won ? mineDeck : oppDeck).length) + 1}/{(won ? mineDeck : oppDeck).length}</small>}
        </span>
        {withBeys && <span class="live-combo">{label(won ? mine : opp)}</span>}
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
        {setup ? (
          <span class="btn-sm" aria-hidden="true" />
        ) : (
          <button type="button" class="btn btn-sm" onClick={() => setSetup(true)}>
            Einstellungen
          </button>
        )}
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
          <p class="eyebrow">Wie willst du spielen?</p>
          <div class="segmented seg-2" role="group" aria-label="Spielart">
            <button type="button" class={!withBeys ? 'on' : ''} aria-pressed={!withBeys} onClick={() => setWithBeys(false)}>
              Nur Punkte zählen
            </button>
            <button type="button" class={withBeys ? 'on' : ''} aria-pressed={withBeys} onClick={() => setWithBeys(true)}>
              Mit Kreiseln
            </button>
          </div>
          {!withBeys ? (
            <p class="fineprint">Einfach losspielen – ohne Kreisel eintragen. Wird nicht im Tagebuch gespeichert.</p>
          ) : (
            <>
              <p class="fineprint">Jede Runde landet im Battle-Tagebuch. Beim 3er-Deck kommt nach jeder Runde der nächste Kreisel dran.</p>
              <div class="side-head">
                <p class="eyebrow">Dein Deck</p>
                <div class="segmented seg-2 seg-mini" role="group" aria-label="Anzahl deiner Kreisel">
                  <button type="button" class={mineDeck.length === 1 ? 'on' : ''} aria-pressed={mineDeck.length === 1} onClick={() => setMineDeck(mineDeck.slice(0, 1))}>
                    1 Kreisel
                  </button>
                  <button
                    type="button"
                    class={mineDeck.length === 3 ? 'on' : ''}
                    aria-pressed={mineDeck.length === 3}
                    onClick={() => setMineDeck(savedDeck.length === 3 ? savedDeck.map(toPart) : [mineDeck[0]!, ...DEFAULT_DECK.slice(1)])}
                  >
                    3er-Deck
                  </button>
                </div>
              </div>
              <DeckPicker db={db} value={mineDeck} onChange={setMineDeck} label="Dein Kreisel" />
              {mineDeck.length === 3 && (
                <label class="toggle">
                  <input type="checkbox" checked={saveDeck} onChange={(e) => setSaveDeck(e.currentTarget.checked)} />
                  <span>Als „Mein Deck“ speichern</span>
                </label>
              )}
              <div class="side-head">
                <p class="eyebrow">Gegner</p>
                <div class="segmented seg-2 seg-mini" role="group" aria-label="Anzahl Gegner-Kreisel">
                  <button type="button" class={oppDeck.length === 1 ? 'on' : ''} aria-pressed={oppDeck.length === 1} onClick={() => setOppDeck(oppDeck.slice(0, 1))}>
                    1 Kreisel
                  </button>
                  <button
                    type="button"
                    class={oppDeck.length === 3 ? 'on' : ''}
                    aria-pressed={oppDeck.length === 3}
                    onClick={() => setOppDeck(savedOpp.length === 3 ? savedOpp.map(toPart) : [oppDeck[0]!, DEFAULT_DECK[2]!, DEFAULT_DECK[0]!])}
                  >
                    3er-Deck
                  </button>
                </div>
              </div>
              <DeckPicker db={db} value={oppDeck} onChange={setOppDeck} label="Gegner-Kreisel" />
            </>
          )}
          <button type="button" class="btn btn-primary" onClick={start} disabled={!ready}>
            {log.length ? 'Weiter' : "Los geht's"}
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
              <Undo2 aria-hidden="true" /> Rückgängig
            </button>
          </div>
          {pad(true)}
        </>
      )}
      {asking && (
        <ConfirmSheet
          title="Match beenden?"
          note={withBeys ? 'Die bisherigen Runden bleiben im Tagebuch.' : 'Der Spielstand geht verloren.'}
          confirmLabel="Beenden"
          cancelLabel="Weiterspielen"
          icon={Flag}
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
export function LiveMatch(props: Parameters<typeof LiveMatchInner>[0]) {
  return createPortal(<LiveMatchInner {...props} />, document.body);
}
