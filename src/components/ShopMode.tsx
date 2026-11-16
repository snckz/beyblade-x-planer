import { useRef, useState } from 'preact/hooks';
import type { Database, MetaFeed, Product } from '../lib/types';
import { PhotoCheck } from './PhotoCheck';
import { prefetchOcr } from '../lib/photo';
import type { ShopPrice, UserState } from '../lib/storage';
import { convert, refPrice, shopVerdict, sumPrices, VERDICT_LABEL, yen } from '../lib/price';
import { displayProductName } from '../lib/names';
import { nb } from '../lib/analysis';
import { useApp } from '../lib/context';
import { useModal } from '../lib/useModal';
import { BeyImage } from './BeyImage';
import { PriceInput } from './PriceInput';
import { purchaseCodes } from '../lib/data';
import { Scanner } from './Scanner';
import { Check } from 'lucide-preact';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  meta?: MetaFeed | null;
  onClose: () => void;
}

const fmt = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n);

/**
 * Einkaufsmodus fürs Geschäft: Wunschliste mit Japan-Vergleichspreis in Baht/Euro,
 * Ladenpreis eintippen → Ampel. Läuft offline, sobald die App einmal geladen wurde.
 */
export function ShopMode({ db, state, update, meta, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { rates, openCheck } = useApp();
  const [cur, setCur] = useState<ShopPrice['cur']>(() => Object.values(state.shopPrices)[0]?.cur ?? 'THB');
  const [scan, setScan] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [offline, setOffline] = useState<'idle' | 'busy' | 'ok' | 'fail' | 'nosw'>('idle');
  useModal(ref, onClose);

  const items = state.wishlist.map((c) => db.products.find((p) => p.code === c)).filter((p): p is Product => !!p);
  const sym = cur === 'THB' ? '฿' : '€';
  // Vergleichspreis: Japan-Preis (Takara) bzw. US-Preis (Hasbro), umgerechnet in die Ladenwährung
  const refLabel = (p: Product) => {
    const r = refPrice(p, rates);
    if (r) return `${r.label} ≈ ${fmt(cur === 'THB' ? r.thb : r.eur)} ${sym}`;
    if (p.priceJpy) return `Japan ${yen(p.priceJpy)}`;
    if (p.priceUsd) return `USA $${p.priceUsd.toFixed(2).replace('.', ',')}`;
    return 'Preis unbekannt';
  };

  const setPrice = (code: string, v: ShopPrice | null) =>
    update((s) => {
      const shopPrices = { ...s.shopPrices };
      if (v) shopPrices[code] = v;
      else delete shopPrices[code];
      return { ...s, shopPrices };
    });
  // Set gekauft = alle Kreisel des Sets
  const bought = (p: Product) => {
    const codes = purchaseCodes(db.products, p);
    update((s) => ({
      ...s,
      wishlist: s.wishlist.filter((c) => !codes.includes(c)),
      owned: { ...s.owned, ...Object.fromEntries(codes.map((c) => [c, (s.owned[c] ?? 0) + 1])) },
    }));
  };

  // Summen: eingetippte Ladenpreise (nur in der gewählten Währung) und Japan-Vergleich
  const seen = items.map((p) => state.shopPrices[p.code]).filter((x): x is ShopPrice => !!x && x.cur === cur);
  const seenSum = seen.reduce((s, x) => s + x.amount, 0);
  const jp = sumPrices(items);
  const jpConv = convert(jp.jpy, rates);

  return (
    <div ref={ref} class="live shop" role="dialog" aria-modal="true" aria-label="Einkaufsmodus" tabIndex={-1}>
      <div class="live-bar">
        <button type="button" class="btn btn-sm" onClick={onClose}>
          Schließen
        </button>
        <span class="live-title">Einkaufsmodus</span>
        <button type="button" class="btn btn-sm btn-primary" onClick={() => setScan(true)}>
          Scannen
        </button>
      </div>

      <div class="shop-body stack-sm">
        <button type="button" class="card glass scan-cta" onClick={() => setPhoto(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          <span>
            <strong>Kauf-Check: Foto oder Name</strong>
            <small>Packung fotografieren oder eintippen – sofort Bewertung</small>
          </span>
        </button>
        <div class="shop-head">
          <div class="segmented seg-2" role="group" aria-label="Währung im Laden">
            <button type="button" class={cur === 'THB' ? 'on' : ''} aria-pressed={cur === 'THB'} onClick={() => setCur('THB')}>
              Baht ฿
            </button>
            <button type="button" class={cur === 'EUR' ? 'on' : ''} aria-pressed={cur === 'EUR'} onClick={() => setCur('EUR')}>
              Euro €
            </button>
          </div>
          {rates ? (
            <p class="fineprint">
              1 € = {rates.THB.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ฿ · Kurs vom {new Date(`${rates.date}T12:00:00`).toLocaleDateString('de-AT')}
            </p>
          ) : (
            <p class="fineprint">Keine Wechselkurse geladen – Vergleich erst nach einmal Online-Öffnen.</p>
          )}
        </div>

        <p class="fineprint">
          Offline im Laden: Die App funktioniert ohne Internet.{' '}
          {offline === 'ok' ? (
            'Foto-Erkennung ist offline bereit ✓'
          ) : (
            <button
              type="button"
              class="link-btn"
              disabled={offline === 'busy'}
              onClick={async () => {
                setOffline('busy');
                setOffline(await prefetchOcr());
              }}
            >
              {offline === 'busy'
                ? 'Lade Foto-Erkennung (ca. 7 MB) …'
                : offline === 'fail'
                  ? 'Laden fehlgeschlagen – nochmal versuchen'
                  : offline === 'nosw'
                    ? 'Offline-Speicher noch nicht aktiv – App einmal neu öffnen und nochmal tippen'
                    : 'Foto-Erkennung jetzt für offline laden (ca. 7 MB, am besten im WLAN)'}
            </button>
          )}
        </p>
        {items.length ? (
          <ul class="shop-list">
            {items.map((p) => {
              const price = state.shopPrices[p.code];
              const v = price ? shopVerdict(price.amount, price.cur, p, rates) : null;
              const blade = p.bladeId ? db.blades.find((b) => b.id === p.bladeId) : undefined;
              const other = price && price.cur !== cur;
              return (
                <li key={p.code} class={`card shop-item${v ? ` v-${v.verdict}` : ''}`}>
                  <div class="shop-top">
                    {blade && <BeyImage bladeId={blade.id} type={blade.type} size="sm" alt="" zoomable={false} />}
                    <div class="row-main">
                      <span class="row-title">{nb(displayProductName(p, db))}</span>
                      <span class="row-sub">
                        {p.code} · {refLabel(p)}
                        {p.kind === 'set' && ' (ganzes Set)'}
                      </span>
                    </div>
                  </div>
                  <div class="shop-price">
                    <PriceInput value={price ?? null} cur={cur} label={`Preis im Laden für ${p.name} in ${cur === 'THB' ? 'Baht' : 'Euro'}`} onCommit={(v) => setPrice(p.code, v)} />
                    {v ? (
                      <span class={`verdict v-${v.verdict}`}>
                        {VERDICT_LABEL[v.verdict]}
                        <small>{v.ratio < 1 ? `${Math.round((1 - v.ratio) * 100)} % unter Japan` : `+${Math.round((v.ratio - 1) * 100)} % zu Japan`}</small>
                      </span>
                    ) : price && !p.priceJpy ? (
                      <span class="verdict">Kein Vergleich</span>
                    ) : null}
                  </div>
                  {other && (
                    <p class="fineprint">
                      Gemerkt: {fmt(price.amount)} {price.cur === 'THB' ? '฿' : '€'}
                    </p>
                  )}
                  <div class="btn-row">
                    <button type="button" class="btn btn-sm btn-primary" onClick={() => bought(p)}>
                      <Check aria-hidden="true" /> Gekauft
                    </button>
                    <button type="button" class="btn btn-sm" onClick={() => openCheck(p.code)}>
                      Kaufen?
                    </button>
                    <button type="button" class="btn btn-sm btn-ghost" onClick={() => update((s) => ({ ...s, wishlist: s.wishlist.filter((c) => c !== p.code) }))}>
                      Entfernen
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div class="card">
            <p class="muted">Deine Wunschliste ist leer. Merk dir Kreisel im Lexikon (Stern) oder über den Kaufberater – dann stehen sie hier als Einkaufsliste.</p>
          </div>
        )}

        {items.length > 0 && (
          <div class="card wish-total-card">
            {seen.length > 0 && (
              <div class="wish-total">
                <span>Ladenpreise ({seen.length})</span>
                <strong>
                  {fmt(seenSum)} {sym}
                  {cur === 'THB' && rates && <small> ≈ {fmt(seenSum / rates.THB)} €</small>}
                </strong>
              </div>
            )}
            <div class="wish-total">
              <span>Japan-Preis gesamt</span>
              <strong>
                {jp.jpy ? yen(jp.jpy) : '–'}
                {jpConv && jp.jpy > 0 && (
                  <small>
                    {' '}
                    ≈ {fmt(cur === 'THB' ? jpConv.thb : jpConv.eur)} {sym}
                  </small>
                )}
              </strong>
            </div>
            <p class="fineprint">
              Ampel: Takara bis +30 % zum Japan-Preis gut, bis +60 % okay. Hasbro: Vergleich mit dem US-Preis (ohne Steuer) – bis +70 % gut, bis +120 % okay. Takara-Tomy-Ware kostet außerhalb Japans fast immer mehr. Achte im Laden auf das Takara-Tomy-Logo – günstige
              Kreisel ohne Logo sind oft Fälschungen.
            </p>
          </div>
        )}
      </div>
      {scan && <Scanner db={db} state={state} update={update} onClose={() => setScan(false)} />}
      {photo && <PhotoCheck db={db} state={state} update={update} meta={meta} onClose={() => setPhoto(false)} />}
    </div>
  );
}
