import type { BeyEvent, Database, NewsFeed } from '../lib/types';
import type { UserState } from '../lib/storage';
import { daysUntil } from '../lib/data';
import { useApp } from '../lib/context';
import { News } from './News';
import { Empty, Section } from './ui';

interface Props {
  db: Database;
  events: BeyEvent[];
  news: NewsFeed;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
}

const KIND = { release: 'Release', tournament: 'Turnier', event: 'Event' } as const;
const FLAG: Record<string, string> = { AT: '🇦🇹', DE: '🇩🇪', TH: '🇹🇭', JP: '🇯🇵', US: '🇺🇸' };

function when(e: BeyEvent): string {
  const d = daysUntil(e.date);
  const end = e.endDate ? daysUntil(e.endDate) : d;
  if (d <= 0 && end >= 0) return 'läuft gerade';
  if (d === 1) return 'morgen';
  if (d > 1) return `in ${d} Tagen`;
  return 'vorbei';
}

function dateRange(e: BeyEvent) {
  const fmt = (s: string, withYear: boolean) => {
    const [y, m, d] = s.split('-');
    return withYear ? `${d}.${m}.${y}` : `${d}.${m}.`;
  };
  return e.endDate && e.endDate !== e.date ? `${fmt(e.date, false)}–${fmt(e.endDate, true)}` : fmt(e.date, true);
}

export function Events({ db, events, news, state, update }: Props) {
  const { openBlade } = useApp();
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = sorted.filter((e) => daysUntil(e.endDate ?? e.date) >= 0);
  const past = sorted.filter((e) => daysUntil(e.endDate ?? e.date) < 0).reverse().slice(0, 10);

  const months = new Map<string, BeyEvent[]>();
  for (const e of upcoming) {
    const key = new Date(e.date + 'T00:00:00').toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
    months.set(key, [...(months.get(key) ?? []), e]);
  }

  const card = (e: BeyEvent) => {
    const blade = e.bladeId ? db.blades.find((b) => b.id === e.bladeId) : undefined;
    return (
      <li key={e.id} class={`event glass kind-${e.kind}`}>
        <div class="event-date">
          <span class="event-day">{e.date.slice(8, 10)}</span>
          <span class="event-mon">{new Date(e.date + 'T00:00:00').toLocaleDateString('de-AT', { month: 'short' })}</span>
        </div>
        <div class="row-main">
          <span class="event-top">
            <span class="event-kind">
              {KIND[e.kind]}
              {e.country && FLAG[e.country] ? ` ${FLAG[e.country]}` : ''}
              {!e.confirmed && <span class="unverified">unbestätigt</span>}
            </span>
            <span class="countdown">{when(e)}</span>
          </span>
          <span class="row-title">{e.url ? <a class="link" href={e.url} target="_blank" rel="noopener noreferrer">{e.title} ↗</a> : e.title}</span>
          <span class="row-sub">
            {dateRange(e)}
            {e.place ? ` · ${e.place}` : ''}
          </span>
          {e.note && <span class="row-note">{e.note}</span>}
          {blade && (
            <button type="button" class="link-btn" onClick={() => openBlade(blade.id)}>
              {blade.name} ansehen →
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div class="stack">
      {upcoming.length ? (
        [...months.entries()].map(([month, list]) => (
          <Section key={month} title={month}>
            <ul class="list">{list.map(card)}</ul>
          </Section>
        ))
      ) : (
        <Empty title="Keine kommenden Termine">Neue Releases und Turniere werden zweimal pro Woche automatisch eingetragen.</Empty>
      )}
      {past.length > 0 && (
        <details class="past">
          <summary>Vergangene Termine ({past.length})</summary>
          <ul class="list">{past.map(card)}</ul>
        </details>
      )}
      <Section title="Neuheiten-Radar">
        <News news={news} state={state} update={update} />
      </Section>
    </div>
  );
}
