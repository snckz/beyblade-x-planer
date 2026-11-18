import { createPortal } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { dismissUndo, subscribeUndo, UNDO_MS, type UndoNotice } from '../lib/undo';
import { RotateCcw } from 'lucide-preact';

/** Meldung „… entfernt · Rückgängig“ über der Tab-Leiste (siehe lib/undo.ts). Einmal in der App eingehängt. */
export function UndoToast() {
  const [notice, setNotice] = useState<UndoNotice | null>(null);
  useEffect(() => subscribeUndo(setNotice), []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => dismissUndo(notice.id), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);
  if (!notice) return null;
  return createPortal(
    <div class="undo-toast" role="status" key={notice.id}>
      <span class="undo-text">{notice.message}</span>
      <button
        type="button"
        class="undo-btn"
        onClick={() => {
          notice.undo();
          dismissUndo(notice.id);
        }}
      >
        <RotateCcw aria-hidden="true" /> Rückgängig
      </button>
    </div>,
    document.body,
  );
}
