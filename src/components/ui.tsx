import type { ComponentChildren } from 'preact';
import type { BeyType, Spin } from '../lib/types';
import { TYPE_LABEL } from '../lib/analysis';

export function TypeBadge({ type, small }: { type: BeyType; small?: boolean }) {
  return <span class={`badge type-${type}${small ? ' badge-sm' : ''}`}>{TYPE_LABEL[type]}</span>;
}

export function SpinBadge({ spin }: { spin: Spin }) {
  if (spin === 'right') return null;
  return (
    <span class="badge badge-spin" title={spin === 'left' ? 'Linksdreher' : 'Beide Richtungen'}>
      {spin === 'left' ? '↺ Links' : '⇄ Beide'}
    </span>
  );
}

export function UnverifiedMark({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span class="unverified" title="Daten noch nicht geprüft">
      ungeprüft
    </span>
  );
}

export function StatBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div class="stat">
      <div class="stat-head">
        <span>{label}</span>
        <span class="stat-val">{value}</span>
      </div>
      <div class="stat-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <div class={`stat-fill tone-${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
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
