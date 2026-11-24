import { tr, dec, NUM_LOCALE } from '../lib/i18n';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Database, MetaFeed, Product } from '../lib/types';
import type { ShopPrice, UserState } from '../lib/storage';
import { findByCode, findByName, recognizePhoto } from '../lib/photo';
import { judgeWithMeta, rateProduct, OVERALL_LABEL, type Rating } from '../lib/rate';
import { META_TOP, pct } from '../lib/metaUsage';
import { metaOpponents } from '../lib/battle';
import type { ScoreCache } from '../lib/optimizer';
import { contentLabel, purchaseCodes, searchProducts } from '../lib/data';
import { groupKey, refPrice, VERDICT_LABEL, yen } from '../lib/price';
import { PriceInput } from './PriceInput';
import { displayName, displayProductName, regionLabel } from '../lib/names';
import { nb } from '../lib/analysis';
import { useApp } from '../lib/context';
import { useModal } from '../lib/useModal';
import { BeyImage } from './BeyImage';
import { Camera, ChevronLeft, Heart, ScanBarcode } from 'lucide-preact';
import { useBarcodeCamera } from '../lib/barcodeCamera';
import { attachEdgeBack, slideBack } from '../lib/edgeBack';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  meta?: MetaFeed | null;
  /** direkt mit der Bewertung dieser Packung starten („Kaufen?“-Knopf) */
  initialCode?: string;
  onClose: () => void;
}

/** Eine Ebene des Kauf-Checks. Wie ein iOS-Navigationsstapel: „Zurück“ geht genau eine Ebene zurück. */
type Level =
  | { k: 'idle' }
  | { k: 'live'; ready: boolean }
  | { k: 'working'; step: string; p?: number }
  | { k: 'pick'; list: Product[]; barcode: string | null; learn: boolean; sure: boolean }
  | { k: 'none'; barcode: string | null; learn: boolean }
  | { k: 'result'; product: Product }
  | { k: 'error'; why?: 'nocam' | 'noreader' };

/** Zwischenstände: Sie werden ersetzt statt gestapelt – „Zurück“ landet nie in einer Ladeanzeige oder Fehlermeldung. */
const TRANSIENT = new Set<Level['k']>(['live', 'working', 'none', 'error']);

const fmt = (n: number) => new Intl.NumberFormat(NUM_LOCALE, { maximumFractionDigits: 0 }).format(n);
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Kauf-Check: Packung fotografieren, live scannen oder suchen → erkennen → bewerten (schon da? wie viel fürs Deck? Preis okay?).
 * Alle drei Wege enden im selben Ergebnis. Zurück (Knopf oben links oder vom linken Rand wischen) geht eine Ebene zurück,
 * „Neuer Check“ beginnt von vorn, nur „Schließen“ auf der Startseite verlässt den Kauf-Check.
 */
export function PhotoCheck({ db, state, update, meta, onClose, initialCode }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const underRef = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const { rates, barcodes: shipped, register } = useApp();
  const [stack, setStack] = useState<Level[]>(() => {
    const p = initialCode ? db.products.find((x) => x.code === initialCode) : undefined;
    if (!p) return [{ k: 'idle' }];
    const first = db.products.find((x) => x.kind === p.kind && groupKey(x) === groupKey(p)) ?? p;
    return [{ k: 'result', product: first }];
  });
  const level = stack[stack.length - 1]!;
  const under = stack.length > 1 ? stack[stack.length - 2]! : null;
  const [query, setQuery] = useState('');
  const [cur, setCur] = useState<ShopPrice['cur']>(() => Object.values(state.shopPrices)[0]?.cur ?? 'THB');
  const [msg, setMsg] = useState('');
  const [round, setRound] = useState(0);
  const run = useRef(0);
  /** Läuft gerade ein Zurück (Animation)? Weitere Tipps/Gesten warten – ein Doppeltipp geht nur eine Ebene zurück. */
  const leaving = useRef(false);
  /** Richtung des letzten Wechsels: vorwärts gleitet die neue Ebene von rechts herein (wie iOS) */
  const dir = useRef<'fwd' | 'none'>('none');
  const close = useModal(ref, onClose, { animate: true });
  // Mitgelieferte Barcodes, überschrieben von selbst zugeordneten
  const known = useMemo(() => ({ ...shipped, ...state.barcodes }), [shipped, state.barcodes]);

  const { opponents } = useMemo(() => metaOpponents(db, meta), [db, meta]);
  const cache = useMemo<ScoreCache>(() => new Map(), [db, opponents]);
  // Neu, sobald Sammlung, Gegner oder Kurse (laden asynchron) sich ändern – damit die Bewertung mitzieht.
  const rate = useCallback((p: Product | Product[], price: ShopPrice | null) => rateProduct(db, state.owned, opponents, p, price, rates, cache, meta ?? null), [db, state.owned, opponents, rates, cache, meta]);

  /** Vorwärts: neue Ebene oben drauf (ein Zwischenstand oben wird dabei ersetzt). */
  const go = (next: Level) => {
    dir.current = 'fwd';
    setMsg('');
    setStack((s) => [...(TRANSIENT.has(s[s.length - 1]!.k) ? s.slice(0, -1) : s), next]);
  };

  // Vertreter eines Kaufs: erstes Produkt des Sets/Random Boosters (gleicher Schlüssel für Preis und Wunschliste wie im Kaufberater)
  const head = (p: Product) => db.products.find((x) => x.kind === p.kind && groupKey(x) === groupKey(p)) ?? p;
  // Barcode merken, damit das nächste Foto/der Live-Scan die Packung sofort erkennt.
  const learn = (barcode: string, p: Product) => update((s) => ({ ...s, barcodes: { ...s.barcodes, [barcode]: p.code } }));

  /** Foto oder Kamerabild auswerten. `liveCode` = vom Live-Scan sicher gelesener Barcode. */
  const analyze = async (img: Blob, liveCode: string | null = null) => {
    const id = ++run.current;
    go({ k: 'working', step: tr('Suche Barcode …') });
    try {
      const res = await recognizePhoto(
        img,
        db,
        known,
        (step, p) => {
          if (run.current !== id) return;
          const text = step === 'barcode' ? tr('Suche Barcode …') : p !== undefined && p < 1 ? tr('Lade Texterkennung (nur beim ersten Mal) …') : tr('Lese die Packung …');
          setStack((s) => (s[s.length - 1]!.k === 'working' ? [...s.slice(0, -1), { k: 'working', step: text, p }] : s));
        },
        register,
      );
      if (run.current !== id) return;
      // Zuordnen (lernen) nur mit einem vom Barcode-Leser gelesenen Code – aus dem Text gelesene Ziffern dienen nur zum Nachschlagen.
      const barcode = liveCode ?? res.barcode;
      const learnable = !!liveCode || res.barcodeFrom === 'scan';
      if (!res.products.length) return go({ k: 'none', barcode, learn: learnable });
      // Mehrere Treffer aus demselben Set bzw. Random Booster sind ein Kauf → direkt als Ganzes bewerten.
      const first = res.products[0]!;
      const oneBuy = res.products.every((p) => p.kind === first.kind && groupKey(p) === groupKey(first));
      if (oneBuy && res.sure) {
        // Barcode nur bei eindeutigem Produktcode merken – ein Namens-Treffer soll keinen Barcode „festnageln“.
        if (barcode && learnable && res.via === 'code') learn(barcode, head(first));
        return go({ k: 'result', product: head(first) });
      }
      // Gleiche Käufe (z. B. drei Kreisel eines Sets) nur einmal anbieten
      const list = res.products.filter((p, i, a) => a.findIndex((q) => q.kind === p.kind && groupKey(q) === groupKey(p)) === i).map(head);
      go({ k: 'pick', list: list.slice(0, 12), barcode, learn: learnable, sure: res.sure });
    } catch {
      if (run.current === id) go({ k: 'error' });
    }
  };

  const onFile = (el: HTMLInputElement) => {
    const file = el.files?.[0];
    // Feld leeren, damit dasselbe Foto erneut gewählt werden kann
    el.value = '';
    if (file) void analyze(file);
  };

  // Live-Scan: dieselbe Kamera-Logik wie „Packung scannen“
  // Sofort (nicht erst nach dem nächsten Zeichnen) aus, sobald die Live-Ebene verlassen wird – sonst käme ein
  // während der Zurück-Animation gelesener Code noch als Ergebnis an.
  const liveOn = useRef(false);
  liveOn.current = level.k === 'live' && !leaving.current;
  useBarcodeCamera(video, level.k === 'live', round, {
    needFrame: (gtin) => !db.products.some((x) => x.code === known[gtin]),
    onReady: () => setStack((s) => (s[s.length - 1]!.k === 'live' ? [...s.slice(0, -1), { k: 'live', ready: true }] : s)),
    onCode: (gtin, frame) => {
      if (!liveOn.current) return;
      const p = db.products.find((x) => x.code === known[gtin]);
      if (p) return go({ k: 'result', product: head(p) });
      // Unbekannter Barcode: Packung auf demselben Bild per Texterkennung bestimmen
      if (frame) void analyze(frame, gtin);
      else go({ k: 'none', barcode: gtin, learn: true });
    },
    onFail: (why) => liveOn.current && go({ k: 'error', why }),
  });
  const startLive = () => {
    run.current++;
    setRound((r) => r + 1);
    go({ k: 'live', ready: false });
  };

  // Eingetippter Text: Produktcode („bx05“), ganzer Name in beliebiger Reihenfolge („Sword Dran“) oder Teil davon.
  // Ein Set oder Random Booster erscheint nur einmal.
  const textMatches = (q: string): Product[] => {
    const all = [...findByCode(q, db), ...findByName(q, db), ...searchProducts(db.products, q, db.blades)].filter((p) => p.kind !== 'stadium');
    return all
      .map(head)
      .filter((p, i, a) => a.findIndex((x) => x.code === p.code) === i)
      .slice(0, 10);
  };

  // Vom Nutzer bestätigt → Barcode darf gelernt werden
  const choose = (p: Product) => {
    if ((level.k === 'none' || level.k === 'pick') && level.barcode && level.learn) learn(level.barcode, head(p));
    go({ k: 'result', product: head(p) });
  };

  /** Neuer Check: zurück zur Startseite, alles leer */
  const reset = () => {
    run.current++;
    dir.current = 'none';
    setStack([{ k: 'idle' }]);
    setQuery('');
    setMsg('');
  };

  /** Eine Ebene zurück (bricht eine laufende Erkennung bzw. die Kamera ab). Auf der Startseite: schließen. */
  const pop = () => {
    run.current++;
    dir.current = 'none';
    setMsg('');
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  };
  const back = () => {
    if (leaving.current) return;
    if (stack.length <= 1) return close();
    leaving.current = true;
    liveOn.current = false;
    void slideBack(
      async () => {
        underRef.current?.classList.add('is-peek');
        await nextFrame();
        return pageRef.current ? { page: pageRef.current, under: underRef.current } : null;
      },
      () => {
        leaving.current = false;
        pop();
      },
    );
  };
  // Randgeste: nur mit einer Ebene darunter und nicht, solange die Kamera läuft
  const canSwipe = useRef(false);
  canSwipe.current = stack.length > 1 && level.k !== 'live' && !leaving.current;
  const popRef = useRef(pop);
  popRef.current = pop;
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    return attachEdgeBack(root, {
      canBack: () => canSwipe.current && !leaving.current,
      start: () => {
        if (!pageRef.current) return null;
        underRef.current?.classList.add('is-peek');
        return { page: pageRef.current, under: underRef.current };
      },
      back: () => {
        liveOn.current = false;
        popRef.current();
      },
      cancel: () => underRef.current?.classList.remove('is-peek'),
    });
  }, []);
  // Nach jedem Ebenenwechsel: untere Ebene wieder verstecken, nach oben scrollen
  useLayoutEffect(() => {
    // Mitten in einer Geste (z. B. Erkennung wird fertig) nicht dazwischenfunken
    if (ref.current?.classList.contains('edge-dragging')) return;
    underRef.current?.classList.remove('is-peek');
    ref.current?.scrollTo?.({ top: 0 });
  }, [stack.length, level.k]);

  const renderLevel = (l: Level) => {
    switch (l.k) {
      case 'idle':
        return (
          <>
            <div class="card glass stack-sm">
              <label class="shop-input">
                <span class="sr-only">{tr('Packung eintippen')}</span>
                <input
                  type="search"
                  value={query}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                  placeholder={tr('Code oder Name eintippen, z. B. BX-05')}
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellcheck={false}
                />
              </label>
              {query.trim().length >= 2 ? (
                <ProductList db={db} list={textMatches(query)} onPick={choose} />
              ) : (
                <p class="fineprint">{tr('Japanischer oder Hasbro-Name, Produktcode – du bekommst dieselbe Bewertung wie beim Foto.')}</p>
              )}
            </div>
            {!query.trim() && (
              <div class="card glass stack-sm photo-start">
                <span class="photo-icon" aria-hidden="true">
                  <Camera />
                </span>
                <p>
                  <strong>{tr('Packung fotografieren')}</strong>
                </p>
                <p class="muted">{tr('Am besten die Rückseite mit dem Barcode – oder die Vorderseite mit Code (z. B. „BX-05“) bzw. Namen, gerade und gut beleuchtet. Die Erkennung läuft auf deinem Handy.')}</p>
                <button type="button" class="btn btn-primary" onClick={() => camRef.current?.click()}>
                  {tr('Foto machen')}
                </button>
                <button type="button" class="btn" onClick={() => galRef.current?.click()}>
                  {tr('Aus der Galerie wählen')}
                </button>
                <button type="button" class="btn btn-ghost" onClick={startLive}>
                  <ScanBarcode aria-hidden="true" /> {tr('Barcode live scannen')}
                </button>
              </div>
            )}
          </>
        );
      case 'live':
        return (
          <div class="scan-cam" data-no-swipe>
            <video ref={video} playsInline muted aria-label={tr('Kamerabild')} />
            <span class="scan-frame" aria-hidden="true" />
            <p class="scan-hint" role="status">
              {l.ready ? tr('Barcode auf der Packungsrückseite in den Rahmen halten') : tr('Kamera wird gestartet …')}
            </p>
          </div>
        );
      case 'working':
        return (
          <div class="card glass stack-sm" role="status">
            <p>
              <strong>{l.step}</strong>
            </p>
            <div class="progress">
              <span style={{ width: `${Math.round((l.p ?? 0.15) * 100)}%` }} />
            </div>
          </div>
        );
      case 'pick':
        return (
          <div class="card glass stack-sm">
            <p>
              <strong>{l.sure ? tr('Mehrere Treffer – welche ist es?') : tr('Ist es eine dieser Packungen?')}</strong>
            </p>
            {l.barcode && <BarcodeNote code={l.barcode} learn={l.learn} />}
            <ProductList db={db} list={l.list} onPick={choose} />
          </div>
        );
      case 'none':
      case 'error':
        return (
          <div class="card glass stack-sm">
            <p>
              <strong>
                {l.k === 'error'
                  ? l.why === 'nocam'
                    ? tr('Keine Kamera verfügbar oder Zugriff abgelehnt.')
                    : l.why === 'noreader'
                      ? tr('Der Barcode-Leser konnte nicht geladen werden – bist du offline?')
                      : tr('Das Foto konnte nicht gelesen werden.')
                  : l.barcode
                    ? tr('Barcode gelesen – aber noch keinem Produkt zugeordnet.')
                    : tr('Keine Packung erkannt.')}
              </strong>
            </p>
            {l.k === 'none' && l.barcode ? (
              <BarcodeNote code={l.barcode} learn={l.learn} />
            ) : (
              <p class="muted">
                {l.k === 'error' && l.why === 'nocam'
                  ? tr('Kamera-Zugriff erlauben (Einstellungen → Safari → Kamera) oder ein Foto machen.')
                  : tr('Weder Barcode noch Produktnummer oder Name waren lesbar. Probier ein schärferes Foto der Rückseite mit dem Barcode.')}
              </p>
            )}
            <p class="muted">{tr('Oder tipp Code bzw. Namen ein:')}</p>
            <label class="shop-input">
              <span class="sr-only">{tr('Packung suchen')}</span>
              <input value={query} onInput={(e) => setQuery(e.currentTarget.value)} placeholder={tr('Name oder Code, z. B. BX-05')} />
            </label>
            {query.trim() && <ProductList db={db} list={textMatches(query)} onPick={choose} />}
          </div>
        );
      case 'result':
        return <Result db={db} state={state} update={update} product={l.product} rate={rate} cur={cur} setCur={setCur} msg={msg} setMsg={setMsg} />;
    }
  };

  const nested = stack.length > 1;
  return (
    <div ref={ref} class="live shop" role="dialog" aria-modal="true" aria-label={tr('Kauf-Check')} tabIndex={-1}>
      <div class="live-bar">
        {nested ? (
          <button type="button" class="btn btn-sm nav-back" onClick={back} aria-label={tr('Zurück')}>
            <ChevronLeft aria-hidden="true" />
            {tr('Zurück')}
          </button>
        ) : (
          <button type="button" class="btn btn-sm" onClick={close}>
            {tr('Schließen')}
          </button>
        )}
        <span class="live-title">{tr('Kauf-Check')}</span>
        {level.k !== 'idle' ? (
          <button type="button" class="btn btn-sm btn-primary" onClick={reset}>
            {tr('Neuer Check')}
          </button>
        ) : (
          <span class="btn-sm" aria-hidden="true" />
        )}
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.currentTarget)} />
      <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.currentTarget)} />

      <div class="shop-stack">
        {under && (
          <div ref={underRef} class="shop-body stack-sm kc-page kc-under" aria-hidden="true" inert key={`u${stack.length - 2}`}>
            {renderLevel(under)}
          </div>
        )}
        <div ref={pageRef} class={`shop-body stack-sm kc-page${dir.current === 'fwd' ? ' kc-in' : ''}`} key={`p${stack.length - 1}${level.k}`}>
          {renderLevel(level)}
        </div>
      </div>
    </div>
  );
}

/** Gelesener, aber noch unbekannter Barcode – sichtbar, damit klar ist: lesbar, nur nicht zugeordnet. */
function BarcodeNote({ code, learn }: { code: string; learn: boolean }) {
  return (
    <p class="muted barcode-note">
      {tr('Barcode')} <strong class="mono">{code}</strong> {learn ? tr('ist noch keinem Produkt zugeordnet. Wähl die Packung aus – danach erkennt die App ihn sofort.') : tr('(aus den Ziffern gelesen) ist noch keinem Produkt zugeordnet.')}
    </p>
  );
}

function ProductList({ db, list, onPick }: { db: Database; list: Product[]; onPick: (p: Product) => void }) {
  if (!list.length) return <p class="muted">{tr('Nichts gefunden.')}</p>;
  // Sets mit mehreren Kreiseln: alle Kreisel nennen, nicht nur den ersten
  const title = (p: Product) => {
    if (p.kind === 'random-booster' && groupKey(p) !== p.code) return tr('{0} Random Booster (Inhalt zufällig)', groupKey(p));
    if (p.kind !== 'set') return nb(displayProductName(p, db));
    const members = db.products.filter((x) => x.kind === 'set' && groupKey(x) === groupKey(p));
    if (members.length < 2) return nb(displayProductName(p, db));
    // Kreisel beim Namen nennen, lose Ratchets/Bits (Einträge ohne Blade) nur zählen
    const names = members.flatMap((x) => {
      const b = db.blades.find((bl) => bl.id === x.bladeId);
      return b ? [displayName(b)] : [];
    });
    const loose = contentLabel(members.filter((x) => !x.bladeId));
    return tr('{0} Set: {1}', groupKey(p), [...names, ...(loose ? [loose] : [])].join(' + '));
  };
  return (
    <ul class="list">
      {list.map((p) => (
        <li key={p.code}>
          <button type="button" class="row row-btn" onClick={() => onPick(p)}>
            {p.bladeId && <BeyImage bladeId={p.bladeId} type={db.blades.find((b) => b.id === p.bladeId)?.type ?? 'balance'} size="sm" alt="" zoomable={false} />}
            <span class="row-main">
              <span class="row-title">{title(p)}</span>
              <span class="row-sub">
                <span class={`region-tag ${p.region === 'hasbro' ? 'hasbro' : 'takara'}`}>{regionLabel(p)}</span> {p.code}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

interface ResultProps {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  product: Product;
  rate: (p: Product | Product[], price: ShopPrice | null) => Rating;
  cur: ShopPrice['cur'];
  setCur: (c: ShopPrice['cur']) => void;
  msg: string;
  setMsg: (m: string) => void;
}

function Result({ db, state, update, product, rate, cur, setCur, msg, setMsg }: ResultProps) {
  const { rates } = useApp();
  const isRandom = product.kind === 'random-booster';
  const group = useMemo(() => db.products.filter((p) => p.kind === product.kind && groupKey(p) === groupKey(product)), [db, product]);
  const price = state.shopPrices[product.code] ?? null;
  // Random Booster: jede mögliche Variante einzeln (Mittelwert). Set: alle Kreisel zusammen als ein Kauf.
  const ratings = useMemo(() => (isRandom ? group.map((p) => rate(p, price)) : [rate(group.length ? group : [product], price)]), [isRandom, group, product, price, rate]);
  const main = ratings[0]!;
  const avgGain = ratings.reduce((s, r) => s + r.gain, 0) / ratings.length;
  const best = ratings.reduce((a, b) => (b.gain > a.gain ? b : a), main);
  // Random Booster: Meta-Anteil im Schnitt über alle möglichen Inhalte
  const avgMeta = ratings.reduce((s, r) => s + (r.meta[0]?.share ?? 0), 0) / ratings.length;
  const metaHit = ratings.map((r) => r.meta[0]).filter((u) => !!u).sort((a, b) => b!.share - a!.share)[0];
  const overall = isRandom ? (group.every((p) => (state.owned[p.code] ?? 0) > 0) ? 'owned' : judgeWithMeta(avgGain, avgMeta, main.price)) : main.overall;
  const own = overall === 'owned';
  const blade = product.bladeId ? db.blades.find((b) => b.id === product.bladeId) : undefined;
  const sym = cur === 'THB' ? '฿' : '€';
  const ref = refPrice(product, rates);

  const setPrice = (v: ShopPrice | null) =>
    update((s) => {
      const shopPrices = { ...s.shopPrices };
      if (v) shopPrices[product.code] = v;
      else delete shopPrices[product.code];
      return { ...s, shopPrices };
    });

  return (
    <div class="stack-sm">
      <div class={`card glass photo-result o-${overall}`}>
        <div class="shop-top">
          {blade && <BeyImage bladeId={blade.id} type={blade.type} size="md" alt="" zoomable={false} />}
          <div class="row-main">
            <span class="eyebrow">{isRandom ? tr('{0} · Random Booster', groupKey(product)) : product.code}</span>
            <span class="row-title">
              {isRandom ? product.name.replace(/\s*\(.*?\)\s*$/, '') : group.length > 1 ? tr('{0} Set ({1})', groupKey(product), contentLabel(group)) : nb(displayProductName(product, db))}
            </span>
          </div>
        </div>
        <p class={`photo-verdict o-${overall}`}>{OVERALL_LABEL[overall]}</p>
        <ul class="photo-reasons">
          {isRandom ? (
            <>
              <li>
                {tr('Im Schnitt +')}{dec(avgGain)} {tr('Punkte für dein Deck, bester Treffer +')}{dec(best.gain)}.
              </li>
              {metaHit && (
                <li>
                  {tr('Bester Turnier-Treffer:')} {metaHit.name} ({pct(metaHit.share)} {tr('der Siegerdecks')}{metaHit.share >= META_TOP ? tr(', Top-Teil') : ''}).
                </li>
              )}
              <li>{tr('Welcher Kreisel drin ist, siehst du erst beim Öffnen.')}</li>
              {main.price && <li>{main.price.verdict === 'good' ? tr('Der Preis ist gut.') : main.price.verdict === 'ok' ? tr('Der Preis ist okay.') : tr('Der Preis ist hoch.')}</li>}
            </>
          ) : (
            main.reasons.map((r) => <li key={r}>{r}</li>)
          )}
        </ul>
        {!own && overall !== 'collect' && (
          <div class="rate-meters" aria-label={tr('Bewertung im Detail')}>
            <Meter label={tr('Turnier')} value={Math.min(1, (isRandom ? avgMeta : (main.meta[0]?.share ?? 0)) / 0.3)} text={main.meta[0] || isRandom ? pct(isRandom ? avgMeta : (main.meta[0]?.share ?? 0)) : '–'} />
            <Meter label={tr('Dein Deck')} value={Math.min(1, (isRandom ? avgGain : main.gain) / 10)} text={`+${dec(isRandom ? avgGain : main.gain)}`} />
            <Meter label={tr('Neue Teile')} value={Math.min(1, main.fresh / 3)} text={String(main.fresh)} />
          </div>
        )}
        {!isRandom && main.gain >= 2 && main.deck.length > 0 && (
          <p class="fineprint">
            {tr('Dein bestes Deck danach:')} {main.deck.map((c) => nb(`${db.blades.find((b) => b.id === c.combo.bladeId)?.name ?? c.combo.bladeId} ${c.combo.ratchetId ?? ''}${c.combo.bitId}`)).join(' · ')}
          </p>
        )}
      </div>

      {!own && (
        <div class="card stack-sm">
          <div class="shop-price">
            <PriceInput value={price} cur={cur} label={tr('Preis im Laden in {0}', cur === 'THB' ? 'Baht' : 'Euro')} onCommit={setPrice} />
            <div class="segmented seg-2 cur-switch" role="group" aria-label={tr('Währung')}>
              <button type="button" class={cur === 'THB' ? 'on' : ''} aria-pressed={cur === 'THB'} onClick={() => setCur('THB')}>
                ฿
              </button>
              <button type="button" class={cur === 'EUR' ? 'on' : ''} aria-pressed={cur === 'EUR'} onClick={() => setCur('EUR')}>
                €
              </button>
            </div>
          </div>
          <p class="muted">
            {tr('Vergleichspreis:')}{' '}
            {ref
              ? `${ref.label} ≈ ${fmt(cur === 'THB' ? ref.thb : ref.eur)} ${sym}`
              : product.priceJpy
                ? `Japan ${yen(product.priceJpy)}`
                : product.priceUsd
                  ? tr('USA ${0}', dec(product.priceUsd, 2))
                  : tr('unbekannt')}
            {product.kind === 'set' && tr(' (ganzes Set)')}
            {main.price && (
              <span class={`verdict-inline v-${main.price.verdict}`}>
                {' '}
                · {VERDICT_LABEL[main.price.verdict]} ({main.price.ratio < 1 ? '−' : '+'}
                {Math.round(Math.abs(main.price.ratio - 1) * 100)} %)
              </span>
            )}
          </p>
        </div>
      )}

      {isRandom && (
        <details class="card">
          <summary>{tr('Gekauft und geöffnet? Kreisel auswählen')}</summary>
          <ProductList
            db={db}
            list={group}
            onPick={(p) => {
              update((s) => ({ ...s, owned: { ...s.owned, [p.code]: (s.owned[p.code] ?? 0) + 1 }, wishlist: s.wishlist.filter((c) => !group.some((g) => g.code === c)) }));
              setMsg(tr('{0} ist jetzt in deiner Sammlung.', p.code));
            }}
          />
        </details>
      )}
      <div class="btn-row">
        {!isRandom && (
          <button
            type="button"
            class={own ? 'btn' : 'btn btn-primary'}
            onClick={() => {
              // Set = alle Kreisel des Sets. Random Booster: welcher drin war, trägst du nach dem Öffnen in der Sammlung ein.
              const codes = purchaseCodes(db.products, product);
              update((s) => ({
                ...s,
                owned: { ...s.owned, ...Object.fromEntries(codes.map((c) => [c, (s.owned[c] ?? 0) + 1])) },
                wishlist: s.wishlist.filter((c) => !codes.includes(c)),
              }));
              setMsg(codes.length > 1 ? tr('Alle {0} Kreisel des Sets sind jetzt in deiner Sammlung.', codes.length) : tr('{0} ist jetzt in deiner Sammlung.', product.code));
            }}
          >
            {own ? tr('Noch eins dazu') : tr('Gekauft – in die Sammlung')}
          </button>
        )}
        {!state.wishlist.includes(product.code) && (main.owned ?? 0) === 0 && (
          <button
            type="button"
            class="btn"
            onClick={() => {
              update((s) => ({ ...s, wishlist: s.wishlist.includes(product.code) ? s.wishlist : [...s.wishlist, product.code] }));
              setMsg(tr('{0} steht auf deiner Wunschliste.', product.code));
            }}
          >
            <Heart aria-hidden="true" /> {tr('Merken')}
          </button>
        )}
      </div>
      {msg && (
        <p class="muted" role="status">
          {msg}
        </p>
      )}
      <p class="fineprint">{tr('Punkte = wie viel stärker dein bestes 3er-Deck gegen die aktuellen Turnier-Kombos wird. Richtwert, kein Messwert.')}</p>
    </div>
  );
}

/** Ein Balken der Detail-Bewertung (0 … 1). */
function Meter({ label, value, text }: { label: string; value: number; text: string }) {
  return (
    <div class="rate-meter">
      <span class="rate-meter-label">{label}</span>
      <span class="rate-meter-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(Math.max(0.04, value) * 100)}%` }} />
      </span>
      <span class="rate-meter-val">{text}</span>
    </div>
  );
}
