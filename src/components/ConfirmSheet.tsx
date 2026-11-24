import { tr } from '../lib/i18n';
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { useModal } from '../lib/useModal';
import { Trash2, type LucideIcon } from 'lucide-preact';

interface Props {
  title: string;
  /** Was betroffen ist (z. B. Name und Teile der Kombo) */
  children?: ComponentChildren;
  /** Kurzer Hinweis unter dem Inhalt, z. B. „Das lässt sich nicht rückgängig machen.“ */
  note?: string;
  confirmLabel: string;
  /** Symbol oben und auf dem Bestätigen-Knopf (Standard: Papierkorb) */
  icon?: LucideIcon;
  /** `null`: nur ein Knopf (reiner Hinweis, z. B. eine Fehlermeldung) */
  cancelLabel?: string | null;
  /** Wird genau einmal und nur beim Tipp auf die Bestätigung aufgerufen */
  onConfirm: () => void;
  /** Fenster ist zu (nach Bestätigen, Abbrechen, Schließen, Escape, Wischen) */
  onClose: () => void;
}

/**
 * Bestätigung vor einer zerstörenden Aktion – statt window.confirm. Gleiches Fenster-System wie die Auswahl
 * (useModal: Fokus, Escape, Griff zum Schließen, Safe-Areas). Abbrechen, Escape, Hintergrund und Wischen ändern nichts;
 * nur „Löschen“ ruft onConfirm. Der Fokus startet auf „Abbrechen“ – Enter oder ein versehentlicher Tipp löscht nichts.
 */
function ConfirmSheetInner({ title, children, note, confirmLabel, cancelLabel = tr('Abbrechen'), icon: Icon = Trash2, onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = useModal(ref, () => closeRef.current(), { animate: true });
  const done = useRef(false);
  useEffect(() => cancelRef.current?.focus(), []);

  const confirm = () => {
    if (done.current) return; // Doppeltipp löscht nicht zweimal
    done.current = true;
    onConfirm();
    close();
  };

  return (
    <div class="sheet-backdrop confirm-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={ref} class="sheet glass confirm-sheet" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc" tabIndex={-1}>
        <div class="sheet-grab" aria-hidden="true" />
        <div class="confirm-body">
          <span class="confirm-icon" aria-hidden="true">
            <Icon />
          </span>
          <h2 id="confirm-title" class="confirm-title">
            {title}
          </h2>
          <div id="confirm-desc" class="confirm-desc">
            {children}
            {note && <p class="confirm-note">{note}</p>}
          </div>
          <div class="confirm-actions">
            {cancelLabel !== null && (
              <button ref={cancelRef} type="button" class="btn confirm-cancel" onClick={close}>
                {cancelLabel}
              </button>
            )}
            <button ref={cancelLabel === null ? cancelRef : undefined} type="button" class={`btn confirm-danger${cancelLabel === null ? ' confirm-only' : ''}`} onClick={confirm}>
              <Icon aria-hidden="true" /> {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConfirmSheet(props: Props) {
  return createPortal(<ConfirmSheetInner {...props} />, document.body);
}
