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
 *   Seite herein. Alle Seiten liegen fertig gezeichnet auf einer Spur – pro Bild wird nur die Spur verschoben. Beim Loslassen rastet sie ein (mit dem Tempo des Fingers) oder federt zurück.
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
/** Gummiband am Rand (keine weitere Kategorie): Stärke wie bei iOS (UIScrollView) */
const RUBBER = 0.55;
/** Abstand zwischen zwei Seiten beim Blättern (px) */
const PAGE_GAP = 24;
/** Zurückfedern bzw. Einrasten (ms): Rest der Strecke mit dem Tempo des Fingers, in diesen Grenzen */
const SPRING_MS = 220;
const SETTLE_MIN_MS = 160;
const SETTLE_MAX_MS = 320;
const EASE = 'cubic-bezier(.2, .8, .2, 1)';
/** Feder fürs Einrasten: Eigenfrequenz (1/s) – kritisch gedämpft, also ohne Überschwingen, wie das Blättern in iOS */
const SPRING_OMEGA = 19;

/** Ausnahmen: eigene waagrechte Leisten (z. B. Ratchet-Höhen) wechseln nie die Kategorie. */
const IGNORE = '.height-filter, [data-no-swipe]';
/** Felder: Standard ebenfalls Ausnahme. Mit `idleFields` zählt ein Wisch auch auf einem Feld, das gerade nicht bedient wird. */
const FIELDS = 'input, textarea, select';
/** Diese Felder brauchen das waagrechte Ziehen immer selbst. */
const DRAG_FIELDS = 'select, input[type="range"]';

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

/**
 * Mitgehen der Seite: 1:1 mit dem Finger. Am Rand (keine weitere Kategorie) wie ein Gummiband: anfangs spürbar,
 * dann immer zäher – nie weiter als ein Bruchteil der Breite (Formel wie UIScrollView).
 */
export function followOffset(dx: number, canMove: boolean, width = 375): number {
  if (canMove) return Math.round(dx);
  const d = Math.max(1, width);
  return Math.round(Math.sign(dx) * (1 - 1 / ((Math.abs(dx) * RUBBER) / d + 1)) * d);
}

/**
 * Federkurve fürs Einrasten als CSS `linear()`: startet mit dem Tempo des Fingers (`v0`, Strecke je Sekunde relativ
 * zur ganzen Strecke) und läuft kritisch gedämpft aus. Rückgabe: Kurve und Dauer (ms) – oder `null`, wenn der Browser
 * `linear()` nicht kennt (dann die feste Kurve).
 */
export function springEasing(v0: number, omega = SPRING_OMEGA): { easing: string; ms: number } | null {
  if (!supportsLinear()) return null;
  // x(t) = 1 − e^(−ωt)·(1 + (ω − v0)·t): x(0) = 0, x'(0) = v0, Ziel 1
  const v = Math.max(0, Math.min(v0, 3 * omega));
  const x = (t: number) => Math.min(1, 1 - Math.exp(-omega * t) * (1 + (omega - v) * t));
  let end = 0.05;
  while (end < 1.2 && 1 - x(end) > 0.003) end += 0.01;
  const n = 24;
  const points = Array.from({ length: n + 1 }, (_, i) => (i === n ? 1 : x((end * i) / n)).toFixed(4));
  return { easing: `linear(${points.join(', ')})`, ms: Math.round(end * 1000) };
}

let linearSupport: boolean | undefined;
const supportsLinear = () =>
  (linearSupport ??= typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('transition-timing-function', 'linear(0, 1)'));

/**
 * Die Seiten des Blätterns: eine Spur, auf der die aktuelle Kategorie und ihre Nachbarn (links = vorherige,
 * rechts = nächste) fertig nebeneinander liegen. Beim Wischen wird nur die Spur verschoben.
 */
export interface Pager {
  track: () => HTMLElement | null;
  side: (step: 1 | -1) => HTMLElement | null;
}

/** Stelle auf dem Bildschirm (px, wie `clientX`/`clientY`) */
export interface Point {
  x: number;
  y: number;
}

interface Options {
  /** Seiten, die beim Wischen mitgehen: Die nächste Kategorie kommt gleichzeitig von der Seite herein. */
  pager?: Pager;
  /** Gibt es in diese Richtung noch eine Kategorie? Sonst nur Nachgeben am Rand, kein Wechsel. */
  canStep?: (step: 1 | -1) => boolean;
  /** Geste samt Einrasten läuft (`true`) bzw. ist vorbei – z. B. um Hintergrundarbeit so lange anzuhalten. */
  onActive?: (active: boolean) => void;
  /** Loslassen mit Wechsel: sofort gemeldet (z. B. Chip umschalten), `onStep` folgt nach dem Einrasten. */
  onSettle?: (step: 1 | -1) => void;
  /** Weitere Ausnahmen beim Aufsetzen des Fingers (z. B. eigene waagrechte Leisten, offenes Fenster). `at`: wo der Finger aufsetzt. */
  ignore?: (target: Element, at: Point) => boolean;
  /** Gehört ein Wisch in diese Richtung an dieser Stelle jemand anderem (z. B. Wischen zum Löschen)? Dann nichts tun. */
  ownsStep?: (target: Element, step: 1 | -1, at: Point) => boolean;
  /**
   * Wisch auch auf Feldern zulassen, die gerade nicht bedient werden (Suchfeld ohne Cursor, Schalter) – für ganze
   * Seiten, auf denen ein breites Suchfeld sonst ein toter Streifen wäre. Ein Feld mit Cursor behält das Ziehen
   * (Text markieren), Auswahllisten und Schieberegler immer.
   */
  idleFields?: boolean;
  /** Scrollstand der Fläche – Standard: `el.scrollTop`. Für Seiten, die mit dem Fenster scrollen: `window.scrollY`. */
  scrollTop?: () => number;
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const STEPS = [1, -1] as const;

/** Aushängen; `finish()` beendet ein laufendes Einrasten sofort (z. B. wenn ein Chip-Tipp dazwischenkommt). */
export type SwipeHandle = (() => void) & { finish: () => void };

export function attachCategorySwipe(el: HTMLElement, onStep: (step: 1 | -1) => void, { pager, canStep = () => true, onActive, onSettle, ignore, ownsStep, idleFields = false, scrollTop = () => el.scrollTop }: Options = {}): SwipeHandle {
  let g: { id: number; x: number; y: number; t: number; horizontal: boolean; target: Element | null; samples: [number, number][] } | null = null;
  let guardUntil = 0;
  /** Laufendes Blättern: Spur, Nachbarseiten (auf Höhe des sichtbaren Ausschnitts gelegt), Seitenbreite */
  let pages: { track: HTMLElement; sides: HTMLElement[]; width: number } | null = null;
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
  };

  /** Beim Entscheiden für „waagrecht“: Nachbarseiten auf Höhe des sichtbaren Ausschnitts legen. */
  const preparePages = () => {
    const track = pager?.track();
    if (!track) return;
    const width = track.offsetWidth + PAGE_GAP;
    // Die Nachbarseite zeigt ihren Anfang dort, wo man gerade hinschaut – nach dem Wechsel steht die Liste oben.
    // Die Nachbarn sind eigene Ebenen: Das Verschieben kostet kein Neuzeichnen.
    const y = scrollTop();
    const sides: HTMLElement[] = [];
    for (const s of STEPS) {
      const side = canStep(s) ? pager!.side(s) : null;
      if (!side) continue;
      side.style.transform = y ? `translate3d(0, ${y}px, 0)` : '';
      sides.push(side);
    }
    track.style.transition = 'none';
    pages = { track, sides, width };
  };

  /** Ein Wert pro Bild: nur die Spur bewegt sich. */
  const move = (offset: number) => {
    if (pages) pages.track.style.transform = `translate3d(${offset}px, 0, 0)`;
  };

  /** Loslassen: zur neuen Seite einrasten (`step`) oder zurückfedern (0). `velocity`: Tempo zuletzt (px/ms, rechts +). */
  const settle = (step: 1 | -1 | 0, offset: number, velocity: number) => {
    const p = pages;
    pages = null;
    if (step) onSettle?.(step);
    const commit = () => {
      if (step) onStep(step);
      onActive?.(false);
    };
    if (!p) return commit();
    const all = [p.track, ...p.sides];
    const target = step ? -step * p.width : 0;
    const distance = Math.abs(target - offset);
    // Ohne Breite (nicht sichtbar) oder bei „Bewegung reduzieren“: sofort
    if (p.width <= PAGE_GAP || reducedMotion() || distance < 1) {
      all.forEach(clear);
      return commit();
    }
    // Tempo des Fingers in Richtung Ziel, bezogen auf die Reststrecke – die Feder übernimmt es nahtlos
    const toward = (velocity * Math.sign(target - offset) * 1000) / distance;
    const spring = springEasing(toward);
    const ms = spring?.ms ?? (step ? Math.min(SETTLE_MAX_MS, Math.max(SETTLE_MIN_MS, distance / Math.max(Math.abs(velocity), 0.8))) : SPRING_MS);
    p.track.style.transition = `transform ${ms}ms ${spring?.easing ?? EASE}`;
    p.track.style.transform = `translate3d(${target}px, 0, 0)`;
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

  /** Setzt der Finger auf einem Feld auf, das die Geste selbst braucht? */
  const onBusyField = (target: Element) => {
    const field = target.closest(FIELDS);
    if (!field) return false;
    return !idleFields || field.matches(DRAG_FIELDS) || field === document.activeElement;
  };

  const touchOf = (list: TouchList, id: number) => [...list].find((t) => t.identifier === id) ?? null;

  const onStart = (e: TouchEvent) => {
    finishSettling();
    // Laufende Geste beenden: zweiter Finger (z. B. Zoom-Versuch) oder liegengebliebene Geste, deren Ende nie ankam
    // (z. B. Element unter dem Finger ersetzt) – Seiten zurück an ihren Platz
    if (g?.horizontal) settle(0, 0, 0);
    g = null;
    if (e.touches.length !== 1) return;
    const t = e.touches[0]!;
    const target = e.target instanceof Element ? e.target : null;
    if (target && (target.closest(IGNORE) || onBusyField(target) || ignore?.(target, { x: t.clientX, y: t.clientY }))) return;
    g = { id: t.identifier, x: t.clientX, y: t.clientY, t: e.timeStamp, horizontal: false, target, samples: [[e.timeStamp, t.clientX]] };
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
      // Waagrecht, aber an dieser Stelle gehört die Richtung einer anderen Geste: ihr überlassen
      if (g.target && ownsStep?.(g.target, dx < 0 ? 1 : -1, { x: g.x, y: g.y })) {
        g = null;
        return;
      }
      g.horizontal = true;
      onActive?.(true);
      preparePages();
    }
    // Waagrecht: Liste darf nicht nebenbei mitscrollen; die Seiten folgen stattdessen dem Finger.
    if (e.cancelable) e.preventDefault();
    g.samples.push([e.timeStamp, t.clientX]);
    if (g.samples.length > 12) g.samples.shift();
    lastOffset = followOffset(dx, canStep(dx < 0 ? 1 : -1), pages ? pages.width : undefined);
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
    settle(ok, lastOffset, signed ?? 0);
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
  const detach = () => {
    finishSettling();
    el.removeEventListener('touchstart', onStart);
    el.removeEventListener('touchmove', onMove);
    el.removeEventListener('touchend', onEnd);
    el.removeEventListener('touchcancel', onCancel);
    el.removeEventListener('click', onClick, true);
  };
  return Object.assign(detach, { finish: finishSettling });
}
