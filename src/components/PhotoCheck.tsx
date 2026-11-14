import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import type { Database, MetaFeed, Product } from '../lib/types';
import type { ShopPrice, UserState } from '../lib/storage';
import { recognizePhoto } from '../lib/photo';
import { judge, rateProduct, OVERALL_LABEL, type Rating } from '../lib/rate';
import { metaOpponents } from '../lib/battle';
import type { ScoreCache } from '../lib/optimizer';
import { purchaseCodes, searchProducts } from '../lib/data';
import { convert, groupKey, VERDICT_LABEL, yen } from '../lib/price';
import { PriceInput } from './PriceInput';
import { displayProductName } from '../lib/names';
import { nb } from '../lib/analysis';
import { useApp } from '../lib/context';
import { useModal } from '../lib/useModal';
import { BeyImage } from './BeyImage';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  meta?: MetaFeed | null;
  onClose: () => void;
}

type Phase =
  | { k: 'idle' }
  | { k: 'working'; step: string; p?: number }
  | { k: 'pick'; list: Product[]; barcode: string | null }
  | { k: 'result'; product: Product }
  | { k: 'none'; text: string; barcode: string | null }
  | { k: 'error' };

const fmt = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n);

/** Packung fotografieren → erkennen → bewerten (schon da? wie viel fürs Deck? Preis okay?). */
export function PhotoCheck({ db, state, update, meta, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const { rates } = useApp();
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const [query, setQuery] = useState('');
  const [cur, setCur] = useState<ShopPrice['cur']>(() => Object.values(state.shopPrices)[0]?.cur ?? 'THB');
  const [msg, setMsg] = useState('');
  const run = useRef(0);
  useModal(ref, onClose);

  const { opponents } = useMemo(() => metaOpponents(db, meta), [db, meta]);
  const cache = useMemo<ScoreCache>(() => new Map(), [db, opponents]);
  // Neu, sobald Sammlung, Gegner oder Kurse (laden asynchron) sich ändern – damit die Bewertung mitzieht.
  const rate = useCallback((p: Product | Product[], price: ShopPrice | null) => rateProduct(db, state.owned, opponents, p, price, rates, cache), [db, state.owned, opponents, rates, cache]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const id = ++run.current;
    setMsg('');
    setPhase({ k: 'working', step: 'Suche Barcode …' });
    try {
      const res = await recognizePhoto(file, db, state.barcodes, (step, p) => {
        if (run.current !== id) return;
        setPhase({ k: 'working', step: step === 'barcode' ? 'Suche Barcode …' : p !== undefined && p < 1 ? 'Lade Texterkennung (nur beim ersten Mal) …' : 'Lese die Packung …', p });
      });
      if (run.current !== id) return;
      if (!res.products.length) return setPhase({ k: 'none', text: res.text, barcode: res.barcode });
      // Mehrere Treffer aus demselben Set bzw. Random Booster sind ein Kauf → direkt als Ganzes bewerten.
      const first = res.products[0]!;
      const oneBuy = res.products.every((p) => p.kind === first.kind && groupKey(p) === groupKey(first));
      if (oneBuy) {
        // Barcode nur bei eindeutigem Produktcode merken – ein unsicherer Namens-Treffer soll keinen Barcode „festnageln“.
        if (res.barcode && res.via === 'code') learn(res.barcode, head(first));
        return setPhase({ k: 'result', product: head(first) });
      }
      // Gleiche Käufe (z. B. drei Kreisel eines Sets) nur einmal anbieten
      const list = res.products.filter((p, i, a) => a.findIndex((q) => q.kind === p.kind && groupKey(q) === groupKey(p)) === i).map(head);
      setPhase({ k: 'pick', list: list.slice(0, 12), barcode: res.barcode });
    } catch {
      if (run.current === id) setPhase({ k: 'error' });
    }
  };
  // Barcode merken, damit das nächste Foto/der Live-Scan die Packung sofort erkennt.
  const learn = (barcode: string, p: Product) => update((s) => ({ ...s, barcodes: { ...s.barcodes, [barcode]: p.code } }));

  // Vertreter eines Kaufs: erstes Produkt des Sets/Random Boosters (gleicher Schlüssel für Preis und Wunschliste wie im Kaufberater)
  const head = (p: Product) => db.products.find((x) => x.kind === p.kind && groupKey(x) === groupKey(p)) ?? p;

  // Vom Nutzer bestätigt → Barcode darf gelernt werden
  const choose = (p: Product) => {
    if ((phase.k === 'none' || phase.k === 'pick') && phase.barcode) learn(phase.barcode, head(p));
    setPhase({ k: 'result', product: head(p) });
  };

  const reset = () => {
    run.current++;
    setPhase({ k: 'idle' });
    setQuery('');
    setMsg('');
  };

  return (
    <div ref={ref} class="live shop" role="dialog" aria-modal="true" aria-label="Foto-Check" tabIndex={-1}>
      <div class="live-bar">
        <button type="button" class="btn btn-sm" onClick={onClose}>
          Schließen
        </button>
        <span class="live-title">Foto-Check</span>
        {phase.k !== 'idle' ? (
          <button type="button" class="btn btn-sm btn-primary" onClick={reset}>
            Neues Foto
          </button>
        ) : (
          <span class="btn-sm" aria-hidden="true" />
        )}
      </div>
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const el = e.currentTarget;
          // Feld leeren, damit dasselbe Foto erneut gewählt werden kann
          void onFile(el.files?.[0]).finally(() => (el.value = ''));
        }}
      />
      <input
        ref={galRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const el = e.currentTarget;
          // Feld leeren, damit dasselbe Foto erneut gewählt werden kann
          void onFile(el.files?.[0]).finally(() => (el.value = ''));
        }}
      />

      <div class="shop-body stack-sm">
        {phase.k === 'idle' && (
          <div class="card glass stack-sm photo-start">
            <span class="photo-icon" aria-hidden="true">
              📷
            </span>
            <p>
              <strong>Packung fotografieren</strong>
            </p>
            <p class="muted">Am besten die Vorderseite mit dem Code (z. B. „BX-05“) oder dem Namen, gerade und gut beleuchtet. Die Erkennung läuft auf deinem Handy.</p>
            <button type="button" class="btn btn-primary" onClick={() => camRef.current?.click()}>
              Foto machen
            </button>
            <button type="button" class="btn" onClick={() => galRef.current?.click()}>
              Aus der Galerie wählen
            </button>
          </div>
        )}

        {phase.k === 'working' && (
          <div class="card glass stack-sm" role="status">
            <p>
              <strong>{phase.step}</strong>
            </p>
            <div class="progress">
              <span style={{ width: `${Math.round((phase.p ?? 0.15) * 100)}%` }} />
            </div>
          </div>
        )}

        {phase.k === 'pick' && (
          <div class="card glass stack-sm">
            <p>
              <strong>Mehrere Treffer – welche ist es?</strong>
            </p>
            <ProductList db={db} list={phase.list} onPick={choose} />
          </div>
        )}

        {(phase.k === 'none' || phase.k === 'error') && (
          <div class="card glass stack-sm">
            <p>
              <strong>{phase.k === 'error' ? 'Das Foto konnte nicht gelesen werden.' : 'Auf dem Foto habe ich keine Packung erkannt.'}</strong>
            </p>
            <p class="muted">Probier ein schärferes Foto der Vorderseite – oder such sie hier:</p>
            <label class="shop-input">
              <span class="sr-only">Packung suchen</span>
              <input value={query} onInput={(e) => setQuery(e.currentTarget.value)} placeholder="Name oder Code, z. B. BX-05" />
            </label>
            {query.trim() && (
              <ProductList
                db={db}
                list={searchProducts(db.products, query, db.blades)
                  .filter((p) => p.kind !== 'stadium')
                  .slice(0, 10)}
                onPick={choose}
              />
            )}
          </div>
        )}

        {phase.k === 'result' && <Result db={db} state={state} update={update} product={phase.product} rate={rate} cur={cur} setCur={setCur} msg={msg} setMsg={setMsg} />}
      </div>
    </div>
  );
}

function ProductList({ db, list, onPick }: { db: Database; list: Product[]; onPick: (p: Product) => void }) {
  if (!list.length) return <p class="muted">Nichts gefunden.</p>;
  return (
    <ul class="list">
      {list.map((p) => (
        <li key={p.code}>
          <button type="button" class="row row-btn" onClick={() => onPick(p)}>
            {p.bladeId && <BeyImage bladeId={p.bladeId} type={db.blades.find((b) => b.id === p.bladeId)?.type ?? 'balance'} size="sm" alt="" zoomable={false} />}
            <span class="row-main">
              <span class="row-title">{nb(displayProductName(p, db))}</span>
              <span class="row-sub">{p.code}</span>
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
  const overall = isRandom ? judge(avgGain, main.price) : main.overall;
  const blade = product.bladeId ? db.blades.find((b) => b.id === product.bladeId) : undefined;
  const sym = cur === 'THB' ? '฿' : '€';
  const jp = product.priceJpy ? convert(product.priceJpy, rates) : null;

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
            <span class="eyebrow">{isRandom ? `${groupKey(product)} · Random Booster` : product.code}</span>
            <span class="row-title">{isRandom ? product.name.replace(/\s*\(.*?\)\s*$/, '') : group.length > 1 ? `${groupKey(product)} Set (${group.length} Kreisel)` : nb(displayProductName(product, db))}</span>
          </div>
        </div>
        <p class={`photo-verdict o-${overall}`}>{OVERALL_LABEL[overall]}</p>
        <ul class="photo-reasons">
          {isRandom ? (
            <>
              <li>
                Im Schnitt +{avgGain.toFixed(1).replace('.', ',')} Punkte für dein Deck, bester Treffer +{best.gain.toFixed(1).replace('.', ',')}.
              </li>
              <li>Welcher Kreisel drin ist, siehst du erst beim Öffnen.</li>
              {main.price && <li>{main.price.verdict === 'good' ? 'Der Preis ist gut.' : main.price.verdict === 'ok' ? 'Der Preis ist okay.' : 'Der Preis ist hoch.'}</li>}
            </>
          ) : (
            main.reasons.map((r) => <li key={r}>{r}</li>)
          )}
        </ul>
        {!isRandom && main.gain >= 2 && main.deck.length > 0 && (
          <p class="fineprint">
            Dein bestes Deck danach: {main.deck.map((c) => nb(`${db.blades.find((b) => b.id === c.combo.bladeId)?.name ?? c.combo.bladeId} ${c.combo.ratchetId ?? ''}${c.combo.bitId}`)).join(' · ')}
          </p>
        )}
      </div>

      <div class="card stack-sm">
        <div class="shop-price">
          <PriceInput value={price} cur={cur} label={`Preis im Laden in ${cur === 'THB' ? 'Baht' : 'Euro'}`} onCommit={setPrice} />
          <div class="segmented seg-2 cur-switch" role="group" aria-label="Währung">
            <button type="button" class={cur === 'THB' ? 'on' : ''} aria-pressed={cur === 'THB'} onClick={() => setCur('THB')}>
              ฿
            </button>
            <button type="button" class={cur === 'EUR' ? 'on' : ''} aria-pressed={cur === 'EUR'} onClick={() => setCur('EUR')}>
              €
            </button>
          </div>
        </div>
        <p class="muted">
          Japan-Preis: {product.priceJpy ? `${yen(product.priceJpy)}${jp ? ` ≈ ${fmt(cur === 'THB' ? jp.thb : jp.eur)} ${sym}` : ''}` : 'unbekannt'}
          {product.kind === 'set' && ' (ganzes Set)'}
          {main.price && (
            <span class={`verdict-inline v-${main.price.verdict}`}>
              {' '}
              · {VERDICT_LABEL[main.price.verdict]} ({main.price.ratio < 1 ? '−' : '+'}
              {Math.round(Math.abs(main.price.ratio - 1) * 100)} %)
            </span>
          )}
        </p>
      </div>

      {isRandom && (
        <details class="card">
          <summary>Gekauft und geöffnet? Kreisel auswählen</summary>
          <ProductList
            db={db}
            list={group}
            onPick={(p) => {
              update((s) => ({ ...s, owned: { ...s.owned, [p.code]: (s.owned[p.code] ?? 0) + 1 }, wishlist: s.wishlist.filter((c) => !group.some((g) => g.code === c)) }));
              setMsg(`${p.code} ist jetzt in deiner Sammlung.`);
            }}
          />
        </details>
      )}
      <div class="btn-row">
        {!isRandom && (
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => {
              // Set = alle Kreisel des Sets. Random Booster: welcher drin war, trägst du nach dem Öffnen in der Sammlung ein.
              const codes = purchaseCodes(db.products, product);
              update((s) => ({
                ...s,
                owned: { ...s.owned, ...Object.fromEntries(codes.map((c) => [c, (s.owned[c] ?? 0) + 1])) },
                wishlist: s.wishlist.filter((c) => !codes.includes(c)),
              }));
              setMsg(codes.length > 1 ? `Alle ${codes.length} Kreisel des Sets sind jetzt in deiner Sammlung.` : `${product.code} ist jetzt in deiner Sammlung.`);
            }}
          >
            Gekauft – in die Sammlung
          </button>
        )}
        {!state.wishlist.includes(product.code) && (main.owned ?? 0) === 0 && (
          <button
            type="button"
            class="btn"
            onClick={() => {
              update((s) => ({ ...s, wishlist: s.wishlist.includes(product.code) ? s.wishlist : [...s.wishlist, product.code] }));
              setMsg(`${product.code} steht auf deiner Wunschliste.`);
            }}
          >
            ♡ Merken
          </button>
        )}
      </div>
      {msg && (
        <p class="muted" role="status">
          {msg}
        </p>
      )}
      <p class="fineprint">Punkte = wie viel stärker dein bestes 3er-Deck gegen die aktuellen Turnier-Kombos wird. Richtwert, kein Messwert.</p>
    </div>
  );
}
