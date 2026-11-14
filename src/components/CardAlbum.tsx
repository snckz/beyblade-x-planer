import { useMemo, useState } from 'preact/hooks';
import type { Database, Rarity } from '../lib/types';
import type { UserState } from '../lib/storage';
import { codeLabel, RARITY_HINT, RARITY_LABEL, RARITY_ORDER, rarityOf } from '../lib/rarity';
import { useApp } from '../lib/context';
import { nb } from '../lib/analysis';
import { BeyImage } from './BeyImage';
import { Empty, TypeBadge } from './ui';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
}

/** Sammelalbum: jedes Produkt als Karte mit Seltenheit; gesammelte Karten leuchten, fehlende sind gedimmt. */
export function CardAlbum({ db, state, update }: Props) {
  const { openBlade } = useApp();
  const [rarity, setRarity] = useState<Rarity | ''>('');
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);

  const cards = useMemo(
    () =>
      db.products
        .filter((p) => p.bladeId)
        .map((p) => ({ p, r: rarityOf(p), blade: db.blades.find((b) => b.id === p.bladeId)! }))
        .sort((a, b) => RARITY_ORDER.indexOf(a.r) - RARITY_ORDER.indexOf(b.r) || a.p.code.localeCompare(b.p.code)),
    [db],
  );
  const owned = (code: string) => state.owned[code] ?? 0;
  const have = cards.filter((c) => owned(c.p.code) > 0).length;
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  const shown = cards.filter(
    (c) =>
      (!rarity || c.r === rarity) &&
      (!onlyMissing || owned(c.p.code) === 0) &&
      (!q || `${c.p.code}${c.p.name}${c.p.hasbroName ?? ''}`.toLowerCase().replace(/\s+/g, '').includes(q)),
  );

  const setOwned = (code: string, delta: number) =>
    update((s) => {
      const n = Math.max(0, (s.owned[code] ?? 0) + delta);
      const next = { ...s.owned };
      if (n === 0) delete next[code];
      else next[code] = n;
      return { ...s, owned: next };
    });

  return (
    <div class="stack">
      <div class="card glass album-head">
        <div class="album-progress">
          <span class="album-count">
            {have}
            <small>/{cards.length}</small>
          </span>
          <div>
            <p class="row-title">Karten gesammelt</p>
            <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={cards.length} aria-valuenow={have}>
              <span style={{ width: `${cards.length ? (have / cards.length) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
        <div class="rarity-row">
          {RARITY_ORDER.map((r) => {
            const total = cards.filter((c) => c.r === r).length;
            if (!total) return null;
            const got = cards.filter((c) => c.r === r && owned(c.p.code) > 0).length;
            return (
              <button key={r} type="button" class={`rarity-chip rar-${r}${rarity === r ? ' on' : ''}`} aria-pressed={rarity === r} onClick={() => setRarity(rarity === r ? '' : r)} title={RARITY_HINT[r]}>
                {RARITY_LABEL[r]} <span>{got}/{total}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div class="filters">
        <input type="search" placeholder="Karte suchen: Name oder Code …" value={query} onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Karten suchen" />
        <label class="toggle">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.currentTarget.checked)} />
          <span>Nur fehlende Karten</span>
        </label>
      </div>
      {rarity && <p class="fineprint">{RARITY_HINT[rarity]}</p>}

      {shown.length ? (
        <ul class="album">
          {shown.map(({ p, r, blade }) => {
            const n = owned(p.code);
            return (
              <li key={p.code} class={`bcard rar-${r}${n ? ' got' : ''}`}>
                <div class="bcard-top">
                  <span class="bcard-code">{codeLabel(p.code)}</span>
                  <span class={`bcard-rar rar-${r}`}>{RARITY_LABEL[r]}</span>
                </div>
                <div class="bcard-art">
                  <BeyImage bladeId={blade.id} type={blade.type} size="lg" alt={blade.name} />
                </div>
                <button type="button" class="bcard-name" onClick={() => openBlade(blade.id)}>
                  {nb(p.name.replace(/^(Starter|Booster|Random Booster( Vol\.\d+)?)\s+/, ''))}
                </button>
                <div class="bcard-foot">
                  <TypeBadge type={blade.type} small />
                  <div class="stepper stepper-sm" aria-label={`Anzahl ${p.name}`}>
                    <button type="button" onClick={() => setOwned(p.code, -1)} disabled={!n} aria-label="Eins weniger">
                      −
                    </button>
                    <span aria-live="polite">{n}</span>
                    <button type="button" onClick={() => setOwned(p.code, 1)} aria-label="Eins mehr">
                      +
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="Keine Karten gefunden" />
      )}
      <p class="fineprint">Seltenheit nach Erhältlichkeit (Handel, Random Booster, Event/Limitiert) – kein offizielles Takara-Tomy-System.</p>
    </div>
  );
}
