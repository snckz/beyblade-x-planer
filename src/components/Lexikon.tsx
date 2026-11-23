import { displayName, otherName } from '../lib/names';
import { useState } from 'preact/hooks';
import type { BeyType, Database } from '../lib/types';
import type { UserState } from '../lib/storage';
import { TYPE_LABEL } from '../lib/analysis';
import { AnnouncedMark, Empty, TYPE_ICON, TypeChip, UnverifiedMark } from './ui';
import { useRelease } from '../lib/useRelease';
import { BladePhoto } from './BeyImage';
import { useApp } from '../lib/context';
import { bitText, ratchetText, TERMS } from '../lib/lexicon';
import { CardAlbum } from './CardAlbum';
import { BitImage, RatchetImage } from './BitImage';
import type { ComponentChildren } from 'preact';
import { BookOpen, ChevronDown, RotateCcw, Search } from 'lucide-preact';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
}

type View = 'cards' | 'blades' | 'bits' | 'ratchets' | 'terms';
/**
 * Teilefoto in einer Lexikon-Zeile. Gibt es ein Foto, öffnet Antippen die Großansicht –
 * auch innerhalb eines <summary>, ohne die Zeile auf- oder zuzuklappen.
 */
function PartArt({ has, label, onZoom, children }: { has: boolean; label: string; onZoom: () => void; children: ComponentChildren }) {
  if (!has) return <span class="lex-row-art">{children}</span>;
  return (
    <button
      type="button"
      class="lex-row-art zoom"
      aria-label={`${label}: Bild vergrößern`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onZoom();
      }}
    >
      {children}
    </button>
  );
}

export function Lexikon({ db, state, update }: Props) {
  const { openBlade, openImage, images } = useApp();
  const [view, setView] = useState<View>('cards');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<BeyType | ''>('');

  const q = query.trim().toLowerCase();
  // Freigabestatus (zentral): Angekündigtes bleibt im Lexikon sichtbar, nur gekennzeichnet
  const { rel } = useRelease(db);

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

      {view !== 'cards' && (
        <div class="filters lex-filters">
          <label class="search-field">
            <Search aria-hidden="true" />
            <input type="search" placeholder="Suchen …" value={query} onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Suchen" />
          </label>
          {showTypeFilter && (
            <div class="type-filter" role="group" aria-label="Nach Typ filtern">
              <button type="button" class={`chip type-chip type-chip-all${type === '' ? ' chip-on' : ''}`} aria-pressed={type === ''} onClick={() => setType('')}>
                Alle
              </button>
              {(['attack', 'defense', 'stamina', 'balance'] as const).map((t) => {
                const Icon = TYPE_ICON[t];
                return (
                  <button key={t} type="button" class={`chip type-chip type-chip-${t}${type === t ? ' chip-on' : ''}`} aria-pressed={type === t} onClick={() => setType(type === t ? '' : t)}>
                    <Icon aria-hidden="true" />
                    {TYPE_LABEL[t]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {view === 'cards' && <CardAlbum db={db} state={state} update={update} />}

      {view === 'blades' &&
        (blades.length ? (
          <ul class="lex-grid">
            {blades.map((b) => (
              <li key={b.id} class={`lex-card aura-${b.type}`}>
                <span class="lex-card-art">
                  <BladePhoto blade={b} alt={displayName(b)} variant="card" zoomable />
                </span>
                <button type="button" class="lex-card-name title-btn" onClick={() => openBlade(b.id)}>
                  {displayName(b)} <UnverifiedMark show={!b.verified} /> <AnnouncedMark {...rel.part('blades', b.id)} />
                </button>
                {otherName(b) && <span class="lex-card-sub">{otherName(b)}</span>}
                <span class="lex-card-badges">
                  <span class="mini-badge">{b.line}</span>
                  <TypeChip type={b.type} />
                  {b.spin === 'left' && (
                    <span class="mini-badge mini-badge-icon" role="img" aria-label="Linksdreher">
                      <RotateCcw aria-hidden="true" />
                    </span>
                  )}
                </span>
                {b.integratedRatchet && <span class="lex-card-sub">Ratchet integriert</span>}
                {b.note && <span class="lex-card-note">{b.note}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Keine Blades gefunden" />
        ))}

      {view === 'bits' &&
        (bits.length ? (
          <ul class="lex-list">
            {bits.map((b) => (
              <li key={b.id}>
                <details class={`lex-row aura-${b.type}`}>
                  <summary>
                    <PartArt has={!!images.bits?.[b.id]?.thumb} label={`Bit ${b.id}`} onZoom={() => openImage(b.id, 'bit')}>
                      <BitImage bit={b} size="card" />
                    </PartArt>
                    <span class="lex-row-main">
                      <span class="lex-row-title">
                        <span class="lex-row-code">{b.id}</span> {b.name} <UnverifiedMark show={!!b.uncertain} /> <AnnouncedMark {...rel.part('bits', b.id)} />
                      </span>
                      <TypeChip type={b.type} />
                    </span>
                    <ChevronDown class="lex-row-chevron" aria-hidden="true" />
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
          <p class="lex-intro">
            Die erste Zahl ist die Anzahl der Zacken, die zweite die Höhe in Zehntel-Millimetern. <strong>3-60</strong> heißt also 3 Zacken und 6,0 mm.
          </p>
          <ul class="lex-list">
            {ratchets.map((r) => (
              <li key={r.id} class="lex-row lex-row-static">
                <PartArt has={!!images.ratchets?.[r.id]?.thumb} label={`Ratchet ${r.id}`} onZoom={() => openImage(r.id, 'ratchet')}>
                  <RatchetImage ratchet={r} size="card" />
                </PartArt>
                <div class="lex-row-main">
                  <span class="lex-row-title">
                    <span class="lex-row-code">{r.id}</span> <AnnouncedMark {...rel.part('ratchets', r.id)} />
                  </span>
                  <span class="lex-row-sub">{ratchetText(r)}</span>
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
          <ul class="lex-list">
            {terms.map((t) => (
              <li key={t.term}>
                <details class="lex-row">
                  <summary>
                    <span class="lex-row-art lex-row-icon" aria-hidden="true">
                      <BookOpen />
                    </span>
                    <span class="lex-row-main">
                      <span class="lex-row-title">{t.term}</span>
                    </span>
                    <ChevronDown class="lex-row-chevron" aria-hidden="true" />
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
