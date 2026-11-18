import type { Combo, Database } from '../lib/types';
import { PartField } from './PartPicker';
import { playableParts } from '../lib/useRelease';

/** Kompakte Auswahl Blade + Ratchet + Bit (Gegner-Deck, Battle-Tagebuch). */
export function ComboPicker({ db, value, onChange, label }: { db: Database; value: Combo; onChange: (c: Combo) => void; label: string }) {
  const blade = db.blades.find((b) => b.id === value.bladeId);
  const integrated = !!blade?.integratedRatchet;
  // Nur freigegebene Teile wählbar; ein schon eingetragenes (inzwischen gesperrtes) Teil bleibt sichtbar, damit nichts verloren geht.
  const play = playableParts(db);
  const keep = <T extends { id: string }>(list: T[], all: T[], id?: string) => (id && !list.some((x) => x.id === id) ? [...list, ...all.filter((x) => x.id === id)] : list);
  const blades = keep(play.blades, db.blades, value.bladeId);
  const ratchets = keep(play.ratchets, db.ratchets, value.ratchetId);
  const bits = keep(play.bits, db.bits, value.bitId).sort((a, b) => a.id.localeCompare(b.id));
  return (
    <div class="picker" role="group" aria-label={label}>
      <PartField
        compact
        kind="blade"
        label="Blade"
        blades={blades}
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
        ratchets={ratchets}
        value={integrated ? '' : (value.ratchetId ?? '')}
        disabled={integrated}
        disabledText="integriert"
        onChange={(id) => onChange({ ...value, ratchetId: id })}
      />
      <PartField compact kind="bit" label="Bit" bits={bits} value={value.bitId} onChange={(id) => onChange({ ...value, bitId: id })} />
    </div>
  );
}
