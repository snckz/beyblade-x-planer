import { tr, trData } from '../lib/i18n';
import type { ReleaseStatus } from '../lib/release';
import type { ComponentChildren } from 'preact';
import type { BeyType, Spin } from '../lib/types';
import { TYPE_LABEL } from '../lib/analysis';
import { ArrowLeftRight, RotateCcw, Scale, Shield, Swords, Timer } from 'lucide-preact';

export function TypeBadge({ type, small }: { type: BeyType; small?: boolean }) {
  return <span class={`badge type-${type}${small ? ' badge-sm' : ''}`}>{TYPE_LABEL[type]}</span>;
}

/** Symbol je Typ – dieselben wie in Auswahl und Detailansicht */
export const TYPE_ICON = { attack: Swords, defense: Shield, stamina: Timer, balance: Scale } as const;

/** Typ als Chip mit Symbol in Typfarbe (wie auf den Karten der Auswahl) */
export function TypeChip({ type }: { type: BeyType }) {
  const Icon = TYPE_ICON[type];
  return (
    <span class={`mini-badge mini-badge-type aura-${type}`}>
      <Icon aria-hidden="true" />
      {TYPE_LABEL[type]}
    </span>
  );
}

export function SpinBadge({ spin }: { spin: Spin }) {
  if (spin === 'right') return null;
  return (
    <span class="badge badge-spin" title={spin === 'left' ? tr('Linksdreher') : tr('Beide Richtungen')}>
      {spin === 'left' ? <><RotateCcw aria-hidden="true" /> {tr('Links')}</> : <><ArrowLeftRight aria-hidden="true" /> {tr('Beide')}</>}
    </span>
  );
}

export function UnverifiedMark({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span class="unverified" title={tr('Daten noch nicht geprüft')}>
      {tr('ungeprüft')}
    </span>
  );
}

/** Angekündigt (noch nicht erschienen): im Lexikon sichtbar, im Kombo-Planer nicht wählbar. Gleiche Optik wie „ungeprüft“. */
export function AnnouncedMark({ status, reason }: { status: ReleaseStatus; reason: string }) {
  if (status !== 'announced') return null;
  return (
    <span class="unverified" title={tr('Angekündigt – {0}. Im Kombo-Planer erst nach Release und Prüfung.', trData(reason))}>
      {tr('angekündigt')}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="empty-ring" aria-hidden="true" />
      <p class="empty-title">{title}</p>
      {children && <div class="empty-body">{children}</div>}
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="section">
      <div class="section-head">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * Bit-Bezeichnung überall gleich: Kürzel betont, Name daneben („D Dot“, „LF Low Flat“).
 * Kürzel und Name brechen nie in sich um – reicht die Breite nicht, rutscht der Name als Ganzes in die nächste Zeile.
 */
export function BitName({ bit }: { bit: { id: string; name?: string } }) {
  return (
    <span class="bit-name">
      <span class="bit-name-code">{bit.id}</span>
      {/* Leerzeichen: als Fließtext (kompakte Felder) „D Dot“, im Flex-Layout wird es ignoriert */}
      {bit.name && bit.name !== bit.id && <>{' '}<span class="bit-name-text">{bit.name}</span></>}
    </span>
  );
}
