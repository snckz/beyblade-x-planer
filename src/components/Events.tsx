import { displayName } from '../lib/names';
import type { BeyEvent, Database, NewsFeed } from '../lib/types';
import type { UserState } from '../lib/storage';
import { daysUntil } from '../lib/data';
import { useApp } from '../lib/context';
import { News } from './News';
import { downloadIcs, type CalItem } from '../lib/ics';
import { Empty, Section } from './ui';
import { ArrowUpRight, CalendarPlus, ChevronRight } from 'lucide-preact';

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

  // Der nächste Termin steht groß oben; die Liste darunter zeigt die übrigen.
  const next = upcoming[0];
  const rest = upcoming.slice(1);
  const months = new Map<string, BeyEvent[]>();
  for (const e of rest) {
    const key = new Date(e.date + 'T00:00:00').toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
    months.set(key, [...(months.get(key) ?? []), e]);
  }

  const cal = (e: BeyEvent): CalItem => ({
    uid: e.id,
    date: e.date,
    endDate: e.endDate,
    title: `Beyblade X: ${e.title}`,
    location: e.place,
    description: e.note,
    url: e.url,
  });

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
          <span class="row-title">{e.url ? <a class="link" href={e.url} target="_blank" rel="noopener noreferrer">{e.title} <ArrowUpRight class="ico-inline" aria-hidden="true" /></a> : e.title}</span>
          <span class="row-sub">
            {dateRange(e)}
            {e.place ? ` · ${e.place}` : ''}
          </span>
          {e.note && <span class="row-note">{e.note}</span>}
          <span class="event-actions">
            {blade && (
              <button type="button" class="link-btn" onClick={() => openBlade(blade.id)}>
                {displayName(blade)} ansehen <ChevronRight aria-hidden="true" />
              </button>
            )}
            {daysUntil(e.endDate ?? e.date) >= 0 && (
              <button type="button" class="link-btn" onClick={() => downloadIcs([cal(e)], `${e.id}.ics`)} aria-label={`${e.title} in den Kalender`}>
                <CalendarPlus aria-hidden="true" /> In Kalender
              </button>
            )}
          </span>
        </div>
      </li>
    );
  };

  const nextDays = next ? daysUntil(next.date) : 0;
  const nextBlade = next?.bladeId ? db.blades.find((b) => b.id === next.bladeId) : undefined;

  return (
    <div class="stack">
      {next && (
        <article class="hero-card" aria-label="Nächster Termin">
          <div class="hero-top">
            <span class="hero-kicker">
              Nächster Termin · {KIND[next.kind]}
              {next.country && FLAG[next.country] ? ` ${FLAG[next.country]}` : ''}
            </span>
            {nextDays > 0 ? (
              <span class="hero-count">
                <b>{nextDays}</b>
                <small>{nextDays === 1 ? 'Tag' : 'Tage'}</small>
              </span>
            ) : (
              <span class="hero-count">
                <small>{when(next)}</small>
              </span>
            )}
          </div>
          <h2 class="hero-title">{next.title}</h2>
          <p class="hero-sub">
            {dateRange(next)}
            {next.place ? ` · ${next.place}` : ''}
          </p>
          {next.note && <p class="hero-note">{next.note}</p>}
          <div class="hero-actions">
            <button type="button" class="btn hero-btn" onClick={() => downloadIcs([cal(next)], `${next.id}.ics`)}>
              <CalendarPlus aria-hidden="true" /> In Kalender
            </button>
            {nextBlade && (
              <button type="button" class="btn btn-ghost hero-link" onClick={() => openBlade(nextBlade.id)}>
                {displayName(nextBlade)} ansehen
              </button>
            )}
            {next.url && (
              <a class="btn btn-ghost hero-link" href={next.url} target="_blank" rel="noopener noreferrer">
                Quelle <ArrowUpRight aria-hidden="true" />
              </a>
            )}
          </div>
        </article>
      )}
      {upcoming.length > 1 && (
        <button type="button" class="btn" onClick={() => downloadIcs(upcoming.map(cal), 'beyblade-termine.ics')}>
          <CalendarPlus aria-hidden="true" /> Alle {upcoming.length} Termine in den Kalender
        </button>
      )}
      {rest.length ? (
        [...months.entries()].map(([month, list]) => (
          <Section key={month} title={month}>
            <ul class="list">{list.map(card)}</ul>
          </Section>
        ))
      ) : next ? null : (
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
