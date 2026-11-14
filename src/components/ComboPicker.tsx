import type { Combo, Database } from '../lib/types';
import { PartField } from './PartPicker';

/** Kompakte Auswahl Blade + Ratchet + Bit (Gegner-Deck, Battle-Tagebuch). */
export function ComboPicker({ db, value, onChange, label }: { db: Database; value: Combo; onChange: (c: Combo) => void; label: string }) {
  const blade = db.blades.find((b) => b.id === value.bladeId);
  const integrated = !!blade?.integratedRatchet;
  return (
    <div class="picker" role="group" aria-label={label}>
      <PartField
        compact
        kind="blade"
        label="Blade"
        blades={db.blades}
        value={value.bladeId}
        onChange={(id) => {
          const b = db.blades.find((x) => x.id === id);
          onChange({ ...value, bladeId: id, ratchetId: b?.integratedRatchet ? undefined : (value.ratchetId ?? '3-60') });
        }}
      />
      <PartField
        compact
        kind="ratchet"
        label="Ratchet"
        ratchets={db.ratchets}
        value={integrated ? '' : (value.ratchetId ?? '')}
        disabled={integrated}
        disabledText="integriert"
        onChange={(id) => onChange({ ...value, ratchetId: id })}
      />
      <PartField compact kind="bit" label="Bit" bits={[...db.bits].sort((a, b) => a.id.localeCompare(b.id))} value={value.bitId} onChange={(id) => onChange({ ...value, bitId: id })} />
    </div>
  );
}
