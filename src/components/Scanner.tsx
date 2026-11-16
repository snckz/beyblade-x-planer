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

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  onClose: () => void;
}

type Phase = 'starting' | 'scanning' | 'nocam' | 'noreader' | 'unknown' | 'found' | 'done';

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
  const [phase, setPhase] = useState<Phase>('starting');
  const [code, setCode] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');
  const [round, setRound] = useState(0);
  const barcodes = useRef(state.barcodes);
  barcodes.current = state.barcodes;

  // Dialog-Grundverhalten: Fokus, Escape, Hintergrund nicht scrollen.
  useModal(ref, () => closeRef.current());

  // Kamera + Erkennung. Läuft pro „round“ neu (nach „Nächste Packung“).
  useEffect(() => {
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
                stop();
                const known = db.products.find((p) => p.code === barcodes.current[gtin]);
                setCode(gtin);
                setProduct(known ?? null);
                setPhase(known ? 'found' : 'unknown');
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
  }, [round, db]);

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
    setCode(null);
    setProduct(null);
    setMsg('');
    setQuery('');
    setPhase('starting');
    setRound((r) => r + 1);
  };

  const camera = phase === 'starting' || phase === 'scanning';
  const pick = phase === 'unknown' || phase === 'nocam' || phase === 'noreader';
  const results = pick ? searchProducts(db.products, query, db.blades).slice(0, 30) : [];
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
              Barcode <strong class="mono">{code}</strong> ist noch unbekannt. Welches Produkt ist das? Danach erkennt die App ihn sofort wieder.
            </p>
          )}

          {pick && (
            <>
              <input type="search" placeholder="Name oder Code, z. B. BX-24 …" value={query} onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Produkt suchen" />
              <ul class="list scan-results">
                {results.map((p) => (
                  <li key={p.code}>
                    <button type="button" class="row row-btn" onClick={() => (code ? assign(p) : (setProduct(p), setPhase('found')))}>
                      <span class="code">{p.code}</span>
                      <span class="row-main">
                        <span class="row-title">{displayProductName(p, db)}</span>
                      </span>
                    </button>
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
