/**
 * Kategorie per Wischen wechseln – in der Kartenliste der Auswahlfenster (Blade, Bit, Ratchet).
 * Nach links: nächste Kategorie, nach rechts: vorherige.
 *
 * Gleiches Muster wie lib/sheetDrag.ts (Pointer-Ereignisse, Ein-/Aushängen per Funktion, nicht-passives touchmove), aber
 * eine andere Fläche: Die Ziehgeste zum Schließen lebt auf Griff und Kopfzeile, diese hier nur auf der Kartenliste.
 *
 * Richtung: Nach wenigen Pixeln entscheidet die überwiegende Achse. Senkrecht → die Geste gibt auf, der Browser scrollt.
 * Waagrecht → touchmove wird ab da blockiert. Sonst würde iOS bei jedem leichten Bogen des Daumens mitscrollen und die
 * Geste mit pointercancel abbrechen (so sprang der Wechsel vorher oft nicht an).
 */

/** Ab dieser Strecke (px) ist die Richtung entschieden – früh, bevor der Browser zu scrollen beginnt. */
const SLOP = 6;
/** Mindeststrecke für einen Wechsel … */
const MIN_DX = 30;
/** … oder ein schneller Wisch (px/ms) ab dieser kürzeren Strecke. */
const FLICK = 0.25;
const FLICK_MIN_DX = 18;
/** Beim Loslassen muss waagrecht überwiegen (Daumen ziehen leichte Bögen – nicht strenger). */
const DOMINANCE = 1;
/** Längere Bewegungen sind eher Herumschieben als ein Wisch. */
const MAX_MS = 1000;
/** Nach einem Wisch so lange Klicks auf Karten verwerfen (ms) – der Finger landet beim Loslassen auf einer Karte. */
const CLICK_GUARD_MS = 400;

/** Ausnahmen: Felder und eigene waagrechte Leisten (z. B. Ratchet-Höhen) wechseln nie die Kategorie. */
const IGNORE = 'input, textarea, select, .height-filter, [data-no-swipe]';

/**
 * Entscheidet beim Loslassen: 1 = nächste Kategorie (nach links gewischt), -1 = vorherige (nach rechts), 0 = nichts.
 * `dx`/`dy` in px (rechts/unten positiv), `ms` = Dauer der Bewegung.
 */
export function swipeStep(dx: number, dy: number, ms: number): 1 | -1 | 0 {
  const ax = Math.abs(dx);
  if (ax < FLICK_MIN_DX || ax <= Math.abs(dy) * DOMINANCE || ms > MAX_MS) return 0;
  const velocity = ms > 0 ? ax / ms : 0;
  if (ax < MIN_DX && velocity < FLICK) return 0;
  return dx < 0 ? 1 : -1;
}

export function attachCategorySwipe(el: HTMLElement, onStep: (step: 1 | -1) => void): () => void {
  let g: { id: number; x: number; y: number; t: number; horizontal: boolean } | null = null;
  let guardUntil = 0;

  const onDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.pointerType === 'mouse') return; // Maus: Chips anklicken reicht, kein Ziehen über Karten
    const target = e.target as Element | null;
    if (target?.closest?.(IGNORE)) return;
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, horizontal: false };
  };

  const onMove = (e: PointerEvent) => {
    if (!g || e.pointerId !== g.id || g.horizontal) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
    // Überwiegend senkrecht: Das ist Scrollen – Geste aufgeben, der Browser scrollt.
    if (Math.abs(dy) >= Math.abs(dx)) g = null;
    else g.horizontal = true;
  };

  const onUp = (e: PointerEvent) => {
    if (!g || e.pointerId !== g.id) return;
    const s = g;
    g = null;
    if (!s.horizontal) return;
    const step = swipeStep(e.clientX - s.x, e.clientY - s.y, e.timeStamp - s.t);
    // Auch ein zu kurzer waagrechter Wisch soll keine Karte auswählen
    guardUntil = e.timeStamp + CLICK_GUARD_MS;
    if (step) onStep(step);
  };

  const onCancel = (e: PointerEvent) => {
    if (g && e.pointerId === g.id) g = null;
  };

  // Steht die waagrechte Richtung fest, darf die Liste nicht mehr mitscrollen (iOS bräche die Geste sonst ab).
  // Pointer-Ereignisse kommen vor dem zugehörigen touchmove – die Entscheidung oben steht also schon fest.
  const onTouchMove = (e: TouchEvent) => {
    if (g?.horizontal && e.cancelable) e.preventDefault();
  };

  // Klick nach einem Wisch verwerfen (Erfassungsphase: vor dem Klick-Handler der Karte)
  const onClick = (e: MouseEvent) => {
    if (e.timeStamp <= guardUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('click', onClick, true);
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  return () => {
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('click', onClick, true);
  };
}
