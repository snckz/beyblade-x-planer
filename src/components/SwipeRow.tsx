import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { attachSwipeRow } from '../lib/swipeRow';
import { Trash2 } from 'lucide-preact';

interface Props {
  /** Klassen der eigentlichen Zeile bzw. Karte (z. B. `row`, `tile-bey aura-attack`) */
  class: string;
  /** Beschriftung des Papierkorbs, z. B. „Kombo Wizard Rod löschen“ */
  deleteLabel: string;
  onDelete: () => void;
  children: ComponentChildren;
}

/**
 * Listeneintrag mit Wischen zum Löschen wie in iOS (lib/swipeRow.ts): nach links wischen → roter Papierkorb.
 * Der Papierkorb ist nur bei offenem Eintrag erreichbar; ohne Wischen bleiben die normalen Knöpfe (×, Bearbeiten).
 */
export function SwipeRow({ class: cls, deleteLabel, onDelete, children }: Props) {
  const ref = useRef<HTMLLIElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const del = useRef(onDelete);
  del.current = onDelete;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !content.current || !action.current) return;
    return attachSwipeRow(el, { content: content.current, action: action.current, onDelete: () => del.current(), onOpenChange: setOpen });
  }, []);
  return (
    <li ref={ref} class="swipe-row">
      <button ref={action} type="button" class="swipe-delete" aria-label={deleteLabel} tabIndex={open ? 0 : -1} aria-hidden={open ? undefined : 'true'}>
        <Trash2 aria-hidden="true" />
      </button>
      <div ref={content} class={`swipe-content ${cls}`}>
        {children}
      </div>
    </li>
  );
}
