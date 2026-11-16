import { displayName } from '../lib/names';
import type { BeyEvent, Database, NewsFeed } from '../lib/types';
import { BladeStage } from './BeyImage';
import type { UserState } from '../lib/storage';
import { daysUntil } from '../lib/data';
import { useApp } from '../lib/context';
import { News } from './News';
import { downloadIcs, type CalItem } from '../lib/ics';
import { Empty, Section } from './ui';
import { ArrowUpRight, CalendarPlus, ChevronRight, Clock, MapPin } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { notePriceYen, photoMatchesTitle, splitNote } from '../lib/eventText';
import { convert, yen } from '../lib/price';

interface Props {
  db: Database;
  events: BeyEvent[];
  news: NewsFeed;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
}

const KIND = { release: 'Release', tournament: 'Turnier', event: 'Event' } as const;
const KIND_PLURAL = { release: 'Releases', tournament: 'Turniere', event: 'Events' } as const;
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

/** „Abb. ähnlich“, wenn das Foto nicht exakt zum Produkt passt (Set, Sonderfarbe). */
const similarNote = (eventTitle: string) => (imageTitle: string) => (photoMatchesTitle(eventTitle, imageTitle) ? null : 'Abb. ähnlich');

export function Events({ db, events, news, state, update }: Props) {
  const { openBlade, rates } = useApp();
  const [kind, setKind] = useState<'all' | BeyEvent['kind']>('all');
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const upcomingAll = sorted.filter((e) => daysUntil(e.endDate ?? e.date) >= 0);
  const kinds = (['release', 'tournament', 'event'] as const).filter((k) => upcomingAll.some((e) => e.kind === k));
  const upcoming = kind === 'all' ? upcomingAll : upcomingAll.filter((e) => e.kind === kind);

  /** Preis-Etikett nur bei Releases – bei Events steht „Yen“ oft für etwas anderes (z. B. Mindesteinkauf). */
  const price = (e: BeyEvent) => {
    const jpy = e.kind === 'release' && e.note ? notePriceYen(e.note) : null;
    if (!jpy) return null;
    const c = convert(jpy, rates);
    return { jpy: yen(jpy), eur: c ? `ca. ${Math.round(c.eur)} €` : null };
  };
  const priceTag = (e: BeyEvent) => {
    const p = price(e);
    return p ? (
      <span class="tl-price">
        {p.jpy}
        {p.eur && <span class="tl-approx">{p.eur}</span>}
      </span>
    ) : null;
  };
  const hasEuro = upcoming.some((e) => price(e)?.eur);
  const past = sorted.filter((e) => daysUntil(e.endDate ?? e.date) < 0).reverse().slice(0, 10);

  // Der nächste Termin steht groß oben; die Liste darunter zeigt die übrigen.
  const next = upcoming[0];
  const rest = upcoming.slice(1);
  const months = new Map<string, BeyEvent[]>();
  for (const e of rest) {
    const key = new Date(e.date + 'T00:00:00').toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
    months.set(key, [...(months.get(key) ?? []), e]);
  }

  /** Kurzbeschreibung + Rest. Besteht der Rest nur aus dem Preis, der schon als Etikett dasteht, entfällt „Mehr“. */
  const shortNote = (e: BeyEvent) => {
    const n = splitNote(e.note ?? '');
    return price(e) && /^[\d.]+ Yen\.?$/.test(n.rest) ? { lead: n.lead, rest: '' } : n;
  };

  const cal = (e: BeyEvent): CalItem => ({
    uid: e.id,
    date: e.date,
    endDate: e.endDate,
    title: `Beyblade X: ${e.title}`,
    location: e.place,
    description: e.note,
    url: e.url,
  });

  /** Kurzbeschreibung; mit Rest aufklappbar – der ganze Text ist die Schaltfläche. */
  const noteBlock = (n: { lead: string; rest: string }, cls: string) =>
    !n.lead ? null : n.rest ? (
      <details class="tl-more">
        <summary class={cls}>
          {n.lead}{' '}
          <span class="more-label">
            <span class="when-closed">Mehr</span>
            <span class="when-open">Weniger</span>
          </span>
        </summary>
        <span class={cls}>{n.rest}</span>
      </details>
    ) : (
      <span class={cls}>{n.lead}</span>
    );

  const card = (e: BeyEvent) => {
    const blade = e.bladeId ? db.blades.find((b) => b.id === e.bladeId) : undefined;
    const upcomingItem = daysUntil(e.endDate ?? e.date) >= 0;
    return (
      <li key={e.id} class={`tl-item kind-${e.kind}`}>
        <div class="tl-date">
          <span class="event-day">{e.date.slice(8, 10)}</span>
          <span class="event-mon">{new Date(e.date + 'T00:00:00').toLocaleDateString('de-AT', { month: 'short' })}</span>
        </div>
        <div class="tl-body">
          <span class="event-kind">
            {KIND[e.kind]}
            {e.country && FLAG[e.country] ? ` ${FLAG[e.country]}` : ''}
            {!e.confirmed && <span class="unverified">unbestätigt</span>}
            <span class="tl-when">{when(e)}</span>
          </span>
          <span class="row-title">{e.url ? <a class="link" href={e.url} target="_blank" rel="noopener noreferrer">{e.title} <ArrowUpRight class="ico-inline" aria-hidden="true" /></a> : e.title}</span>
          <span class="tl-meta">
            {e.endDate && e.endDate !== e.date && (
              <span>
                <Clock aria-hidden="true" /> {dateRange(e)}
              </span>
            )}
            {e.place && (
              <span>
                <MapPin aria-hidden="true" /> {e.place}
              </span>
            )}
            {priceTag(e)}
          </span>
          {noteBlock(shortNote(e), 'row-note')}
          {blade && (
            <button type="button" class="tl-link" onClick={() => openBlade(blade.id)}>
              {displayName(blade)} <ChevronRight aria-hidden="true" />
            </button>
          )}
        </div>
        <div class="tl-side">
          {blade && <BladeStage blade={blade} name={displayName(blade)} noteFor={similarNote(e.title)} />}
          {upcomingItem && (
            <button type="button" class="icon-btn tl-cal" onClick={() => downloadIcs([cal(e)], `${e.id}.ics`)} aria-label={`${e.title} in den Kalender`}>
              <CalendarPlus aria-hidden="true" />
            </button>
          )}
        </div>
      </li>
    );
  };

  const nextDays = next ? daysUntil(next.date) : 0;
  const nextBlade = next?.bladeId ? db.blades.find((b) => b.id === next.bladeId) : undefined;
  const nextNote = next ? shortNote(next) : { lead: '', rest: '' };

  return (
    <div class="stack">
      {kinds.length > 1 && (
        <div class="chip-row" role="group" aria-label="Termine filtern">
          <button type="button" class={`chip${kind === 'all' ? ' chip-on' : ''}`} aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
            Alle
          </button>
          {kinds.map((k) => (
            <button key={k} type="button" class={`chip${kind === k ? ' chip-on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {KIND_PLURAL[k]}
            </button>
          ))}
        </div>
      )}
      {next && (
        <article class="hero-card" aria-label="Nächster Termin">
          <div class="hero-main">
            <div class="hero-text">
              <span class="hero-kicker">
                Nächster Termin · {KIND[next.kind]}
                {next.country && FLAG[next.country] ? ` ${FLAG[next.country]}` : ''}
              </span>
              <h2 class="hero-title">{next.title}</h2>
              <p class="tl-meta hero-meta">
                <span>
                  <Clock aria-hidden="true" /> {dateRange(next)}
                </span>
                {next.place && (
                  <span>
                    <MapPin aria-hidden="true" /> {next.place}
                  </span>
                )}
                {priceTag(next)}
              </p>
            </div>
            <div class="hero-aside">
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
              {nextBlade && <BladeStage blade={nextBlade} name={displayName(nextBlade)} size="lg" noteFor={similarNote(next.title)} />}
            </div>
          </div>
          {noteBlock(nextNote, 'hero-note')}
          <div class="hero-actions">
            <button type="button" class="btn hero-btn" onClick={() => downloadIcs([cal(next)], `${next.id}.ics`)}>
              <CalendarPlus aria-hidden="true" /> In Kalender
            </button>
            {nextBlade && (
              <button type="button" class="btn btn-ghost hero-link" onClick={() => openBlade(nextBlade.id)}>
                {displayName(nextBlade)} <ChevronRight aria-hidden="true" />
              </button>
            )}
            {next.url && (
              <a class="btn btn-ghost hero-link hero-icon" href={next.url} target="_blank" rel="noopener noreferrer" aria-label="Quelle öffnen">
                <ArrowUpRight aria-hidden="true" />
              </a>
            )}
          </div>
        </article>
      )}
      {upcoming.length > 1 && (
        <button type="button" class="btn btn-sm cal-all" onClick={() => downloadIcs(upcoming.map(cal), 'beyblade-termine.ics')}>
          <CalendarPlus aria-hidden="true" /> Alle {upcoming.length} Termine in den Kalender
        </button>
      )}
      {rest.length ? (
        [...months.entries()].map(([month, list]) => (
          <Section key={month} title={month}>
            <ul class="timeline card">{list.map(card)}</ul>
          </Section>
        ))
      ) : next ? null : (
        <Empty title="Keine kommenden Termine">Neue Releases und Turniere werden regelmäßig automatisch eingetragen.</Empty>
      )}
      {hasEuro && rates && (
        <p class="fineprint rate-note">
          Euro-Beträge sind ungefähre Umrechnungen der japanischen Listenpreise ({rates.source} vom {rates.date.split('-').reverse().join('.')}) – keine Ladenpreise.
        </p>
      )}
      {past.length > 0 && (
        <details class="past">
          <summary>Vergangene Termine ({past.length})</summary>
          <ul class="timeline card">{past.map(card)}</ul>
        </details>
      )}
      <Section title="Neuheiten-Radar">
        <News news={news} state={state} update={update} />
      </Section>
    </div>
  );
}
