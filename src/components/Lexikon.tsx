import { useMemo, useState } from 'preact/hooks';
import type { BeyType, Database, Product } from '../lib/types';
import type { UserState } from '../lib/storage';
import { searchProducts } from '../lib/data';
import { TYPE_LABEL } from '../lib/analysis';
import { Empty, SpinBadge, TypeBadge, UnverifiedMark } from './ui';
import { BeyImage } from './BeyImage';
import { useApp } from '../lib/context';
import { bitText, ratchetText, TERMS } from '../lib/lexicon';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
}

type View = 'blades' | 'bits' | 'ratchets' | 'terms' | 'products';
const KIND_LABEL: Record<Product['kind'], string> = {
  starter: 'Starter',
  booster: 'Booster',
  'random-booster': 'Random Booster',
  set: 'Set',
  stadium: 'Stadium',
  launcher: 'Launcher',
  other: 'Sonstiges',
};

export function Lexikon({ db, state, update }: Props) {
  const { openBlade } = useApp();
  const [view, setView] = useState<View>('blades');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<BeyType | ''>('');

  const bladeType = useMemo(() => new Map(db.blades.map((b) => [b.id, b])), [db.blades]);
  const q = query.trim().toLowerCase();

  const products = useMemo(
    () =>
      searchProducts(db.products, query).filter((p) => !type || (p.bladeId && bladeType.get(p.bladeId)?.type === type)),
    [db.products, query, type, bladeType],
  );
  const blades = db.blades.filter(
    (b) => (!type || b.type === type) && (!q || `${b.name} ${b.hasbroName ?? ''}`.toLowerCase().includes(q)),
  );
  const bits = db.bits.filter((b) => (!type || b.type === type) && (!q || `${b.id} ${b.name}`.toLowerCase().includes(q)));
  const ratchets = db.ratchets.filter((r) => !q || r.id.includes(q));
  const terms = TERMS.filter((t) => !q || `${t.term} ${t.text}`.toLowerCase().includes(q));
  const showTypeFilter = view !== 'ratchets' && view !== 'terms';

  const setOwned = (code: string, delta: number) =>
    update((s) => {
      const n = Math.max(0, (s.owned[code] ?? 0) + delta);
      const owned = { ...s.owned };
      if (n === 0) delete owned[code];
      else owned[code] = n;
      return { ...s, owned };
    });

  return (
    <div class="stack">
      <div class="segmented" role="tablist" aria-label="Ansicht">
        {(
          [
            ['blades', 'Blades'],
            ['bits', 'Bits'],
            ['ratchets', 'Ratchets'],
            ['terms', 'Begriffe'],
            ['products', 'Produkte'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} class={view === id ? 'on' : ''} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      <div class="filters">
        <input
          type="search"
          placeholder={view === 'products' ? 'Suche: Name, Code (UX-20) …' : 'Suchen …'}
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
      </div>

      {view === 'products' &&
        (products.length ? (
          <ul class="list">
            {products.map((p) => {
              const b = p.bladeId ? bladeType.get(p.bladeId) : undefined;
              const n = state.owned[p.code] ?? 0;
              return (
                <li key={p.code} class={`row product${n ? ' owned' : ''}`}>
                  {b ? (
                    <BeyImage bladeId={b.id} type={b.type} size="sm" alt={b.name} />
                  ) : (
                    <span class="bey-img bey-img-sm bey-placeholder" aria-hidden="true">◎</span>
                  )}
                  <div class="row-main">
                    <span class="code code-inline">{p.code.startsWith('TBA') ? 'neu' : p.code}</span>
                    {b ? (
                      <button type="button" class="row-title link-btn title-btn" onClick={() => openBlade(b.id)}>
                        {p.name} <UnverifiedMark show={!p.verified} />
                      </button>
                    ) : (
                      <span class="row-title">
                        {p.name} <UnverifiedMark show={!p.verified} />
                      </span>
                    )}
                    <span class="row-sub">
                      {KIND_LABEL[p.kind]}
                      {p.includesLauncher ? ' · mit Launcher' : ''}
                      {p.hasbroName ? ` · Hasbro: ${p.hasbroName}` : ''}
                      {p.weightG ? ` · ${p.weightG} g` : ''}
                    </span>
                    {p.note && <span class="row-note">{p.note}</span>}
                  </div>
                  <div class="row-side">
                    {b && <TypeBadge type={b.type} small />}
                    {p.bladeId && (
                      <div class="stepper" aria-label={`Anzahl ${p.code} in Sammlung`}>
                        <button type="button" onClick={() => setOwned(p.code, -1)} disabled={!n} aria-label="Eins weniger">
                          −
                        </button>
                        <span aria-live="polite">{n}</span>
                        <button type="button" onClick={() => setOwned(p.code, 1)} aria-label="Eins mehr">
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty title="Nichts gefunden">Versuch es mit dem Produktcode, z. B. „BX-52“.</Empty>
        ))}

      {view === 'blades' &&
        (blades.length ? (
          <ul class="list">
            {blades.map((b) => (
              <li key={b.id} class="row row-click">
                <BeyImage bladeId={b.id} type={b.type} size="sm" alt={b.name} />
                <div class="row-main">
                  <span class="code code-inline">{b.line}</span>
                  <button type="button" class="row-title link-btn title-btn" onClick={() => openBlade(b.id)}>
                    {b.name} <UnverifiedMark show={!b.verified} />
                  </button>
                  <span class="row-sub">
                    {b.hasbroName ? `Hasbro: ${b.hasbroName}` : ''}
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
                    <span class="code code-bit">{b.id}</span>
                    <span class="row-main">
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
                <span class="code code-bit">{r.id}</span>
                <div class="row-main">
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
        Datenstand {db.updatedAt}. „ungeprüft“ heißt: aus Händler- oder Fanangaben, noch nicht gegen eine offizielle Quelle bestätigt.
      </p>
    </div>
  );
}
