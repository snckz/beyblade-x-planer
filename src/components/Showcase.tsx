import { useRef, useState } from 'preact/hooks';
import type { BeyType, Database, Product } from '../lib/types';
import type { UserState } from '../lib/storage';
import { displayName } from '../lib/names';
import { nb, TYPE_LABEL } from '../lib/analysis';
import { useModal } from '../lib/useModal';
import { BeyImage } from './BeyImage';
import { TypeBadge } from './ui';

interface Props {
  db: Database;
  state: UserState;
  onClose: () => void;
}

type Filter = 'all' | BeyType;

/** Vitrine: alle gesammelten Kreisel auf einen Blick, groß mit Bild. Antippen zeigt das Foto in groß. */
export function Showcase({ db, state, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  useModal(ref, onClose);

  const items = db.products
    .filter((p): p is Product & { bladeId: string } => (state.owned[p.code] ?? 0) > 0 && !!p.bladeId)
    .map((p) => ({ p, blade: db.blades.find((b) => b.id === p.bladeId)!, n: state.owned[p.code] ?? 0 }))
    .filter((x) => x.blade);
  const total = items.reduce((s, x) => s + x.n, 0);
  const types = [...new Set(items.map((x) => x.blade.type))];
  const shown = items.filter((x) => filter === 'all' || x.blade.type === filter);

  return (
    <div ref={ref} class="live shop" role="dialog" aria-modal="true" aria-label="Meine Kreisel" tabIndex={-1}>
      <div class="live-bar">
        <span class="live-title">
          Meine Kreisel <span class="muted">({total})</span>
        </span>
        <button type="button" class="btn btn-sm btn-primary" onClick={onClose}>
          Schließen
        </button>
      </div>
      <div class="shop-body stack-sm">
        {types.length > 1 && (
          <div class="chips" role="group" aria-label="Nach Typ filtern">
            {(['all', ...types] as Filter[]).map((t) => (
              <button key={t} type="button" class={`chip${filter === t ? ' chip-on' : ''}`} aria-pressed={filter === t} onClick={() => setFilter(t)}>
                {t === 'all' ? 'Alle' : TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        )}
        {shown.length ? (
          <ul class="showcase">
            {shown.map(({ p, blade, n }) => (
              <li key={p.code} class={`show-card type-edge-${blade.type}`}>
                {n > 1 && <span class="show-count">{n}×</span>}
                <BeyImage bladeId={blade.id} type={blade.type} size="lg" alt={displayName(blade)} />
                <strong>{displayName(blade)}</strong>
                <span class="muted">{nb(`${p.ratchetId ?? ''}${p.bitId ?? ''}`) || '–'}</span>
                <TypeBadge type={blade.type} small />
              </li>
            ))}
          </ul>
        ) : (
          <p class="muted">Noch keine Kreisel in der Sammlung.</p>
        )}
        <p class="fineprint">Bild antippen für die Großansicht.</p>
      </div>
    </div>
  );
}
