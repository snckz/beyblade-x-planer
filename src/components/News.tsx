import { tr, DATE_LOCALE } from '../lib/i18n';
import { useEffect, useRef } from 'preact/hooks';
import type { NewsFeed } from '../lib/types';
import type { UserState } from '../lib/storage';
import { Empty } from './ui';

interface Props {
  news: NewsFeed;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  /** Nur die sichtbare Seite markiert Meldungen als gelesen – eine fürs Wischen vorbereitete Nachbarseite nicht. */
  active?: boolean;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString(DATE_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });

export function News({ news, state, update, active = true }: Props) {
  // „neu“-Markierung aus dem Stand beim Öffnen des Tabs, damit sie während des Lesens sichtbar bleibt.
  const seenAtOpen = useRef<Set<string> | null>(null);
  if (seenAtOpen.current === null) seenAtOpen.current = new Set(state.seenNews);
  const seen = seenAtOpen.current;

  // Sofort als gelesen speichern – auch wenn die App direkt auf diesem Tab geschlossen wird.
  useEffect(() => {
    if (!active) return;
    const ids = news.items.map((i) => i.id);
    if (ids.every((id) => state.seenNews.includes(id))) return;
    update((s) => ({ ...s, seenNews: [...new Set([...s.seenNews, ...ids])].slice(-300) }));
  }, [news.items, state.seenNews, update, active]);

  return (
    <div class="stack">
      <div class="card radar">
        <div class="radar-dot" aria-hidden="true" />
        <div>
          <p class="row-title">{tr('Neuheiten-Radar')}</p>
          <p class="muted">
            {tr('Prüft täglich das Beyblade Wiki auf neue Produktnummern (BX, UX, CX), die noch nicht in der Datenbank stehen.')}
            {news.updatedAt ? tr(' Letzter Fund: {0}.', fmt(news.updatedAt)) : ''}
          </p>
        </div>
      </div>
      {news.items.length ? (
        <ul class="list">
          {news.items.map((n) => (
            <li key={n.id} class="row">
              <span class="code">{n.code ?? '•'}</span>
              <div class="row-main">
                <a class="row-title link" href={n.url} target="_blank" rel="noopener noreferrer">
                  {n.title}
                </a>
                <span class="row-sub">
                  {n.source} {tr('· gefunden')} {fmt(n.foundAt)}
                </span>
              </div>
              {!seen.has(n.id) && <span class="badge badge-new">{tr('neu')}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={tr('Noch keine Neuheiten')}>{tr('Sobald im Wiki neue Produktnummern auftauchen, erscheinen sie hier.')}</Empty>
      )}
    </div>
  );
}
