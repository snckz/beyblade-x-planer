import { tr } from '../lib/i18n';
import type { Database } from '../lib/types';
import type { UserState } from '../lib/storage';
import { analyze, checkDeck, nb, resolveCombo, TYPE_LABEL } from '../lib/analysis';
import { Empty, Section, SpinBadge, TypeChip } from './ui';
import { BladePhoto } from './BeyImage';
import { DeckPicker, DEFAULT_DECK, type Part } from './DeckPicker';
import { newId } from '../lib/storage';
import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../lib/context';
import { deckFile, renderDeckImage } from '../lib/deckImage';
import { DeckExportSheet } from './DeckExportSheet';
import { Check, ChevronDown, ChevronUp, Share } from 'lucide-preact';

interface Props {
  db: Database;
  state: UserState;
  update: (fn: (s: UserState) => UserState) => void;
  goToBuilder: () => void;
}

export function Deck({ db, state, update, goToBuilder }: Props) {
  const combos = state.deck.map((id) => state.combos.find((c) => c.id === id)).filter((c) => c !== undefined);
  const check = checkDeck(db, combos);
  const missingTypes = (['attack', 'defense', 'stamina'] as const).filter((t) => !check.types.includes(t));
  const { images } = useApp();
  const [building, setBuilding] = useState(false);
  const [draft, setDraft] = useState<Part[]>(DEFAULT_DECK);
  const saveDraft = () =>
    update((s) => {
      const list = draft.map((p, i) => s.combos.find((c) => c.bladeId === p.bladeId && (c.ratchetId ?? '') === (p.ratchetId ?? '') && c.bitId === p.bitId) ?? { id: newId(), name: tr('Deck {0}', i + 1), ...p });
      const fresh = list.filter((c) => !s.combos.includes(c));
      return { ...s, combos: [...fresh, ...s.combos], deck: list.map((c) => c.id) };
    });
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  // Fertiges Bild im Hochformat; weitere Formate erzeugt die Vorschau bei Bedarf über makeImage
  const [img, setImg] = useState<File | null>(null);
  // Deck geändert → altes Bild nicht mehr teilen
  const deckKey = combos.map((c) => `${c.bladeId}|${c.ratchetId ?? ''}|${c.bitId}`).join(',');
  useEffect(() => setImg(null), [deckKey]);
  // Schritt 1: Bild erzeugen (dauert kurz) und in der Vorschau zeigen. Schritt 2: „In Fotos sichern“/„Teilen“ in der
  // Vorschau rufen share() direkt im Tipp auf – sonst blockt iOS.
  const create = async () => {
    if (sharing) return;
    setSharing(true);
    setShareMsg('');
    try {
      const file = deckFile(await renderDeckImage(db, combos, images));
      setImg(file);
    } catch {
      setShareMsg(tr('Das Bild konnte nicht erstellt werden.'));
    } finally {
      setSharing(false);
    }
  };

  const move = (i: number, dir: -1 | 1) =>
    update((s) => {
      const deck = [...s.deck];
      const j = i + dir;
      if (j < 0 || j >= deck.length) return s;
      [deck[i], deck[j]] = [deck[j]!, deck[i]!];
      return { ...s, deck };
    });

  if (!combos.length) {
    if (building)
      return (
        <Section title={tr('Deck zusammenstellen')}>
          <div class="card glass stack-sm">
            <p class="muted">{tr('Wähle deine 3 Kreisel. Im Turnier darf kein Blade, Ratchet oder Bit doppelt vorkommen.')}</p>
            <DeckPicker db={db} value={draft} onChange={setDraft} label={tr('Kreisel')} />
            <div class="btn-row">
              <button type="button" class="btn btn-primary" onClick={saveDraft} disabled={!draft.every((p) => resolveCombo(db, { id: '', ...p }))}>
                {tr('Als mein Deck speichern')}
              </button>
              <button type="button" class="btn btn-ghost" onClick={() => setBuilding(false)}>
                {tr('Abbrechen')}
              </button>
            </div>
          </div>
        </Section>
      );
    return (
      <Empty title={tr('Noch kein Deck')}>
        <p>{tr('Ein Turnier-Deck hat 3 Kreisel ohne doppelte Teile. Stell es direkt hier zusammen.')}</p>
        <div class="btn-row" style={{ justifyContent: 'center' }}>
          <button type="button" class="btn btn-primary" onClick={() => setBuilding(true)}>
            {tr('3er-Deck zusammenstellen')}
          </button>
          <button type="button" class="btn" onClick={goToBuilder}>
            {tr('Kombo bauen')}
          </button>
        </div>
      </Empty>
    );
  }

  return (
    <div class="stack">
      <Section title={tr('Mein Deck ({0}/3)', combos.length)}>
        <ol class="deck">
          {combos.map((c, i) => {
            const r = resolveCombo(db, c);
            const a = r ? analyze(r) : null;
            return (
              <li key={c.id} class={`card deck-slot ${a ? `type-edge-${a.type}` : ''}`}>
                <span class="slot-no">{i + 1}</span>
                {r && a && (
                  <span class={`saved-art aura-${a.type}`}>
                    <BladePhoto blade={r.blade} alt="" variant="card" />
                  </span>
                )}
                <div class="row-main">
                  <span class="row-title">{c.name ?? (a ? nb(a.label) : tr('Unbekannte Teile'))}</span>
                  {c.name && a && <span class="row-sub">{nb(a.label)}</span>}
                  {r && a && (
                    <span class="saved-badges">
                      <span class="mini-badge">{r.blade.line}</span>
                      <TypeChip type={a.type} />
                      <SpinBadge spin={r.blade.spin} />
                    </span>
                  )}
                </div>
                <div class="row-side">
                  <div class="reorder">
                    <button type="button" class="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={tr('Nach oben')}>
                      <ChevronUp aria-hidden="true" />
                    </button>
                    <button type="button" class="icon-btn" onClick={() => move(i, 1)} disabled={i === combos.length - 1} aria-label={tr('Nach unten')}>
                      <ChevronDown aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      onClick={() => update((s) => ({ ...s, deck: s.deck.filter((d) => d !== c.id) }))}
                      aria-label={tr('Aus Deck entfernen')}
                    >
                      ×
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Section>

      <div class={`card check ${check.ok ? 'check-ok' : 'check-bad'}`} role="status">
        <p class="check-title">{check.ok ? <><Check aria-hidden="true" /> {tr('Turnier-tauglich')}</> : tr('Noch nicht turnier-tauglich')}</p>
        {check.problems.length > 0 && (
          <ul class="notes notes-warn">
            {check.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {combos.length === 3 && missingTypes.length > 0 && (
          <p class="muted">
            {tr('Tipp: Dir fehlt noch')} {missingTypes.map((t) => TYPE_LABEL[t]).join(tr(' und '))} {tr('– ein gemischtes Deck kontert mehr Gegner.')}
          </p>
        )}
        <p class="fineprint">{tr('Regeln können je nach Veranstalter abweichen – vor dem Turnier kurz nachfragen.')}</p>
      </div>
      {/* Nicht „disabled“: Der Knopf soll den Fokus behalten, damit er ihn nach dem Schließen der Vorschau zurückbekommt */}
      <button type="button" class="btn" onClick={create} aria-busy={sharing}>
        {sharing ? tr('Bild wird erstellt …') : <><Share aria-hidden="true" /> {tr('Deck als Bild teilen')}</>}
      </button>
      {img && <DeckExportSheet initial={img} make={async (format) => deckFile(await renderDeckImage(db, combos, images, undefined, format), format)} onClose={() => setImg(null)} />}
      {shareMsg && (
        <p class="muted" role="status">
          {shareMsg}
        </p>
      )}
    </div>
  );
}
