/**
 * Wischen zum Löschen wie in iOS (z. B. Uhr-App): Eintrag nach links wischen → roter Papierkorb erscheint daneben.
 * - Antippen des Papierkorbs löscht; ganz durchwischen löscht direkt.
 * - Immer nur ein Eintrag offen: Antippen woanders, ein anderer Wisch oder Scrollen schließt ihn.
 * - Senkrecht bleibt Scrollen; erst wenn waagrecht überwiegt, gehört die Geste dem Eintrag.
 * Touch-Ereignisse wie in lib/categorySwipe.ts (Safari bricht Pointer-Gesten ab, Touch läuft bis zum Loslassen).
 */

/** Breite der Aktion (px): runder Papierkorb mit Abstand */
export const ACTION_WIDTH = 84;
/** Ab dieser Strecke (px) ist die Richtung entschieden */
const SLOP = 8;
/** Ganz durchwischen: ab diesem Anteil der Breite wird beim Loslassen gelöscht – mindestens aber so weit (px),
 *  damit schmale Karten (zwei nebeneinander) nicht schon beim normalen Öffnen gelöscht werden */
const FULL = 0.6;
const FULL_MIN = 160;
/** Schneller Wisch (px/ms) öffnet bzw. schließt auch bei kurzer Strecke */
const FLICK = 0.35;
const VELOCITY_MS = 100;
const SNAP_MS = 260;
const EASE = 'cubic-bezier(.2, .8, .2, 1)';
/** So lange nach dem Loslassen darf der zugehörige Klick noch verworfen werden (ms) */
const CLICK_GUARD_MS = 400;

export interface SwipeRowOptions {
  /** Der bewegliche Inhalt (die eigentliche Karte bzw. Zeile) */
  content: HTMLElement;
  /** Der Papierkorb hinter dem Inhalt */
  action: HTMLElement;
  /** Löschen (nach Tipp auf den Papierkorb oder ganz durchgewischt) */
  onDelete: () => void;
  /** Offen/zu – z. B. um den Papierkorb erreichbar zu machen */
  onOpenChange?: (open: boolean) => void;
}

/** Der gerade offene Eintrag (nur einer zur Zeit) */
let openRow: { close: (animate?: boolean) => void; el: HTMLElement } | null = null;

/** Offenen Eintrag schließen – z. B. beim Scrollen oder beim Antippen außerhalb. */
export function closeOpenSwipeRow(): void {
  openRow?.close();
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Position (px, ≤ 0) → Anteil, um den der Papierkorb sichtbar ist (0–1) */
const reveal = (x: number) => Math.max(0, Math.min(1, -x / ACTION_WIDTH));

export function attachSwipeRow(el: HTMLElement, { content, action, onDelete, onOpenChange }: SwipeRowOptions): () => void {
  let x = 0; // aktuelle Position des Inhalts (0 = zu, -ACTION_WIDTH = offen)
  let open = false;
  let g: { id: number; x0: number; y0: number; start: number; horizontal: boolean; samples: [number, number][] } | null = null;
  /** Der Klick, der zu dieser Berührung gehört, wird verworfen (nach Wisch oder Schließen per Tipp) */
  let swallow = false;
  let swallowTimer = 0;
  const swallowNextClick = () => {
    swallow = true;
    window.clearTimeout(swallowTimer);
    swallowTimer = window.setTimeout(() => (swallow = false), CLICK_GUARD_MS);
  };
  let timer = 0;

  const paint = (px: number, ms = 0) => {
    x = px;
    // Solange verschoben: am eigenen Rand abschneiden (der Inhalt gleitet nicht über den Nachbarn)
    el.classList.toggle('is-swiping', px !== 0 || ms > 0);
    // In Ruhe ohne eigene Übergänge (sonst gingen die Drück-Effekte der Karte verloren)
    content.style.transition = ms ? `transform ${ms}ms ${EASE}` : px ? 'none' : '';
    content.style.transform = px ? `translate3d(${px}px, 0, 0)` : '';
    // Papierkorb wächst mit hinein; beim Durchwischen wandert er mit der Kante des Inhalts
    const r = reveal(px);
    const follow = Math.min(0, px + ACTION_WIDTH);
    action.style.transition = ms ? `transform ${ms}ms ${EASE}, opacity ${ms}ms ${EASE}` : 'none';
    action.style.opacity = String(r);
    action.style.transform = `translate3d(${follow}px, -50%, 0) scale(${0.6 + 0.4 * r})`;
  };

  const setOpen = (next: boolean) => {
    if (open === next) return;
    open = next;
    el.classList.toggle('is-open', next);
    onOpenChange?.(next);
    if (next) {
      if (openRow && openRow.el !== el) openRow.close();
      openRow = handle;
      window.addEventListener('scroll', onAnyScroll, { passive: true, capture: true });
      document.addEventListener('touchstart', onOutside, { passive: true, capture: true });
    } else {
      if (openRow === handle) openRow = null;
      window.removeEventListener('scroll', onAnyScroll, true);
      document.removeEventListener('touchstart', onOutside, true);
    }
  };

  const close = (animate = true) => {
    window.clearTimeout(timer);
    const ms = animate && !reducedMotion() ? SNAP_MS : 0;
    paint(0, ms);
    setOpen(false);
    if (ms) timer = window.setTimeout(() => !open && x === 0 && el.classList.remove('is-swiping'), ms + 20);
  };
  const handle = { close, el };

  const remove = () => {
    setOpen(false);
    const width = el.offsetWidth || 400;
    if (reducedMotion()) return onDelete();
    paint(-width, 200);
    content.style.opacity = '0';
    timer = window.setTimeout(onDelete, 190);
  };

  const onAnyScroll = (e: Event) => {
    // Scrollen der Seite (nicht ein waagrechter Streifen im Eintrag) schließt
    if (!g && !(e.target instanceof Element && el.contains(e.target))) close();
  };
  const onOutside = (e: TouchEvent) => {
    if (!el.contains(e.target as Node)) close();
  };

  const touchOf = (list: TouchList, id: number) => [...list].find((t) => t.identifier === id) ?? null;

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) {
      g = null;
      return;
    }
    const t = e.touches[0]!;
    // Anderer Eintrag offen: zuerst den schließen (wie iOS), dieser Wisch darf trotzdem starten
    if (openRow && openRow.el !== el) openRow.close();
    window.clearTimeout(timer);
    g = { id: t.identifier, x0: t.clientX, y0: t.clientY, start: x, horizontal: false, samples: [[e.timeStamp, t.clientX]] };
  };

  const onMove = (e: TouchEvent) => {
    if (!g) return;
    const t = touchOf(e.touches, g.id);
    if (!t) return;
    const dx = t.clientX - g.x0;
    const dy = t.clientY - g.y0;
    if (!g.horizontal) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      // Senkrecht: Scrollen – Geste aufgeben. Nach rechts auf geschlossenem Eintrag: nichts zu tun.
      if (Math.abs(dy) >= Math.abs(dx) || (dx > 0 && g.start === 0)) {
        g = null;
        return;
      }
      g.horizontal = true;
    }
    if (e.cancelable) e.preventDefault();
    g.samples.push([e.timeStamp, t.clientX]);
    if (g.samples.length > 12) g.samples.shift();
    let next = g.start + dx;
    // Nach rechts über „zu“ hinaus: leichter Widerstand
    if (next > 0) next = next * 0.25;
    paint(Math.round(next));
  };

  const onEnd = (e: TouchEvent) => {
    if (!g) return;
    const t = touchOf(e.changedTouches, g.id);
    if (!t) return;
    const s = g;
    g = null;
    if (!s.horizontal) {
      // Antippen eines offenen Eintrags schließt ihn (und wählt nichts aus)
      if (open && !action.contains(e.target as Node)) {
        swallowNextClick();
        close();
      }
      return;
    }
    swallowNextClick();
    const recent = s.samples.filter(([time]) => e.timeStamp - time <= VELOCITY_MS);
    const first = recent[0];
    const dt = first ? e.timeStamp - first[0] : 0;
    const v = first && dt > 0 ? (t.clientX - first[1]) / dt : 0; // px/ms, rechts positiv
    const width = el.offsetWidth || 400;
    if (x < -Math.max(width * FULL, FULL_MIN)) return remove(); // ganz durchgewischt
    const shouldOpen = v < -FLICK || (v <= FLICK && x < -ACTION_WIDTH / 2);
    const ms = reducedMotion() ? 0 : SNAP_MS;
    if (shouldOpen) {
      paint(-ACTION_WIDTH, ms);
      setOpen(true);
    } else close();
  };

  const onCancel = () => {
    if (g?.horizontal) {
      if (open) paint(-ACTION_WIDTH, SNAP_MS);
      else close();
    }
    g = null;
  };

  // Klick nach einem Wisch (oder auf einen offenen Eintrag) verwerfen
  const onClick = (e: MouseEvent) => {
    if (action.contains(e.target as Node)) return;
    if (swallow || open) {
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
      if (open) close();
    }
  };
  const onAction = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    remove();
  };

  paint(0);
  el.addEventListener('touchstart', onStart, { passive: true });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onEnd);
  el.addEventListener('touchcancel', onCancel);
  content.addEventListener('click', onClick, true);
  action.addEventListener('click', onAction);
  return () => {
    window.clearTimeout(timer);
    window.clearTimeout(swallowTimer);
    setOpen(false);
    el.removeEventListener('touchstart', onStart);
    el.removeEventListener('touchmove', onMove);
    el.removeEventListener('touchend', onEnd);
    el.removeEventListener('touchcancel', onCancel);
    content.removeEventListener('click', onClick, true);
    action.removeEventListener('click', onAction);
  };
}
