import { tr, trData } from '../lib/i18n';
import { displayName, otherName } from '../lib/names';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { BeyType, Database } from '../lib/types';
import type { UserState } from '../lib/storage';
import { TYPE_LABEL } from '../lib/analysis';
import { AnnouncedMark, Empty, TYPE_ICON, TypeChip, UnverifiedMark } from './ui';
import { useRelease } from '../lib/useRelease';
import { BladePhoto } from './BeyImage';
import { useApp } from '../lib/context';
import { bitText, ratchetText, TERMS } from '../lib/lexicon';
import { CardAlbum } from './CardAlbum';
import { TabPager } from './TabPager';
import { useProgressive } from '../lib/useProgressive';
import { BitImage, RatchetImage } from './BitImage';
import type { ComponentChildren } from 'preact';
import { Bomb, BookOpen, ChevronDown, Cog, Cone, Disc3, Factory, Layers, LayoutGrid, Link2, LogOut, Package, RotateCcw, Route, Search, Target, Timer, Zap } from 'lucide-preact';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  /** Die sichtbare Hauptseite? Als Nachbarseite (beim Wischen zwischen den Hauptseiten) ruhen die Unterseiten. */
  active?: boolean;
}

/** Unterseiten in der Reihenfolge der Leiste – so wird auch gewischt (components/TabPager.tsx mit `sub`) */
const VIEWS = ['cards', 'blades', 'bits', 'ratchets', 'terms'] as const;
type View = (typeof VIEWS)[number];

/** Abstand der Umschaltleiste zu einer mitlaufenden Kopfzeile (breite Bildschirme), wenn sie nach einem Wisch wieder ins Bild geholt wird (px) */
const PIN_GAP = 8;

/** Ein eigenes Symbol je Begriff – in der Reihenfolge von TERMS (lib/lexicon.ts). Fehlt eines, steht das Buch da. */
const TERM_ICONS = [Disc3, Cog, Cone, Zap, Route, Target, LogOut, Bomb, Timer, Layers, Link2, RotateCcw, LayoutGrid, Package, Factory];
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
      aria-label={tr('{0}: Bild vergrößern', label)}
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

/**
 * Lange Liste schrittweise zeichnen – wie das Karten-Album (lib/useProgressive.ts): erst der Anfang, beim Scrollen
 * mehr. So bleibt der Wechsel der Unterseite schnell, und eine Unterseite kann fürs Wischen fertig daneben liegen,
 * ohne dass im Hintergrund die ganze Liste entsteht.
 */
function Rows<T>({ items, resetKey, class: cls, row }: { items: T[]; resetKey: string; class: string; row: (item: T) => ComponentChildren }) {
  const { count, sentinel } = useProgressive(items.length, resetKey);
  return (
    <>
      <ul class={cls}>{items.slice(0, count).map(row)}</ul>
      {count < items.length && <div ref={sentinel} class="load-more" aria-hidden="true" />}
    </>
  );
}

export function Lexikon({ db, state, update, active = true }: Props) {
  const { openBlade, openImage, images } = useApp();
  const [view, setView] = useState<View>('cards');
  // Beim Loslassen eines Wischs schaltet die Leiste sofort um, die Unterseite wechselt nach dem Einrasten
  const [preview, setPreview] = useState<View | null>(null);
  const shownView = preview ?? view;

  // Wer weiter unten in einer Liste wischt, hat die Umschaltleiste nicht mehr im Bild: Die nächste Unterseite kommt
  // dann mit ihrem Anfang herein, und nach dem Wechsel steht die Leiste wieder oben – man sieht, wo man gelandet ist.
  const bar = useRef<HTMLDivElement>(null);
  const hidden = () => {
    const el = bar.current;
    if (!el) return 0;
    // Zielhöhe: unter Statusleiste/Notch (scroll-margin der Leiste, siehe .scroll-anchor) bzw. unter der Kopfzeile, wo sie mitläuft
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    const top = document.querySelector('.top');
    const stuck = top && getComputedStyle(top).position === 'sticky' ? top.getBoundingClientRect().bottom + PIN_GAP : 0;
    return Math.max(0, Math.round(Math.max(margin, stuck) - el.getBoundingClientRect().top));
  };
  const pin = useRef(false);
  const swipeTo = (next: View) => {
    pin.current = hidden() > 0;
    setView(next);
  };
  useLayoutEffect(() => {
    if (!pin.current) return;
    pin.current = false;
    const by = hidden();
    if (by > 0) window.scrollTo({ top: window.scrollY - by });
  }, [view]);
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
  /** Neue Suche oder anderer Typ: Listen beginnen wieder am Anfang */
  const filterKey = `${type}|${q}`;
  const terms = TERMS.filter((t) => !q || `${t.term} ${t.text}`.toLowerCase().includes(q));

  const pick = (id: View) => {
    setPreview(null);
    setView(id);
  };

  /** Eine Unterseite: Suche und Filter (außer bei den Karten, die bringen ihre eigenen mit), Liste, Datenstand */
  const pane = (v: View) => (
    <div class="stack">
      {v !== 'cards' && (
        <div class="filters lex-filters">
          <label class="search-field">
            <Search aria-hidden="true" />
            <input type="search" placeholder={tr('Suchen …')} value={query} onInput={(e) => setQuery(e.currentTarget.value)} aria-label={tr('Suchen')} />
          </label>
          {v !== 'ratchets' && v !== 'terms' && (
            <div class="type-filter" role="group" aria-label={tr('Nach Typ filtern')}>
              <button type="button" class={`chip type-chip type-chip-all${type === '' ? ' chip-on' : ''}`} aria-pressed={type === ''} onClick={() => setType('')}>
                {tr('Alle')}
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

      {v === 'cards' && <CardAlbum db={db} state={state} update={update} />}

      {v === 'blades' &&
        (blades.length ? (
          <Rows
            items={blades}
            resetKey={filterKey}
            class="lex-grid"
            row={(b) => (
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
                    <span class="mini-badge mini-badge-icon" role="img" aria-label={tr('Linksdreher')}>
                      <RotateCcw aria-hidden="true" />
                    </span>
                  )}
                </span>
                {b.integratedRatchet && <span class="lex-card-sub">{tr('Ratchet integriert')}</span>}
                {b.note && <span class="lex-card-note">{trData(b.note)}</span>}
              </li>
            )}
          />
        ) : (
          <Empty title={tr('Keine Blades gefunden')} />
        ))}

      {v === 'bits' &&
        (bits.length ? (
          <Rows
            items={bits}
            resetKey={filterKey}
            class="lex-list"
            row={(b) => (
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
            )}
          />
        ) : (
          <Empty title={tr('Keine Bits gefunden')} />
        ))}

      {v === 'ratchets' && (
        <>
          <p class="lex-intro">
            {tr('Die erste Zahl ist die Anzahl der Zacken, die zweite die Höhe in Zehntel-Millimetern.')} <strong>3-60</strong> {tr('heißt also 3 Zacken und 6,0 mm.')}
          </p>
          <Rows
            items={ratchets}
            resetKey={filterKey}
            class="lex-list"
            row={(r) => (
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
            )}
          />
        </>
      )}

      {v === 'terms' &&
        (terms.length ? (
          <ul class="lex-list">
            {terms.map((t) => (
              <li key={t.term}>
                <details class="lex-row">
                  <summary>
                    <span class="lex-row-art lex-row-icon" aria-hidden="true">
                      {(() => {
                        const Icon = TERM_ICONS[TERMS.indexOf(t)] ?? BookOpen;
                        return <Icon />;
                      })()}
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
          <Empty title={tr('Kein Begriff gefunden')} />
        ))}
      <p class="fineprint">
        {tr('Datenstand')} {db.updatedAt}{tr('. „ungeprüft“ heißt: Typ oder Drehrichtung sind noch nicht durch die Produktseite im Beyblade Wiki bestätigt, oder der Kreisel ist in Japan noch nicht erschienen.')}
      </p>
    </div>
  );

  return (
    <div class="stack">
      <div class="segmented scroll-anchor" ref={bar} role="tablist" aria-label={tr('Ansicht')}>
        {(
          [
            ['cards', tr('Karten')],
            ['blades', 'Blades'],
            ['bits', 'Bits'],
            ['ratchets', 'Ratchets'],
            ['terms', tr('Begriffe')],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={shownView === id} class={shownView === id ? 'on' : ''} onClick={() => pick(id)}>
            {label}
          </button>
        ))}
      </div>


      <TabPager
        tabs={VIEWS}
        current={view}
        render={pane}
        canPrebuild={() => active}
        onChange={swipeTo}
        onPreview={setPreview}
        swipeArea="#main"
        sub={{ enabled: active, below: '.filters', offset: hidden }}
      />
    </div>
  );
}
