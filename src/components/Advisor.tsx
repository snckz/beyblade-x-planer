import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Database, MetaFeed } from '../lib/types';
import type { UserState } from '../lib/storage';
import { advise, offerScore, rankOffers, valuePer1000, type NewPart, type Offer } from '../lib/advisor';
import { META_TOP, pct } from '../lib/metaUsage';
import { metaOpponents } from '../lib/battle';
import { priceHint } from '../lib/price';
import { displayName, displayProductName } from '../lib/names';
import { useApp } from '../lib/context';
import { BeyImage } from './BeyImage';
import { Section } from './ui';
import { Heart } from 'lucide-preact';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  meta?: MetaFeed | null;
}

type Sort = 'value' | 'gain';

/** Welche Packung bringt dem besten Deck am meisten – und was kostet das? */
export function Advisor({ db, state, update, meta }: Props) {
  const { rates } = useApp();
  const [result, setResult] = useState<{ base: number; offers: Offer[] } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>('value');
  const run = useRef(0);
  const { opponents, vsMeta } = useMemo(() => metaOpponents(db, meta), [db, meta]);
  const hasCollection = Object.values(state.owned).some((n) => n > 0);

  // Sammlung oder Gegner geändert → altes Ergebnis passt nicht mehr.
  useEffect(() => {
    run.current++;
    setResult(null);
    setProgress(null);
  }, [db, state.owned, opponents]);

  const start = async () => {
    const id = ++run.current;
    setProgress(0);
    // Gleiche Kreisel als Takara- und Hasbro-Packung: die Variante anbieten, die man selbst meist kauft
    const mine = db.products.filter((p) => (state.owned[p.code] ?? 0) > 0);
    const preferHasbro = mine.filter((p) => p.region === 'hasbro').length > mine.length / 2;
    const res = await advise(db, state.owned, opponents, (done, total) => run.current === id && setProgress(done / total), preferHasbro, meta ?? null);
    if (run.current !== id) return; // inzwischen neu gestartet oder Sammlung geändert
    setResult(res);
    setProgress(null);
  };

  const offers = useMemo(() => {
    if (!result) return [];
    const list = sort === 'value' ? rankOffers(result.offers) : [...result.offers].sort((a, b) => offerScore(b) - offerScore(a));
    return list.slice(0, 8);
  }, [result, sort]);

  const partName = (p: NewPart) => {
    if (p.kind === 'blade') {
      const b = db.blades.find((x) => x.id === p.id);
      return b ? displayName(b) : p.id;
    }
    if (p.kind === 'bit') return `${db.bits.find((x) => x.id === p.id)?.name ?? p.id} (Bit)`;
    return `${p.id} (Ratchet)`;
  };
  const toggleWish = (o: Offer) =>
    update((s) => {
      const on = o.codes.some((c) => s.wishlist.includes(c));
      return { ...s, wishlist: on ? s.wishlist.filter((c) => !o.codes.includes(c)) : [...s.wishlist, o.code] };
    });
  const pts = (n: number) => `+${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })}`;

  return (
    <Section title="Kaufberater">
      <div class="card glass stack-sm">
        <p class="muted">
          Welche Packung macht dein bestes Deck {vsMeta ? 'gegen die aktuellen Turnier-Kombos' : 'gegen typische Gegner'} am stärksten? Teile, die du schon hast, zählen nicht doppelt.
        </p>
        {!hasCollection && <p class="muted">Tipp: Trag zuerst deine Kreisel in der Sammlung ein – dann passen die Vorschläge zu dem, was dir noch fehlt.</p>}

        {!result && (
          <button type="button" class="btn btn-primary" onClick={start} disabled={progress !== null}>
            {progress !== null ? `Rechne … ${Math.round(progress * 100)} %` : 'Was soll ich als Nächstes kaufen?'}
          </button>
        )}
        {progress !== null && (
          <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Kaufberater rechnet">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}

        {result && (
          <>
            <div class="segmented seg-2" role="group" aria-label="Sortierung">
              <button type="button" class={sort === 'value' ? 'on' : ''} aria-pressed={sort === 'value'} onClick={() => setSort('value')}>
                Preis-Leistung
              </button>
              <button type="button" class={sort === 'gain' ? 'on' : ''} aria-pressed={sort === 'gain'} onClick={() => setSort('gain')}>
                Größter Sprung
              </button>
            </div>
            {offers.length ? (
              <ol class="list advice">
                {offers.map((o) => {
                  const product = db.products.find((p) => p.code === o.code)!;
                  const wished = o.codes.some((c) => state.wishlist.includes(c));
                  const v = valuePer1000(o);
                  const hint = priceHint(product, rates);
                  return (
                    <li key={o.code} class="row advice-row">
                      {product.bladeId && <BeyImage bladeId={product.bladeId} type={db.blades.find((b) => b.id === product.bladeId)?.type ?? 'balance'} size="sm" alt="" zoomable={false} />}
                      <div class="row-main">
                        <span class="row-title">{o.codes.length > 1 ? o.name : displayProductName(product, db)}</span>
                        <span class="advice-gain">
                          {o.kind === 'random-booster' ? (
                            <>
                              Zufall: im Schnitt <strong>{pts(o.gain)}</strong>, bester Treffer {pts(o.bestGain ?? o.gain)}
                            </>
                          ) : (
                            <>
                              <strong>{pts(o.gain)} Punkte</strong> fürs Deck
                            </>
                          )}
                          {v !== null && sort === 'value' && <span class="muted"> · {v.toLocaleString('de-DE', { maximumFractionDigits: 1 })} pro 1.000 ¥</span>}
                        </span>
                        {o.meta && (
                          <span class={`meta-tag${o.meta.share >= META_TOP ? ' top' : ''}`}>
                            {o.meta.share >= META_TOP ? 'Top im Turnier' : 'Turnier-relevant'}: {o.meta.name} · {pct(o.meta.share)} der Siegerdecks
                          </span>
                        )}
                        <span class="row-sub">Neu: {o.newParts.map(partName).join(', ')}</span>
                        {hint && <span class="row-sub">{hint}</span>}
                      </div>
                      <button
                        type="button"
                        class={`chip${wished ? ' chip-on' : ''}`}
                        aria-pressed={wished}
                        onClick={() => toggleWish(o)}
                        aria-label={`${product.name} ${wished ? 'von der Wunschliste nehmen' : 'auf die Wunschliste'}`}
                      >
                        <Heart aria-hidden="true" fill={wished ? 'currentColor' : 'none'} /> Wunsch
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p class="muted">Kein Kauf verbessert dein Deck noch spürbar – du bist gut aufgestellt.</p>
            )}
            <p class="fineprint">
              Punkte = wie viel stärker dein bestes 3er-Deck wird (Richtwert aus Typ, Werten, Gewicht und Drehrichtung). Preise: Japan-Verkaufspreis (Takara Tomy), sofern bekannt.
            </p>
            <button type="button" class="btn btn-sm" onClick={start}>
              Neu berechnen
            </button>
          </>
        )}
      </div>
    </Section>
  );
}
