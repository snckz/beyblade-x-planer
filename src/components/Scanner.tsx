import { useModal } from '../lib/useModal';
import { displayProductName } from '../lib/names';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Database, Product } from '../lib/types';
import type { UserState } from '../lib/storage';
import { createDetector, normalizeGtin, validGtin } from '../lib/barcode';
import { ownedParts, purchaseCodes, searchProducts } from '../lib/data';
import { useApp } from '../lib/context';
import { priceHint } from '../lib/price';
import { BeyImage } from './BeyImage';
import { recognizePhoto } from '../lib/photo';
import { groupKey } from '../lib/price';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  onClose: () => void;
}

type Phase = 'choose' | 'starting' | 'scanning' | 'reading' | 'nocam' | 'noreader' | 'unknown' | 'found' | 'done';

/** Kamera schon freigegeben? Dann direkt live scannen, sonst erst fragen (iPhone fragt sonst bei jedem App-Start). */
async function cameraGranted(): Promise<boolean> {
  try {
    const st = await navigator.permissions?.query({ name: 'camera' as PermissionName });
    return st?.state === 'granted';
  } catch {
    return false;
  }
}

/** Aktuelles Kamerabild als JPEG – für die Texterkennung, wenn der Barcode noch unbekannt ist. */
function grabFrame(v: HTMLVideoElement): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  if (!c.width || !c.height) return Promise.resolve(null);
  c.getContext('2d')!.drawImage(v, 0, 0);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
}

/**
 * Scan-Modus: Barcode der Packung mit der Kamera lesen.
 * Ein Barcode, der noch unbekannt ist, wird einmal einem Produkt zugeordnet und danach wiedererkannt.
 * Ohne Kamera (oder abgelehnt) bleibt die Produktsuche.
 */
export function Scanner({ db, state, update, onClose }: Props) {
  const { rates } = useApp();
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
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');
  const [round, setRound] = useState(0);
  const barcodes = useRef(state.barcodes);
  barcodes.current = state.barcodes;

  // Dialog-Grundverhalten: Fokus, Escape, Hintergrund nicht scrollen.
  useModal(ref, () => closeRef.current());

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

  /** Packung auf einem Foto/Kamerabild erkennen: Barcode, sonst Produktcode oder Blade-Name per Texterkennung. */
  const identify = async (img: Blob, liveCode: string | null) => {
    const id = ++run.current;
    setPhase('reading');
    setReadStep('Suche Barcode …');
    try {
      const res = await recognizePhoto(img, db, barcodes.current, (step, p) => {
        if (run.current === id) setReadStep(step === 'barcode' ? 'Suche Barcode …' : p !== undefined && p < 1 ? 'Lade Texterkennung (nur beim ersten Mal) …' : 'Lese die Packung …');
      });
      if (run.current !== id) return;
      const gtin = liveCode ?? res.barcode;
      setCode(gtin);
      const list = res.products.map(head).filter((p, i, a) => a.findIndex((x) => x.code === p.code) === i);
      // Eindeutig über Barcode oder Produktcode → direkt übernehmen und Barcode merken.
      if (list.length === 1 && (res.via === 'barcode' || res.via === 'code')) {
        const p = list[0]!;
        if (gtin && res.via === 'code') update((s) => ({ ...s, barcodes: { ...s.barcodes, [gtin]: p.code } }));
        setProduct(p);
        setPhase('found');
        return;
      }
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
    if (file) void identify(file, null);
  };

  const startLive = () => {
    setLive(true);
    setPhase('starting');
    setRound((r) => r + 1);
  };

  // Kamera + Erkennung. Läuft pro „round“ neu (nach „Nächste Packung“), nur im Live-Modus.
  useEffect(() => {
    if (!live) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    let last = '';
    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocam');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      if (stopped) return stop();
      const v = video.current!;
      v.srcObject = stream;
      await v.play();
      let detector;
      try {
        detector = await createDetector();
      } catch {
        throw new Error('noreader');
      }
      if (stopped) return;
      setPhase('scanning');
      const tick = async () => {
        if (stopped) return;
        try {
          if (v.readyState >= 2) {
            const found = (await detector.detect(v)).map((r) => r.rawValue.trim()).find(validGtin);
            if (found) {
              // Erst übernehmen, wenn derselbe Code zweimal hintereinander gelesen wurde.
              if (found === last) {
                const gtin = normalizeGtin(found);
                navigator.vibrate?.(60);
                const known = db.products.find((p) => p.code === barcodes.current[gtin]);
                if (known) {
                  stop();
                  setCode(gtin);
                  setProduct(known);
                  setPhase('found');
                  return;
                }
                // Unbekannter Barcode: Packung auf demselben Bild per Texterkennung bestimmen.
                const frame = await grabFrame(v);
                stop();
                setCode(gtin);
                if (frame) void identify(frame, gtin);
                else setPhase('unknown');
                return;
              }
              last = found;
            }
          }
        } catch {
          /* einzelner Fehlversuch, weiter scannen */
        }
        timer = window.setTimeout(tick, 180);
      };
      void tick();
    })().catch((err: unknown) => {
      if (stopped) return;
      stop();
      setPhase(err instanceof Error && err.message === 'noreader' ? 'noreader' : 'nocam');
    });
    return stop;
  }, [round, db, live]);

  const assign = (p: Product) => {
    if (code) update((s) => ({ ...s, barcodes: { ...s.barcodes, [code]: p.code } }));
    setProduct(p);
    setPhase('found');
    setMsg('');
  };
  const addOwned = (p: Product) => {
    // Sets: alle Kreisel der Packung eintragen, nicht nur den ersten
    const codes = purchaseCodes(db.products, p);
    update((s) => {
      const owned = { ...s.owned };
      for (const c of codes) owned[c] = (owned[c] ?? 0) + 1;
      return { ...s, owned, wishlist: s.wishlist.filter((c) => !codes.includes(c)) };
    });
    setMsg(codes.length > 1 ? `${codes.length} Kreisel aus ${p.code} sind jetzt in deiner Sammlung.` : `${p.code} ist jetzt in deiner Sammlung (${(state.owned[p.code] ?? 0) + 1}×).`);
    setPhase('done');
  };
  const addWish = (p: Product) => {
    update((s) => ({ ...s, wishlist: s.wishlist.includes(p.code) ? s.wishlist : [...s.wishlist, p.code] }));
    setMsg(`${p.code} steht auf deiner Wunschliste.`);
    setPhase('done');
  };
  const forget = () => {
    if (code) update((s) => ({ ...s, barcodes: Object.fromEntries(Object.entries(s.barcodes).filter(([k]) => k !== code)) }));
    setProduct(null);
    setPhase('unknown');
  };
  const again = () => {
    run.current++;
    setCode(null);
    setProduct(null);
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
  const results = pick || (phase === 'choose' && query.trim()) ? searchProducts(db.products, query, db.blades).slice(0, 30) : [];
  const blade = product && db.blades.find((b) => b.id === product.bladeId);

  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} class="sheet glass scan-sheet" role="dialog" aria-modal="true" aria-label="Packung scannen" tabIndex={-1}>
        <div class="sheet-grab" aria-hidden="true" />
        <div class="picker-head">
          <h2 class="sheet-title">Packung scannen</h2>
          <button type="button" class="icon-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>

        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.currentTarget.files?.[0])} />

        {phase === 'choose' && (
          <div class="scan-body">
            <button type="button" class="scan-choice primary" onClick={() => fileRef.current?.click()}>
              <span class="scan-choice-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              </span>
              <span>
                <strong>Packung fotografieren</strong>
                <small>Rückseite mit Barcode und Produktnummer – ohne Kamera-Freigabe</small>
              </span>
            </button>
            <button type="button" class="scan-choice" onClick={startLive}>
              <span class="scan-choice-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 8v8M10 8v8M13 8v8M16 8v8" />
                </svg>
              </span>
              <span>
                <strong>Live scannen</strong>
                <small>Für viele Packungen hintereinander</small>
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
            <video ref={video} playsInline muted aria-label="Kamerabild" />
            <span class="scan-frame" aria-hidden="true" />
            <p class="scan-hint" role="status">
              {phase === 'starting' ? 'Kamera wird gestartet …' : 'Barcode auf der Packungsrückseite in den Rahmen halten'}
            </p>
          </div>
        )}

        <div class="scan-body">
          {phase === 'nocam' && (
            <p class="muted">
              Keine Kamera verfügbar oder Zugriff abgelehnt (Einstellungen → Safari → Kamera). Du kannst das Produkt auch hier suchen.{' '}
              <button type="button" class="btn btn-ghost btn-sm" onClick={again}>
                Erneut versuchen
              </button>
            </p>
          )}
          {phase === 'noreader' && (
            <p class="muted">
              Der Barcode-Leser konnte nicht geladen werden – bist du offline? Du kannst das Produkt auch hier suchen.{' '}
              <button type="button" class="btn btn-ghost btn-sm" onClick={again}>
                Erneut versuchen
              </button>
            </p>
          )}
          {phase === 'unknown' && (
            <p class="muted">
              {candidates.length
                ? 'Welche Packung ist es?'
                : code
                  ? <>Barcode <strong class="mono">{code}</strong> kenne ich noch nicht. Welches Produkt ist das? Danach erkennt die App ihn sofort wieder.</>
                  : 'Ich konnte die Packung nicht sicher erkennen. Tipp: Rückseite mit Produktnummer (z. B. G4568 oder BX-05) scharf fotografieren – oder hier suchen.'}
            </p>
          )}
          {phase === 'unknown' && candidates.length > 0 && (
            <ul class="list scan-results">
              {candidates.map((p) => (
                <li key={p.code}>
                  <ProductRow db={db} product={p} onClick={() => (code ? assign(p) : (setProduct(p), setPhase('found')))} />
                </li>
              ))}
            </ul>
          )}

          {(pick || phase === 'choose') && (
            <>
              <input type="search" placeholder="Name oder Code, z. B. BX-24 …" value={query} onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Produkt suchen" />
              <ul class="list scan-results">
                {results.map((p) => (
                  <li key={p.code}>
                    <ProductRow db={db} product={p} onClick={() => (code ? assign(p) : (setProduct(p), setPhase('found')))} />
                  </li>
                ))}
              </ul>
            </>
          )}

          {phase === 'found' && product && (
            <div class="scan-found">
              {blade && <BeyImage bladeId={blade.id} type={blade.type} size="lg" alt={blade.name} />}
              <div>
                <p class="eyebrow">{product.code}</p>
                <p class="row-title">{displayProductName(product, db)}</p>
                {priceHint(product, rates) && <p class="muted">{priceHint(product, rates)}</p>}
                <OwnStatus db={db} state={state} product={product} />
              </div>
              <div class="btn-row">
                <button type="button" class="btn btn-primary" onClick={() => addOwned(product)}>
                  In die Sammlung
                </button>
                <button type="button" class="btn" onClick={() => addWish(product)}>
                  Auf Wunschliste
                </button>
              </div>
              {code && (
                <button type="button" class="btn btn-ghost btn-sm" onClick={forget}>
                  Falsches Produkt? Neu zuordnen
                </button>
              )}
            </div>
          )}

          {phase === 'done' && (
            <div class="scan-found">
              <p role="status">{msg}</p>
              <div class="btn-row">
                <button type="button" class="btn btn-primary" onClick={again}>
                  Nächste Packung
                </button>
                <button type="button" class="btn" onClick={onClose}>
                  Fertig
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Produkt in einer Trefferliste: Blade-Bild statt Materialnummer. */
function ProductRow({ db, product, onClick }: { db: Database; product: Product; onClick: () => void }) {
  const blade = product.bladeId ? db.blades.find((b) => b.id === product.bladeId) : undefined;
  return (
    <button type="button" class="row row-btn" onClick={onClick}>
      {blade ? <BeyImage bladeId={blade.id} type={blade.type} size="sm" alt="" zoomable={false} /> : <span class="code">{product.code}</span>}
      <span class="row-main">
        <span class="row-title">{displayProductName(product, db)}</span>
        <span class="row-sub">{product.code}</span>
      </span>
    </button>
  );
}

/** Im Laden das Wichtigste auf einen Blick: schon da? auf der Wunschliste? bringt es neue Teile? */
function OwnStatus({ db, state, product }: { db: Database; state: UserState; product: Product }) {
  const n = state.owned[product.code] ?? 0;
  if (n > 0) return <p class="scan-status have">✓ Hast du schon ({n}×)</p>;
  const parts = ownedParts(db, state.owned);
  const fresh = [
    product.bladeId && !parts.blades.has(product.bladeId),
    product.ratchetId && !parts.ratchets.has(product.ratchetId),
    product.bitId && !parts.bits.has(product.bitId),
  ].filter(Boolean).length;
  return (
    <>
      {state.wishlist.includes(product.code) && <p class="scan-status wish">♥ Steht auf deiner Wunschliste</p>}
      {product.bladeId && (fresh ? <p class="scan-status new">{fresh === 1 ? '1 neues Teil' : `${fresh} neue Teile`} für deine Sammlung</p> : <p class="scan-status have">Alle Teile hast du schon aus anderen Packungen</p>)}
    </>
  );
}
