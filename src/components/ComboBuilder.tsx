import { CompareCombos } from './CompareCombos';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Combo, Database, MetaFeed } from '../lib/types';
import { improveCombo, type Improvement } from '../lib/improve';
import { metaOpponents } from '../lib/battle';
import type { UserState } from '../lib/storage';
import { newId } from '../lib/storage';
import { analyze, nb, resolveCombo, TYPE_HINT } from '../lib/analysis';
import { ownedParts } from '../lib/data';
import { Empty, Section, SpinBadge, StatBar, TypeBadge } from './ui';
import { PartField } from './PartPicker';
import { Check, Scale, Sparkles } from 'lucide-preact';
import { ComboParts, ComboStage } from './ComboStage';
import { ConfirmSheet } from './ConfirmSheet';
import { SwipeRow } from './SwipeRow';
import { showUndo } from '../lib/undo';
import { displayName } from '../lib/names';
import { BitName } from './ui';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  presetBladeId?: string;
  presetRatchetId?: string;
  presetBitId?: string;
  /** Kennung der Vorgabe: eine Vorgabe wird nur einmal übernommen, danach gilt die eigene Auswahl. */
  presetKey?: number;
  /** aktuelle Turnier-Kombos – Gegner für „Kombo verbessern“ */
  meta?: MetaFeed | null;
}

// Angefangene Auswahl überlebt den Tab-Wechsel (die Komponente wird beim Wechsel abgebaut).
let draft = { bladeId: '', ratchetId: '', bitId: '' };
let usedPreset = 0;

export function ComboBuilder({ db, state, update, presetBladeId, presetRatchetId, presetBitId, presetKey = 0, meta = null }: Props) {
  const parts = useMemo(() => ownedParts(db, state.owned), [db, state.owned]);
  const hasCollection = parts.blades.size > 0;
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [start] = useState(() => {
    if (presetKey && presetKey !== usedPreset) {
      usedPreset = presetKey;
      return { bladeId: presetBladeId ?? '', ratchetId: presetRatchetId ?? '', bitId: presetBitId ?? '' };
    }
    return draft;
  });
  const [bladeId, setBladeId] = useState(start.bladeId);
  const [ratchetId, setRatchetId] = useState(start.ratchetId);
  const [bitId, setBitId] = useState(start.bitId);
  useEffect(() => {
    draft = { bladeId, ratchetId, bitId };
  }, [bladeId, ratchetId, bitId]);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  const useOwned = onlyOwned && hasCollection;
  const blades = useMemo(
    () => db.blades.filter((b) => !useOwned || parts.blades.has(b.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [db.blades, useOwned, parts.blades],
  );
  const ratchets = db.ratchets.filter((r) => !useOwned || parts.ratchets.has(r.id));
  const bits = useMemo(
    () => db.bits.filter((b) => !useOwned || parts.bits.has(b.id)).sort((a, b) => a.id.localeCompare(b.id)),
    [db.bits, useOwned, parts.bits],
  );

  // Auswahl nur gelten lassen, wenn sie in den (ggf. gefilterten) Listen vorkommt.
  const blade = blades.find((b) => b.id === bladeId);
  const bladeSel = blade ? bladeId : '';
  const ratchetSel = ratchets.some((r) => r.id === ratchetId) ? ratchetId : '';
  const bitSel = bits.some((b) => b.id === bitId) ? bitId : '';
  const integrated = !!blade?.integratedRatchet;
  const combo: Combo | null =
    bladeSel && bitSel ? { id: '', bladeId: bladeSel, bitId: bitSel, ratchetId: integrated ? undefined : ratchetSel || undefined } : null;
  const resolved = combo ? resolveCombo(db, combo) : null;
  const result = resolved ? analyze(resolved) : null;

  // „Kombo verbessern“: erst auf Knopfdruck rechnen, bei jeder Änderung der Kombo wieder zuklappen
  // „Vergleichen“ im Ergebnis öffnet den Vergleich weiter unten mit dieser Kombo (Zähler als Auslöser).
  const [compareSignal, setCompareSignal] = useState(0);
  const [improveOpen, setImproveOpen] = useState(false);
  const comboKey = combo ? `${combo.bladeId}|${combo.ratchetId ?? ''}|${combo.bitId}|${useOwned}` : '';
  useEffect(() => setImproveOpen(false), [comboKey]);
  const improvements = useMemo<Improvement[] | null>(() => {
    if (!improveOpen || !combo) return null;
    const { opponents } = metaOpponents(db, meta);
    const pool = useOwned
      ? { ratchets: [...parts.ratchets.keys()], bits: [...parts.bits.keys()] }
      : {
          ratchets: db.ratchets.map((r) => r.id),
          bits: db.bits.map((b) => b.id),
          owned: hasCollection ? { ratchets: new Set(parts.ratchets.keys()), bits: new Set(parts.bits.keys()) } : undefined,
        };
    // Abhängigkeit über comboKey (Kombo + Filter), damit nicht bei jedem Rendern neu gerechnet wird
    return improveCombo(db, combo, opponents, pool, meta);
  }, [improveOpen, comboKey, db, meta, parts]);
  const apply = (c: Combo) => {
    setRatchetId(c.ratchetId ?? '');
    setBitId(c.bitId);
  };

  const save = () => {
    if (!combo || !result?.valid) return;
    const c: Combo = { ...combo, id: newId(), name: name.trim() || undefined };
    update((s) => ({ ...s, combos: [c, ...s.combos] }));
    setName('');
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const random = () => {
    const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
    const b = pick(blades);
    const t = pick(bits);
    const r = pick(ratchets);
    if (!b || !t) return;
    setBladeId(b.id);
    setBitId(t.id);
    setRatchetId(b.integratedRatchet ? '' : (r?.id ?? ''));
  };

  return (
    <div class="stack">
      <Section
        title="Kombo bauen"
        aside={
          <button type="button" class="btn btn-ghost" onClick={random} disabled={!blades.length || !bits.length}>
            Zufall
          </button>
        }
      >
        <div class="card builder">
          {hasCollection && (
            <label class="toggle">
              <input type="checkbox" checked={onlyOwned} onChange={(e) => setOnlyOwned(e.currentTarget.checked)} />
              <span>Nur Teile aus meiner Sammlung</span>
            </label>
          )}
          <div class="layers">
            <PartField kind="blade" label="Blade" blades={blades} value={bladeSel} onChange={setBladeId} counts={useOwned ? parts.blades : undefined} />
            <PartField
              kind="ratchet"
              label="Ratchet"
              ratchets={ratchets}
              value={integrated ? '' : ratchetSel}
              onChange={setRatchetId}
              disabled={integrated}
              disabledText="In Blade integriert"
              counts={useOwned ? parts.ratchets : undefined}
            />
            <PartField kind="bit" label="Bit" bits={bits} value={bitSel} onChange={setBitId} counts={useOwned ? parts.bits : undefined} />
          </div>
          {useOwned && !blades.length && <p class="muted">In deiner Sammlung sind noch keine Blades.</p>}
        </div>
      </Section>

      {result && resolved ? (
        <div class={`card result type-edge-${result.type}`} aria-live="polite">
          <div class="result-head">
            <ComboStage resolved={resolved} />
            <div class="result-title">
              <p class="eyebrow">Deine Kombo</p>
              <h3 class="combo-name">{nb(result.label)}</h3>
              <div class="badges badges-left">
                <TypeBadge type={result.type} />
                <SpinBadge spin={resolved.blade.spin} />
              </div>
            </div>
          </div>
          <ComboParts resolved={resolved} />
          <div class="result-actions">
            <div class="result-actions-row">
              <button type="button" class={`btn improve-btn${improveOpen ? ' on' : ''}`} onClick={() => setImproveOpen((o) => !o)} aria-expanded={improveOpen}>
                <Sparkles aria-hidden="true" /> {improveOpen ? 'Vorschläge zu' : 'Verbessern'}
              </button>
              <button type="button" class="btn" onClick={() => setCompareSignal((n) => n + 1)}>
                <Scale aria-hidden="true" /> Vergleichen
              </button>
            </div>
            {improveOpen && improvements && (
              <div class="improve" aria-live="polite">
                {improvements.length ? (
                  <ul class="improve-list">
                    {improvements.map((s) => (
                      <li key={s.label} class="improve-item">
                        <div class="improve-main">
                          <span class="improve-label">{nb(s.label)}</span>
                          <span class="improve-change">{s.change}</span>
                          <span class="improve-why">
                            {s.gain > 0 && <span class="improve-tag good">+{s.gain} gegen Turnier-Kombos</span>}
                            {s.fixes.length > 0 && <span class="improve-tag fix">behebt: {s.fixes.map((f) => f.split(':')[0]).join(', ')}</span>}
                            {s.metaDecks >= 3 && <span class="improve-tag meta">im Turnier {s.metaDecks}× gespielt</span>}
                          </span>
                          {s.missing.length > 0 && <span class="improve-missing">Fehlt dir noch: {s.missing.join(', ')}</span>}
                        </div>
                        <button type="button" class="btn btn-sm btn-primary" onClick={() => apply(s.combo)}>
                          Übernehmen
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p class="muted">Mit {useOwned ? 'deinen Teilen' : 'den verfügbaren Teilen'} ist diese Blade so schon gut aufgestellt – ich finde keine klar bessere Ratchet/Bit-Kombination.</p>
                )}
                <p class="fineprint">Gerechnet gegen {meta?.combos?.length ? 'die aktuellen Turnier-Kombos' : 'typische Gegner'}. Blade bleibt gleich – getauscht werden nur Ratchet und Bit.</p>
              </div>
            )}
            <div class="save-row">
              <input
                type="text"
                placeholder="Name (optional)"
                maxLength={40}
                value={name}
                onInput={(e) => setName(e.currentTarget.value)}
                aria-label="Name der Kombo"
              />
              <button type="button" class="btn btn-primary" onClick={save} disabled={!result.valid}>
                {saved ? <><Check aria-hidden="true" /> Gespeichert</> : 'Speichern'}
              </button>
            </div>
          </div>

          <div class="block-head block-sep">
            <h4 class="block-h">Profil</h4>
            <span class="est-tag">Schätzwerte</span>
          </div>
          <p class="result-hint">{TYPE_HINT[result.type]}</p>
          <div class="stats">
            <StatBar label="Angriff" value={result.profile.attack} tone="attack" />
            <StatBar label="Ausdauer" value={result.profile.stamina} tone="stamina" />
            <StatBar label="Verteidigung" value={result.profile.defense} tone="defense" />
            <StatBar label="Burst-Schutz" value={result.profile.burstResistance} tone="balance" />
          </div>
          <p class="fineprint">
            Richtwerte aus Teile-Typen, Ratchet-Form{typeof resolved.blade.weightG === 'number' ? ` und dem echten Blade-Gewicht (${resolved.blade.weightG.toLocaleString('de-DE')} g)` : ''} – keine Messwerte.
          </p>
          {result.warnings.length > 0 && (
            <ul class="notes notes-warn">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          {result.tips.length > 0 && (
            <ul class="notes">
              {result.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <Empty title="Wähle Blade, Ratchet und Bit">Dann siehst du Typ, Profil und Hinweise zu deiner Kombo.</Empty>
      )}

      <CompareCombos db={db} initial={combo ? { bladeId: combo.bladeId, ratchetId: combo.ratchetId, bitId: combo.bitId } : undefined} openSignal={compareSignal} />
      <SavedCombos db={db} state={state} update={update} />
    </div>
  );
}

function SavedCombos({ db, state, update }: Props) {
  // Kombo, deren Löschen gerade bestätigt werden soll (Kennung – die Liste kann sich inzwischen ändern)
  const [pendingId, setPendingId] = useState<string | null>(null);
  if (!state.combos.length) return null;
  const toggleDeck = (id: string) =>
    update((s) => {
      if (s.deck.includes(id)) return { ...s, deck: s.deck.filter((d) => d !== id) };
      if (s.deck.length >= 3) return s;
      return { ...s, deck: [...s.deck, id] };
    });
  // Löschen erst nach Bestätigung im Dialog – Löschlogik unverändert, nur genau diese Kennung
  const remove = (id: string) => update((s) => ({ ...s, combos: s.combos.filter((c) => c.id !== id), deck: s.deck.filter((d) => d !== id) }));
  /** Weggewischt: sofort löschen, mit „Rückgängig“ (Kombo an alter Stelle, wieder im Deck, falls dort Platz ist) */
  const swipeRemove = (c: Combo, title: string) => {
    const at = state.combos.findIndex((x) => x.id === c.id);
    const deckAt = state.deck.indexOf(c.id);
    remove(c.id);
    showUndo(`Kombo „${title}“ gelöscht`, () =>
      update((s) => {
        if (s.combos.some((x) => x.id === c.id)) return s;
        const combos = [...s.combos.slice(0, at), c, ...s.combos.slice(at)];
        const deck = deckAt >= 0 && s.deck.length < 3 && !s.deck.includes(c.id) ? [...s.deck.slice(0, deckAt), c.id, ...s.deck.slice(deckAt)] : s.deck;
        return { ...s, combos, deck };
      }),
    );
  };
  const pending = pendingId ? state.combos.find((c) => c.id === pendingId) : undefined;
  const pendingParts = pending ? resolveCombo(db, pending) : null;
  return (
    <Section title={`Gespeichert (${state.combos.length})`}>
      <ul class="list">
        {state.combos.map((c) => {
          const r = resolveCombo(db, c);
          const a = r ? analyze(r) : null;
          const inDeck = state.deck.includes(c.id);
          return (
            <SwipeRow key={c.id} class="row" deleteLabel={`Kombo ${c.name ?? (a ? a.label : '')} löschen`.replace(/\s+/g, ' ')} onDelete={() => swipeRemove(c, c.name ?? (a ? a.label : 'Unbekannte Teile'))}>
              <div class="row-main">
                <span class="row-title">{c.name ?? (a ? nb(a.label) : 'Unbekannte Teile')}</span>
                {c.name && a && <span class="row-sub">{nb(a.label)}</span>}
              </div>
              {a && <TypeBadge type={a.type} small />}
              <button
                type="button"
                class={`chip${inDeck ? ' chip-on' : ''}`}
                onClick={() => toggleDeck(c.id)}
                disabled={!inDeck && state.deck.length >= 3}
                aria-pressed={inDeck}
              >
                {inDeck ? 'Im Deck' : '+ Deck'}
              </button>
              <button type="button" class="icon-btn" onClick={() => setPendingId(c.id)} aria-label={`Kombo ${c.name ?? (a ? a.label : '')} löschen`.replace(/\s+/g, ' ')} aria-haspopup="dialog">
                ×
              </button>
            </SwipeRow>
          );
        })}
      </ul>
      {pending && (
        <ConfirmSheet
          title="Kombo löschen?"
          note="Das lässt sich nicht rückgängig machen."
          confirmLabel="Löschen"
          onConfirm={() => remove(pending.id)}
          onClose={() => setPendingId(null)}
        >
          <p class="confirm-item">{pending.name ?? (pendingParts ? nb(analyze(pendingParts).label) : 'Unbekannte Teile')}</p>
          {pendingParts && (
            <p class="confirm-parts">
              <span>{displayName(pendingParts.blade)}</span>
              {pendingParts.ratchet && <span>{pendingParts.ratchet.id}</span>}
              <BitName bit={pendingParts.bit} />
            </p>
          )}
        </ConfirmSheet>
      )}
    </Section>
  );
}
