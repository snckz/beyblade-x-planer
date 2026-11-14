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
    if (!count) document.body.style.overflow = '';
  };
}
