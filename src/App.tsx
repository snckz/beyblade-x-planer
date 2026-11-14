import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { Database, EventFeed, ImageIndex, NewsFeed } from './lib/types';
import { daysUntil, loadDatabase, loadEvents, loadImages, loadNews } from './lib/data';
import { loadState, saveState, type UserState } from './lib/storage';
import { AppContext, type ImageKind } from './lib/context';
import { ComboBuilder } from './components/ComboBuilder';
import { Lexikon } from './components/Lexikon';
import { Lightbox } from './components/Lightbox';
import { Collection } from './components/Collection';
import { Battle } from './components/Battle';
import { Events } from './components/Events';
import { DetailSheet } from './components/DetailSheet';

type Tab = 'builder' | 'parts' | 'battle' | 'events' | 'collection';

const TABS: { id: Tab; label: string; title: string; icon: string }[] = [
  { id: 'builder', label: 'Kombo', title: 'Kombo-Planer', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z' },
  { id: 'parts', label: 'Lexikon', title: 'Lexikon', icon: 'M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h10' },
  { id: 'battle', label: 'Battle', title: 'Battle', icon: 'M5 19 19 5M14 5h5v5M5 5l5 5M14 14l5 5M19 14v5h-5' },
  { id: 'events', label: 'Termine', title: 'Termine & News', icon: 'M5 6h14v14H5zM5 10h14M9 3v4M15 3v4' },
  { id: 'collection', label: 'Sammlung', title: 'Sammlung', icon: 'M4 7l8-4 8 4-8 4-8-4Zm0 5l8 4 8-4M4 17l8 4 8-4' },
];

// Alte Links (#deck, #news) auf die neuen Tabs umleiten.
const ALIAS: Record<string, Tab> = { deck: 'battle', news: 'events', lexikon: 'parts' };

function readTab(): Tab {
  const raw = window.location.hash.slice(1);
  const h = (ALIAS[raw] ?? raw) as Tab;
  return TABS.some((t) => t.id === h) ? h : 'builder';
}

export function App() {
  const [db, setDb] = useState<Database | null>(null);
  const [news, setNews] = useState<NewsFeed>({ updatedAt: null, lastRunOk: true, items: [] });
  const [images, setImages] = useState<ImageIndex>({ source: '', blades: {} });
  const [events, setEvents] = useState<EventFeed>({ updatedAt: '', events: [] });
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<UserState>(loadState);
  const [tab, setTab] = useState<Tab>(readTab);
  const [storageOk, setStorageOk] = useState(true);
  const [detail, setDetail] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ id: string; kind: ImageKind } | null>(null);
  const [preset, setPreset] = useState<{ bladeId: string; key: number } | null>(null);

  const load = useCallback(() => {
    setError(null);
    loadDatabase()
      .then(setDb)
      .catch(() => setError('Die Teile-Datenbank konnte nicht geladen werden. Prüfe deine Internetverbindung.'));
    void loadNews().then(setNews);
    void loadImages().then(setImages);
    void loadEvents().then(setEvents);
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
  const openBlade = useCallback((id: string) => setDetail(id), []);
  const closeDetail = useCallback(() => setDetail(null), []);
  const openImage = useCallback((id: string, kind: ImageKind = 'blade') => setZoom({ id, kind }), []);
  const closeZoom = useCallback(() => setZoom(null), []);
  const useInBuilder = useCallback(
    (bladeId: string) => {
      setDetail(null);
      setPreset({ bladeId, key: Date.now() });
      go('builder');
    },
    [go],
  );
  const ctx = useMemo(() => ({ images, openBlade, openImage }), [images, openBlade, openImage]);

  const unread = news.items.filter((n) => !state.seenNews.includes(n.id)).length;
  const soon = events.events.filter((e) => {
    const d = daysUntil(e.date);
    return d >= 0 && d <= 14;
  }).length;
  const badge = (t: Tab) => (t === 'events' ? unread + soon : 0);
  const current = TABS.find((t) => t.id === tab)!;

  const navLink = (t: (typeof TABS)[number], withIcon: boolean) => (
    <a
      key={t.id}
      href={`#${t.id}`}
      class={tab === t.id ? 'on' : ''}
      aria-current={tab === t.id ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        go(t.id);
      }}
    >
      {withIcon ? (
        <span class="tab-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={t.icon} />
          </svg>
          {badge(t.id) > 0 && <span class="dot-count">{badge(t.id)}</span>}
        </span>
      ) : null}
      <span>{t.label}</span>
      {!withIcon && badge(t.id) > 0 && <span class="dot-count">{badge(t.id)}</span>}
    </a>
  );

  return (
    <AppContext.Provider value={ctx}>
      <div class="app">
        <div class="bg" aria-hidden="true">
          <span class="blob b1" />
          <span class="blob b2" />
          <span class="blob b3" />
          <span class="rings" />
        </div>
        <header class="top glass-bar">
          <div class="brand">
            <p class="brand-name">
              Beyblade<span> X</span>
            </p>
          </div>
          <nav class="tabs-top" aria-label="Hauptnavigation">
            {TABS.map((t) => navLink(t, false))}
          </nav>
        </header>

        <main class="main" id="main">
          <h1 class="page-title">
            <span>{current.title}</span>
          </h1>
          {!storageOk && <p class="banner">Speichern auf diesem Gerät ist blockiert (z. B. privater Modus). Änderungen gehen beim Schließen verloren.</p>}
          {error ? (
            <div class="card glass error" role="alert">
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
              {tab === 'builder' && <ComboBuilder key={preset?.key ?? 0} db={db} state={state} update={update} presetBladeId={preset?.bladeId} />}
              {tab === 'parts' && <Lexikon db={db} state={state} update={update} />}
              {tab === 'battle' && <Battle db={db} state={state} update={update} goToBuilder={() => go('builder')} />}
              {tab === 'events' && <Events db={db} events={events.events} news={news} state={state} update={update} />}
              {tab === 'collection' && <Collection db={db} state={state} update={update} goToParts={() => go('parts')} />}
            </>
          )}
        </main>

        <nav class="tabbar glass-bar" aria-label="Hauptnavigation">
          {TABS.map((t) => navLink(t, true))}
        </nav>

        {db && detail && <DetailSheet db={db} events={events.events} bladeId={detail} onClose={closeDetail} onUse={useInBuilder} />}
        {db && zoom && <Lightbox db={db} id={zoom.id} kind={zoom.kind} onClose={closeZoom} />}
      </div>
    </AppContext.Provider>
  );
}
