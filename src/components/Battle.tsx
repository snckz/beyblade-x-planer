import { useMemo, useState } from 'preact/hooks';
import type { Combo, Database, MetaFeed } from '../lib/types';
import type { UserState } from '../lib/storage';
import { newId } from '../lib/storage';
import { nb } from '../lib/analysis';
import { playableParts, releaseOf } from '../lib/useRelease';

/** Zweizeilig: Blade oben, Ratchet+Bit unten – kein Umbruch mitten im Namen. */
function TwoLine({ name, label }: { name?: string; label: string }) {
  if (name) return <span class="matrix-name">{name}</span>;
  const i = label.lastIndexOf(' ');
  return (
    <span class="matrix-name">
      {i > 0 ? label.slice(0, i) : label}
      {i > 0 && <span class="matrix-sub">{nb(label.slice(i + 1))}</span>}
    </span>
  );
}
import { ARCHETYPES, deckDuel, suggestImprovements, toBey, type Bey, type Matchup } from '../lib/battle';
import { ownedParts } from '../lib/data';
import { BeyImage } from './BeyImage';
import { Deck } from './Deck';
import { Meta } from './Meta';
import { ComboPicker } from './ComboPicker';
import { BattleLog } from './BattleLog';
import { DeckOptimizer } from './DeckOptimizer';
import { LiveMatch } from './LiveMatch';
import { Tournament } from './Tournament';
import { Section, TypeBadge } from './ui';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  goToBuilder: () => void;
  meta?: MetaFeed | null;
  onBuild?: (bladeId: string, ratchetId: string | undefined, bitId: string) => void;
}


const tone = (m: Matchup) => (m.score >= 10 ? 'win' : m.score <= -10 ? 'lose' : 'even');

export function Battle(props: Props) {
  const { db, state, update } = props;
  const [onlyOwned, setOnlyOwned] = useState(true);
  const [live, setLive] = useState(false);
  const parts = useMemo(() => ownedParts(db, state.owned), [db, state.owned]);
  const hasParts = parts.bits.size > 0;

  const deckCombos = state.deck.map((id) => state.combos.find((c) => c.id === id)).filter((c): c is Combo => !!c);
  const mine = deckCombos.map((c) => toBey(db, c)).filter((b): b is Bey => !!b && b.analysis.valid);
  const oppValid = state.opponent.map((c) => toBey(db, c)).filter((b): b is Bey => !!b && b.analysis.valid);
  const usingArchetypes = oppValid.length === 0;
  const opponents = usingArchetypes ? ARCHETYPES.map((c) => toBey(db, c)).filter((b): b is Bey => !!b) : oppValid;
  const duel = mine.length ? deckDuel(mine, opponents) : null;

  // Tausch-Vorschläge nur mit freigegebenen Teilen (zentraler Freigabestatus)
  const rel = releaseOf(db);
  const pool = onlyOwned && hasParts
    ? { bits: [...parts.bits.keys()].filter((id) => rel.selectable('bits', id)), ratchets: [...parts.ratchets.keys()].filter((id) => rel.selectable('ratchets', id)) }
    : { bits: playableParts(db).bits.map((b) => b.id), ratchets: playableParts(db).ratchets.map((r) => r.id) };
  const suggestions = mine.length ? suggestImprovements(db, mine.map((b) => b.combo), opponents, pool) : [];

  const setOpp = (i: number, c: Combo) =>
    update((s) => {
      const opponent = [...s.opponent];
      opponent[i] = c;
      return { ...s, opponent };
    });
  const addOpp = () =>
    update((s) => (s.opponent.length >= 3 ? s : { ...s, opponent: [...s.opponent, { id: newId(), bladeId: '', ratchetId: '3-60', bitId: '' }] }));
  const removeOpp = (i: number) => update((s) => ({ ...s, opponent: s.opponent.filter((_, j) => j !== i) }));

  const apply = (comboId: string, to: Combo) =>
    update((s) => ({ ...s, combos: s.combos.map((c) => (c.id === comboId ? { ...c, bitId: to.bitId, ratchetId: to.ratchetId } : c)) }));

  const verdict = (score: number) =>
    score >= 15 ? 'Klarer Vorteil für dich' : score >= 5 ? 'Leichter Vorteil für dich' : score > -5 ? 'Ausgeglichen' : score > -15 ? 'Leichter Nachteil' : 'Klarer Nachteil';

  return (
    <div class="stack">
      <button type="button" class="card glass live-cta" onClick={() => setLive(true)}>
        <span class="live-cta-icon" aria-hidden="true">▶</span>
        <span>
          <strong>Live-Match starten</strong>
          <small>Punkte zählen im Stadion – landet automatisch im Tagebuch</small>
        </span>
      </button>
      {live && <LiveMatch db={db} state={state} update={update} onClose={() => setLive(false)} />}
      <Deck {...props} />
      <DeckOptimizer db={db} state={state} update={update} meta={props.meta} />

      <span id="gegner" class="anchor" aria-hidden="true" />
      <Section
        title={`Gegner-Deck (${state.opponent.length}/3)`}
        aside={
          state.opponent.length > 0 && (
            <button type="button" class="btn btn-ghost" onClick={() => update((s) => ({ ...s, opponent: [] }))}>
              Leeren
            </button>
          )
        }
      >
        <div class="card glass stack-sm">
          {state.opponent.length === 0 && <p class="muted">Trag ein, was dein Gegner spielt. Ohne Eingabe vergleiche ich mit typischen Gegnern.</p>}
          {state.opponent.map((c, i) => (
            <div key={c.id} class="opp-row">
              <span class="slot-no">{i + 1}</span>
              <ComboPicker db={db} value={c} label={`Gegner ${i + 1}`} onChange={(v) => setOpp(i, v)} />
              <button type="button" class="icon-btn" onClick={() => removeOpp(i)} aria-label={`Gegner ${i + 1} entfernen`}>
                ×
              </button>
            </div>
          ))}
          {state.opponent.length < 3 && (
            <button type="button" class="btn" onClick={addOpp}>
              + Gegner-Kreisel
            </button>
          )}
        </div>
      </Section>

      {duel && (
        <Section title={usingArchetypes ? 'Analyse gegen typische Gegner' : 'Matchup-Analyse'}>
          <div class="card glass stack-sm">
            <div class="verdict">
              <span class={`verdict-score ${duel.overall >= 5 ? 'win' : duel.overall <= -5 ? 'lose' : 'even'}`}>
                {duel.overall > 0 ? '+' : ''}
                {duel.overall}
              </span>
              <div>
                <p class="row-title">{verdict(duel.overall)}</p>
                <p class="fineprint">Durchschnitt über alle Paarungen · Richtwert, keine Simulation</p>
              </div>
            </div>
            <div class="matrix-wrap">
              <table class="matrix">
                <thead>
                  <tr>
                    <th scope="col">
                      <span class="sr-only">Mein Kreisel</span>
                    </th>
                    {opponents.map((o) => (
                      <th key={o.combo.id} scope="col" title={o.analysis.label}>
                        <BeyImage bladeId={o.combo.bladeId} type={o.analysis.type} size="sm" alt={o.analysis.label} />
                        <TwoLine name={o.combo.name} label={o.analysis.label} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mine.map((m, i) => (
                    <tr key={m.combo.id}>
                      <th scope="row">
                        <TwoLine name={m.combo.name} label={m.analysis.label} />
                      </th>
                      {duel.matrix[i]!.map((mu, j) => (
                        <td key={j} class={`cell-${tone(mu)}`} title={mu.reasons.join(' · ') || 'Ausgeglichen'}>
                          {mu.chance}%
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="fineprint">Prozent = grobe Siegchance deines Kreisels (Zeile) gegen den Gegner (Spalte).</p>
            {!usingArchetypes && mine.length >= 2 && (
              <div class="order">
                <p class="eyebrow">Empfohlene Reihenfolge gegen diese Gegner-Reihenfolge</p>
                <ol>
                  {duel.bestOrder.map((i, slot) => {
                    const m = mine[i]!;
                    const mu = duel.matrix[i]![slot]!;
                    return (
                      <li key={m.combo.id}>
                        <strong>{m.combo.name ?? nb(m.analysis.label)}</strong> gegen {opponents[slot]!.combo.name ?? nb(opponents[slot]!.analysis.label)}{' '}
                        <span class={`chance ${tone(mu)}`}>{mu.chance}%</span>
                        {mu.reasons[0] && <span class="row-sub"> · {mu.reasons[0]}</span>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>
        </Section>
      )}

      {duel && (
        <Section title="Verbesserungen">
          <div class="card glass stack-sm">
            {hasParts && (
              <label class="toggle">
                <input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.currentTarget.checked)} />
                <span>Nur Teile aus meiner Sammlung vorschlagen</span>
              </label>
            )}
            {suggestions.length ? (
              <ul class="suggestions">
                {suggestions.map((s) => {
                  const m = mine[s.slot]!;
                  return (
                    <li key={`${s.slot}-${s.newId}`} class="suggestion">
                      <div class="row-main">
                        <span class="row-title">
                          {m.combo.name ?? nb(m.analysis.label)}: {s.part} {s.oldId} → {s.newId}
                        </span>
                        <span class="row-sub">
                          Neu: {nb(s.newLabel)} · <span class="gain">+{s.gain} Punkte</span> im Schnitt
                        </span>
                      </div>
                      <TypeBadge type={toBey(db, s.to)!.analysis.type} small />
                      <button type="button" class="btn btn-ghost" onClick={() => apply(m.combo.id, s.to)}>
                        Übernehmen
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p class="muted">Kein Tausch bringt einen klaren Vorteil – dein Deck ist für diese Gegner schon gut eingestellt.</p>
            )}
          </div>
        </Section>
      )}
      <BattleLog db={db} state={state} update={update} />
      <Tournament />
      {props.meta && props.onBuild && <Meta db={db} meta={props.meta} update={update} onBuild={props.onBuild} />}
    </div>
  );
}
