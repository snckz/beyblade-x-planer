import { createPortal } from 'preact/compat';
import { useModal } from '../lib/useModal';
import { bothNames, displayName, otherName } from '../lib/names';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { BeyType, Blade, Bit, Ratchet } from '../lib/types';
import { TYPE_LABEL } from '../lib/analysis';
import { BeyImage, BladePhoto } from './BeyImage';
import { BitImage, RatchetImage } from './BitImage';
import { BitName } from './ui';
import { filterRatchets, heightLabel, ratchetHeights, teethGroups, type TeethGroup } from '../lib/ratchetFilter';
import { attachCategorySwipe } from '../lib/categorySwipe';
import { ChevronRight, Cog, Link2, MoveVertical, Plus, RotateCcw, Scale, Search, Shield, Swords, Timer, X } from 'lucide-preact';

type Kind = 'blade' | 'ratchet' | 'bit';

interface FieldProps {
  kind: Kind;
  label: string;
  blades?: Blade[];
  ratchets?: Ratchet[];
  bits?: Bit[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  disabledText?: string;
  /** Anzahl im Besitz je ID (zeigt „2×“) */
  counts?: Map<string, number>;
  compact?: boolean;
}

const DOT: Record<Kind, string> = { blade: 'l1', ratchet: 'l2', bit: 'l3' };

/** Feld, das die aktuelle Auswahl zeigt und beim Antippen ein Auswahl-Fenster öffnet. */
export function PartField(props: FieldProps) {
  const { kind, label, value, disabled, disabledText, compact } = props;
  const [open, setOpen] = useState(false);
  const blade = kind === 'blade' ? props.blades?.find((b) => b.id === value) : undefined;
  const bit = kind === 'bit' ? props.bits?.find((b) => b.id === value) : undefined;
  const ratchet = kind === 'ratchet' ? props.ratchets?.find((r) => r.id === value) : undefined;

  let main = `${label} wählen`;
  let title = '';
  let sub = '';
  let type: BeyType | undefined;
  if (blade) {
    main = bothNames(blade);
    sub = `${blade.line}${blade.spin === 'left' ? ' · Linksdreher' : ''}${blade.integratedRatchet ? ' · Ratchet integriert' : ''}`;
    title = displayName(blade);
    type = blade.type;
  } else if (bit) {
    main = `${bit.id} – ${bit.name}`;
    title = bit.name && bit.name !== bit.id ? `${bit.id} ${bit.name}` : bit.id;
    type = bit.type;
  } else if (ratchet) {
    main = ratchet.id;
    title = ratchet.id;
    sub = [teeth(ratchet.contacts), heightMm(ratchet.heightMm)].filter(Boolean).join(' · ');
  }
  if (disabled) {
    main = disabledText ?? '—';
    sub = '';
  }

  const sheet = open
    ? createPortal(
          <PickerSheet
            {...props}
            onClose={() => setOpen(false)}
            onPick={(id) => {
              props.onChange(id);
              setOpen(false);
            }}
          />,
          document.body,
        )
    : null;

  const art = blade ? (
    <BeyImage bladeId={blade.id} type={blade.type} size="sm" alt="" zoomable={false} />
  ) : bit ? (
    <BitImage bit={bit} />
  ) : ratchet && !disabled ? (
    <RatchetImage ratchet={ratchet} />
  ) : null;

  // Konfigurator-Karte im Kombo-Planer: freigestellte Fotos wie in der Auswahl und im Kombo-Ergebnis
  // (dieselben Komponenten), statt des kleinen Fotos auf weißem Rahmen.
  const cardArt = blade ? (
    <BladePhoto blade={blade} alt="" variant="card" />
  ) : bit ? (
    <BitImage bit={bit} size="card" />
  ) : ratchet && !disabled ? (
    <RatchetImage ratchet={ratchet} size="card" />
  ) : null;

  // Kompakte Variante (Vergleich, Deck): Bilder unverändert, Bit-Beschriftung wie überall.
  if (compact) {
    return (
      <div class="part-field compact">
        <button type="button" class={`part-btn${value ? ' has-value' : ''}`} onClick={() => setOpen(true)} disabled={disabled} aria-haspopup="dialog" aria-label={`${label}: ${main}`}>
          {art ?? <span class={`part-glyph ${DOT[kind]}`}>{kind === 'ratchet' ? (ratchet?.id ?? 'R') : kind === 'bit' ? 'B' : '◎'}</span>}
          <span class="part-text">
            <span class={value || disabled ? 'part-main' : 'part-main placeholder'}>{bit && !disabled ? <BitName bit={bit} /> : main}</span>
            {sub && <span class="part-sub">{sub}</span>}
          </span>
          <span class="part-chev" aria-hidden="true">›</span>
        </button>
        {open && sheet}
      </div>
    );
  }

  // Konfigurator-Karte im Kombo-Planer: Bild, Art des Teils, Bezeichnung, Eckdaten.
  const filled = !!value && !disabled;
  return (
    <div class={`part-field part-step${type ? ` aura-${type}` : ''}${filled ? ' is-filled' : ''}`}>
      <button type="button" class="part-btn" onClick={() => setOpen(true)} disabled={disabled} aria-haspopup="dialog" aria-label={`${label}: ${main}`}>
        <span class="part-art">{cardArt ?? <span class="part-empty">{disabled ? <Link2 aria-hidden="true" /> : <Plus aria-hidden="true" />}</span>}</span>
        <span class="part-text">
          <span class="part-kind">{label}</span>
          <span class={filled ? 'part-main' : 'part-main placeholder'}>{filled ? bit ? <BitName bit={bit} /> : title : disabled ? (disabledText ?? '—') : `${label} wählen`}</span>
          {filled && (type || sub) && (
            <span class="part-sub">
              {type && <span class={`part-type type-fg-${type}`}>{TYPE_LABEL[type]}</span>}
              {sub && sub.split(' · ').map((t) => <span key={t}>{t}</span>)}
            </span>
          )}
        </span>
        {!disabled && (
          <span class="part-chev" aria-hidden="true">
            <ChevronRight />
          </span>
        )}
      </button>
      {sheet}
    </div>
  );
}

function PickerSheet({ kind, label, blades = [], ratchets = [], bits = [], value, counts, onClose, onPick }: FieldProps & { onClose: () => void; onPick: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<BeyType | ''>('');
  // Ratchet: Zacken-Gruppe und Höhe (kombinierbar, zusammen mit der Suche)
  const [group, setGroup] = useState<TeethGroup>('');
  const [height, setHeight] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  // onClose kommt bei jedem Render neu – per Ref, damit der Effekt nur beim Öffnen/Schließen läuft
  // (sonst springt der Fokus beim Tippen weg und die iOS-Tastatur klappt zu).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const close = useModal(ref, () => closeRef.current(), { animate: true });

  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  const match = (s: string) => !q || s.toLowerCase().replace(/\s+/g, '').includes(q);

  // Neue Suche oder neuer Typfilter: Die Liste beginnt wieder oben. Sonst bliebe die alte Scrollposition stehen
  // (bei einer kürzeren Liste auf deren Maximum) und die erste Kartenreihe stünde halb unter der Filterleiste.
  const bodyRef = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [q, type, group, height]);
  // Gescrollt: Kante unter Kopfzeile bzw. Filterleiste zeigen, damit klar ist, dass Karten darunter weiterlaufen.
  // Klasse direkt am Fenster wie `kb-open` aus useModal – kein Neuzeichnen beim Scrollen.
  const onListScroll = (e: Event) => ref.current?.classList.toggle('list-scrolled', (e.currentTarget as HTMLElement).scrollTop > 2);
  const count = (id: string) => counts?.get(id);

  const bladeList = blades.filter((b) => (!type || b.type === type) && match(`${b.name}${b.hasbroName ?? ''}${b.id}`)).sort((a, b) => displayName(a).localeCompare(displayName(b)));
  const bitList = bits.filter((b) => (!type || b.type === type) && match(`${b.id}${b.name}`));
  const ratchetList = kind === 'ratchet' ? filterRatchets(ratchets, { query, teeth: group, height }) : [];
  const groups = kind === 'ratchet' ? teethGroups(ratchets) : [];
  const heights = kind === 'ratchet' ? ratchetHeights(ratchets) : [];
  const filtered = !!q || !!type || !!group || height != null;

  // Kategorie per Wischen über die Karten wechseln – dieselben Setzfunktionen wie die Chips (Reihenfolge wie die Chips).
  // Suche und Ratchet-Höhe bleiben, die Auswahl (value) bleibt; den Sprung nach oben übernimmt der Effekt oben.
  const swipeStep = useRef<(step: 1 | -1) => void>(() => {});
  swipeStep.current = (step) => {
    const order: string[] = kind === 'ratchet' ? ['', ...groups.map((g) => g.id)] : ['', 'attack', 'defense', 'stamina', 'balance'];
    const now = order.indexOf(kind === 'ratchet' ? group : type);
    const next = Math.max(0, Math.min(order.length - 1, now + step));
    if (next === now) return; // erste/letzte Kategorie: nicht darüber hinaus
    if (kind === 'ratchet') setGroup(order[next] as TeethGroup);
    else setType(order[next] as BeyType | '');
    nudgeList(bodyRef.current, step);
  };
  useEffect(() => {
    const el = bodyRef.current;
    return el ? attachCategorySwipe(el, (step) => swipeStep.current(step)) : undefined;
  }, []);

  const resetFilters = () => {
    setQuery('');
    setType('');
    setGroup('');
    setHeight(null);
  };

  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={ref} class="sheet glass picker-sheet" role="dialog" aria-modal="true" aria-label={`${label}-Auswahl`} tabIndex={-1}>
        <div class="sheet-grab" aria-hidden="true" />
        <div class="win-head">
          <div class="win-heading">
            <h2 class="win-title">{label}-Auswahl</h2>
            <p class="win-sub win-sub-plain">{PICK_HINT[kind]}</p>
          </div>
          <button type="button" class="icon-btn win-close" onClick={close} aria-label="Schließen">
            <X aria-hidden="true" />
          </button>
        </div>
        <div class={`picker-tools${kind === 'ratchet' ? ' picker-tools-ratchet' : ''}`}>
          <div class="search-field">
            <Search aria-hidden="true" />
            <input type="search" placeholder={SEARCH_HINT[kind]} value={query} onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Suchen" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck={false} />
            {query && (
              <button type="button" class="search-clear" onClick={() => setQuery('')} aria-label="Suche leeren">
                <X aria-hidden="true" />
              </button>
            )}
          </div>
          {kind === 'ratchet' ? (
            <>
              <div class="type-filter teeth-filter" role="group" aria-label="Nach Zacken filtern">
                <button type="button" class={`chip type-chip type-chip-all${group === '' ? ' chip-on' : ''}`} aria-pressed={group === ''} onClick={() => setGroup('')}>
                  Alle
                </button>
                {groups.map((g) => (
                  <button key={g.id} type="button" class={`chip type-chip teeth-chip${group === g.id ? ' chip-on' : ''}`} aria-pressed={group === g.id} aria-label={`${g.value} ${g.caption}`} onClick={() => setGroup(group === g.id ? '' : g.id)}>
                    <span class="teeth-chip-value">{g.value}</span>
                    <span class="teeth-chip-caption">{g.caption}</span>
                  </button>
                ))}
              </div>
              <div class="height-filter" role="group" aria-label="Nach Höhe filtern">
                <button type="button" class={`chip height-chip${height == null ? ' chip-on' : ''}`} aria-pressed={height == null} onClick={() => setHeight(null)}>
                  Jede Höhe
                </button>
                {heights.map((h) => (
                  <button key={h} type="button" class={`chip height-chip${height === h ? ' chip-on' : ''}`} aria-pressed={height === h} onClick={() => setHeight(height === h ? null : h)}>
                    {heightLabel(h)}
                  </button>
                ))}
              </div>
            </>
          ) : (
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

        <div ref={bodyRef} class="picker-body" onScroll={onListScroll}>
          {kind === 'blade' && (
            <div class="grid grid-blades">
              {bladeList.map((b) => {
                const TypeIcon = TYPE_ICON[b.type];
                return (
                  <button key={b.id} type="button" class={`tile pick blade-card aura-${b.type}${b.id === value ? ' selected' : ''}`} onClick={() => onPick(b.id)} aria-pressed={b.id === value}>
                    <span class="blade-card-art">
                      <BladePhoto blade={b} alt="" variant="card" />
                    </span>
                    <span class="tile-name">{displayName(b)}</span>
                    {/* Zweitname nur während der Suche – er erklärt, warum die Karte gefunden wurde */}
                    {q && otherName(b) && <span class="pick-alt">{b.name}</span>}
                    <span class="blade-card-badges">
                      <span class="mini-badge">{b.line}</span>
                      <span class={`mini-badge mini-badge-type type-fg-${b.type}`}>
                        <TypeIcon aria-hidden="true" />
                        {TYPE_LABEL[b.type]}
                      </span>
                      {b.spin === 'left' && (
                        <span class="mini-badge mini-badge-icon" role="img" aria-label="Linksdreher">
                          <RotateCcw aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    {count(b.id) ? <span class="tile-count">{count(b.id)}×</span> : null}
                  </button>
                );
              })}
            </div>
          )}

          {kind === 'ratchet' && (
            <div class="grid grid-ratchets">
              {ratchetList.map((r) => (
                <button key={r.id} type="button" class={`tile pick part-card ratchet-card${r.id === value ? ' selected' : ''}`} onClick={() => onPick(r.id)} aria-pressed={r.id === value}>
                  <span class="part-card-art">
                    <RatchetImage ratchet={r} size="card" />
                  </span>
                  <span class="tile-name part-card-code">{r.id}</span>
                  <span class="part-card-facts">
                    <span>
                      <Cog aria-hidden="true" />
                      {teeth(r.contacts)}
                    </span>
                    {r.heightMm != null && (
                      <span>
                        <MoveVertical aria-hidden="true" />
                        <span class="sr-only">Höhe </span>
                        {heightMm(r.heightMm)}
                      </span>
                    )}
                  </span>
                  {count(r.id) ? <span class="tile-count">{count(r.id)}×</span> : null}
                </button>
              ))}
            </div>
          )}

          {kind === 'bit' && (
            <div class="grid grid-bits">
              {bitList.map((b) => {
                const TypeIcon = TYPE_ICON[b.type];
                return (
                  <button key={b.id} type="button" class={`tile pick part-card bit-card aura-${b.type}${b.id === value ? ' selected' : ''}`} onClick={() => onPick(b.id)} aria-pressed={b.id === value}>
                    <span class="part-card-art">
                      <BitImage bit={b} size="card" />
                    </span>
                    <span class="tile-name part-card-code">{b.id}</span>
                    <span class="part-card-name">{b.name}</span>
                    <span class={`mini-badge mini-badge-type type-fg-${b.type}`}>
                      <TypeIcon aria-hidden="true" />
                      {TYPE_LABEL[b.type]}
                    </span>
                    {count(b.id) ? <span class="tile-count">{count(b.id)}×</span> : null}
                  </button>
                );
              })}
            </div>
          )}

          {((kind === 'blade' && !bladeList.length) || (kind === 'bit' && !bitList.length)) && <p class="muted center">Nichts gefunden.</p>}

          {kind === 'ratchet' && !ratchetList.length && (
            <div class="picker-empty" role="status">
              <p class="picker-empty-title">Kein Ratchet gefunden</p>
              <p class="muted">
                {query.trim() ? `Zu „${query.trim()}“ passt kein Ratchet` : 'Kein Ratchet passt'}
                {group || height != null ? ' mit den gewählten Filtern.' : '.'}
              </p>
              {filtered && (
                <button type="button" class="btn btn-sm" onClick={resetFilters}>
                  Suche und Filter zurücksetzen
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Dezenter Übergang nach einem Wisch: Liste gleitet ein Stück aus der Wischrichtung herein. Ohne Bewegung bei „reduzieren“. */
function nudgeList(body: HTMLElement | null, step: 1 | -1) {
  const grid = body?.querySelector<HTMLElement>('.grid');
  if (!grid || typeof grid.animate !== 'function') return;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  grid.animate([{ transform: `translateX(${step * 22}px)`, opacity: 0.55 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.2, .8, .2, 1)' });
}

/** Zacken eines Ratchets; Sonderformen (ohne Angabe in den Daten) bekommen keine erfundene Zahl. */
const teeth = (n?: number | null) => (n == null ? 'Sonderform' : n === 1 ? '1 Zacke' : `${n} Zacken`);
/** Höhe mit deutschem Komma, z. B. „6,0 mm“. */
const heightMm = (mm?: number | null) => (mm == null ? '' : heightLabel(mm));

const TYPE_ICON = { attack: Swords, defense: Shield, stamina: Timer, balance: Scale } as const;

const SEARCH_HINT: Record<Kind, string> = {
  blade: 'Blade suchen …',
  ratchet: 'Ratchet suchen (z. B. 3-60) …',
  bit: 'Bit suchen (z. B. LF) …',
};

const PICK_HINT: Record<Kind, string> = {
  blade: 'Wähle eine Blade für deine Kombo.',
  ratchet: 'Wähle ein Ratchet für deine Kombo.',
  bit: 'Wähle ein Bit für deine Kombo.',
};
