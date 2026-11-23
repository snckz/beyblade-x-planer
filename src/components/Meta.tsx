import { displayName } from '../lib/names';
import type { Database, MetaFeed, MetaTrend } from '../lib/types';
import type { UserState } from '../lib/storage';
import { newId } from '../lib/storage';
import { deriveType, nb, resolveCombo } from '../lib/analysis';
import { BladePhoto } from './BeyImage';
import { Section, TypeChip } from './ui';

interface Props {
  db: Database;
  meta: MetaFeed;
  update: (fn: (s: UserState) => UserState) => void;
  /** Öffnet den Kombo-Planer mit dieser Kombo */
  onBuild: (bladeId: string, ratchetId: string | undefined, bitId: string) => void;
}

const TREND: Record<MetaTrend, { label: string; cls: string }> = {
  top: { label: 'Top', cls: 'trend-top' },
  up: { label: '▲ steigend', cls: 'trend-up' },
  down: { label: '▼ fallend', cls: 'trend-down' },
  steady: { label: 'stabil', cls: 'trend-steady' },
};

const date = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('de-AT', { day: 'numeric', month: 'short', year: 'numeric' });

/** Turnier-Meta: welche Kombos gerade gewinnen – mit „Bauen“ und „Als Gegner laden“. */
export function Meta({ db, meta, update, onBuild }: Props) {
  const combos = meta.combos
    .map((c) => ({ c, r: resolveCombo(db, { id: '', bladeId: c.bladeId, ratchetId: c.ratchetId ?? undefined, bitId: c.bitId }) }))
    .filter((x): x is { c: (typeof meta.combos)[number]; r: NonNullable<ReturnType<typeof resolveCombo>> } => !!x.r);

  const loadAsOpponent = (deck: MetaFeed['decks'][number]) => {
    update((s) => ({
      ...s,
      opponent: deck.combos.slice(0, 3).map(([bladeId, ratchetId, bitId]) => ({ id: newId(), bladeId, ratchetId: ratchetId ?? undefined, bitId })),
    }));
    document.getElementById('gegner')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Section title="Turnier-Meta" aside={<span class="muted meta-date">Stand {date(meta.updatedAt)}</span>}>
      <div class="card glass stack-sm">
        <p class="muted">{meta.note}</p>
        <ul class="list meta-list">
          {combos.map(({ c, r }, i) => (
            <li key={`${c.bladeId}-${c.ratchetId}-${c.bitId}`} class="row meta-row">
              <span class="meta-rank">{i + 1}</span>
              <span class={`saved-art aura-${deriveType(r.blade, r.bit)}`}>
                <BladePhoto blade={r.blade} alt="" variant="card" />
              </span>
              <div class="row-main">
                <span class="row-title">
                  {displayName(r.blade)} {nb(`${r.ratchet?.id ?? ''}${r.bit.id}`)}
                </span>
                <span class="meta-tags">
                  <TypeChip type={deriveType(r.blade, r.bit)} />
                  <span class={`trend ${TREND[c.trend].cls}`}>{TREND[c.trend].label}</span>
                </span>
                <span class="row-sub">{c.note}</span>
              </div>
              <button type="button" class="btn btn-sm" onClick={() => onBuild(c.bladeId, c.ratchetId ?? undefined, c.bitId)} aria-label={`${displayName(r.blade)} ${r.ratchet?.id ?? ''}${r.bit.id} im Kombo-Planer öffnen`}>
                Bauen
              </button>
            </li>
          ))}
        </ul>

        <p class="eyebrow">Siegerdecks</p>
        <ul class="list">
          {meta.decks.map((d) => (
            <li key={`${d.event}-${d.date}`} class="row meta-deck">
              <div class="row-main">
                <span class="row-title">{d.event}</span>
                <span class="row-sub">
                  {date(d.date)} ·{' '}
                  {d.combos
                    .map(([bl, ra, bi]) => {
                      const res = resolveCombo(db, { id: '', bladeId: bl, ratchetId: ra ?? undefined, bitId: bi });
                      return res ? `${displayName(res.blade)} ${nb(`${res.ratchet?.id ?? ''}${res.bit.id}`)}` : `${bl} ${ra ?? ''}${bi}`;
                    })
                    .join(' · ')}
                </span>
              </div>
              <button type="button" class="btn btn-sm" onClick={() => loadAsOpponent(d)}>
                Als Gegner
              </button>
            </li>
          ))}
        </ul>
        <p class="fineprint">
          Quellen:{' '}
          {meta.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && ', '}
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.name}
              </a>
            </span>
          ))}
          . Gemeldete WBO-Ergebnisse, keine offiziellen Takara-Tomy-Daten.
        </p>
      </div>
    </Section>
  );
}
