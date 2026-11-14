import { useEffect, useState } from 'preact/hooks';
import {
  advance,
  canAdvance,
  validResult,
  createTournament,
  currentRound,
  finished,
  isDone,
  loadTournament,
  MAX_PLAYERS,
  saveTournament,
  setResult,
  standings,
  swissRounds,
  type Format,
  type TMatch,
  type Tournament as T,
} from '../lib/tournament';
import { DuelScorer } from './DuelScorer';
import { Section } from './ui';

/** Mini-Turnier mit Freunden: Spieler eintragen, Paarungen auslosen, Tabelle führen. Bleibt auf dem Gerät gespeichert. */
export function Tournament() {
  const [t, setT] = useState<T | null>(() => loadTournament());
  const [names, setNames] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [format, setFormat] = useState<Format>('swiss');
  const [target, setTarget] = useState<4 | 7>(4);
  const [live, setLive] = useState<TMatch | null>(null);
  const [edit, setEdit] = useState<{ id: string; a: string; b: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => saveTournament(t), [t]);

  const addName = () => {
    const n = draft.trim().slice(0, 24);
    if (!n) return;
    if (names.some((x) => x.toLowerCase() === n.toLowerCase())) {
      setError(`„${n}“ ist schon dabei.`);
      return;
    }
    if (names.length >= MAX_PLAYERS) return;
    setNames([...names, n]);
    setDraft('');
    setError('');
  };

  // Ergebnis speichern, aber noch nicht weiterlosen – so lassen sich Tippfehler korrigieren.
  const save = (matchId: string, sa: number, sb: number) => {
    if (!t) return;
    setT(setResult(t, matchId, sa, sb));
  };

  if (!t) {
    const rounds = format === 'rr' ? (names.length % 2 ? names.length : names.length - 1) : swissRounds(names.length);
    return (
      <Section title="Mini-Turnier">
        <div class="card glass stack-sm">
          <p class="muted">Spielt mit Freunden: Namen eintragen, die App lost die Paarungen aus und führt die Tabelle.</p>
          <form
            class="tour-add"
            onSubmit={(e) => {
              e.preventDefault();
              addName();
            }}
          >
            <label class="shop-input">
              <span class="sr-only">Name</span>
              <input value={draft} onInput={(e) => setDraft(e.currentTarget.value)} placeholder="Name eintragen" maxLength={24} enterKeyHint="enter" disabled={names.length >= MAX_PLAYERS} />
            </label>
            <button type="submit" class="btn" disabled={!draft.trim() || names.length >= MAX_PLAYERS}>
              Hinzufügen
            </button>
          </form>
          {error && (
            <p class="muted" role="alert">
              {error}
            </p>
          )}
          {names.length > 0 && (
            <ul class="chips tour-names">
              {names.map((n) => (
                <li key={n}>
                  <button type="button" class="chip chip-on" onClick={() => setNames(names.filter((x) => x !== n))} aria-label={`${n} entfernen`}>
                    {n} ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div class="segmented seg-2" role="group" aria-label="Modus">
            <button type="button" class={format === 'swiss' ? 'on' : ''} aria-pressed={format === 'swiss'} onClick={() => setFormat('swiss')}>
              Schweizer System
            </button>
            <button type="button" class={format === 'rr' ? 'on' : ''} aria-pressed={format === 'rr'} onClick={() => setFormat('rr')}>
              Jeder gegen jeden
            </button>
          </div>
          <div class="segmented seg-2" role="group" aria-label="Punkteziel">
            <button type="button" class={target === 4 ? 'on' : ''} aria-pressed={target === 4} onClick={() => setTarget(4)}>
              Bis 4 Punkte
            </button>
            <button type="button" class={target === 7 ? 'on' : ''} aria-pressed={target === 7} onClick={() => setTarget(7)}>
              Bis 7 Punkte
            </button>
          </div>
          <button type="button" class="btn btn-primary" disabled={names.length < 3} onClick={() => setT(createTournament(names, format, target))}>
            {names.length < 3 ? 'Mindestens 3 Spieler' : `Turnier starten (${names.length} Spieler, ${rounds} Runden)`}
          </button>
          <p class="fineprint">
            Schweizer System: Gleichstarke spielen gegeneinander, niemand doppelt – ideal ab 5 Spielern. Jeder gegen jeden: alle Paarungen, dauert länger. Bei ungerader Zahl hat pro Runde einer
            Freilos (zählt als Sieg).
          </p>
        </div>
      </Section>
    );
  }

  const name = (id: string | null) => t.players.find((p) => p.id === id)?.name ?? '–';
  const round = currentRound(t);
  const done = finished(t);
  const table = standings(t);
  const lastRound = Math.max(0, ...t.matches.map((m) => m.round));
  const valid = (a: string, b: string) => a.trim() !== '' && b.trim() !== '' && validResult(t.target, Number(a), Number(b));

  const matchRow = (m: TMatch) => (
    <li key={m.id} class="row tour-match">
      {m.b === null ? (
        <span class="row-main">
          <span class="row-title">{name(m.a)}</span>
          <span class="row-sub">Freilos – zählt als Sieg</span>
        </span>
      ) : edit?.id === m.id ? (
        <form
          class="tour-edit"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid(edit.a, edit.b)) return;
            save(m.id, Number(edit.a), Number(edit.b));
            setEdit(null);
          }}
        >
          <label>
            <span>{name(m.a)}</span>
            <input type="number" inputMode="numeric" min={0} max={t.target + 2} step={1} value={edit.a} onInput={(e) => setEdit({ ...edit, a: e.currentTarget.value })} />
          </label>
          <label>
            <span>{name(m.b)}</span>
            <input type="number" inputMode="numeric" min={0} max={t.target + 2} step={1} value={edit.b} onInput={(e) => setEdit({ ...edit, b: e.currentTarget.value })} />
          </label>
          <button type="submit" class="btn btn-sm btn-primary" disabled={!valid(edit.a, edit.b)}>
            OK
          </button>
        </form>
      ) : (
        <>
          <span class="row-main">
            <span class="row-title">
              {name(m.a)} <span class="muted">vs</span> {name(m.b)}
            </span>
            {isDone(m) && (
              <span class="row-sub">
                {m.sa}:{m.sb} – {m.sa! > m.sb! ? name(m.a) : name(m.b)} gewinnt
              </span>
            )}
          </span>
          {!isDone(m) && (
            <button type="button" class="btn btn-sm btn-primary" onClick={() => setLive(m)}>
              ▶ Zählen
            </button>
          )}
          <button
            type="button"
            class="btn btn-sm"
            onClick={() => setEdit({ id: m.id, a: m.sa === null ? '' : String(m.sa), b: m.sb === null ? '' : String(m.sb) })}
            aria-label={`Ergebnis ${name(m.a)} gegen ${name(m.b)} ${isDone(m) ? 'korrigieren' : 'eintippen'}`}
          >
            ✎
          </button>
        </>
      )}
    </li>
  );

  return (
    <Section
      title="Mini-Turnier"
      aside={
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          onClick={() => {
            if (window.confirm(done ? 'Turnier schließen?' : 'Turnier abbrechen? Alle Ergebnisse gehen verloren.')) {
              setNames(t.players.map((p) => p.name));
              setT(null);
            }
          }}
        >
          {done ? 'Neues Turnier' : 'Abbrechen'}
        </button>
      }
    >
      <div class="card glass stack-sm">
        {done ? (
          <p class="tour-winner">🏆 {table[0]?.player.name} gewinnt das Turnier!</p>
        ) : canAdvance(t) ? (
          <p class="eyebrow">Runde {round} fertig – bereit für die nächste</p>
        ) : (
          <p class="eyebrow">
            Runde {round} von {t.rounds} · bis {t.target} Punkte · {t.format === 'swiss' ? 'Schweizer System' : 'Jeder gegen jeden'}
          </p>
        )}

        <ul class="list">{t.matches.filter((m) => m.round === round).map(matchRow)}</ul>
        {canAdvance(t) && (
          <button type="button" class="btn btn-primary" onClick={() => setT(advance(t))}>
            Runde {lastRound + 1} auslosen
          </button>
        )}
        {round > 1 && (
          <details class="tour-past">
            <summary>Frühere Runden ansehen / korrigieren</summary>
            {Array.from({ length: round - 1 }, (_, i) => i + 1).map((r) => (
              <div key={r}>
                <p class="eyebrow">Runde {r}</p>
                <ul class="list">{t.matches.filter((m) => m.round === r).map(matchRow)}</ul>
              </div>
            ))}
            {t.format === 'swiss' && <p class="fineprint">Änderst du ein früheres Ergebnis, bleiben die schon ausgelosten Paarungen bestehen – die Tabelle rechnet neu.</p>}
          </details>
        )}

        <table class="tour-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col" class="left">
                Spieler
              </th>
              <th scope="col" title="Siege – Niederlagen">
                S–N
              </th>
              <th scope="col" title="Punkte für – gegen">
                Punkte
              </th>
            </tr>
          </thead>
          <tbody>
            {table.map((s, i) => (
              <tr key={s.player.id} class={i === 0 && done ? 'lead' : ''}>
                <td>{i + 1}</td>
                <th scope="row" class="left">
                  {s.player.name}
                </th>
                <td>
                  {s.wins}–{s.losses}
                </td>
                <td>
                  {s.pointsFor}:{s.pointsAgainst}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {t.format === 'swiss' && <p class="fineprint">Bei gleich vielen Siegen zählt zuerst die Stärke der Gegner (Buchholz), dann die Punktedifferenz.</p>}
      </div>
      {live && live.b && (
        <DuelScorer
          left={name(live.a)}
          right={name(live.b)}
          target={t.target}
          onClose={() => setLive(null)}
          onDone={(a, b) => {
            save(live.id, a, b);
            setLive(null);
          }}
        />
      )}
    </Section>
  );
}
