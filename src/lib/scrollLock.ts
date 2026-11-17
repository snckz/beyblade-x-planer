// Hintergrund-Scrollen sperren, solange mindestens ein Dialog offen ist.
// Zähler statt „vorherigen Wert merken“: verschachtelte Dialoge können in beliebiger Reihenfolge schließen.
let count = 0;

export function lockScroll(): () => void {
  count++;
  document.body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count = Math.max(0, count - 1);
    // Ohne Dokument (Fenster wird nach dem Abbau der Seite/Testumgebung aufgeräumt) gibt es nichts freizugeben.
    if (!count && typeof document !== 'undefined') document.body.style.overflow = '';
  };
}
