import { displayName } from '../lib/names';
import { useState } from 'preact/hooks';
import type { Combo, Database } from '../lib/types';
import type { UserState } from '../lib/storage';
import { newId } from '../lib/storage';
import { comboLabel, nb, resolveCombo } from '../lib/analysis';
import { FINISH, statsByCombo, type Finish, type Match } from '../lib/matches';
import { ComboPicker } from './ComboPicker';
import { Section } from './ui';
import { SwipeRow } from './SwipeRow';
import { showUndo } from '../lib/undo';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
}

type Part = Omit<Combo, 'id' | 'name'>;

const label = (db: Database, c: Part) => {
  const r = resolveCombo(db, { id: '', ...c });
  return r ? nb(`${displayName(r.blade)} ${r.ratchet?.id ?? ''}${r.bit.id}`) : `${c.bladeId} ${c.ratchetId ?? ''}${c.bitId}`;
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Battle-Tagebuch: Kämpfe eintragen, Siegquote und Schwachstellen pro eigener Kombo. */
export function BattleLog({ db, state, update }: Props) {
  // Vorbelegung: erste Kombo aus dem Deck, sonst die erste gespeicherte, sonst ein Standard.
  const first = state.deck.map((id) => state.combos.find((c) => c.id === id)).find(Boolean) ?? state.combos[0];
  const start: Part = first ? { bladeId: first.bladeId, ratchetId: first.ratchetId, bitId: first.bitId } : { bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' };
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<Part>(start);
  const [opp, setOpp] = useState<Part>(state.opponent[0] ? { bladeId: state.opponent[0].bladeId, ratchetId: state.opponent[0].ratchetId, bitId: state.opponent[0].bitId } : { bladeId: 'WizardRod', ratchetId: '1-60', bitId: 'H' });
  const [won, setWon] = useState<boolean | null>(null);
  const [finish, setFinish] = useState<Finish | null>(null);
  const [msg, setMsg] = useState('');

  const saved = state.combos.filter((c) => resolveCombo(db, c));
  const stats = statsByCombo(state.matches);
  const total = state.matches.length;
  const wins = state.matches.filter((m) => m.won).length;

  const complete = (c: Part) => {
    const r = resolveCombo(db, { id: '', ...c });
    return !!r && (r.blade.integratedRatchet ? !c.ratchetId : !!c.ratchetId);
  };
  const ready = won !== null && !!finish && complete(mine) && complete(opp);

  const save = () => {
    if (!ready || won === null || !finish) return;
    const m: Match = { id: newId(), date: new Date().toISOString(), mine, opp, won, finish };
    update((s) => ({ ...s, matches: [...s.matches, m].slice(-500) }));
    setMsg(`${won ? 'Sieg' : 'Niederlage'} per ${FINISH[finish].label} gespeichert.`);
    setWon(null);
    setFinish(null);
  };
  // Löschen nur per Wischen (Papierkorb wie in iOS): sofort, mit „Rückgängig“
  const remove = (id: string) => update((s) => ({ ...s, matches: s.matches.filter((m) => m.id !== id) }));
  const swipeRemove = (m: Match) => {
    const at = state.matches.findIndex((x) => x.id === m.id);
    remove(m.id);
    showUndo('Kampf gelöscht', () => update((s) => (s.matches.some((x) => x.id === m.id) ? s : { ...s, matches: [...s.matches.slice(0, at), m, ...s.matches.slice(at)] })));
  };

  return (
    <Section
      title="Battle-Tagebuch"
      aside={
        <button type="button" class="btn btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Schließen' : '+ Kampf'}
        </button>
      }
    >
      {open && (
        <div class="card glass stack-sm">
          <p class="eyebrow">Meine Kombo</p>
          {saved.length > 0 && (
            <div class="chip-row" role="group" aria-label="Gespeicherte Kombos">
              {saved.slice(0, 8).map((c) => {
                const on = c.bladeId === mine.bladeId && (c.ratchetId ?? '') === (mine.ratchetId ?? '') && c.bitId === mine.bitId;
                const r = resolveCombo(db, c)!;
                return (
                  <button key={c.id} type="button" class={`chip${on ? ' chip-on' : ''}`} aria-pressed={on} onClick={() => setMine({ bladeId: c.bladeId, ratchetId: c.ratchetId, bitId: c.bitId })}>
                    {c.name || nb(comboLabel(r))}
                  </button>
                );
              })}
            </div>
          )}
          <ComboPicker db={db} value={{ id: 'mine', ...mine }} label="Meine Kombo" onChange={({ bladeId, ratchetId, bitId }) => setMine({ bladeId, ratchetId, bitId })} />
          <p class="eyebrow">Gegner</p>
          <ComboPicker db={db} value={{ id: 'opp', ...opp }} label="Gegner-Kombo" onChange={({ bladeId, ratchetId, bitId }) => setOpp({ bladeId, ratchetId, bitId })} />
          <p class="eyebrow">Ergebnis</p>
          <div class="segmented seg-2" role="group" aria-label="Ergebnis">
            <button type="button" class={won === true ? 'on' : ''} aria-pressed={won === true} onClick={() => setWon(true)}>
              Gewonnen
            </button>
            <button type="button" class={won === false ? 'on' : ''} aria-pressed={won === false} onClick={() => setWon(false)}>
              Verloren
            </button>
          </div>
          <div class="segmented seg-4" role="group" aria-label="Finish">
            {(Object.keys(FINISH) as Finish[]).map((f) => (
              <button key={f} type="button" class={finish === f ? 'on' : ''} aria-pressed={finish === f} onClick={() => setFinish(f)}>
                {FINISH[f].label} <small>{FINISH[f].points}P</small>
              </button>
            ))}
          </div>
          {!(complete(mine) && complete(opp)) && <p class="fineprint">Wähle für beide Kreisel Blade, Ratchet und Bit.</p>}
          <button type="button" class="btn btn-primary" disabled={!ready} onClick={save}>
            Kampf speichern
          </button>
          {msg && (
            <p class="muted" role="status">
              {msg}
            </p>
          )}
        </div>
      )}

      {total > 0 ? (
        <div class="card glass stack-sm">
          <div class="log-summary">
            <span class="log-big">{pct(wins, total)}%</span>
            <span class="muted">
              Siegquote · {wins} von {total} Kämpfen
            </span>
          </div>
          <ul class="list">
            {stats.slice(0, 6).map((s) => (
              <li key={s.key} class="row">
                <div class="row-main">
                  <span class="row-title">{label(db, s.combo)}</span>
                  <span class="row-sub">
                    {s.wins}/{s.games} Siege · {s.pointDiff >= 0 ? '+' : ''}
                    {s.pointDiff} Punkte
                    {s.weakness && ` · verliert meist per ${FINISH[s.weakness].label}`}
                  </span>
                </div>
                <span class={`log-rate ${pct(s.wins, s.games) >= 50 ? 'good' : 'bad'}`}>{pct(s.wins, s.games)}%</span>
              </li>
            ))}
          </ul>
          <details class="log-history">
            <summary>Letzte Kämpfe</summary>
            <ul class="list">
              {[...state.matches]
                .reverse()
                .slice(0, 15)
                .map((m) => (
                  <SwipeRow key={m.id} class="row" deleteLabel="Kampf löschen" onlyDelete onDelete={() => swipeRemove(m)}>
                    <span class={`log-dot ${m.won ? 'good' : 'bad'}`} aria-label={m.won ? 'Sieg' : 'Niederlage'} />
                    <div class="row-main">
                      <span class="row-title">
                        {label(db, m.mine)} <span class="muted">vs</span> {label(db, m.opp)}
                      </span>
                      <span class="row-sub">
                        {m.won ? 'Sieg' : 'Niederlage'} per {FINISH[m.finish].label} · {new Date(m.date).toLocaleDateString('de-AT')}
                      </span>
                    </div>
                  </SwipeRow>
                ))}
            </ul>
          </details>
        </div>
      ) : (
        !open && <p class="muted">Trag nach jedem Kampf kurz ein, wie es ausging. Mit der Zeit siehst du hier deine Siegquote pro Kombo und woran du am häufigsten verlierst.</p>
      )}
    </Section>
  );
}
