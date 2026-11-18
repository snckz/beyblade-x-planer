import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { attachSwipeRow, type SwipeRowHandle } from '../lib/swipeRow';
import { Trash2 } from 'lucide-preact';

interface Props {
  /** Klassen der eigentlichen Zeile bzw. Karte (z. B. `row`, `tile-bey aura-attack`) */
  class: string;
  /** Beschriftung des Papierkorbs, z. B. „Kombo Wizard Rod löschen“ */
  deleteLabel: string;
  onDelete: () => void;
  /**
   * Der Papierkorb ist der einzige Weg zum Löschen (kein × in der Zeile): Dann bleibt er für VoiceOver und Tastatur
   * immer erreichbar und öffnet den Eintrag, sobald er angesteuert wird. Sonst nur bei offenem Eintrag.
   */
  onlyDelete?: boolean;
  children: ComponentChildren;
}

/**
 * Listeneintrag mit Wischen zum Löschen wie in iOS (lib/swipeRow.ts): nach links wischen → roter Papierkorb.
 * Der Papierkorb ist nur bei offenem Eintrag erreichbar; ohne Wischen bleiben die normalen Knöpfe (×, Bearbeiten).
 */
export function SwipeRow({ class: cls, deleteLabel, onDelete, onlyDelete = false, children }: Props) {
  const ref = useRef<HTMLLIElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const del = useRef(onDelete);
  del.current = onDelete;
  const [open, setOpen] = useState(false);
  const handle = useRef<SwipeRowHandle | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !content.current || !action.current) return;
    return (handle.current = attachSwipeRow(el, { content: content.current, action: action.current, onDelete: () => del.current(), onOpenChange: setOpen }));
  }, []);
  const reachable = open || onlyDelete;
  return (
    <li ref={ref} class="swipe-row">
      <div ref={content} class={`swipe-content ${cls}`}>
        {children}
      </div>
      {/* Nach dem Inhalt: gleiche Lesereihenfolge wie auf dem Bildschirm (liegt per z-index darunter) */}
      <button
        ref={action}
        type="button"
        class="swipe-delete"
        aria-label={deleteLabel}
        tabIndex={reachable ? 0 : -1}
        aria-hidden={reachable ? undefined : 'true'}
        onFocus={() => onlyDelete && handle.current?.open()}
      >
        <Trash2 aria-hidden="true" />
      </button>
    </li>
  );
}
