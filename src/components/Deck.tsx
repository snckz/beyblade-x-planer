import type { Database } from '../lib/types';
import type { UserState } from '../lib/storage';
import { analyze, checkDeck, nb, resolveCombo, TYPE_LABEL } from '../lib/analysis';
import { Empty, Section, SpinBadge, TypeBadge } from './ui';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  goToBuilder: () => void;
}

export function Deck({ db, state, update, goToBuilder }: Props) {
  const combos = state.deck.map((id) => state.combos.find((c) => c.id === id)).filter((c) => c !== undefined);
  const check = checkDeck(db, combos);
  const missingTypes = (['attack', 'defense', 'stamina'] as const).filter((t) => !check.types.includes(t));

  const move = (i: number, dir: -1 | 1) =>
    update((s) => {
      const deck = [...s.deck];
      const j = i + dir;
      if (j < 0 || j >= deck.length) return s;
      [deck[i], deck[j]] = [deck[j]!, deck[i]!];
      return { ...s, deck };
    });

  if (!combos.length) {
    return (
      <Empty title="Noch kein Deck">
        <p>Speichere Kombos und tippe auf „+ Deck“. Ein Turnier-Deck hat 3 Kreisel ohne doppelte Teile.</p>
        <button type="button" class="btn btn-primary" onClick={goToBuilder}>
          Kombo bauen
        </button>
      </Empty>
    );
  }

  return (
    <div class="stack">
      <Section title={`Mein Deck (${combos.length}/3)`}>
        <ol class="deck">
          {combos.map((c, i) => {
            const r = resolveCombo(db, c);
            const a = r ? analyze(r) : null;
            return (
              <li key={c.id} class={`card deck-slot ${a ? `type-edge-${a.type}` : ''}`}>
                <span class="slot-no">{i + 1}</span>
                <div class="row-main">
                  <span class="row-title">{c.name ?? (a ? nb(a.label) : 'Unbekannte Teile')}</span>
                  {c.name && a && <span class="row-sub">{nb(a.label)}</span>}
                  <span class="badges badges-left">
                    {a && <TypeBadge type={a.type} small />}
                    {r && <SpinBadge spin={r.blade.spin} />}
                  </span>
                </div>
                <div class="row-side">
                  <div class="reorder">
                    <button type="button" class="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Nach oben">
                      ↑
                    </button>
                    <button type="button" class="icon-btn" onClick={() => move(i, 1)} disabled={i === combos.length - 1} aria-label="Nach unten">
                      ↓
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      onClick={() => update((s) => ({ ...s, deck: s.deck.filter((d) => d !== c.id) }))}
                      aria-label="Aus Deck entfernen"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Section>

      <div class={`card check ${check.ok ? 'check-ok' : 'check-bad'}`} role="status">
        <p class="check-title">{check.ok ? '✓ Turnier-tauglich' : 'Noch nicht turnier-tauglich'}</p>
        {check.problems.length > 0 && (
          <ul class="notes notes-warn">
            {check.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {combos.length === 3 && missingTypes.length > 0 && (
          <p class="muted">
            Tipp: Dir fehlt noch {missingTypes.map((t) => TYPE_LABEL[t]).join(' und ')} – ein gemischtes Deck kontert mehr Gegner.
          </p>
        )}
        <p class="fineprint">Regeln können je nach Veranstalter abweichen – vor dem Turnier kurz nachfragen.</p>
      </div>
    </div>
  );
}
