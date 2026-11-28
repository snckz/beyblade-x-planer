import { tr, canStoreLang, storedLang } from './lib/i18n';
import { displayName } from './lib/names';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { BarcodeFeed, Database, EventFeed, ImageIndex, MetaFeed, NewsFeed, Rates } from './lib/types';
import { daysUntil, knownBarcodes, loadBarcodes, loadDatabase, loadEvents, loadIdRegister, loadImages, loadMeta, loadNews, loadRates } from './lib/data';
import { migrateUserState, type IdRegister } from './lib/idRegister';
import { loadState, saveState, STORAGE_KEY, type UserState } from './lib/storage';
import { AppContext, type ImageKind } from './lib/context';
import { preloadImages } from './lib/images';
import { decodeState, importError, mergeState } from './lib/transfer';
import { ImportConfirm } from './components/ImportConfirm';
import { ConfirmSheet } from './components/ConfirmSheet';
import { TriangleAlert } from 'lucide-preact';
import { wishReleases } from './lib/reminders';
import { ComboBuilder } from './components/ComboBuilder';
import { Lightbox } from './components/Lightbox';
import { DetailSheet } from './components/DetailSheet';
import { IosHint } from './components/IosHint';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UndoToast } from './components/UndoToast';
import { lazy, Suspense } from 'preact/compat';
import { TabPager } from './components/TabPager';
import { LanguagePrompt } from './components/LanguagePrompt';
import { rememberTab } from './lib/tabSwipe';

// Tabs und selten genutzte Fenster erst bei Bedarf laden – der Start bleibt schlank.
// Gleich nach dem Start werden sie im Leerlauf vorgeladen, damit der Wechsel trotzdem sofort geht.
// Schlägt das Nachladen fehl (App war während eines Updates offen → alte Dateien gibt es nicht mehr),
// einmal kurz warten und erneut versuchen; sonst übernimmt die ErrorBoundary (lädt die Seite einmal neu).
const retry =
  <T,>(load: () => Promise<T>) =>
  () =>
    load().catch(() => new Promise<T>((r) => setTimeout(r, 400)).then(load));
// Welche Seiten sind schon geladen? Nur die dürfen als Nachbarseite im Hintergrund entstehen (siehe TabPager) –
// ein fehlgeschlagenes Nachladen soll nie die sichtbare Seite stören.
const loadedTabs = new Set<string>(['builder']);
const mark =
  <T,>(tab: string) =>
  (m: T) => {
    loadedTabs.add(tab);
    return m;
  };
const loaders = {
  Lexikon: retry(() => import('./components/Lexikon').then((m) => ({ default: m.Lexikon })).then(mark('parts'))),
  Battle: retry(() => import('./components/Battle').then((m) => ({ default: m.Battle })).then(mark('battle'))),
  Events: retry(() => import('./components/Events').then((m) => ({ default: m.Events })).then(mark('events'))),
  Collection: retry(() => import('./components/Collection').then((m) => ({ default: m.Collection })).then(mark('collection'))),
  PhotoCheck: retry(() => import('./components/PhotoCheck').then((m) => ({ default: m.PhotoCheck }))),
};
const Lexikon = lazy(loaders.Lexikon);
const Battle = lazy(loaders.Battle);
const Events = lazy(loaders.Events);
const Collection = lazy(loaders.Collection);
const PhotoCheck = lazy(loaders.PhotoCheck);
const preloadAll = () => Promise.all(Object.values(loaders).map((l) => l().catch(() => undefined)));

type Tab = 'builder' | 'parts' | 'battle' | 'events' | 'collection';

const TABS: {
  id: Tab;
  label: string;
  title: string;
  kicker: string;
  icon: string;
}[] = [
  {
    id: 'builder',
    label: tr('Kombo'),
    title: tr('Kombo-Planer'),
    kicker: tr('Blade, Ratchet und Bit kombinieren und bewerten lassen.'),
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
  },
  {
    id: 'parts',
    label: tr('Lexikon'),
    title: tr('Lexikon'),
    kicker: tr('Alle Blades, Ratchets und Bits mit Werten und Bildern.'),
    icon: 'M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h10',
  },
  {
    id: 'battle',
    label: 'Battle',
    title: 'Battle',
    kicker: tr('Deck aufstellen, Gegner einschätzen, Punkte zählen.'),
    icon: 'M5 19 19 5M14 5h5v5M5 5l5 5M14 14l5 5M19 14v5h-5',
  },
  {
    id: 'events',
    label: tr('Termine'),
    title: tr('Termine & News'),
    kicker: tr('Neuerscheinungen, Turniere und Meldungen.'),
    icon: 'M5 6h14v14H5zM5 10h14M9 3v4M15 3v4',
  },
  {
    id: 'collection',
    label: tr('Sammlung'),
    title: tr('Sammlung'),
    kicker: tr('Was du hast, was dir fehlt und was sich lohnt.'),
    icon: 'M4 7l8-4 8 4-8 4-8-4Zm0 5l8 4 8-4M4 17l8 4 8-4',
  },
];

// Alte Links (#deck, #news) auf die neuen Tabs umleiten.
const TAB_IDS = TABS.map((t) => t.id);

const ALIAS: Record<string, Tab> = {
  deck: 'battle',
  news: 'events',
  lexikon: 'parts',
};

function readTab(): Tab {
  const raw = window.location.hash.slice(1);
  const h = (ALIAS[raw] ?? raw) as Tab;
  return TABS.some((t) => t.id === h) ? h : 'builder';
}

export function App() {
  const [db, setDb] = useState<Database | null>(null);
  const [news, setNews] = useState<NewsFeed>({
    updatedAt: null,
    lastRunOk: true,
    items: [],
  });
  const [images, setImages] = useState<ImageIndex>({ source: '', blades: {} });
  const [events, setEvents] = useState<EventFeed>({
    updatedAt: '',
    events: [],
  });
  const [rates, setRates] = useState<Rates | null>(null);
  const [register, setRegister] = useState<IdRegister | null>(null);
  const [meta, setMeta] = useState<MetaFeed | null>(null);
  const [barcodeFeed, setBarcodeFeed] = useState<BarcodeFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<UserState>(loadState);
  const [tab, setTab] = useState<Tab>(readTab);
  // Beim Wischen: Ziel in der Leiste schon markieren, sobald der Finger loslässt (die Seite rastet noch ein)
  const [previewTab, setPreviewTab] = useState<Tab | null>(null);
  const [, setPreloaded] = useState(false);
  // Erster Start: einmal nach der Sprache fragen (nur wenn sich die Antwort auch merken lässt)
  const [askLang, setAskLang] = useState(() => storedLang() === null && canStoreLang());
  const [storageOk, setStorageOk] = useState(true);
  const [detail, setDetail] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ id: string; kind: ImageKind } | null>(null);
  const [preset, setPreset] = useState<{
    bladeId: string;
    ratchetId?: string;
    bitId?: string;
    key: number;
  } | null>(null);

  const load = useCallback(() => {
    setError(null);
    loadDatabase()
      .then(setDb)
      .catch(() => setError(tr('Die Teile-Datenbank konnte nicht geladen werden. Prüfe deine Internetverbindung.')));
    void loadNews().then(setNews);
    void loadImages().then(setImages);
    void loadEvents().then(setEvents);
    void loadRates().then(setRates);
    void loadMeta().then(setMeta);
    void loadBarcodes().then(setBarcodeFeed);
    void loadIdRegister().then(setRegister);
  }, []);

  // Gespeicherte Kombos, Sammlung, Wunschliste … mit veralteten IDs (umbenannt, alte Produktcodes) auf die aktuellen
  // umstellen – nur ausdrücklich im ID-Register Eingetragenes, Unbekanntes bleibt unverändert (nichts geht verloren).
  // Läuft auch nach einem Import; ohne Änderung bleibt der Stand derselbe (kein erneutes Speichern).
  useEffect(() => {
    if (!db || !register) return;
    const res = migrateUserState(state, register, db);
    if (res.changes.length) setState(res.state);
  }, [db, register, state]);

  useEffect(load, [load]);
  // Große Fotos vorladen, sobald der Bilder-Index da ist – dann öffnet die Großansicht sofort.
  useEffect(() => (Object.keys(images.blades).length ? preloadImages(images) : undefined), [images]);
  useEffect(() => setStorageOk(saveState(state)), [state]);
  // Zweiter Tab/Fenster hat gespeichert: Stand übernehmen statt ihn beim nächsten Speichern zu überschreiben.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setState(loadState());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => {
    const onHash = () => {
      setTab(readTab());
      setPreviewTab(null);
      // Zurück-Taste (Android) oder Tab-Wechsel: offene Fenster auf App-Ebene schließen
      setDetail(null);
      setZoom(null);
      setCheck(null);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const update = useCallback((fn: (s: UserState) => UserState) => setState((s) => fn(s)), []);
  const go = useCallback((t: Tab) => {
    rememberTab(t);
    setTab(t);
    setPreviewTab(null);
    window.scrollTo({ top: 0 });
  }, []);

  // Daten von einem anderen Gerät: Rückfrage bzw. Fehlermeldung im eigenen Fenster
  const [incoming, setIncoming] = useState<UserState | null>(null);
  const [importFailed, setImportFailed] = useState<string | null>(null);
  // Übertragungs-Link von einem anderen Gerät (#import=…): nach Rückfrage zusammenführen.
  useEffect(() => {
    const check = () => {
      const h = window.location.hash;
      if (!h.startsWith('#import=')) return;
      const code = h.slice('#import='.length);
      history.replaceState(null, '', `${location.pathname}${location.search}#collection`);
      setTab('collection');
      decodeState(code)
        .then((data) => setIncoming(data))
        .catch((err: unknown) => setImportFailed(importError(err)));
    };
    check();
    // Auch wenn die App schon offen ist und nur der Link (Hash) wechselt.
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, []);
  // Nach dem ersten Bild alle Tabs im Leerlauf vorladen (danach wechselt man ohne Wartezeit, auch offline).
  useEffect(() => {
    if (!db) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    // Danach einmal neu zeichnen: Jetzt dürfen die Nachbarseiten fürs Wischen entstehen.
    const run = () => void preloadAll().then(() => setPreloaded(true));
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 3000 });
    else window.setTimeout(run, 1200);
  }, [!!db]);
  const openBlade = useCallback((id: string) => setDetail(id), []);
  const closeDetail = useCallback(() => setDetail(null), []);
  const openImage = useCallback((id: string, kind: ImageKind = 'blade') => setZoom({ id, kind }), []);
  const closeZoom = useCallback(() => setZoom(null), []);
  const [check, setCheck] = useState<string | null>(null);
  const openCheck = useCallback((code: string) => {
    setDetail(null); // Detailseite schließen, sonst liegen zwei Fenster übereinander
    setCheck(code);
  }, []);
  const closeCheck = useCallback(() => setCheck(null), []);
  const useInBuilder = useCallback(
    (bladeId: string) => {
      setDetail(null);
      setPreset({ bladeId, key: Date.now() });
      go('builder');
    },
    [go],
  );
  const buildCombo = useCallback(
    (bladeId: string, ratchetId: string | undefined, bitId: string) => {
      setPreset({ bladeId, ratchetId, bitId, key: Date.now() });
      go('builder');
      window.scrollTo({ top: 0 });
    },
    [go],
  );
  const hasbroNames = true; // englische (Hasbro-)Namen überall, Takara-Name daneben
  const bladeName = useCallback((b: { name: string; hasbroName?: string }) => displayName(b), []);
  const owned = state.owned;
  const ownedCount = useCallback((code: string) => owned[code] ?? 0, [owned]);
  // Mitgelieferte Barcodes, auf die Produkte der Datenbank aufgelöst (der Kauf-Check erkennt Packungen damit sofort)
  const barcodes = useMemo(() => (db ? knownBarcodes(barcodeFeed, db.products) : {}), [barcodeFeed, db]);
  const ctx = useMemo(
    () => ({ images, rates, openBlade, openImage, openCheck, ownedCount, bladeName, hasbroNames, barcodes, register, meta }),
    [images, rates, openBlade, openImage, openCheck, ownedCount, bladeName, hasbroNames, barcodes, register, meta],
  );

  const unread = news.items.filter((n) => !state.seenNews.includes(n.id)).length;
  const soon = events.events.filter((e) => {
    const d = daysUntil(e.date);
    return d >= 0 && d <= 14;
  }).length;
  const newWishes = db ? wishReleases(db, state, events.events).filter((r) => r.status === 'new').length : 0;
  const badge = (t: Tab) => (t === 'events' ? unread + soon : t === 'collection' ? newWishes : 0);
  const shownTab = previewTab ?? tab;

  // Merkt, ob gescrollt ist – dann schützt eine dunkle Fläche die Statusleiste (siehe styles.css „.is-scrolled“).
  useEffect(() => {
    const onScroll = () => document.documentElement.classList.toggle('is-scrolled', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const spinner = (
    <div class="loading" aria-busy="true" aria-label={tr('Lädt')}>
      <div class="spinner" />
    </div>
  );
  const storageBanner = !storageOk && <p class="banner">{tr('Speichern auf diesem Gerät ist blockiert (z. B. privater Modus). Änderungen gehen beim Schließen verloren.')}</p>;
  const pageHead = (id: Tab) => {
    const t = TABS.find((x) => x.id === id)!;
    return (
      <div class="page-head">
        <h1 class="page-title">{t.title}</h1>
        <span class="x-rail" aria-hidden="true" />
        <p class="page-sub">{t.kicker}</p>
      </div>
    );
  };
  /** Eine Hauptseite samt Kopf. `active`: die sichtbare Seite; Nachbarseiten liegen fürs Wischen fertig daneben. */
  const renderPage = (data: Database, id: Tab, active: boolean) => (
    <>
      {pageHead(id)}
      {active && storageBanner}
      {active && <IosHint hasData={Object.keys(state.owned).length > 0 || state.combos.length > 0} />}
      <ErrorBoundary>
        <Suspense fallback={active ? spinner : null}>
          {id === 'builder' && (
            <ComboBuilder key={preset?.key ?? 0} db={data} state={state} update={update} presetBladeId={preset?.bladeId} presetRatchetId={preset?.ratchetId} presetBitId={preset?.bitId} presetKey={preset?.key} meta={meta} />
          )}
          {id === 'parts' && <Lexikon db={data} state={state} update={update} active={active} />}
          {id === 'battle' && <Battle db={data} state={state} update={update} goToBuilder={() => go('builder')} meta={meta} onBuild={buildCombo} />}
          {id === 'events' && <Events db={data} events={events.events} news={news} state={state} update={update} active={active} />}
          {id === 'collection' && <Collection events={events.events} db={data} state={state} update={update} meta={meta} />}
        </Suspense>
      </ErrorBoundary>
    </>
  );

  const navLink = (t: (typeof TABS)[number], withIcon: boolean) => (
    <a
      key={t.id}
      href={`#${t.id}`}
      class={shownTab === t.id ? 'on' : ''}
      aria-current={shownTab === t.id ? 'page' : undefined}
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
      <span class="tab-label">{t.label}</span>
      {!withIcon && badge(t.id) > 0 && <span class="dot-count">{badge(t.id)}</span>}
    </a>
  );

  if (askLang) return <LanguagePrompt onDone={() => setAskLang(false)} />;

  return (
    <AppContext.Provider value={ctx}>
      <div class="app">
        <div class="bg" aria-hidden="true">
          <span class="bg-photo" />
        </div>
        <header class="top glass-bar">
          <div class="brand">
            <img class="brand-logo" src="./logo.webp" alt={tr('Beyblade X')} width="600" height="94" />
          </div>
          <nav class="tabs-top" aria-label={tr('Hauptnavigation')}>
            {TABS.map((t) => navLink(t, false))}
          </nav>
        </header>

        <main class="main" id="main">
          {error || !db ? (
            <>
              {pageHead(tab)}
              {storageBanner}
              {error ? (
                <div class="card glass error" role="alert">
                  <p>{error}</p>
                  <button type="button" class="btn btn-primary" onClick={load}>
                    {tr('Erneut versuchen')}
                  </button>
                </div>
              ) : (
                spinner
              )}
            </>
          ) : (
            <TabPager tabs={TAB_IDS} current={tab} render={(t, active) => renderPage(db, t, active)} canPrebuild={(t) => loadedTabs.has(t)} onChange={go} onPreview={setPreviewTab} swipeArea="#main" />
          )}
        </main>

        <nav class="tabbar glass-bar" aria-label={tr('Hauptnavigation')}>
          {TABS.map((t) => navLink(t, true))}
        </nav>
        <UndoToast />
        {incoming && <ImportConfirm incoming={incoming} onConfirm={() => setState((s) => mergeState(s, incoming))} onClose={() => setIncoming(null)} />}
        {importFailed && (
          <ConfirmSheet title={tr('Übernehmen ging nicht')} confirmLabel="OK" cancelLabel={null} icon={TriangleAlert} onConfirm={() => {}} onClose={() => setImportFailed(null)}>
            <p>{importFailed}</p>
          </ConfirmSheet>
        )}

        {db && detail && <DetailSheet db={db} events={events.events} bladeId={detail} onClose={closeDetail} onUse={useInBuilder} meta={meta} />}
        {db && zoom && <Lightbox db={db} id={zoom.id} kind={zoom.kind} onClose={closeZoom} />}
        {db && check && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <PhotoCheck key={check} db={db} state={state} update={update} meta={meta} initialCode={check} onClose={closeCheck} />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
    </AppContext.Provider>
  );
}
