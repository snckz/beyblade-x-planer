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
 * - Blättern wie in iOS: Die aktuelle Seite geht 1:1 mit dem Finger, die nächste Kategorie kommt gleichzeitig von der
 *   Seite herein. Beim Loslassen rastet sie ein (mit dem Tempo des Fingers) oder federt zurück.
 *   An der ersten/letzten Kategorie gibt die Seite nur gebremst nach.
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
/** Am Rand (keine weitere Kategorie) gibt die Seite nur gebremst nach. */
const FOLLOW_EDGE = 0.2;
/** Abstand zwischen zwei Seiten beim Blättern (px) */
const PAGE_GAP = 24;
/** Zurückfedern bzw. Einrasten (ms): Rest der Strecke mit dem Tempo des Fingers, in diesen Grenzen */
const SPRING_MS = 220;
const SETTLE_MIN_MS = 160;
const SETTLE_MAX_MS = 320;
const EASE = 'cubic-bezier(.2, .8, .2, 1)';

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

/** Mitgehen der Seite: 1:1 mit dem Finger, am Rand (keine weitere Kategorie) deutlich gebremst. */
export function followOffset(dx: number, canMove: boolean): number {
  return canMove ? Math.round(dx) : Math.round(dx * FOLLOW_EDGE);
}

/** Die Seiten des Blätterns: aktuelle Kategorie und ihre Nachbarn (links = vorherige, rechts = nächste). */
export interface Pager {
  current: () => HTMLElement | null;
  side: (step: 1 | -1) => HTMLElement | null;
}

interface Options {
  /** Seiten, die beim Wischen mitgehen: Die nächste Kategorie kommt gleichzeitig von der Seite herein. */
  pager?: Pager;
  /** Gibt es in diese Richtung noch eine Kategorie? Sonst nur Nachgeben am Rand, kein Wechsel. */
  canStep?: (step: 1 | -1) => boolean;
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const STEPS = [1, -1] as const;

export function attachCategorySwipe(el: HTMLElement, onStep: (step: 1 | -1) => void, { pager, canStep = () => true }: Options = {}): () => void {
  let g: { id: number; x: number; y: number; t: number; horizontal: boolean; samples: [number, number][] } | null = null;
  let guardUntil = 0;
  /** Laufende Seiten: aktuelle und vorbereitete Nachbarn, Seitenbreite */
  let pages: { cur: HTMLElement; sides: Map<1 | -1, HTMLElement>; width: number } | null = null;
  /** Laufendes Einrasten/Zurückfedern – ein neuer Fingerkontakt beendet es sofort */
  let settling: { timer: number; done: () => void } | null = null;

  const finishSettling = () => {
    const s = settling;
    if (!s) return;
    settling = null;
    window.clearTimeout(s.timer);
    s.done();
  };

  const clear = (node: HTMLElement) => {
    node.style.transition = '';
    node.style.transform = '';
    node.style.willChange = '';
    node.style.visibility = '';
    node.style.top = '';
    node.style.height = '';
  };

  /** Beim Entscheiden für „waagrecht“: Nachbarseiten neben die aktuelle legen, im sichtbaren Ausschnitt. */
  const preparePages = () => {
    const cur = pager?.current();
    if (!cur) return;
    const width = cur.offsetWidth + PAGE_GAP;
    const sides = new Map<1 | -1, HTMLElement>();
    for (const s of STEPS) {
      const side = canStep(s) ? pager!.side(s) : null;
      if (!side) continue;
      // Die Nachbarseite zeigt ihren Anfang dort, wo man gerade hinschaut – nach dem Wechsel steht die Liste oben.
      side.style.top = `${el.scrollTop}px`;
      side.style.height = `${el.clientHeight}px`;
      side.style.visibility = 'visible';
      side.style.willChange = 'transform';
      side.style.transition = 'none';
      side.style.transform = `translateX(${s * width}px)`;
      sides.set(s, side);
    }
    cur.style.willChange = 'transform';
    cur.style.transition = 'none';
    pages = { cur, sides, width };
  };

  const move = (offset: number) => {
    if (!pages) return;
    pages.cur.style.transform = offset ? `translateX(${offset}px)` : '';
    pages.sides.forEach((side, s) => (side.style.transform = `translateX(${s * pages!.width + offset}px)`));
  };

  /** Loslassen: zur neuen Seite einrasten (`step`) oder zurückfedern (0). */
  const settle = (step: 1 | -1 | 0, offset: number, velocity: number) => {
    const p = pages;
    pages = null;
    const commit = () => {
      if (step) onStep(step);
    };
    if (!p) return commit();
    const all = [p.cur, ...p.sides.values()];
    const target = step ? -step * p.width : 0;
    const distance = Math.abs(target - offset);
    // Ohne Breite (nicht sichtbar) oder bei „Bewegung reduzieren“: sofort
    if (p.width <= PAGE_GAP || reducedMotion() || distance < 1) {
      all.forEach(clear);
      return commit();
    }
    const ms = step ? Math.min(SETTLE_MAX_MS, Math.max(SETTLE_MIN_MS, distance / Math.max(velocity, 0.8))) : SPRING_MS;
    all.forEach((node) => (node.style.transition = `transform ${Math.round(ms)}ms ${EASE}`));
    p.cur.style.transform = target ? `translateX(${target}px)` : '';
    p.sides.forEach((side, s) => (side.style.transform = `translateX(${s * p.width + target}px)`));
    settling = {
      timer: window.setTimeout(finishSettling, ms + 20),
      // Erst die Kategorie wechseln, dann die Stile lösen: Preact zeichnet noch vor dem nächsten Bild neu,
      // die neue Seite steht dann ohne Sprung an derselben Stelle.
      done: () => {
        commit();
        all.forEach(clear);
      },
    };
  };

  const touchOf = (list: TouchList, id: number) => [...list].find((t) => t.identifier === id) ?? null;

  const onStart = (e: TouchEvent) => {
    finishSettling();
    if (e.touches.length !== 1) {
      // Zweiter Finger: keine Wischgeste (z. B. Zoom-Versuch)
      if (g?.horizontal) settle(0, 0, 0);
      g = null;
      return;
    }
    const t = e.touches[0]!;
    if ((e.target as Element | null)?.closest?.(IGNORE)) return;
    g = { id: t.identifier, x: t.clientX, y: t.clientY, t: e.timeStamp, horizontal: false, samples: [[e.timeStamp, t.clientX]] };
  };

  let lastOffset = 0;
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
      preparePages();
    }
    // Waagrecht: Liste darf nicht nebenbei mitscrollen; die Seiten folgen stattdessen dem Finger.
    if (e.cancelable) e.preventDefault();
    g.samples.push([e.timeStamp, t.clientX]);
    if (g.samples.length > 12) g.samples.shift();
    lastOffset = followOffset(dx, canStep(dx < 0 ? 1 : -1));
    move(lastOffset);
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
    // Tempo zuletzt mit Richtung (px/ms, nach rechts positiv)
    const signed = first && dt > 0 ? (t.clientX - first[1]) / dt : undefined;
    let step = swipeStep(dx, t.clientY - s.y, e.timeStamp - s.t, signed == null ? undefined : Math.abs(signed));
    // Zum Schluss deutlich zurückgezogen: Das ist ein Abbrechen, kein Wechsel.
    if (step && signed != null && Math.sign(signed) === step && Math.abs(signed) > 0.15) step = 0;
    // Auch ein zu kurzer waagrechter Wisch soll keine Karte auswählen
    guardUntil = e.timeStamp + CLICK_GUARD_MS;
    const ok = step && canStep(step) ? step : 0;
    settle(ok, lastOffset, Math.abs(signed ?? 0));
  };

  const onCancel = () => {
    if (g?.horizontal) settle(0, lastOffset, 0);
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
    finishSettling();
    el.removeEventListener('touchstart', onStart);
    el.removeEventListener('touchmove', onMove);
    el.removeEventListener('touchend', onEnd);
    el.removeEventListener('touchcancel', onCancel);
    el.removeEventListener('click', onClick, true);
  };
}
