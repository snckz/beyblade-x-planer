import { useMemo, useState } from 'preact/hooks';
import type { BeyType, Database, Product } from '../lib/types';
import type { UserState } from '../lib/storage';
import { searchProducts } from '../lib/data';
import { TYPE_LABEL } from '../lib/analysis';
import { Empty, SpinBadge, TypeBadge, UnverifiedMark } from './ui';
import { BeyImage } from './BeyImage';
import { useApp } from '../lib/context';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
}

type View = 'products' | 'blades' | 'bits';
const KIND_LABEL: Record<Product['kind'], string> = {
  starter: 'Starter',
  booster: 'Booster',
  'random-booster': 'Random Booster',
  set: 'Set',
  stadium: 'Stadium',
  launcher: 'Launcher',
  other: 'Sonstiges',
};

export function PartsBrowser({ db, state, update }: Props) {
  const { openBlade } = useApp();
  const [view, setView] = useState<View>('products');
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
            ['products', 'Produkte'],
            ['blades', 'Blades'],
            ['bits', 'Bits'],
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
        <div class="type-filter" role="group" aria-label="Nach Typ filtern">
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
        </div>
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
                    <button type="button" class="img-btn" onClick={() => openBlade(b.id)} aria-label={`${b.name}: Details`}>
                      <BeyImage bladeId={b.id} type={b.type} size="sm" alt={b.name} />
                    </button>
                  ) : (
                    <span class="bey-img bey-img-sm bey-placeholder" aria-hidden="true">◎</span>
                  )}
                  <div class="row-main">
                    <span class="code code-inline">{p.code.startsWith('TBA') ? 'neu' : p.code}</span>
                    <span class="row-title">
                      {p.name} <UnverifiedMark show={!p.verified} />
                    </span>
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
                <button type="button" class="img-btn" onClick={() => openBlade(b.id)} aria-label={`${b.name}: Details`}>
                  <BeyImage bladeId={b.id} type={b.type} size="sm" alt={b.name} />
                </button>
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
              <li key={b.id} class="row">
                <span class="code code-bit">{b.id}</span>
                <div class="row-main">
                  <span class="row-title">
                    {b.name} <UnverifiedMark show={!!b.uncertain} />
                  </span>
                  {b.note && <span class="row-note">{b.note}</span>}
                </div>
                <TypeBadge type={b.type} small />
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Keine Bits gefunden" />
        ))}
      <p class="fineprint">
        Datenstand {db.updatedAt}. „ungeprüft“ heißt: aus Händler- oder Fanangaben, noch nicht gegen eine offizielle Quelle bestätigt.
      </p>
    </div>
  );
}
