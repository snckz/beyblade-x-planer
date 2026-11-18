/**
 * „Rückgängig“ nach dem Löschen (wie in iOS-Apps): Statt vorher zu fragen, wird sofort gelöscht und unten kurz
 * „… entfernt · Rückgängig“ angezeigt. Immer nur eine Meldung; eine neue ersetzt die alte.
 */
export interface UndoNotice {
  id: number;
  message: string;
  undo: () => void;
}

/** Wie lange die Meldung stehen bleibt (ms) */
export const UNDO_MS = 5000;

let current: UndoNotice | null = null;
let nextId = 1;
const listeners = new Set<(n: UndoNotice | null) => void>();

export function showUndo(message: string, undo: () => void): void {
  current = { id: nextId++, message, undo };
  listeners.forEach((l) => l(current));
}

export function dismissUndo(id?: number): void {
  if (!current || (id !== undefined && current.id !== id)) return;
  current = null;
  listeners.forEach((l) => l(null));
}

export function subscribeUndo(listener: (n: UndoNotice | null) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}
