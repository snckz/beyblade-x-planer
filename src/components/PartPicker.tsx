import { useEffect, useRef, useState } from 'preact/hooks';
import type { BeyType, Blade, Bit, Ratchet } from '../lib/types';
import { TYPE_LABEL } from '../lib/analysis';
import { BeyImage } from './BeyImage';
import { TypeBadge } from './ui';

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
  let sub = '';
  let type: BeyType | undefined;
  if (blade) {
    main = blade.name;
    sub = `${blade.line}${blade.spin === 'left' ? ' · Linksdreher' : ''}${blade.integratedRatchet ? ' · Ratchet integriert' : ''}`;
    type = blade.type;
  } else if (bit) {
    main = `${bit.id} – ${bit.name}`;
    type = bit.type;
  } else if (ratchet) {
    main = ratchet.id;
    sub = `${ratchet.contacts ?? 0} Zacken · ${ratchet.heightMm?.toFixed(1)} mm`;
  }
  if (disabled) {
    main = disabledText ?? '—';
    sub = '';
  }

  return (
    <div class={`part-field${compact ? ' compact' : ''}`}>
      {!compact && (
        <span class="field-label">
          <span class={`layer-dot ${DOT[kind]}`} />
          {label}
        </span>
      )}
      <button type="button" class={`part-btn${value ? ' has-value' : ''}`} onClick={() => setOpen(true)} disabled={disabled} aria-haspopup="dialog" aria-label={`${label}: ${main}`}>
        {blade ? (
          <BeyImage bladeId={blade.id} type={blade.type} size="sm" alt="" zoomable={false} />
        ) : (
          <span class={`part-glyph ${DOT[kind]}`}>{kind === 'ratchet' ? (ratchet?.id ?? 'R') : (bit?.id ?? (kind === 'bit' ? 'B' : '◎'))}</span>
        )}
        <span class="part-text">
          <span class={value || disabled ? 'part-main' : 'part-main placeholder'}>{main}</span>
          {sub && <span class="part-sub">{sub}</span>}
        </span>
        {type && !compact && <TypeBadge type={type} small />}
        <span class="part-chev" aria-hidden="true">›</span>
      </button>
      {open && (
        <PickerSheet
          {...props}
          onClose={() => setOpen(false)}
          onPick={(id) => {
            props.onChange(id);
            setOpen(false);
          }}
        />
      )}
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

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, []);

  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  const match = (s: string) => !q || s.toLowerCase().replace(/\s+/g, '').includes(q);
  const count = (id: string) => counts?.get(id);

  const bladeList = blades.filter((b) => (!type || b.type === type) && match(`${b.name}${b.hasbroName ?? ''}${b.id}`)).sort((a, b) => a.name.localeCompare(b.name));
  const bitList = bits.filter((b) => (!type || b.type === type) && match(`${b.id}${b.name}`));
  const ratchetList = ratchets.filter((r) => match(r.id));

  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} class="sheet glass picker-sheet" role="dialog" aria-modal="true" aria-label={`${label} wählen`} tabIndex={-1}>
        <div class="sheet-grab" aria-hidden="true" />
        <div class="picker-head">
          <h2 class="sheet-title">{label} wählen</h2>
          <button type="button" class="icon-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <div class="picker-tools">
          {kind !== 'ratchet' && (
            <input type="search" placeholder={kind === 'blade' ? 'Blade suchen …' : 'Bit suchen (z. B. LF) …'} value={query} onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Suchen" />
          )}
          {kind !== 'ratchet' && (
            <div class="type-filter" role="group" aria-label="Nach Typ filtern">
              {(['attack', 'defense', 'stamina', 'balance'] as const).map((t) => (
                <button key={t} type="button" class={`chip type-chip-${t}${type === t ? ' chip-on' : ''}`} aria-pressed={type === t} onClick={() => setType(type === t ? '' : t)}>
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div class="picker-body">
          {kind === 'blade' && (
            <div class="grid grid-blades">
              {bladeList.map((b) => (
                <button key={b.id} type="button" class={`tile type-edge-${b.type}${b.id === value ? ' selected' : ''}`} onClick={() => onPick(b.id)} aria-pressed={b.id === value}>
                  <BeyImage bladeId={b.id} type={b.type} size="md" alt="" zoomable={false} />
                  <span class="tile-name">{b.name}</span>
                  <span class="tile-meta">
                    <span class={`type-dot dot-${b.type}`} />
                    {TYPE_LABEL[b.type]}
                    {b.spin === 'left' ? ' · ↺' : ''}
                  </span>
                  {count(b.id) ? <span class="tile-count">{count(b.id)}×</span> : null}
                </button>
              ))}
            </div>
          )}

          {kind === 'ratchet' && (
            <div class="grid grid-ratchets">
              {ratchetList.map((r) => (
                <button key={r.id} type="button" class={`tile tile-ratchet${r.id === value ? ' selected' : ''}`} onClick={() => onPick(r.id)} aria-pressed={r.id === value}>
                  <span class="tile-big">{r.id}</span>
                  <span class="teeth" aria-hidden="true">
                    {Array.from({ length: r.contacts ?? 0 }, (_, i) => (
                      <i key={i} />
                    ))}
                  </span>
                  <span class="tile-meta">{r.heightMm?.toFixed(1)} mm</span>
                  {count(r.id) ? <span class="tile-count">{count(r.id)}×</span> : null}
                </button>
              ))}
            </div>
          )}

          {kind === 'bit' && (
            <div class="grid grid-bits">
              {bitList.map((b) => (
                <button key={b.id} type="button" class={`tile tile-bit type-edge-${b.type}${b.id === value ? ' selected' : ''}`} onClick={() => onPick(b.id)} aria-pressed={b.id === value}>
                  <span class="tile-big">{b.id}</span>
                  <span class="tile-name">{b.name}</span>
                  <span class="tile-meta">
                    <span class={`type-dot dot-${b.type}`} />
                    {TYPE_LABEL[b.type]}
                  </span>
                  {count(b.id) ? <span class="tile-count">{count(b.id)}×</span> : null}
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
