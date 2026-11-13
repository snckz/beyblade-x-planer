import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Database, NewsFeed } from './lib/types';
import { loadDatabase, loadNews } from './lib/data';
import { loadState, saveState, type UserState } from './lib/storage';
import { ComboBuilder } from './components/ComboBuilder';
import { PartsBrowser } from './components/PartsBrowser';
import { Collection } from './components/Collection';
import { Deck } from './components/Deck';
import { News } from './components/News';

type Tab = 'builder' | 'parts' | 'collection' | 'deck' | 'news';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'builder', label: 'Kombo', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z' },
  { id: 'parts', label: 'Teile', icon: 'M4 6h16M4 12h16M4 18h10' },
  { id: 'collection', label: 'Sammlung', icon: 'M4 7l8-4 8 4-8 4-8-4Zm0 5l8 4 8-4M4 17l8 4 8-4' },
  { id: 'deck', label: 'Deck', icon: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h3' },
  { id: 'news', label: 'News', icon: 'M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0M12 12v8' },
];

function readTab(): Tab {
  const h = window.location.hash.slice(1) as Tab;
  return TABS.some((t) => t.id === h) ? h : 'builder';
}

export function App() {
  const [db, setDb] = useState<Database | null>(null);
  const [news, setNews] = useState<NewsFeed>({ updatedAt: null, lastRunOk: true, items: [] });
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<UserState>(loadState);
  const [tab, setTab] = useState<Tab>(readTab);
  const [storageOk, setStorageOk] = useState(true);

  const load = useCallback(() => {
    setError(null);
    loadDatabase()
      .then(setDb)
      .catch(() => setError('Die Teile-Datenbank konnte nicht geladen werden. Prüfe deine Internetverbindung.'));
    void loadNews().then(setNews);
  }, []);

  useEffect(load, [load]);
  useEffect(() => setStorageOk(saveState(state)), [state]);
  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const update = useCallback((fn: (s: UserState) => UserState) => setState((s) => fn(s)), []);
  const go = useCallback((t: Tab) => {
    window.location.hash = t;
    setTab(t);
    window.scrollTo({ top: 0 });
  }, []);

  const unread = news.items.filter((n) => !state.seenNews.includes(n.id)).length;
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div class="app">
      <header class="top">
        <div class="brand">
          <svg class="logo" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="17" class="logo-ring" />
            <path d="M20 6l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" class="logo-star" />
          </svg>
          <div>
            <p class="brand-name">X-Planer</p>
            <p class="brand-sub">Beyblade X Kombos &amp; Sammlung</p>
          </div>
        </div>
        <nav class="tabs-top" aria-label="Hauptnavigation">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} class={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(t.id); }}>
              {t.label}
              {t.id === 'news' && unread > 0 && <span class="dot-count">{unread}</span>}
            </a>
          ))}
        </nav>
      </header>

      <main class="main" id="main">
        <h1 class="page-title">{current.label === 'Kombo' ? 'Kombo-Planer' : current.label}</h1>
        {!storageOk && <p class="banner">Speichern auf diesem Gerät ist blockiert (z. B. privater Modus). Änderungen gehen beim Schließen verloren.</p>}
        {error ? (
          <div class="card error" role="alert">
            <p>{error}</p>
            <button type="button" class="btn btn-primary" onClick={load}>
              Erneut versuchen
            </button>
          </div>
        ) : !db ? (
          <div class="loading" aria-busy="true" aria-label="Lädt">
            <div class="spinner" />
          </div>
        ) : (
          <>
            {tab === 'builder' && <ComboBuilder db={db} state={state} update={update} />}
            {tab === 'parts' && <PartsBrowser db={db} state={state} update={update} />}
            {tab === 'collection' && <Collection db={db} state={state} update={update} goToParts={() => go('parts')} />}
            {tab === 'deck' && <Deck db={db} state={state} update={update} goToBuilder={() => go('builder')} />}
            {tab === 'news' && <News news={news} state={state} update={update} />}
          </>
        )}
      </main>

      <nav class="tabbar" aria-label="Hauptnavigation">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} class={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(t.id); }}>
            <span class="tab-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={t.icon} />
              </svg>
              {t.id === 'news' && unread > 0 && <span class="dot-count">{unread}</span>}
            </span>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
