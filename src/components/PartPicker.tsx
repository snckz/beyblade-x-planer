import { createPortal, memo } from 'preact/compat';
import { useModal } from '../lib/useModal';
import { bothNames, displayName, otherName } from '../lib/names';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { BeyType, Blade, Bit, ImageIndex, Ratchet } from '../lib/types';
import { TYPE_LABEL } from '../lib/analysis';
import { BeyImage, BladePhoto } from './BeyImage';
import { BIT_CUTOUT, BitImage, RATCHET_CUTOUT, RatchetImage } from './BitImage';
import { pauseCutouts, prefetchCutout, type CutoutOptions } from '../lib/cutout';
import { useApp } from '../lib/context';
import { BitName } from './ui';
import { filterRatchets, heightLabel, ratchetHeights, teethGroups, type TeethGroup } from '../lib/ratchetFilter';
import { attachCategorySwipe, type SwipeHandle } from '../lib/categorySwipe';
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

/** Feste leere Listen: Neue `[]` bei jedem Zeichnen würden die gemerkten Seiten (memo) jedes Mal neu bauen. */
const NO_BLADES: Blade[] = [];
const NO_RATCHETS: Ratchet[] = [];
const NO_BITS: Bit[] = [];
/** Nachbarseiten so viel später bauen (ms): nach dem Öffnen bzw. Einrasten */
const NEIGHBOR_DELAY_MS = 180;

function PickerSheet({ kind, label, blades = NO_BLADES, ratchets = NO_RATCHETS, bits = NO_BITS, value, counts, onClose, onPick }: FieldProps & { onClose: () => void; onPick: (id: string) => void }) {
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

  const q = normalize(query);

  // Neue Suche, neue Kategorie oder neuer Filter: Die Liste beginnt wieder oben. Sonst bliebe die alte Scrollposition
  // stehen (bei einer kürzeren Liste auf deren Maximum) und die erste Kartenreihe stünde halb unter der Filterleiste.
  // Vor dem Zeichnen (Layout-Effekt): Nach dem Blättern steht die neue Seite ohne Sprung oben.
  const bodyRef = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);
  useLayoutEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [q, type, group, height]);
  // Gescrollt: Kante unter Kopfzeile bzw. Filterleiste zeigen, damit klar ist, dass Karten darunter weiterlaufen.
  // Klasse direkt am Fenster wie `kb-open` aus useModal – kein Neuzeichnen beim Scrollen.
  const onListScroll = (e: Event) => ref.current?.classList.toggle('list-scrolled', (e.currentTarget as HTMLElement).scrollTop > 2);

  const allBlades = useMemo(() => [...blades].sort((a, b) => displayName(a).localeCompare(displayName(b))), [blades]);
  const groups = kind === 'ratchet' ? teethGroups(ratchets) : [];
  const heights = kind === 'ratchet' ? ratchetHeights(ratchets) : [];

  // Kategorien als Seiten zum Blättern (Reihenfolge wie die Chips). Wischen und Chips setzen dieselben Werte;
  // Suche und Ratchet-Höhe gelten für alle Seiten, die Auswahl (value) bleibt.
  const order: string[] = kind === 'ratchet' ? ['', ...groups.map((g) => g.id)] : ['', 'attack', 'defense', 'stamina', 'balance'];
  const category = kind === 'ratchet' ? group : type;
  const position = Math.max(0, order.indexOf(category));
  // Seiten bleiben gebaut, sobald sie einmal da waren – beim Zurückblättern sind Karten und Fotos sofort da.
  // Die aktuelle Seite sofort; ihre Nachbarn (die beim Wischen hereinkommen) kurz danach – nicht im selben Moment wie
  // das Öffnen oder Einrasten, sonst stockt genau diese Bewegung.
  const built = useRef(new Set<string>());
  built.current.add(order[position]!);
  const [, rebuild] = useState(0);
  const gesture = useRef(false);
  useEffect(() => {
    let timer = 0;
    const build = () => {
      if (gesture.current) return void (timer = window.setTimeout(build, NEIGHBOR_DELAY_MS));
      let added = false;
      for (const cat of [order[position - 1], order[position + 1]]) {
        if (cat !== undefined && !built.current.has(cat)) {
          built.current.add(cat);
          added = true;
        }
      }
      if (added) rebuild((n) => n + 1);
    };
    timer = window.setTimeout(build, NEIGHBOR_DELAY_MS);
    return () => window.clearTimeout(timer);
    // order hängt nur an kind und den Teilen
  }, [position, kind]);

  // Beim Loslassen schaltet der Chip sofort um (wie in iOS); die Seite selbst wechselt nach dem Einrasten.
  const [preview, setPreview] = useState<string | null>(null);
  /** Ziel des laufenden Einrastens; `null` = durch einen Chip-Tipp überholt, `undefined` = kein Einrasten */
  const target = useRef<string | null | undefined>(undefined);
  const setCategory = (cat: string) => {
    // Ein Tipp auf einen Chip während des Einrastens hat Vorrang vor dem Wisch: Einrasten sofort beenden (ohne Wechsel)
    if (target.current !== undefined) {
      target.current = null;
      swipeHandle.current?.finish();
    }
    setPreview(null);
    if (kind === 'ratchet') setGroup(cat as TeethGroup);
    else setType(cat as BeyType | '');
  };
  const chipValue = preview ?? category;
  const swipe = useRef<{ step: (step: 1 | -1) => void; settle: (step: 1 | -1) => void; can: (step: 1 | -1) => boolean; side: (step: 1 | -1) => HTMLElement | null }>({
    step: () => {},
    settle: () => {},
    can: () => false,
    side: () => null,
  });
  swipe.current = {
    can: (step) => position + step >= 0 && position + step < order.length, // erste/letzte Kategorie: nicht darüber hinaus
    settle: (step) => {
      const next = order[position + step];
      if (next === undefined) return;
      target.current = next;
      setPreview(next);
    },
    step: (step) => {
      // Ziel vom Loslassen; wurde inzwischen ein Chip angetippt, gilt der Chip
      const next = target.current === undefined ? order[position + step] : target.current;
      target.current = undefined;
      if (next == null) return;
      setCategory(next);
    },
    side: (step) => bodyRef.current?.querySelector<HTMLElement>(`.picker-page[data-page="${position + step}"]`) ?? null,
  };
  const swipeHandle = useRef<SwipeHandle | null>(null);
  useEffect(() => {
    const el = bodyRef.current;
    return el
      ? (swipeHandle.current = attachCategorySwipe(el, (step) => swipe.current.step(step), {
          pager: { current: () => el.querySelector<HTMLElement>('.picker-page.is-current'), side: (step) => swipe.current.side(step) },
          canStep: (step) => swipe.current.can(step),
          // Während der Geste ruht Hintergrundarbeit (Fotos freistellen, Nachbarseiten bauen), danach geht es weiter
          onActive: (active) => {
            gesture.current = active;
            pauseCutouts(active);
          },
          onSettle: (step) => swipe.current.settle(step),
        }))
      : undefined;
  }, []);

  const resetFilters = () => {
    target.current = undefined;
    setPreview(null);
    setQuery('');
    setType('');
    setGroup('');
    setHeight(null);
  };

  // Pager so hoch wie die aktuelle Seite (alle Seiten liegen übereinander, siehe styles.css) – vor dem Zeichnen und
  // bei jeder Größenänderung (Suche, Fotos, Drehen, Tastatur).
  const pagerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const pager = pagerRef.current;
    const cur = pager?.querySelector<HTMLElement>('.picker-page.is-current');
    if (!pager || !cur) return;
    const fit = () => (pager.style.height = `${cur.offsetHeight}px`);
    // ResizeObserver meldet die Größe nach dem Anordnen und noch vor dem Zeichnen – ohne erzwungenes Messen.
    if (typeof ResizeObserver === 'undefined') return void fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cur);
    return () => ro.disconnect();
  }, [position]);

  // Für die gemerkten Seiten: gleichbleibende Funktionen, die immer den aktuellen Stand nutzen
  const actions = useRef({ pick: onPick, reset: resetFilters });
  actions.current = { pick: onPick, reset: resetFilters };
  const pick = useCallback((id: string) => actions.current.pick(id), []);
  const reset = useCallback(() => actions.current.reset(), []);

  // Fotos der Nachbarseiten im Hintergrund vorbereiten: Beim Blättern kommen sie fertig herein.
  const { images } = useApp();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const i of [position + 1, position - 1]) {
        const cat = order[i];
        if (cat === undefined) continue;
        for (const src of pageSources(kind, cat, { query, height, blades: allBlades, ratchets, bits, images })) prefetchCutout(src.src, src.options);
      }
    }, 250);
    return () => window.clearTimeout(timer);
    // Neu bei anderer Kategorie, Suche oder Höhe (order und Listen hängen nur an kind und den Teilen)
  }, [position, query, height, kind]);

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
                <button type="button" class={`chip type-chip type-chip-all${chipValue === '' ? ' chip-on' : ''}`} aria-pressed={chipValue === ''} onClick={() => setCategory('')}>
                  Alle
                </button>
                {groups.map((g) => (
                  <button key={g.id} type="button" class={`chip type-chip teeth-chip${chipValue === g.id ? ' chip-on' : ''}`} aria-pressed={chipValue === g.id} aria-label={`${g.value} ${g.caption}`} onClick={() => setCategory(chipValue === g.id ? '' : g.id)}>
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
              <button type="button" class={`chip type-chip type-chip-all${chipValue === '' ? ' chip-on' : ''}`} aria-pressed={chipValue === ''} onClick={() => setCategory('')}>
                Alle
              </button>
              {(['attack', 'defense', 'stamina', 'balance'] as const).map((t) => {
                const Icon = TYPE_ICON[t];
                return (
                  <button key={t} type="button" class={`chip type-chip type-chip-${t}${chipValue === t ? ' chip-on' : ''}`} aria-pressed={chipValue === t} onClick={() => setCategory(chipValue === t ? '' : t)}>
                    <Icon aria-hidden="true" />
                    {TYPE_LABEL[t]}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div ref={bodyRef} class="picker-body" onScroll={onListScroll}>
          <div ref={pagerRef} class="picker-pager">
            {order.map((cat, i) =>
              built.current.has(cat) ? (
                <div
                  key={cat || 'all'}
                  class={`picker-page ${i === position ? 'is-current' : Math.abs(i - position) === 1 ? 'is-side' : 'is-parked'}`}
                  data-page={i}
                  aria-hidden={i === position ? undefined : 'true'}
                  inert={i !== position}
                >
                  <PickerPage kind={kind} cat={cat} query={query} height={height} value={value} counts={counts} blades={allBlades} ratchets={ratchets} bits={bits} onPick={pick} onReset={reset} />
                </div>
              ) : null,
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PageProps {
  kind: Kind;
  cat: string;
  query: string;
  height: number | null;
  value: string;
  counts?: Map<string, number>;
  blades: Blade[];
  ratchets: Ratchet[];
  bits: Bit[];
  onPick: (id: string) => void;
  onReset: () => void;
}

/**
 * Eine Seite: Karten einer Kategorie (mit Suche und Ratchet-Höhe) oder der passende leere Zustand.
 * Gemerkt (memo): Beim Blättern ändert sich nur, welche Seite sichtbar ist – die Seiten selbst werden nicht neu berechnet.
 */
const PickerPage = memo(function PickerPage({ kind, cat, query, height, value, counts, blades, ratchets, bits, onPick, onReset }: PageProps) {
  const q = normalize(query);
  const match = (s: string) => !q || normalize(s).includes(q);
  const count = (id: string) => counts?.get(id);
  if (kind === 'blade') {
    const list = blades.filter((b) => (!cat || b.type === cat) && match(`${b.name}${b.hasbroName ?? ''}${b.id}`));
    if (!list.length) return <p class="muted center">Nichts gefunden.</p>;
    return (
      <div class="grid grid-blades">
        {list.map((b) => {
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
    );
  }

  if (kind === 'ratchet') {
    const list = filterRatchets(ratchets, { query, teeth: cat as TeethGroup, height });
    if (!list.length) {
      const anyFilter = !!q || !!cat || height != null;
      return (
        <div class="picker-empty" role="status">
          <p class="picker-empty-title">Kein Ratchet gefunden</p>
          <p class="muted">
            {query.trim() ? `Zu „${query.trim()}“ passt kein Ratchet` : 'Kein Ratchet passt'}
            {cat || height != null ? ' mit den gewählten Filtern.' : '.'}
          </p>
          {anyFilter && (
            <button type="button" class="btn btn-sm" onClick={onReset}>
              Suche und Filter zurücksetzen
            </button>
          )}
        </div>
      );
    }
    return (
      <div class="grid grid-ratchets">
        {list.map((r) => (
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
    );
  }

  const list = bits.filter((b) => (!cat || b.type === cat) && match(`${b.id}${b.name}`));
  if (!list.length) return <p class="muted center">Nichts gefunden.</p>;
  return (
    <div class="grid grid-bits">
      {list.map((b) => {
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
  );
});

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');

/** Foto-Adressen einer Seite (mit den Freistell-Optionen der Karte) – fürs Vorladen beim Blättern. */
function pageSources(
  kind: Kind,
  cat: string,
  { query, height, blades, ratchets, bits, images }: { query: string; height: number | null; blades: Blade[]; ratchets: Ratchet[]; bits: Bit[]; images: ImageIndex },
): { src: string; options?: CutoutOptions }[] {
  const q = normalize(query);
  const match = (s: string) => !q || normalize(s).includes(q);
  const out: { src: string; options?: CutoutOptions }[] = [];
  if (kind === 'blade') {
    for (const b of blades) if ((!cat || b.type === cat) && match(`${b.name}${b.hasbroName ?? ''}${b.id}`)) out.push({ src: images.blades[b.id]?.thumb ?? '' });
  } else if (kind === 'ratchet') {
    for (const r of filterRatchets(ratchets, { query, teeth: cat as TeethGroup, height })) out.push({ src: images.ratchets?.[r.id]?.thumb ?? '', options: RATCHET_CUTOUT });
  } else {
    for (const b of bits) if ((!cat || b.type === cat) && match(`${b.id}${b.name}`)) out.push({ src: images.bits?.[b.id]?.thumb ?? '', options: BIT_CUTOUT });
  }
  return out.filter((x) => x.src);
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
