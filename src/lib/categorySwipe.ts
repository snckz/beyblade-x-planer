/**
 * Kategorie per Wischen wechseln – in der Kartenliste der Auswahlfenster (Blade, Bit, Ratchet).
 * Nach links: nächste Kategorie, nach rechts: vorherige.
 *
 * Gleiches Muster wie lib/sheetDrag.ts (Ein-/Aushängen per Funktion, nicht-passives touchmove), aber eine andere
 * Fläche: Die Ziehgeste zum Schließen lebt auf Griff und Kopfzeile, diese hier nur auf der Kartenliste.
 *
 * Wie in iOS-Apps:
 * - Touch-Ereignisse statt Pointer-Ereignissen: Safari bricht Pointer-Gesten ab, sobald es selbst eine Geste vermutet
 *   (pointercancel) – Touch-Ereignisse laufen bis zum Loslassen durch.
 * - Nach wenigen Pixeln entscheidet die überwiegende Achse. Senkrecht → aufgeben, der Browser scrollt.
 *   Waagrecht → touchmove wird blockiert, damit die Liste nicht nebenbei mitscrollt.
 * - Die Liste folgt dem Finger (gedämpft) und blendet dabei leicht aus; an der ersten/letzten Kategorie gibt sie nur
 *   spürbar nach.
 *   Beim Loslassen wechselt sie oder federt zurück.
 * - Schnelle Wische zählen nach dem Tempo der letzten ~100 ms, nicht gemittelt über die ganze Bewegung.
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
/** Zeitfenster für das Tempo beim Loslassen (ms). */
const VELOCITY_MS = 100;
/** Nach einem Wisch so lange Klicks auf Karten verwerfen (ms) – der Finger landet beim Loslassen auf einer Karte. */
const CLICK_GUARD_MS = 400;
/** Mitgehen: Anteil der Fingerstrecke; am Rand (keine weitere Kategorie) deutlich weniger. */
const FOLLOW = 0.5;
const FOLLOW_EDGE = 0.12;
/** Zurückfedern (ms) – passt zum Hereingleiten der neuen Liste in PartPicker. */
const SPRING_MS = 180;
/** Beim Mitgehen blendet die Liste leicht aus (Strecke in px bis zur geringsten Deckkraft) – sie „geht“ zur Seite. */
const FADE_PX = 140;
const MIN_OPACITY = 0.45;

/** Ausnahmen: Felder und eigene waagrechte Leisten (z. B. Ratchet-Höhen) wechseln nie die Kategorie. */
const IGNORE = 'input, textarea, select, .height-filter, [data-no-swipe]';

/**
 * Entscheidet beim Loslassen: 1 = nächste Kategorie (nach links gewischt), -1 = vorherige (nach rechts), 0 = nichts.
 * `dx`/`dy` in px (rechts/unten positiv), `ms` = Dauer der Bewegung, `velocity` = Tempo zuletzt (px/ms, Betrag).
 */
export function swipeStep(dx: number, dy: number, ms: number, velocity?: number): 1 | -1 | 0 {
  const ax = Math.abs(dx);
  if (ax < FLICK_MIN_DX || ax <= Math.abs(dy) * DOMINANCE || ms > MAX_MS) return 0;
  const v = velocity ?? (ms > 0 ? ax / ms : 0);
  if (ax < MIN_DX && v < FLICK) return 0;
  return dx < 0 ? 1 : -1;
}

/** Gedämpftes Mitgehen der Liste: Anteil der Fingerstrecke, am Rand stärker gebremst. */
export function followOffset(dx: number, canMove: boolean): number {
  return Math.round(dx * (canMove ? FOLLOW : FOLLOW_EDGE));
}

/** Deckkraft der Liste beim Mitgehen (1 = voll sichtbar). */
export function followOpacity(offset: number): number {
  return Math.max(MIN_OPACITY, 1 - (Math.abs(offset) / FADE_PX) * (1 - MIN_OPACITY));
}

interface Options {
  /** Element, das beim Wischen mitgeht (z. B. das Kartenraster) */
  follow?: () => HTMLElement | null;
  /** Gibt es in diese Richtung noch eine Kategorie? Sonst nur Nachgeben am Rand, kein Wechsel. */
  canStep?: (step: 1 | -1) => boolean;
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function attachCategorySwipe(el: HTMLElement, onStep: (step: 1 | -1) => void, { follow, canStep = () => true }: Options = {}): () => void {
  let g: { id: number; x: number; y: number; t: number; horizontal: boolean; samples: [number, number][] } | null = null;
  let guardUntil = 0;
  let springTimer = 0;
  let moved: HTMLElement | null = null;

  const setOffset = (px: number) => {
    const target = follow?.();
    if (!target) return;
    window.clearTimeout(springTimer);
    target.style.transition = 'none';
    target.style.transform = px ? `translateX(${px}px)` : '';
    target.style.opacity = px ? String(followOpacity(px)) : '';
    moved = target;
  };
  /** Liste wieder an ihren Platz: mit kurzem Federn, oder sofort (beim Wechsel übernimmt das Hereingleiten). */
  const release = (animate: boolean) => {
    const target = moved;
    moved = null;
    if (!target) return;
    if (!animate || reducedMotion() || !target.style.transform) {
      target.style.transition = '';
      target.style.transform = '';
      target.style.opacity = '';
      return;
    }
    target.style.transition = `transform ${SPRING_MS}ms cubic-bezier(.2, .8, .2, 1), opacity ${SPRING_MS}ms ease`;
    target.style.transform = '';
    target.style.opacity = '';
    springTimer = window.setTimeout(() => (target.style.transition = ''), SPRING_MS + 40);
  };

  const touchOf = (list: TouchList, id: number) => [...list].find((t) => t.identifier === id) ?? null;

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) {
      // Zweiter Finger: keine Wischgeste (z. B. Zoom-Versuch)
      if (g) release(true);
      g = null;
      return;
    }
    const t = e.touches[0]!;
    if ((e.target as Element | null)?.closest?.(IGNORE)) return;
    g = { id: t.identifier, x: t.clientX, y: t.clientY, t: e.timeStamp, horizontal: false, samples: [[e.timeStamp, t.clientX]] };
  };

  const onMove = (e: TouchEvent) => {
    if (!g) return;
    const t = touchOf(e.touches, g.id);
    if (!t) return;
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (!g.horizontal) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      // Überwiegend senkrecht: Das ist Scrollen – Geste aufgeben, der Browser scrollt.
      if (Math.abs(dy) >= Math.abs(dx)) {
        g = null;
        return;
      }
      g.horizontal = true;
    }
    // Waagrecht: Liste darf nicht nebenbei mitscrollen; sie folgt stattdessen dem Finger.
    if (e.cancelable) e.preventDefault();
    g.samples.push([e.timeStamp, t.clientX]);
    if (g.samples.length > 12) g.samples.shift();
    setOffset(followOffset(dx, canStep(dx < 0 ? 1 : -1)));
  };

  const onEnd = (e: TouchEvent) => {
    if (!g) return;
    const t = touchOf(e.changedTouches, g.id);
    if (!t) return;
    const s = g;
    g = null;
    if (!s.horizontal) return;
    const dx = t.clientX - s.x;
    const recent = s.samples.filter(([time]) => e.timeStamp - time <= VELOCITY_MS);
    const first = recent[0];
    const dt = first ? e.timeStamp - first[0] : 0;
    const velocity = first && dt > 0 ? Math.abs(t.clientX - first[1]) / dt : undefined;
    const step = swipeStep(dx, t.clientY - s.y, e.timeStamp - s.t, velocity);
    // Auch ein zu kurzer waagrechter Wisch soll keine Karte auswählen
    guardUntil = e.timeStamp + CLICK_GUARD_MS;
    if (step && canStep(step)) {
      release(false);
      onStep(step);
    } else release(true);
  };

  const onCancel = () => {
    if (g?.horizontal) release(true);
    g = null;
  };

  // Klick nach einem Wisch verwerfen (Erfassungsphase: vor dem Klick-Handler der Karte)
  const onClick = (e: MouseEvent) => {
    if (e.timeStamp <= guardUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  el.addEventListener('touchstart', onStart, { passive: true });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onEnd);
  el.addEventListener('touchcancel', onCancel);
  el.addEventListener('click', onClick, true);
  return () => {
    window.clearTimeout(springTimer);
    el.removeEventListener('touchstart', onStart);
    el.removeEventListener('touchmove', onMove);
    el.removeEventListener('touchend', onEnd);
    el.removeEventListener('touchcancel', onCancel);
    el.removeEventListener('click', onClick, true);
  };
}
