import { displayName, otherName } from '../lib/names';
import { useState } from 'preact/hooks';
import type { BeyType, Database } from '../lib/types';
import type { UserState } from '../lib/storage';
import { TYPE_LABEL } from '../lib/analysis';
import { Empty, SpinBadge, TypeBadge, UnverifiedMark } from './ui';
import { BeyImage } from './BeyImage';
import { useApp } from '../lib/context';
import { bitText, ratchetText, TERMS } from '../lib/lexicon';
import { CardAlbum } from './CardAlbum';
import { BitImage, RatchetImage } from './BitImage';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
}

type View = 'cards' | 'blades' | 'bits' | 'ratchets' | 'terms';
export function Lexikon({ db, state, update }: Props) {
  const { openBlade } = useApp();
  const [view, setView] = useState<View>('cards');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<BeyType | ''>('');

  const q = query.trim().toLowerCase();

  const blades = db.blades.filter(
    (b) => (!type || b.type === type) && (!q || `${b.name} ${b.hasbroName ?? ''}`.toLowerCase().includes(q)),
  );
  const bits = db.bits.filter((b) => (!type || b.type === type) && (!q || `${b.id} ${b.name}`.toLowerCase().includes(q)));
  const ratchets = db.ratchets.filter((r) => !q || r.id.includes(q));
  const terms = TERMS.filter((t) => !q || `${t.term} ${t.text}`.toLowerCase().includes(q));
  const showTypeFilter = view !== 'ratchets' && view !== 'terms';

  return (
    <div class="stack">
      <div class="segmented" role="tablist" aria-label="Ansicht">
        {(
          [
            ['cards', 'Karten'],
            ['blades', 'Blades'],
            ['bits', 'Bits'],
            ['ratchets', 'Ratchets'],
            ['terms', 'Begriffe'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} class={view === id ? 'on' : ''} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {view !== 'cards' && <div class="filters">
        <input
          type="search"
          placeholder="Suchen …"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
          aria-label="Suchen"
        />
        {showTypeFilter && <div class="type-filter" role="group" aria-label="Nach Typ filtern">
          {(['attack', 'defense', 'stamina', 'balance'] as const).map((t) => (
            <button
              key={t}
              type="button"
              class={`chip type-chip-${t}${type === t ? ' chip-on' : ''}`}
              aria-pressed={type === t}
              onClick={() => setType(type === t ? '' : t)}
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>}
      </div>}

      {view === 'cards' && <CardAlbum db={db} state={state} update={update} />}

      {view === 'blades' &&
        (blades.length ? (
          <ul class="list">
            {blades.map((b) => (
              <li key={b.id} class="row row-click">
                <BeyImage bladeId={b.id} type={b.type} size="sm" alt={b.name} />
                <div class="row-main">
                  <span class="code code-inline">{b.line}</span>
                  <button type="button" class="row-title link-btn title-btn" onClick={() => openBlade(b.id)}>
                    {displayName(b)} <UnverifiedMark show={!b.verified} />
                  </button>
                  <span class="row-sub">
                    {otherName(b) ?? ''}
                    {b.integratedRatchet ? `${b.hasbroName ? ' · ' : ''}Ratchet integriert` : ''}
                  </span>
                  {b.note && <span class="row-note">{b.note}</span>}
                </div>
                <div class="row-side">
                  <SpinBadge spin={b.spin} />
                  <TypeBadge type={b.type} small />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Keine Blades gefunden" />
        ))}

      {view === 'bits' &&
        (bits.length ? (
          <ul class="list">
            {bits.map((b) => (
              <li key={b.id}>
                <details class="row lex">
                  <summary>
                    <BitImage bit={b} zoomable />
                    <span class="row-main">
                      <span class="code code-inline">{b.id}</span>
                      <span class="row-title">
                        {b.name} <UnverifiedMark show={!!b.uncertain} />
                      </span>
                    </span>
                    <TypeBadge type={b.type} small />
                  </summary>
                  <p class="lex-text">{bitText(b)}</p>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Keine Bits gefunden" />
        ))}

      {view === 'ratchets' && (
        <>
          <div class="card glass">
            <p class="muted">
              Die erste Zahl ist die Anzahl der Zacken, die zweite die Höhe in Zehntel-Millimetern. <strong>3-60</strong> heißt also 3 Zacken und 6,0 mm.
            </p>
          </div>
          <ul class="list">
            {ratchets.map((r) => (
              <li key={r.id} class="row">
                <RatchetImage ratchet={r} zoomable />
                <div class="row-main">
                  <span class="row-title">{r.id}</span>
                  <span class="row-sub">{ratchetText(r)}</span>
                  <span class="height-bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, ((r.heightMm ?? 0) / 9) * 100)}%` }} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {view === 'terms' &&
        (terms.length ? (
          <ul class="list">
            {terms.map((t) => (
              <li key={t.term}>
                <details class="row lex">
                  <summary>
                    <span class="row-main">
                      <span class="row-title">{t.term}</span>
                    </span>
                  </summary>
                  <p class="lex-text">{t.text}</p>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Kein Begriff gefunden" />
        ))}
      <p class="fineprint">
        Datenstand {db.updatedAt}. „ungeprüft“ heißt: Typ oder Drehrichtung sind noch nicht durch die Produktseite im Beyblade Wiki bestätigt, oder der Kreisel ist in Japan noch nicht erschienen.
      </p>
    </div>
  );
}
