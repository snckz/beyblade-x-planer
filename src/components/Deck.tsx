import type { Database } from '../lib/types';
import type { UserState } from '../lib/storage';
import { analyze, checkDeck, nb, resolveCombo, TYPE_LABEL } from '../lib/analysis';
import { Empty, Section, SpinBadge, TypeBadge } from './ui';
import { BeyImage } from './BeyImage';
import { DeckPicker, DEFAULT_DECK, type Part } from './DeckPicker';
import { newId } from '../lib/storage';
import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../lib/context';
import { canShareFile, deckFile, renderDeckImage } from '../lib/deckImage';

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
      const list = draft.map((p, i) => s.combos.find((c) => c.bladeId === p.bladeId && (c.ratchetId ?? '') === (p.ratchetId ?? '') && c.bitId === p.bitId) ?? { id: newId(), name: `Deck ${i + 1}`, ...p });
      const fresh = list.filter((c) => !s.combos.includes(c));
      return { ...s, combos: [...fresh, ...s.combos], deck: list.map((c) => c.id) };
    });
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [img, setImg] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => () => img && URL.revokeObjectURL(img.url), [img]);
  // Deck geändert → altes Bild nicht mehr teilen
  const deckKey = combos.map((c) => `${c.bladeId}|${c.ratchetId ?? ''}|${c.bitId}`).join(',');
  useEffect(() => setImg(null), [deckKey]);
  // Schritt 1: Bild erzeugen (dauert kurz). Schritt 2: „Teilen“ ruft share() direkt im Tipp auf – sonst blockt iOS.
  const create = async () => {
    setSharing(true);
    setShareMsg('');
    try {
      const file = deckFile(await renderDeckImage(db, combos, images));
      setImg({ file, url: URL.createObjectURL(file) });
    } catch {
      setShareMsg('Das Bild konnte nicht erstellt werden.');
    } finally {
      setSharing(false);
    }
  };
  const share = () => {
    if (!img) return;
    navigator.share({ files: [img.file], title: 'Mein Beyblade-X-Deck' }).catch((e: Error) => {
      if (e.name !== 'AbortError') setShareMsg('Teilen ging nicht – halte das Bild gedrückt, um es zu sichern.');
    });
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
        <Section title="Deck zusammenstellen">
          <div class="card glass stack-sm">
            <p class="muted">Wähle deine 3 Kreisel. Im Turnier darf kein Blade, Ratchet oder Bit doppelt vorkommen.</p>
            <DeckPicker db={db} value={draft} onChange={setDraft} label="Kreisel" />
            <div class="btn-row">
              <button type="button" class="btn btn-primary" onClick={saveDraft} disabled={!draft.every((p) => resolveCombo(db, { id: '', ...p }))}>
                Als mein Deck speichern
              </button>
              <button type="button" class="btn btn-ghost" onClick={() => setBuilding(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        </Section>
      );
    return (
      <Empty title="Noch kein Deck">
        <p>Ein Turnier-Deck hat 3 Kreisel ohne doppelte Teile. Stell es direkt hier zusammen.</p>
        <div class="btn-row" style={{ justifyContent: 'center' }}>
          <button type="button" class="btn btn-primary" onClick={() => setBuilding(true)}>
            3er-Deck zusammenstellen
          </button>
          <button type="button" class="btn" onClick={goToBuilder}>
            Kombo bauen
          </button>
        </div>
      </Empty>
    );
  }

  return (
    <div class="stack">
      <Section title={`Mein Deck (${combos.length}/3)`}>
        <ol class="deck">
          {combos.map((c, i) => {
            const r = resolveCombo(db, c);
            const a = r ? analyze(r) : null;
            return (
              <li key={c.id} class={`card deck-slot ${a ? `type-edge-${a.type}` : ''}`}>
                <span class="slot-no">{i + 1}</span>
                {r && a && <BeyImage bladeId={r.blade.id} type={a.type} size="sm" alt={r.blade.name} />}
                <div class="row-main">
                  <span class="row-title">{c.name ?? (a ? nb(a.label) : 'Unbekannte Teile')}</span>
                  {c.name && a && <span class="row-sub">{nb(a.label)}</span>}
                  <span class="badges badges-left">
                    {a && <TypeBadge type={a.type} small />}
                    {r && <SpinBadge spin={r.blade.spin} />}
                  </span>
                </div>
                <div class="row-side">
                  <div class="reorder">
                    <button type="button" class="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Nach oben">
                      ↑
                    </button>
                    <button type="button" class="icon-btn" onClick={() => move(i, 1)} disabled={i === combos.length - 1} aria-label="Nach unten">
                      ↓
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      onClick={() => update((s) => ({ ...s, deck: s.deck.filter((d) => d !== c.id) }))}
                      aria-label="Aus Deck entfernen"
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
        <p class="check-title">{check.ok ? '✓ Turnier-tauglich' : 'Noch nicht turnier-tauglich'}</p>
        {check.problems.length > 0 && (
          <ul class="notes notes-warn">
            {check.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {combos.length === 3 && missingTypes.length > 0 && (
          <p class="muted">
            Tipp: Dir fehlt noch {missingTypes.map((t) => TYPE_LABEL[t]).join(' und ')} – ein gemischtes Deck kontert mehr Gegner.
          </p>
        )}
        <p class="fineprint">Regeln können je nach Veranstalter abweichen – vor dem Turnier kurz nachfragen.</p>
      </div>
      {img ? (
        <div class="card deck-share stack-sm">
          <img src={img.url} alt="Dein Deck als Bild" width={1080} height={1350} />
          <div class="btn-row">
            {canShareFile(img.file) && (
              <button type="button" class="btn btn-primary" onClick={share}>
                📤 Teilen
              </button>
            )}
            <a class="btn" href={img.url} download="beyblade-deck.png">
              Speichern
            </a>
            <button type="button" class="btn btn-ghost" onClick={() => setImg(null)}>
              Schließen
            </button>
          </div>
          <p class="fineprint">Auf dem iPhone: Bild gedrückt halten → „Zu Fotos hinzufügen“.</p>
        </div>
      ) : (
        <button type="button" class="btn" onClick={create} disabled={sharing}>
          {sharing ? 'Bild wird erstellt …' : '📤 Deck als Bild teilen'}
        </button>
      )}
      {shareMsg && (
        <p class="muted" role="status">
          {shareMsg}
        </p>
      )}
    </div>
  );
}
