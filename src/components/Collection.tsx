import { useMemo, useRef, useState } from 'preact/hooks';
import type { Database } from '../lib/types';
import type { UserState } from '../lib/storage';
import { exportState, importState } from '../lib/storage';
import { ownedParts } from '../lib/data';
import { Empty, Section, TypeBadge } from './ui';
import { useApp } from '../lib/context';
import { Scanner } from './Scanner';
import { nb } from '../lib/analysis';
import { convert, priceHint, sumPrices, yen } from '../lib/price';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  goToParts: () => void;
}

export function Collection({ db, state, update, goToParts }: Props) {
  const parts = useMemo(() => ownedParts(db, state.owned), [db, state.owned]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [scan, setScan] = useState(false);
  const ownedProducts = db.products.filter((p) => (state.owned[p.code] ?? 0) > 0);
  const unknownCodes = Object.keys(state.owned).filter((c) => !db.products.some((p) => p.code === c));
  const total = ownedProducts.reduce((n, p) => n + (state.owned[p.code] ?? 0), 0);
  const { rates } = useApp();
  const wishProducts = state.wishlist.map((c) => db.products.find((p) => p.code === c)).filter((p): p is (typeof db.products)[number] => !!p);
  const wishSum = sumPrices(wishProducts);
  const wishConv = convert(wishSum.jpy, rates);
  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n);
  const unwish = (code: string) => update((s) => ({ ...s, wishlist: s.wishlist.filter((c) => c !== code) }));
  const gotIt = (code: string) =>
    update((s) => ({ ...s, wishlist: s.wishlist.filter((c) => c !== code), owned: { ...s.owned, [code]: (s.owned[code] ?? 0) + 1 } }));

  const doExport = () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beyblade-sammlung-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    // iOS/Safari braucht die URL noch kurz nach dem Klick.
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = importState(await file.text());
      if (!window.confirm('Aktuelle Sammlung, Kombos und Deck durch die Datei ersetzen?')) return;
      update(() => next);
      setMsg('Import erfolgreich.');
    } catch {
      setMsg('Die Datei konnte nicht gelesen werden.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div class="stack">
      <button type="button" class="card glass scan-cta" onClick={() => setScan(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 8v8M10 8v8M13 8v8M16 8v8" />
        </svg>
        <span>
          <strong>Packung scannen</strong>
          <small>Barcode fotografieren – Kreisel landet in der Sammlung</small>
        </span>
      </button>
      {scan && <Scanner db={db} state={state} update={update} onClose={() => setScan(false)} />}
      {ownedProducts.length ? (
        <>
          <div class="kpis">
            <div class="kpi">
              <span class="kpi-val">{total}</span>
              <span class="kpi-label">Produkte</span>
            </div>
            <div class="kpi">
              <span class="kpi-val">{parts.blades.size}</span>
              <span class="kpi-label">Blades</span>
            </div>
            <div class="kpi">
              <span class="kpi-val">{parts.ratchets.size}</span>
              <span class="kpi-label">Ratchets</span>
            </div>
            <div class="kpi">
              <span class="kpi-val">{parts.bits.size}</span>
              <span class="kpi-label">Bits</span>
            </div>
          </div>
          <Section title="Meine Produkte" aside={<button type="button" class="btn btn-ghost" onClick={goToParts}>Bearbeiten</button>}>
            <ul class="list">
              {ownedProducts.map((p) => {
                const b = db.blades.find((x) => x.id === p.bladeId);
                return (
                  <li key={p.code} class="row">
                    <span class="code">{p.code.startsWith('TBA') ? 'neu' : p.code}</span>
                    <div class="row-main">
                      <span class="row-title">{nb(p.name)}</span>
                    </div>
                    {b && <TypeBadge type={b.type} small />}
                    <span class="count">{state.owned[p.code]}×</span>
                  </li>
                );
              })}
            </ul>
          </Section>
          <Section title="Teile zum Kombinieren">
            <div class="card parts-grid">
              <div>
                <p class="eyebrow">Ratchets</p>
                <p>{[...parts.ratchets.keys()].sort().join(', ') || '–'}</p>
              </div>
              <div>
                <p class="eyebrow">Bits</p>
                <p>{[...parts.bits.keys()].sort().join(', ') || '–'}</p>
              </div>
            </div>
          </Section>
        </>
      ) : (
        <Empty title="Deine Sammlung ist leer">
          <p>Trag unter „Teile“ mit + ein, welche Produkte du hast. Dann kannst du nur mit deinen Teilen kombinieren.</p>
          <button type="button" class="btn btn-primary" onClick={goToParts}>
            Produkte hinzufügen
          </button>
        </Empty>
      )}
      <Section title="Wunschliste" aside={wishProducts.length ? <span class="muted">{wishProducts.length}</span> : undefined}>
        {wishProducts.length ? (
          <div class="card wish-card">
            <ul class="list">
              {wishProducts.map((p) => {
                const price = priceHint(p, rates);
                return (
                  <li key={p.code} class="row">
                    <div class="row-main">
                      <span class="row-title">{nb(p.name)}</span>
                      <span class="row-sub">
                        {p.code} · {price ?? 'Preis unbekannt'}
                      </span>
                    </div>
                    <button type="button" class="btn btn-ghost btn-sm" onClick={() => gotIt(p.code)} aria-label={`${p.name} gekauft: in die Sammlung`}>
                      Gekauft
                    </button>
                    <button type="button" class="icon-btn" onClick={() => unwish(p.code)} aria-label={`${p.name} von der Wunschliste nehmen`}>
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
            <div class="wish-total">
              <span>Summe Japan-Preis</span>
              <strong>
                {wishSum.jpy ? yen(wishSum.jpy) : '–'}
                {wishSum.jpy > 0 && wishConv && (
                  <small>
                    {' '}
                    ≈ {fmt(wishConv.eur)} € · {fmt(wishConv.thb)} ฿
                  </small>
                )}
              </strong>
            </div>
            <p class="fineprint">
              Japan-Verkaufspreis (Takara Tomy) laut Beyblade Wiki{wishSum.missing ? `, ${wishSum.missing} ohne Preis` : ''}. In Thailand und Europa (Hasbro) weichen die Preise ab – als grober Richtwert zum Vergleichen.
              {rates && ` Kurs: EZB vom ${new Date(`${rates.date}T12:00:00`).toLocaleDateString('de-AT')}.`}
            </p>
          </div>
        ) : (
          <p class="muted">Tippe im Lexikon unter „Karten“ auf den Stern, um Kreisel vorzumerken. Hier siehst du dann, was sie ungefähr kosten.</p>
        )}
      </Section>

      {unknownCodes.length > 0 && (
        <p class="fineprint">Nicht mehr in der Datenbank: {unknownCodes.join(', ')}</p>
      )}

      <Section title="Sichern">
        <div class="card">
          <p class="muted">Deine Daten liegen nur auf diesem Gerät. Exportiere sie als Datei, um sie zu sichern oder aufs Handy zu übertragen.</p>
          <div class="btn-row">
            <button type="button" class="btn" onClick={doExport}>
              Exportieren
            </button>
            <button type="button" class="btn" onClick={() => fileRef.current?.click()}>
              Importieren
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void doImport(e.currentTarget.files?.[0])} />
          </div>
          {msg && (
            <p class="muted" role="status">
              {msg}
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
