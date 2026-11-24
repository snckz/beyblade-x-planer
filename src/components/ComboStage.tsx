import { tr } from '../lib/i18n';
import type { Resolved } from '../lib/analysis';
import { displayName } from '../lib/names';
import { useApp } from '../lib/context';
import { BladePhoto } from './BeyImage';
import { BitImage, RatchetImage } from './BitImage';
import { BitName } from './ui';
import { ChevronRight } from 'lucide-preact';

/**
 * Bild der Kombo im Ergebnis. Heute zeigt die Bühne das echte Blade-Foto – freigestellt wie in Auswahl und Steckbrief
 * (BladePhoto), auf einer Graphit-Fläche statt auf Weiß. Ratchet und Bit stehen darunter in der Teileleiste (ComboParts):
 * Es gibt pro Teil nur ein Einzelfoto, eine zusammengesetzte Ansicht würde eine Montage vortäuschen.
 * Die Komponente bekommt bewusst die ganze Kombo (Blade, Ratchet, Bit): Soll später eine Kombo-Ansicht aus allen
 * drei Teilen entstehen, wird nur diese Komponente ersetzt – Aufrufer und Layout bleiben gleich.
 */
export function ComboStage({ resolved }: { resolved: Resolved }) {
  const { blade } = resolved;
  return (
    <span class={`combo-stage aura-${blade.type}`}>
      <BladePhoto blade={blade} alt={displayName(blade)} variant="hero" sharp zoomable />
    </span>
  );
}

/** Die drei Teile der Kombo nebeneinander: Foto, Art, Bezeichnung. Die Blade führt in ihren Steckbrief. */
export function ComboParts({ resolved }: { resolved: Resolved }) {
  const { openBlade } = useApp();
  const { blade, ratchet, bit } = resolved;
  return (
    <ul class="combo-parts" aria-label={tr('Teile dieser Kombo')}>
      <li>
        <button type="button" class="combo-part combo-part-link" onClick={() => openBlade(blade.id)} aria-label={tr('Blade {0}: Steckbrief öffnen', displayName(blade))}>
          <span class="combo-part-art">
            <BladePhoto blade={blade} alt="" variant="card" />
          </span>
          <span class="combo-part-kind">Blade</span>
          <span class="combo-part-name">
            {displayName(blade)}
            <ChevronRight aria-hidden="true" />
          </span>
        </button>
      </li>
      <li class="combo-part">
        <span class="combo-part-art">{ratchet ? <RatchetImage ratchet={ratchet} size="card" /> : <span class="combo-part-none" aria-hidden="true" />}</span>
        <span class="combo-part-kind">Ratchet</span>
        <span class="combo-part-name">{ratchet ? ratchet.id : tr('in der Blade')}</span>
      </li>
      <li class="combo-part">
        <span class="combo-part-art">
          <BitImage bit={bit} size="card" />
        </span>
        <span class="combo-part-kind">Bit</span>
        <span class="combo-part-name">
          <BitName bit={bit} />
        </span>
      </li>
    </ul>
  );
}
