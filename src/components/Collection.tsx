import { useMemo, useRef, useState } from 'preact/hooks';
import type { Database } from '../lib/types';
import type { UserState } from '../lib/storage';
import { exportState, importState } from '../lib/storage';
import { ownedParts } from '../lib/data';
import { Empty, Section, TypeBadge } from './ui';

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
  const ownedProducts = db.products.filter((p) => (state.owned[p.code] ?? 0) > 0);
  const unknownCodes = Object.keys(state.owned).filter((c) => !db.products.some((p) => p.code === c));
  const total = ownedProducts.reduce((n, p) => n + (state.owned[p.code] ?? 0), 0);

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
                      <span class="row-title">{p.name}</span>
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
