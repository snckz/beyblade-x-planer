import { useMemo, useState } from 'preact/hooks';
import type { Combo, Database } from '../lib/types';
import type { UserState } from '../lib/storage';
import { newId } from '../lib/storage';
import { analyze, nb, resolveCombo, TYPE_HINT } from '../lib/analysis';
import { ownedParts } from '../lib/data';
import { Empty, Section, SpinBadge, StatBar, TypeBadge } from './ui';
import { BeyImage } from './BeyImage';
import { useApp } from '../lib/context';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  presetBladeId?: string;
}

export function ComboBuilder({ db, state, update, presetBladeId }: Props) {
  const { openBlade } = useApp();
  const parts = useMemo(() => ownedParts(db, state.owned), [db, state.owned]);
  const hasCollection = parts.blades.size > 0;
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [bladeId, setBladeId] = useState(presetBladeId ?? '');
  const [ratchetId, setRatchetId] = useState('');
  const [bitId, setBitId] = useState('');
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
            <label class="field">
              <span class="field-label">
                <span class="layer-dot l1" />
                Blade
              </span>
              <select value={bladeSel} onChange={(e) => setBladeId(e.currentTarget.value)}>
                <option value="">Blade wählen …</option>
                {(['BX', 'UX', 'CX'] as const).map((line) => (
                  <optgroup key={line} label={`${line}-Linie`}>
                    {blades
                      .filter((b) => b.line === line)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                          {b.spin === 'left' ? ' ↺' : ''}
                          {useOwned ? ` (${parts.blades.get(b.id)}×)` : ''}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label class="field">
              <span class="field-label">
                <span class="layer-dot l2" />
                Ratchet
              </span>
              <select value={integrated ? '' : ratchetSel} disabled={integrated} onChange={(e) => setRatchetId(e.currentTarget.value)}>
                <option value="">{integrated ? 'In Blade integriert' : 'Ratchet wählen …'}</option>
                {ratchets.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id}
                    {r.heightMm !== null ? ` · ${r.heightMm.toFixed(1)} mm` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label class="field">
              <span class="field-label">
                <span class="layer-dot l3" />
                Bit
              </span>
              <select value={bitSel} onChange={(e) => setBitId(e.currentTarget.value)}>
                <option value="">Bit wählen …</option>
                {bits.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} – {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {useOwned && !blades.length && <p class="muted">In deiner Sammlung sind noch keine Blades.</p>}
        </div>
      </Section>

      {result && resolved ? (
        <div class={`card result type-edge-${result.type}`} aria-live="polite">
          <div class="result-head">
            <button type="button" class="img-btn" onClick={() => openBlade(resolved.blade.id)} aria-label={`${resolved.blade.name}: Details`}>
              <BeyImage bladeId={resolved.blade.id} type={result.type} size="md" alt={resolved.blade.name} />
            </button>
            <div class="result-title">
              <p class="eyebrow">Deine Kombo</p>
              <h3 class="combo-name">{nb(result.label)}</h3>
            </div>
            <div class="badges">
              <TypeBadge type={result.type} />
              <SpinBadge spin={resolved.blade.spin} />
            </div>
          </div>
          <p class="muted">{TYPE_HINT[result.type]}</p>
          <div class="stats">
            <StatBar label="Angriff" value={result.profile.attack} tone="attack" />
            <StatBar label="Ausdauer" value={result.profile.stamina} tone="stamina" />
            <StatBar label="Verteidigung" value={result.profile.defense} tone="defense" />
            <StatBar label="Burst-Schutz" value={result.profile.burstResistance} tone="balance" />
          </div>
          <p class="fineprint">Richtwerte aus Teile-Typen und Ratchet-Form, keine Messwerte.</p>
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
              {saved ? 'Gespeichert ✓' : 'Speichern'}
            </button>
          </div>
        </div>
      ) : (
        <Empty title="Wähle Blade, Ratchet und Bit">Dann siehst du Typ, Profil und Hinweise zu deiner Kombo.</Empty>
      )}

      <SavedCombos db={db} state={state} update={update} />
    </div>
  );
}

function SavedCombos({ db, state, update }: Props) {
  if (!state.combos.length) return null;
  const toggleDeck = (id: string) =>
    update((s) => {
      if (s.deck.includes(id)) return { ...s, deck: s.deck.filter((d) => d !== id) };
      if (s.deck.length >= 3) return s;
      return { ...s, deck: [...s.deck, id] };
    });
  const remove = (id: string) => {
    if (!window.confirm('Kombo löschen?')) return;
    update((s) => ({ ...s, combos: s.combos.filter((c) => c.id !== id), deck: s.deck.filter((d) => d !== id) }));
  };
  return (
    <Section title={`Gespeichert (${state.combos.length})`}>
      <ul class="list">
        {state.combos.map((c) => {
          const r = resolveCombo(db, c);
          const a = r ? analyze(r) : null;
          const inDeck = state.deck.includes(c.id);
          return (
            <li key={c.id} class="row">
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
              <button type="button" class="icon-btn" onClick={() => remove(c.id)} aria-label="Kombo löschen">
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
