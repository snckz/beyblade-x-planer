import { useMemo, useRef, useState } from 'preact/hooks';
import type { Database, Product } from '../lib/types';
import type { UserState } from '../lib/storage';
import { searchProducts } from '../lib/data';
import { groupKey } from '../lib/price';
import { displayProductName, regionLabel } from '../lib/names';
import { nb } from '../lib/analysis';
import { useModal } from '../lib/useModal';
import { BeyImage } from './BeyImage';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  onClose: () => void;
}

type Region = 'all' | 'takara' | 'hasbro';
const PAGE = 40;

const KIND: Partial<Record<Product['kind'], string>> = { starter: 'Starter', booster: 'Booster', 'random-booster': 'Random Booster', set: 'Set' };

/** Sammlung bearbeiten im eigenen Fenster: suchen, mit + / − Anzahl setzen – ohne den Tab zu wechseln. */
export function AddProducts({ db, state, update, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<Region>('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  useModal(ref, onClose);

  const list = useMemo(() => {
    const base = db.products.filter((p) => p.bladeId && p.kind !== 'stadium');
    return searchProducts(base, query, db.blades).filter((p) => (region === 'all' || (region === 'hasbro') === (p.region === 'hasbro')) && (!onlyMine || (state.owned[p.code] ?? 0) > 0));
  }, [db, query, region, onlyMine, state.owned]);
  const total = Object.values(state.owned).reduce((s, n) => s + n, 0);

  const change = (code: string, d: 1 | -1) =>
    update((s) => {
      const owned = { ...s.owned };
      const next = (owned[code] ?? 0) + d;
      if (next > 0) owned[code] = next;
      else delete owned[code];
      // Gekauft → von der Wunschliste nehmen
      return { ...s, owned, wishlist: d > 0 ? s.wishlist.filter((c) => c !== code) : s.wishlist };
    });

  return (
    <div ref={ref} class="live shop" role="dialog" aria-modal="true" aria-label="Produkte hinzufügen" tabIndex={-1}>
      <div class="live-bar">
        <span class="live-title">Meine Sammlung</span>
        <button type="button" class="btn btn-sm btn-primary" onClick={onClose}>
          Fertig{total ? ` (${total})` : ''}
        </button>
      </div>

      <div class="shop-body stack-sm">
        <label class="shop-input">
          <span class="sr-only">Produkt suchen</span>
          <input
            type="search"
            value={query}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setLimit(PAGE);
            }}
            placeholder="Name oder Code, z. B. Dran Sword oder G1670"
            autoComplete="off"
            autoCapitalize="off"
            spellcheck={false}
            enterKeyHint="search"
          />
        </label>
        <div class="segmented" role="group" aria-label="Hersteller">
          {(
            [
              ['all', 'Alle'],
              ['takara', 'Takara Tomy'],
              ['hasbro', 'Hasbro'],
            ] as [Region, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" class={region === k ? 'on' : ''} aria-pressed={region === k} onClick={() => (setRegion(k), setLimit(PAGE))}>
              {l}
            </button>
          ))}
        </div>
        <label class="toggle">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.currentTarget.checked)} />
          <span>Nur was ich schon habe</span>
        </label>

        {list.length ? (
          <ul class="list add-list">
            {list.slice(0, limit).map((p) => {
              const n = state.owned[p.code] ?? 0;
              const blade = db.blades.find((b) => b.id === p.bladeId);
              return (
                <li key={p.code} class={`row${n ? ' row-own' : ''}`}>
                  {blade && <BeyImage bladeId={blade.id} type={blade.type} size="sm" alt="" zoomable={false} />}
                  <div class="row-main">
                    <span class="row-title">{nb(displayProductName(p, db).replace(/^(Starter|Booster|Set|Random Booster)\s+/, ''))}</span>
                    <span class="row-sub">
                      <span class={`region-tag ${p.region === 'hasbro' ? 'hasbro' : 'takara'}`}>{regionLabel(p)}</span> {p.code} ·{' '}
                      {p.kind === 'set' && groupKey(p) !== p.code ? `aus Set ${groupKey(p)}` : (KIND[p.kind] ?? 'Produkt')}
                    </span>
                  </div>
                  <div class="stepper stepper-sm" aria-label={`Anzahl ${p.name}`}>
                    <button type="button" onClick={() => change(p.code, -1)} disabled={!n} aria-label="Eins weniger">
                      −
                    </button>
                    <span aria-live="polite">{n}</span>
                    <button type="button" onClick={() => change(p.code, 1)} aria-label={`${p.name} hinzufügen`}>
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p class="muted">Nichts gefunden – probier einen anderen Namen oder die Nummer von der Packung.</p>
        )}
        {list.length > limit && (
          <button type="button" class="btn" onClick={() => setLimit(limit + PAGE)}>
            Mehr anzeigen ({list.length - limit} weitere)
          </button>
        )}
      </div>
    </div>
  );
}
