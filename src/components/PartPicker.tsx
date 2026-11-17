import { createPortal } from 'preact/compat';
import { useModal } from '../lib/useModal';
import { bothNames, displayName, otherName } from '../lib/names';
import { useRef, useState } from 'preact/hooks';
import type { BeyType, Blade, Bit, Ratchet } from '../lib/types';
import { TYPE_LABEL } from '../lib/analysis';
import { BeyImage, BladePhoto } from './BeyImage';
import { BitImage, RatchetImage } from './BitImage';
import { Check, ChevronRight, Link2, Plus, RotateCcw, Scale, Search, Shield, Swords, Timer, X } from 'lucide-preact';

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
    sub = `${teeth(ratchet.contacts)} · ${ratchet.heightMm?.toFixed(1)} mm`;
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

  // Kompakte Variante (Vergleich, Deck): unverändert.
  if (compact) {
    return (
      <div class="part-field compact">
        <button type="button" class={`part-btn${value ? ' has-value' : ''}`} onClick={() => setOpen(true)} disabled={disabled} aria-haspopup="dialog" aria-label={`${label}: ${main}`}>
          {art ?? <span class={`part-glyph ${DOT[kind]}`}>{kind === 'ratchet' ? (ratchet?.id ?? 'R') : kind === 'bit' ? 'B' : '◎'}</span>}
          <span class="part-text">
            <span class={value || disabled ? 'part-main' : 'part-main placeholder'}>{main}</span>
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
        <span class="part-art">{art ?? <span class="part-empty">{disabled ? <Link2 aria-hidden="true" /> : <Plus aria-hidden="true" />}</span>}</span>
        <span class="part-text">
          <span class="part-kind">{label}</span>
          <span class={filled ? 'part-main' : 'part-main placeholder'}>{filled ? title : disabled ? (disabledText ?? '—') : `${label} wählen`}</span>
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
  const ref = useRef<HTMLDivElement>(null);
  // onClose kommt bei jedem Render neu – per Ref, damit der Effekt nur beim Öffnen/Schließen läuft
  // (sonst springt der Fokus beim Tippen weg und die iOS-Tastatur klappt zu).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const close = useModal(ref, () => closeRef.current(), { animate: true });

  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  const match = (s: string) => !q || s.toLowerCase().replace(/\s+/g, '').includes(q);
  const count = (id: string) => counts?.get(id);

  const bladeList = blades.filter((b) => (!type || b.type === type) && match(`${b.name}${b.hasbroName ?? ''}${b.id}`)).sort((a, b) => displayName(a).localeCompare(displayName(b)));
  const bitList = bits.filter((b) => (!type || b.type === type) && match(`${b.id}${b.name}`));
  const ratchetList = ratchets.filter((r) => match(r.id));

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
        {kind !== 'ratchet' && (
          <div class="picker-tools">
            <div class="search-field">
              <Search aria-hidden="true" />
              <input type="search" placeholder={kind === 'blade' ? 'Blade suchen …' : 'Bit suchen (z. B. LF) …'} value={query} onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Suchen" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck={false} />
              {query && (
                <button type="button" class="search-clear" onClick={() => setQuery('')} aria-label="Suche leeren">
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
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
          </div>
        )}

        <div class="picker-body">
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
                <button key={r.id} type="button" class={`tile pick${r.id === value ? ' selected' : ''}`} onClick={() => onPick(r.id)} aria-pressed={r.id === value}>
                  <span class="pick-art">
                    <RatchetImage ratchet={r} size="md" />
                  </span>
                  <span class="tile-name pick-id">{r.id}</span>
                  <span class="pick-meta">
                    <span>{teeth(r.contacts)}</span>
                    <span>{r.heightMm?.toFixed(1)} mm</span>
                  </span>
                  <PickMarks count={count(r.id)} selected={r.id === value} />
                </button>
              ))}
            </div>
          )}

          {kind === 'bit' && (
            <div class="grid grid-bits">
              {bitList.map((b) => (
                <button key={b.id} type="button" class={`tile pick aura-${b.type}${b.id === value ? ' selected' : ''}`} onClick={() => onPick(b.id)} aria-pressed={b.id === value}>
                  <span class="pick-art">
                    <BitImage bit={b} size="md" />
                  </span>
                  <span class="tile-name pick-id">{b.id}</span>
                  <span class="pick-meta">
                    <span class="pick-sub">{b.name}</span>
                    <span class={`type-fg-${b.type}`}>{TYPE_LABEL[b.type]}</span>
                  </span>
                  <PickMarks count={count(b.id)} selected={b.id === value} />
                </button>
              ))}
            </div>
          )}

          {((kind === 'blade' && !bladeList.length) || (kind === 'bit' && !bitList.length) || (kind === 'ratchet' && !ratchetList.length)) && (
            <p class="muted center">Nichts gefunden.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const teeth = (n?: number | null) => (n === 1 ? '1 Zacke' : `${n ?? 0} Zacken`);

const TYPE_ICON = { attack: Swords, defense: Shield, stamina: Timer, balance: Scale } as const;

const PICK_HINT: Record<Kind, string> = {
  blade: 'Wähle eine Blade für deine Kombo.',
  ratchet: 'Wähle ein Ratchet für deine Kombo.',
  bit: 'Wähle ein Bit für deine Kombo.',
};

/** Ecken-Markierungen einer Auswahlkarte: Haken, wenn gewählt; Anzahl im Besitz. */
function PickMarks({ count, selected }: { count?: number; selected: boolean }) {
  return (
    <>
      {selected && (
        <span class="pick-check" aria-hidden="true">
          <Check />
        </span>
      )}
      {count ? <span class="tile-count">{count}×</span> : null}
    </>
  );
}
