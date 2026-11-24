import { tr } from '../lib/i18n';
import type { Combo, Database } from '../lib/types';
import { checkDeck, deckSizeProblem } from '../lib/analysis';
import { ComboPicker } from './ComboPicker';

export type Part = Omit<Combo, 'id' | 'name'>;
export const toPart = (c: Combo): Part => ({ bladeId: c.bladeId, ratchetId: c.ratchetId, bitId: c.bitId });

/** Startwerte, falls noch nichts gewählt ist: drei Kreisel ohne doppelte Teile. */
export const DEFAULT_DECK: Part[] = [
  { bladeId: 'DranSword', ratchetId: '3-60', bitId: 'F' },
  { bladeId: 'WizardRod', ratchetId: '5-70', bitId: 'DB' },
  { bladeId: 'KnightShield', ratchetId: '3-80', bitId: 'N' },
];

/** 1–3 Kreisel nebeneinander wählen (3er-Deck), mit Hinweis auf doppelte Teile. */
export function DeckPicker({ db, value, onChange, label }: { db: Database; value: Part[]; onChange: (v: Part[]) => void; label: string }) {
  const check = value.length === 3 ? checkDeck(db, value.map((p, i) => ({ id: String(i), ...p }))) : null;
  const dupes = check?.problems.filter((p) => p !== deckSizeProblem(value.length)) ?? [];
  return (
    <div class="deck-picker stack-sm">
      {value.map((p, i) => (
        <div key={i} class="deck-pick">
          <span class="slot-no">{i + 1}</span>
          <ComboPicker
            db={db}
            value={{ id: `${label}-${i}`, ...p }}
            label={`${label} ${i + 1}`}
            onChange={(c) => onChange(value.map((x, j) => (j === i ? toPart(c) : x)))}
          />
        </div>
      ))}
      {dupes.length > 0 && (
        <p class="fineprint deck-warn" role="status">
          {dupes.join(' ')} {tr('Im Turnier darf kein Teil doppelt vorkommen.')}
        </p>
      )}
    </div>
  );
}
