import type { Resolved } from '../lib/analysis';
import { displayName } from '../lib/names';
import { useApp } from '../lib/context';
import { BeyImage, BladeStage } from './BeyImage';
import { BitImage, RatchetImage } from './BitImage';
import { ChevronRight } from 'lucide-preact';

/**
 * Bild der Kombo im Ergebnis. Heute zeigt die Bühne das echte Blade-Foto.
 * Die Komponente bekommt bewusst die ganze Kombo (Blade, Ratchet, Bit): Soll später eine
 * zusammengesetzte Ansicht aus allen drei Teilen entstehen, wird nur diese Komponente ersetzt –
 * Aufrufer und Layout bleiben gleich.
 */
export function ComboStage({ resolved }: { resolved: Resolved }) {
  return <BladeStage blade={resolved.blade} name={displayName(resolved.blade)} size="xl" sharp />;
}

/** Die drei Teile der Kombo nebeneinander: Foto, Art, Bezeichnung. Die Blade führt in ihren Steckbrief. */
export function ComboParts({ resolved }: { resolved: Resolved }) {
  const { openBlade } = useApp();
  const { blade, ratchet, bit } = resolved;
  return (
    <ul class="combo-parts" aria-label="Teile dieser Kombo">
      <li>
        <button type="button" class="combo-part combo-part-link" onClick={() => openBlade(blade.id)} aria-label={`Blade ${displayName(blade)}: Steckbrief öffnen`}>
          <BeyImage bladeId={blade.id} type={blade.type} size="sm" alt="" zoomable={false} />
          <span class="combo-part-kind">Blade</span>
          <span class="combo-part-name">
            {displayName(blade)}
            <ChevronRight aria-hidden="true" />
          </span>
        </button>
      </li>
      <li class="combo-part">
        {ratchet ? <RatchetImage ratchet={ratchet} /> : <span class="combo-part-none" aria-hidden="true" />}
        <span class="combo-part-kind">Ratchet</span>
        <span class="combo-part-name">{ratchet ? ratchet.id : 'in der Blade'}</span>
      </li>
      <li class="combo-part">
        <BitImage bit={bit} />
        <span class="combo-part-kind">Bit</span>
        <span class="combo-part-name">
          {bit.id}
          {bit.name && bit.name !== bit.id && <small>{bit.name}</small>}
        </span>
      </li>
    </ul>
  );
}
