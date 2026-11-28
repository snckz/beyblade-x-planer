import { tr } from '../lib/i18n';
import { createPortal } from 'preact/compat';
import { useModal } from '../lib/useModal';
import { displayProductName } from '../lib/names';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Database, Product } from '../lib/types';
import type { UserState } from '../lib/storage';
import { cameraGranted, useBarcodeCamera } from '../lib/barcodeCamera';
import { contentLabel, ownedParts, purchaseProducts, searchProducts } from '../lib/data';
import { useApp } from '../lib/context';
import { priceHint } from '../lib/price';
import { BeyImage } from './BeyImage';
import { recognizePhoto } from '../lib/photo';
import { groupKey } from '../lib/price';
import { Camera, Check, Heart, X } from 'lucide-preact';
import { isStoreCode } from '../lib/barcode';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  onClose: () => void;
}

type Phase = 'choose' | 'starting' | 'scanning' | 'reading' | 'nocam' | 'noreader' | 'unknown' | 'found' | 'done';

/**
 * Scan-Modus: Barcode der Packung mit der Kamera lesen.
 * Ein Barcode, der noch unbekannt ist, wird einmal einem Produkt zugeordnet und danach wiedererkannt – am schnellsten
 * mit einem Foto der Vorderseite (dort steht die Produktnummer), sonst über die Suche.
 * Random Booster: Der Barcode steht für die Packung. Welcher Kreisel drin war, fragt die App danach.
 * Ohne Kamera (oder abgelehnt) bleibt die Produktsuche.
 */
function ScannerInner({ db, state, update, onClose }: Props) {
  const { rates, barcodes: shipped, register } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [phase, setPhase] = useState<Phase>('choose');
  const [live, setLive] = useState(false);
  const [candidates, setCandidates] = useState<Product[]>([]);
  const [readStep, setReadStep] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const run = useRef(0);
  const [code, setCode] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  // Random Booster: Steht schon fest, welcher Kreisel in der Packung war? (sonst erst fragen)
  const [opened, setOpened] = useState(false);
  // Barcode, der beim Foto der Vorderseite erhalten bleibt und danach zugeordnet wird
  const keep = useRef<string | null>(null);
  const [frontTried, setFrontTried] = useState(false);
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');
  const [round, setRound] = useState(0);
  // Bekannte Barcodes: mitgelieferte Liste, überschrieben von dem, was man selbst zugeordnet hat
  const known = useMemo(() => ({ ...shipped, ...state.barcodes }), [shipped, state.barcodes]);
  const barcodes = useRef(known);
  barcodes.current = known;

  // Dialog-Grundverhalten: Fokus, Escape, Hintergrund nicht scrollen.
  const close = useModal(ref, () => closeRef.current(), { animate: true });

  // Live-Kamera sofort starten, wenn der Zugriff schon erlaubt ist.
  useEffect(() => {
    let off = false;
    void cameraGranted().then((ok) => !off && ok && startLive());
    return () => {
      off = true;
      run.current++;
    };
  }, []);

  // Vertreter eines Kaufs (erstes Produkt eines Sets/Random Boosters)
  const head = (p: Product) => db.products.find((x) => x.kind === p.kind && groupKey(x) === groupKey(p)) ?? p;
  /** Mögliche Inhalte eines Random Boosters (sonst nur das Produkt selbst) */
  const contents = (p: Product) => (p.kind === 'random-booster' ? db.products.filter((x) => x.kind === 'random-booster' && groupKey(x) === groupKey(p)) : [p]);
  /** Gefundenes Produkt zeigen. `chosen`: Bei einem Random Booster steht der Kreisel schon fest (selbst ausgewählt). */
  const show = (p: Product, chosen = false) => {
    setProduct(chosen || p.kind !== 'random-booster' ? p : head(p));
    setOpened(chosen);
    setPhase('found');
    setMsg('');
  };
  /** Barcode merken – für die Packung, nicht für einen einzelnen Inhalt. Etiketten des Ladens nicht. */
  const learn = (gtin: string, p: Product) => {
    if (!isStoreCode(gtin)) update((s) => ({ ...s, barcodes: { ...s.barcodes, [gtin]: (p.kind === 'random-booster' ? head(p) : p).code } }));
  };

  /** Packung auf einem Foto/Kamerabild erkennen: Barcode, sonst Produktcode oder Blade-Name per Texterkennung. */
  const identify = async (img: Blob, liveCode: string | null) => {
    const id = ++run.current;
    setPhase('reading');
    setReadStep(tr('Suche Barcode …'));
    try {
      const res = await recognizePhoto(
        img,
        db,
        barcodes.current,
        (step, p) => {
          if (run.current === id) setReadStep(step === 'barcode' ? tr('Suche Barcode …') : p !== undefined && p < 1 ? tr('Lade Texterkennung (nur beim ersten Mal) …') : tr('Lese die Packung …'));
        },
        register,
      );
      if (run.current !== id) return;
      // Nur einen vom Barcode-Leser gelesenen Code zuordnen – aus dem Text gelesene Ziffern dienen nur zum Nachschlagen.
      const gtin = liveCode ?? (res.barcodeFrom === 'scan' ? res.barcode : null);
      setCode(gtin);
      const list = res.products.map(head).filter((p, i, a) => a.findIndex((x) => x.code === p.code) === i);
      // Eindeutig über Barcode oder Produktcode → direkt übernehmen und Barcode merken.
      if (list.length === 1 && (res.via === 'barcode' || res.via === 'code')) {
        const p = list[0]!;
        if (gtin && res.via === 'code') learn(gtin, p);
        show(p);
        return;
      }
      setFrontTried(!!liveCode && !list.length);
      setCandidates(list.slice(0, 8));
      setPhase('unknown');
    } catch {
      if (run.current === id) {
        setCandidates([]);
        setPhase('unknown');
      }
    }
  };

  const onFile = (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    const kept = keep.current;
    keep.current = null;
    if (file) void identify(file, kept);
  };
  /** Foto aufnehmen. `gtin`: schon gelesener, noch unbekannter Barcode – er wird dem erkannten Produkt zugeordnet. */
  const takePhoto = (gtin: string | null) => {
    keep.current = gtin;
    fileRef.current?.click();
  };

  const startLive = () => {
    setLive(true);
    setPhase('starting');
    setRound((r) => r + 1);
  };

  // Kamera + Erkennung. Läuft pro „round“ neu (nach „Nächste Packung“), nur im Live-Modus.
  useBarcodeCamera(video, live && (phase === 'starting' || phase === 'scanning'), round, {
    onReady: () => setPhase('scanning'),
    needFrame: (gtin) => !db.products.some((p) => p.code === barcodes.current[gtin]),
    onCode: (gtin, frame) => {
      setCode(gtin);
      const known = db.products.find((p) => p.code === barcodes.current[gtin]);
      if (known) return show(known);
      setFrontTried(false);
      // Unbekannter Barcode: Packung auf demselben Bild per Texterkennung bestimmen.
      if (frame) void identify(frame, gtin);
      else setPhase('unknown');
    },
    onFail: (why) => setPhase(why),
  });

  /** Selbst ausgewählt: Barcode zuordnen. `chosen`: Es wurde ein bestimmter Kreisel gewählt (Suche), nicht nur die Packung. */
  const assign = (p: Product, chosen: boolean) => {
    if (code) learn(code, p);
    show(p, chosen);
  };
  const addOwned = (p: Product) => {
    // Sets: alle Kreisel und losen Teile der Packung eintragen, nicht nur den ersten
    const items = purchaseProducts(db.products, p);
    const codes = items.map((x) => x.code);
    update((s) => {
      const owned = { ...s.owned };
      for (const c of codes) owned[c] = (owned[c] ?? 0) + 1;
      return { ...s, owned, wishlist: s.wishlist.filter((c) => !codes.includes(c)) };
    });
    setMsg(codes.length > 1 ? tr('{0} aus {1} sind jetzt in deiner Sammlung.', contentLabel(items), groupKey(p)) : tr('{0} ist jetzt in deiner Sammlung ({1}×).', p.code, (state.owned[p.code] ?? 0) + 1));
    setPhase('done');
  };
  const addWish = (p: Product) => {
    update((s) => ({ ...s, wishlist: s.wishlist.includes(p.code) ? s.wishlist : [...s.wishlist, p.code] }));
    setMsg(tr('{0} steht auf deiner Wunschliste.', p.code));
    setPhase('done');
  };
  const forget = () => {
    if (code) update((s) => ({ ...s, barcodes: Object.fromEntries(Object.entries(s.barcodes).filter(([k]) => k !== code)) }));
    setProduct(null);
    setOpened(false);
    setFrontTried(false);
    setCandidates([]);
    setPhase('unknown');
  };
  const again = () => {
    run.current++;
    setCode(null);
    setProduct(null);
    setOpened(false);
    setFrontTried(false);
    setCandidates([]);
    setMsg('');
    setQuery('');
    if (live) {
      setPhase('starting');
      setRound((r) => r + 1);
    } else setPhase('choose');
  };

  const camera = phase === 'starting' || phase === 'scanning';
  const pick = phase === 'unknown' || phase === 'nocam' || phase === 'noreader';
  // Lose Teile aus Sets (Einträge ohne Blade) nicht einzeln anbieten – die Packung findet man über ihre Kreisel
  const results =
    pick || (phase === 'choose' && query.trim())
      ? searchProducts(db.products, query, db.blades)
          .filter((p) => p.bladeId || p.kind !== 'set')
          .slice(0, 30)
      : [];
  const blade = product && db.blades.find((b) => b.id === product.bladeId);
  // Random Booster mit mehreren möglichen Inhalten: erst fragen, welcher Kreisel drin ist
  const choices = product && !opened ? contents(product) : [];
  const askContent = choices.length > 1;
  const storeLabel = !!code && isStoreCode(code);

  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={ref} class="sheet glass scan-sheet" role="dialog" aria-modal="true" aria-label={tr('Packung scannen')} tabIndex={-1}>
        <div class="sheet-grab" aria-hidden="true" />
        <div class="win-head">
          <h2 class="win-title">{tr('Packung scannen')}</h2>
          <button type="button" class="icon-btn win-close" onClick={close} aria-label={tr('Schließen')}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div class="win-scroll">

          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.currentTarget.files?.[0])} />

          {phase === 'choose' && (
            <div class="scan-body">
              <button type="button" class="scan-choice primary" onClick={() => takePhoto(null)}>
                <span class="scan-choice-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                </span>
                <span>
                  <strong>{tr('Packung fotografieren')}</strong>
                  <small>{tr('Rückseite mit Barcode und Produktnummer – ohne Kamera-Freigabe')}</small>
                </span>
              </button>
              <button type="button" class="scan-choice" onClick={startLive}>
                <span class="scan-choice-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 8v8M10 8v8M13 8v8M16 8v8" />
                  </svg>
                </span>
                <span>
                  <strong>{tr('Live scannen')}</strong>
                  <small>{tr('Für viele Packungen hintereinander')}</small>
                </span>
              </button>
            </div>
          )}

          {phase === 'reading' && (
            <div class="scan-body scan-reading" role="status">
              <span class="spinner" aria-hidden="true" />
              <p class="muted">{readStep}</p>
            </div>
          )}

          {camera && (
            <div class="scan-cam">
              <video ref={video} playsInline muted aria-label={tr('Kamerabild')} />
              <span class="scan-frame" aria-hidden="true" />
              <p class="scan-hint" role="status">
                {phase === 'starting' ? tr('Kamera wird gestartet …') : tr('Barcode auf der Packungsrückseite in den Rahmen halten')}
              </p>
            </div>
          )}

          <div class="scan-body">
            {phase === 'nocam' && (
              <p class="muted">
                {tr('Keine Kamera verfügbar oder Zugriff abgelehnt (Einstellungen → Safari → Kamera). Du kannst das Produkt auch hier suchen.')}{' '}
                <button type="button" class="btn btn-ghost btn-sm" onClick={again}>
                  {tr('Erneut versuchen')}
                </button>
              </p>
            )}
            {phase === 'noreader' && (
              <p class="muted">
                {tr('Der Barcode-Leser konnte nicht geladen werden – bist du offline? Du kannst das Produkt auch hier suchen.')}{' '}
                <button type="button" class="btn btn-ghost btn-sm" onClick={again}>
                  {tr('Erneut versuchen')}
                </button>
              </p>
            )}
            {phase === 'unknown' && (
              <p class="muted">
                {candidates.length
                  ? tr('Welche Packung ist es?')
                  : storeLabel
                    ? <>{tr('Die Nummer')} <strong class="mono">{code}</strong> {tr('ist ein Etikett des Ladens, kein Barcode des Herstellers. Scann den aufgedruckten Barcode auf der Packung – oder such das Produkt hier.')}</>
                    : code
                      ? <>{tr('Barcode')} <strong class="mono">{code}</strong> {tr('kenne ich noch nicht. Welches Produkt ist das? Danach erkennt die App ihn sofort wieder.')}</>
                      : tr('Ich konnte die Packung nicht sicher erkennen. Tipp: Rückseite mit Produktnummer (z. B. G4568 oder BX-05) scharf fotografieren – oder hier suchen.')}
              </p>
            )}
            {phase === 'unknown' && code && !storeLabel && !candidates.length && (
              <div class="scan-front">
                <button type="button" class="btn" onClick={() => takePhoto(code)}>
                  <Camera aria-hidden="true" /> {tr('Vorderseite fotografieren')}
                </button>
                <p class="fineprint">
                  {frontTried
                    ? tr('Auf dem Foto war keine Produktnummer lesbar. Probier es näher und gerade – oder such das Produkt unten.')
                    : tr('Vorne steht die Produktnummer (z. B. BX-05). Die App liest sie und merkt sich den Barcode dazu.')}
                </p>
              </div>
            )}
            {phase === 'unknown' && candidates.length > 0 && (
              <ul class="list scan-results">
                {candidates.map((p) => (
                  <li key={p.code}>
                    <ProductRow db={db} product={p} onClick={() => assign(p, false)} />
                  </li>
                ))}
              </ul>
            )}

            {(pick || phase === 'choose') && (
              <>
                <input type="search" placeholder={tr('Name oder Code, z. B. BX-24 …')} value={query} onInput={(e) => setQuery(e.currentTarget.value)} aria-label={tr('Produkt suchen')} />
                <ul class="list scan-results">
                  {results.map((p) => (
                    <li key={p.code}>
                      <ProductRow db={db} product={p} onClick={() => assign(p, true)} />
                    </li>
                  ))}
                </ul>
              </>
            )}

            {phase === 'found' && product && askContent && (
              <div class="scan-found scan-random">
                <div>
                  <p class="eyebrow">{tr('{0} · Random Booster', groupKey(product))}</p>
                  <p class="row-title">{tr('Welcher Kreisel ist drin?')}</p>
                  <p class="muted">{tr('Der Inhalt ist zufällig – die Packung verrät ihn nicht. Zum Eintragen den Kreisel wählen.')}</p>
                </div>
                <ul class="list scan-results">
                  {choices.map((p) => (
                    <li key={p.code}>
                      <ProductRow db={db} product={p} note={(state.owned[p.code] ?? 0) > 0 ? tr('hast du schon') : undefined} onClick={() => show(p, true)} />
                    </li>
                  ))}
                </ul>
                {code && (
                  <button type="button" class="btn btn-ghost btn-sm" onClick={forget}>
                    {tr('Falsches Produkt? Neu zuordnen')}
                  </button>
                )}
              </div>
            )}

            {phase === 'found' && product && !askContent && (
              <div class="scan-found">
                {blade && <BeyImage bladeId={blade.id} type={blade.type} size="lg" alt={blade.name} />}
                <div>
                  <p class="eyebrow">{product.code}</p>
                  <p class="row-title">{displayProductName(product, db)}</p>
                  {priceHint(product, rates) && <p class="muted">{priceHint(product, rates)}</p>}
                  {product.kind === 'random-booster' && !opened && <p class="muted">{tr('Random Booster: Der Inhalt ist zufällig. Erfasst ist bisher nur dieser Kreisel.')}</p>}
                  <OwnStatus db={db} state={state} product={product} />
                </div>
                <div class="btn-row">
                  <button type="button" class="btn btn-primary" onClick={() => addOwned(product)}>
                    {tr('In die Sammlung')}
                  </button>
                  <button type="button" class="btn" onClick={() => addWish(product)}>
                    {tr('Auf Wunschliste')}
                  </button>
                </div>
                {code && (
                  <button type="button" class="btn btn-ghost btn-sm" onClick={forget}>
                    {tr('Falsches Produkt? Neu zuordnen')}
                  </button>
                )}
              </div>
            )}

            {phase === 'done' && (
              <div class="scan-found">
                <p role="status">{msg}</p>
                <div class="btn-row">
                  <button type="button" class="btn btn-primary" onClick={again}>
                    {tr('Nächste Packung')}
                  </button>
                  <button type="button" class="btn" onClick={onClose}>
                    {tr('Fertig')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Produkt in einer Trefferliste: Blade-Bild statt Materialnummer. */
function ProductRow({ db, product, note, onClick }: { db: Database; product: Product; note?: string; onClick: () => void }) {
  const blade = product.bladeId ? db.blades.find((b) => b.id === product.bladeId) : undefined;
  return (
    <button type="button" class="row row-btn" onClick={onClick}>
      {blade ? <BeyImage bladeId={blade.id} type={blade.type} size="sm" alt="" zoomable={false} /> : <span class="code">{product.code}</span>}
      <span class="row-main">
        <span class="row-title">{displayProductName(product, db)}</span>
        <span class="row-sub">
          {product.code}
          {note && ` · ${note}`}
        </span>
      </span>
    </button>
  );
}

/** Im Laden das Wichtigste auf einen Blick: schon da? auf der Wunschliste? bringt es neue Teile? */
function OwnStatus({ db, state, product }: { db: Database; state: UserState; product: Product }) {
  const n = state.owned[product.code] ?? 0;
  if (n > 0) return <p class="scan-status have"><Check aria-hidden="true" /> {tr('Hast du schon (')}{n}×)</p>;
  const parts = ownedParts(db, state.owned);
  // Sets zählen als ganze Packung: jedes neue Teil einmal, auch wenn es mehrfach drin ist
  const items = purchaseProducts(db.products, product);
  const fresh =
    new Set(items.map((x) => x.bladeId).filter((id) => id && !parts.blades.has(id))).size +
    new Set(items.map((x) => x.ratchetId).filter((id) => id && !parts.ratchets.has(id))).size +
    new Set(items.map((x) => x.bitId).filter((id) => id && !parts.bits.has(id))).size;
  return (
    <>
      {state.wishlist.includes(product.code) && <p class="scan-status wish"><Heart aria-hidden="true" fill="currentColor" /> {tr('Steht auf deiner Wunschliste')}</p>}
      {product.bladeId && (fresh ? <p class="scan-status new">{fresh === 1 ? tr('1 neues Teil') : tr('{0} neue Teile', fresh)} {tr('für deine Sammlung')}</p> : <p class="scan-status have">{tr('Alle Teile hast du schon aus anderen Packungen')}</p>)}
    </>
  );
}

/**
 * Vollbild-Fenster direkt in <body> zeichnen: So bleibt es auch dann bildschirmfüllend, wenn ein
 * Elternelement (z. B. eine Karte mit Einblend-Animation) für position: fixed als Bezugsrahmen dient –
 * Safari auf dem iPhone macht das bei animierten Elementen.
 */
export function Scanner(props: Parameters<typeof ScannerInner>[0]) {
  return createPortal(<ScannerInner {...props} />, document.body);
}
