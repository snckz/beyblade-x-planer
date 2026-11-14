import { displayProductName } from '../lib/names';
import { useMemo, useRef, useState } from 'preact/hooks';
import type { BeyEvent, Database, MetaFeed } from '../lib/types';
import { wishReleases } from '../lib/reminders';
import { downloadIcs } from '../lib/ics';
import type { UserState } from '../lib/storage';
import { exportState, importState } from '../lib/storage';
import { ownedParts, purchaseCodes } from '../lib/data';
import { Empty, Section, TypeBadge } from './ui';
import { useApp } from '../lib/context';
import { Scanner } from './Scanner';
import { Transfer } from './Transfer';
import { Advisor } from './Advisor';
import { ShopMode } from './ShopMode';
import { PhotoCheck } from './PhotoCheck';
import { AddProducts } from './AddProducts';
import { Showcase } from './Showcase';
import { nb } from '../lib/analysis';
import { convert, priceHint, sumPrices, yen } from '../lib/price';

interface Props {
  events?: BeyEvent[];
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  meta?: MetaFeed | null;
}

export function Collection({ db, state, update, events = [], meta }: Props) {
  const parts = useMemo(() => ownedParts(db, state.owned), [db, state.owned]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [scan, setScan] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [shop, setShop] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showcase, setShowcase] = useState(false);
  const ownedProducts = db.products.filter((p) => (state.owned[p.code] ?? 0) > 0);
  const unknownCodes = Object.keys(state.owned).filter((c) => !db.products.some((p) => p.code === c));
  const total = ownedProducts.reduce((n, p) => n + (state.owned[p.code] ?? 0), 0);
  const { rates, openCheck } = useApp();
  const wishProducts = state.wishlist.map((c) => db.products.find((p) => p.code === c)).filter((p): p is (typeof db.products)[number] => !!p);
  const wishSum = sumPrices(wishProducts);
  const wishConv = convert(wishSum.jpy, rates);
  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n);
  const releases = wishReleases(db, state, events);
  const releaseOf = (code: string) => releases.find((r) => r.product.code === code);
  const upcoming = releases.filter((r) => r.status === 'upcoming');
  const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' });
  const toCalendar = () =>
    downloadIcs(
      upcoming.map((r) => ({
        uid: `release-${r.product.code}`,
        date: r.date,
        title: `Beyblade X Release: ${r.product.name}`,
        location: 'Japan (Takara Tomy)',
        description: `${r.product.code} von deiner Wunschliste erscheint heute in Japan.`,
      })),
      'beyblade-wunschliste.ics',
    );
  // Anzahl ändern; bei 0 verschwindet der Eintrag (mit Rückfrage, damit nichts aus Versehen weg ist)
  const changeOwned = (code: string, d: 1 | -1) => {
    const n = state.owned[code] ?? 0;
    if (d < 0 && n <= 1) {
      const p = db.products.find((x) => x.code === code);
      if (!window.confirm(`${p?.name ?? code} aus der Sammlung entfernen?`)) return;
    }
    update((s) => {
      const owned = { ...s.owned };
      const next = (owned[code] ?? 0) + d;
      if (next > 0) owned[code] = next;
      else delete owned[code];
      return { ...s, owned };
    });
  };
  const unwish = (code: string) => update((s) => ({ ...s, wishlist: s.wishlist.filter((c) => c !== code) }));
  const gotIt = (code: string) => {
    const p = db.products.find((x) => x.code === code);
    const codes = p ? purchaseCodes(db.products, p) : [code];
    update((s) => ({
      ...s,
      wishlist: s.wishlist.filter((c) => !codes.includes(c)),
      owned: { ...s.owned, ...Object.fromEntries(codes.map((c) => [c, (s.owned[c] ?? 0) + 1])) },
    }));
  };

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
      <button type="button" class="card glass scan-cta" onClick={() => setPhoto(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        <span>
          <strong>Kauf-Check: Foto oder Name</strong>
          <small>Packung fotografieren oder eintippen – und bewerten lassen</small>
        </span>
      </button>
      {scan && <Scanner db={db} state={state} update={update} onClose={() => setScan(false)} />}
      {showcase && <Showcase db={db} state={state} onClose={() => setShowcase(false)} />}
      {adding && <AddProducts db={db} state={state} update={update} onClose={() => setAdding(false)} />}
      {photo && <PhotoCheck db={db} state={state} update={update} meta={meta} onClose={() => setPhoto(false)} />}
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
          <section class="section">
            <div class="section-head">
              {/* Antippen öffnet die Vitrine mit allen Kreiseln */}
              <button type="button" class="section-link" onClick={() => setShowcase(true)} aria-label="Alle meine Kreisel ansehen">
                <h2>Meine Produkte</h2>
                <span class="section-link-hint">Alle ansehen ›</span>
              </button>
              {editing ? (
                <div class="btn-row-tight">
                  <button type="button" class="btn btn-sm" onClick={() => setAdding(true)}>
                    + Hinzufügen
                  </button>
                  <button type="button" class="btn btn-sm btn-primary" onClick={() => setEditing(false)}>
                    Fertig
                  </button>
                </div>
              ) : (
                <button type="button" class="btn btn-ghost" onClick={() => setEditing(true)}>
                  Bearbeiten
                </button>
              )}
            </div>
            <ul class={`list${editing ? ' editing' : ''}`}>
              {ownedProducts.map((p) => {
                const b = db.blades.find((x) => x.id === p.bladeId);
                return (
                  <li key={p.code} class="row">
                    <span class="code">{p.code.startsWith('TBA') ? 'neu' : p.code}</span>
                    <div class="row-main">
                      <span class="row-title">{nb(displayProductName(p, db))}</span>
                    </div>
                    {b && <TypeBadge type={b.type} small />}
                    {!editing ? (
                      <span class="count">{state.owned[p.code]}×</span>
                    ) : (
                      <div class="stepper stepper-sm" aria-label={`Anzahl ${p.name}`}>
                        <button type="button" onClick={() => changeOwned(p.code, -1)} aria-label={(state.owned[p.code] ?? 0) <= 1 ? `${p.name} aus der Sammlung entfernen` : 'Eins weniger'}>
                          {(state.owned[p.code] ?? 0) <= 1 ? '×' : '−'}
                        </button>
                        <span aria-live="polite">{state.owned[p.code]}</span>
                        <button type="button" onClick={() => changeOwned(p.code, 1)} aria-label="Eins mehr">
                          +
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
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
          <p>Tipp auf „Produkte hinzufügen“ und trag mit + ein, was du hast – oder nimm den Kauf-Check mit der Nummer von der Packung.</p>
          <button type="button" class="btn btn-primary" onClick={() => setAdding(true)}>
            Produkte hinzufügen
          </button>
        </Empty>
      )}
      <Section
        title={`Wunschliste${wishProducts.length ? ` (${wishProducts.length})` : ''}`}
        aside={
          <button type="button" class="btn btn-sm" onClick={() => setShop(true)}>
            🛒 Einkaufsmodus
          </button>
        }
      >
        {wishProducts.length ? (
          <div class="card wish-card">
            <ul class="list">
              {wishProducts.map((p) => {
                const price = priceHint(p, rates);
                const rel = releaseOf(p.code);
                return (
                  <li key={p.code} class="row">
                    <div class="row-main">
                      <span class="row-title">{nb(displayProductName(p, db))}</span>
                      <span class="row-sub">
                        {p.code} · {price ?? 'Preis unbekannt'}
                      </span>
                      {rel && (
                        <span class={`release-tag ${rel.status}`}>
                          {rel.status === 'new' ? `Neu erschienen (${fmtDate(rel.date)})` : rel.days === 0 ? 'Erscheint heute' : `Erscheint am ${fmtDate(rel.date)}`}
                        </span>
                      )}
                    </div>
                    <button type="button" class="buy-q" onClick={() => openCheck(p.code)} aria-label={`Soll ich ${p.name} kaufen?`}>
                      Kaufen?
                    </button>
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
            {upcoming.length > 0 && (
              <button type="button" class="btn" onClick={toCalendar}>
                🔔 {upcoming.length === 1 ? 'Release-Termin' : `${upcoming.length} Release-Termine`} in den Kalender
              </button>
            )}
            <p class="fineprint">
              Japan-Verkaufspreis (Takara Tomy) laut Beyblade Wiki{wishSum.missing ? `, ${wishSum.missing} ohne Preis` : ''}. In Thailand und Europa (Hasbro) weichen die Preise ab – als grober
              Richtwert zum Vergleichen.
              {rates && ` Kurs: EZB vom ${new Date(`${rates.date}T12:00:00`).toLocaleDateString('de-AT')}.`}
            </p>
          </div>
        ) : (
          <p class="muted">Tippe im Lexikon unter „Karten“ auf den Stern, um Kreisel vorzumerken. Hier siehst du dann, was sie ungefähr kosten.</p>
        )}
      </Section>

      <Advisor db={db} state={state} update={update} meta={meta} />
      {shop && <ShopMode db={db} state={state} update={update} meta={meta} onClose={() => setShop(false)} />}

      {unknownCodes.length > 0 && (
        <p class="fineprint">
          Nicht mehr in der Datenbank: {unknownCodes.join(', ')}{' '}
          <button type="button" class="link-btn" onClick={() => update((s) => ({ ...s, owned: Object.fromEntries(Object.entries(s.owned).filter(([c]) => !unknownCodes.includes(c))) }))}>
            entfernen
          </button>
        </p>
      )}

      <Section title="Sichern">
        <div class="card">
          <p class="muted">Deine Daten liegen auf diesem Gerät. Übertrag sie per QR-Code auf ein anderes Gerät oder sichere sie als Datei.</p>
          <div class="btn-row">
            <button type="button" class="btn btn-primary" onClick={() => setTransfer(true)}>
              Auf anderes Gerät
            </button>
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
      {transfer && <Transfer state={state} update={update} onClose={() => setTransfer(false)} />}
    </div>
  );
}
