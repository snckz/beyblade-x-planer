import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Database, MetaFeed } from '../lib/types';
import type { UserState } from '../lib/storage';
import { newId } from '../lib/storage';
import { ownedParts } from '../lib/data';
import { ARCHETYPES, toBey, type Bey } from '../lib/battle';
import { optimizeDeck, type OptimizedDeck } from '../lib/optimizer';
import { nb } from '../lib/analysis';
import { BeyImage } from './BeyImage';
import { Section, TypeBadge } from './ui';
import { useApp } from '../lib/context';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  meta?: MetaFeed | null;
}

/** Stellt aus den eigenen Teilen das stärkste regelkonforme 3er-Deck gegen das aktuelle Turnier-Meta zusammen. */
export function DeckOptimizer({ db, state, update, meta }: Props) {
  const { bladeName } = useApp();
  const parts = useMemo(() => ownedParts(db, state.owned), [db, state.owned]);
  const hasParts = parts.blades.size >= 3;
  const [onlyOwned, setOnlyOwned] = useState(hasParts);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OptimizedDeck | null | undefined>(undefined);
  const [msg, setMsg] = useState('');

  const { opponents, vsMeta } = useMemo(() => {
    const fromMeta = (meta?.combos ?? []).map((c) => toBey(db, { id: '', bladeId: c.bladeId, ratchetId: c.ratchetId ?? undefined, bitId: c.bitId }));
    const list = fromMeta.filter((b): b is Bey => !!b && b.analysis.valid);
    if (list.length >= 3) return { opponents: list, vsMeta: true };
    return { opponents: ARCHETYPES.map((c) => toBey(db, c)).filter((b): b is Bey => !!b), vsMeta: false };
  }, [db, meta]);
  // Altes Ergebnis verwerfen, sobald sich Teile oder Gegner ändern – sonst ließe sich ein veraltetes Deck übernehmen.
  useEffect(() => setResult(undefined), [parts, opponents, onlyOwned]);

  const run = () => {
    setBusy(true);
    setMsg('');
    // Kurz warten, damit der Lade-Zustand sichtbar wird, bevor gerechnet wird.
    window.setTimeout(() => {
      const useOwned = onlyOwned && hasParts;
      const pool = useOwned
        ? { blades: [...parts.blades.keys()], ratchets: [...parts.ratchets.keys()], bits: [...parts.bits.keys()] }
        : { blades: db.blades.map((b) => b.id), ratchets: db.ratchets.map((r) => r.id), bits: db.bits.map((b) => b.id) };
      setResult(optimizeDeck(db, pool, opponents));
      setBusy(false);
    }, 30);
  };

  const adopt = () => {
    if (!result) return;
    update((s) => {
      // Schon gespeicherte gleiche Kombos wiederverwenden statt bei jedem Klick Duplikate anzulegen.
      const sameCombo = (a: { bladeId: string; ratchetId?: string; bitId: string }, b: typeof a) =>
        a.bladeId === b.bladeId && (a.ratchetId ?? '') === (b.ratchetId ?? '') && a.bitId === b.bitId;
      const fresh: UserState['combos'] = [];
      const ids = result.picks.map((p, i) => {
        const existing = s.combos.find((c) => sameCombo(c, p.combo));
        if (existing) return existing.id;
        const c = { id: newId(), name: `Optimiert ${i + 1}`, bladeId: p.combo.bladeId, ratchetId: p.combo.ratchetId, bitId: p.combo.bitId };
        fresh.push(c);
        return c.id;
      });
      return { ...s, combos: [...fresh, ...s.combos], deck: ids };
    });
    setMsg('Als dein Deck übernommen – oben siehst du es.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Section title="Deck-Optimierer">
      <div class="card glass stack-sm">
        <p class="muted">
          Sucht das stärkste Turnier-Deck (3 Kreisel, kein Teil doppelt) {vsMeta ? 'gegen die aktuellen Turnier-Kombos' : 'gegen typische Gegner'}.
        </p>
        <label class="toggle">
          <input type="checkbox" checked={onlyOwned && hasParts} disabled={!hasParts} onChange={(e) => setOnlyOwned(e.currentTarget.checked)} />
          <span>{hasParts ? 'Nur Teile aus meiner Sammlung' : 'Für „nur meine Teile“ brauchst du mind. 3 Blades in der Sammlung'}</span>
        </label>
        <button type="button" class="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? 'Rechne …' : 'Bestes Deck finden'}
        </button>

        {result === null && <p class="muted">Mit diesen Teilen geht kein regelkonformes Deck – es fehlen unterschiedliche Ratchets oder Bits.</p>}
        {result && (
          <>
            <ul class="list">
              {result.picks.map((p, i) => (
                <li key={i} class="row">
                  <span class="slot-no">{i + 1}</span>
                  <BeyImage bladeId={p.bey.resolved.blade.id} type={p.bey.resolved.blade.type} size="sm" alt={bladeName(p.bey.resolved.blade)} zoomable={false} />
                  <div class="row-main">
                    <span class="row-title">
                      {bladeName(p.bey.resolved.blade)} {nb(`${p.bey.resolved.ratchet?.id ?? ''}${p.bey.resolved.bit.id}`)}
                    </span>
                    <span class="row-sub">
                      {p.score >= 0 ? '+' : ''}
                      {Math.round(p.score)} im Schnitt gegen {opponents.length} Gegner
                    </span>
                  </div>
                  <TypeBadge type={p.bey.analysis.type} small />
                </li>
              ))}
            </ul>
            <p class="fineprint">{result.checked.toLocaleString('de-DE')} Kombos geprüft. Richtwerte aus Typ, Profil, Gewicht und Drehrichtung – kein Ersatz fürs Testen im Stadion.</p>
            <button type="button" class="btn" onClick={adopt}>
              Als mein Deck übernehmen
            </button>
          </>
        )}
        {msg && (
          <p class="muted" role="status">
            {msg}
          </p>
        )}
      </div>
    </Section>
  );
}
