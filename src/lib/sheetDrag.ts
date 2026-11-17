/**
 * Bottom-Sheet am Griff nach unten ziehen und schließen.
 *
 * Zugfläche sind der Griff (.sheet-grab) und die Kopfzeile (.win-head) – nicht der scrollende Inhalt.
 * So bleiben Scrollen, Suche und Bildschirmtastatur unberührt; Knöpfe in der Kopfzeile bleiben tippbar.
 * Eingehängt wird die Geste von lib/useModal.ts bei jedem Fenster, das einen Griff zeigt.
 */

/** Ab dieser Strecke (px) gilt eine Bewegung als Ziehen statt Tippen. */
const SLOP = 6;
/** Schließen ab dieser Strecke: Anteil der Fensterhöhe, höchstens CLOSE_PX. */
const CLOSE_SHARE = 0.3;
const CLOSE_PX = 140;
/** Schneller Wisch nach unten (px/ms) schließt schon nach kurzer Strecke. */
const FLICK = 0.5;
const FLICK_MIN_PX = 24;
/** Bewegt sich der Finger beim Loslassen wieder nach oben, bleibt das Fenster offen. */
const UPWARD = -0.1;
/** Zeitfenster (ms) für die Geschwindigkeit beim Loslassen. */
const VELOCITY_MS = 100;
/** Dauer des Zurückgleitens – muss zu `.sheet.is-settling` in styles.css passen. */
const SETTLE_MS = 260;

const ZONE = '.sheet-grab, .win-head';
const INTERACTIVE = 'button, a, input, select, textarea, label, summary, [role="button"]';

/** Entscheidet beim Loslassen: schließen (true) oder zurückgleiten (false). `velocity` in px/ms, nach unten positiv. */
export function dragCloses(dy: number, velocity: number, height: number): boolean {
  if (!(dy > 0) || velocity < UPWARD) return false;
  if (velocity >= FLICK && dy >= FLICK_MIN_PX) return true;
  return dy >= Math.min(CLOSE_PX, height * CLOSE_SHARE);
}

/** Fenster nach einer Ziehgeste wieder an seinen Platz setzen (falls es doch offen bleibt). */
export function resetSheetDrag(root: HTMLElement): void {
  root.classList.remove('is-dragging', 'is-settling');
  root.style.removeProperty('transform');
  root.style.removeProperty('--sink');
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Hängt die Ziehgeste an ein Fenster. Ohne Griff (Vollbild-Fenster) passiert nichts.
 * `close` ist derselbe Weg wie der Schließen-Knopf. Gibt die Funktion zum Aushängen zurück.
 */
export function attachSheetDrag(root: HTMLElement, close: () => void): () => void {
  if (![...root.children].some((c) => c.classList.contains('sheet-grab'))) return () => {};

  let drag: { id: number; x: number; y: number; active: boolean; samples: [number, number][] } | null = null;
  let settleTimer = 0;

  const endSettle = () => {
    window.clearTimeout(settleTimer);
    root.classList.remove('is-settling');
  };

  const settle = () => {
    root.classList.remove('is-dragging');
    if (reducedMotion() || !root.style.transform) {
      root.style.removeProperty('transform');
      return;
    }
    root.classList.add('is-settling');
    root.style.removeProperty('transform');
    settleTimer = window.setTimeout(endSettle, SETTLE_MS + 60);
  };

  const onDown = (e: PointerEvent) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (drag?.active) return; // läuft schon eine Geste, zählt ein zweiter Zeiger nicht
    drag = null;
    const target = e.target as Element | null;
    const zone = target?.closest?.(ZONE);
    if (!target || !zone || zone.parentElement !== root || target.closest(INTERACTIVE)) return;
    if (root.classList.contains('is-settling') || root.closest('.is-closing')) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false, samples: [[e.timeStamp, e.clientY]] };
  };

  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      // Nur eine klare Bewegung nach unten startet das Ziehen – seitlich oder nach oben bleibt es beim Tippen.
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        drag = null;
        return;
      }
      drag.active = true;
      // Nur die Anlaufstrecke abziehen: Das Fenster springt nicht, und ein schneller Wisch,
      // den der Browser in ein oder zwei Ereignissen meldet, behält seine volle Strecke.
      drag.y += SLOP;
      root.classList.add('is-dragging');
      try {
        root.setPointerCapture(e.pointerId);
      } catch {
        /* Zeiger schon weg – die Geste läuft trotzdem über die normalen Ereignisse weiter */
      }
    }
    root.style.transform = `translateY(${Math.max(0, e.clientY - drag.y)}px)`;
    drag.samples.push([e.timeStamp, e.clientY]);
    if (drag.samples.length > 12) drag.samples.shift();
  };

  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.active) return;
    const dy = Math.max(0, e.clientY - d.y);
    const recent = d.samples.filter(([t]) => e.timeStamp - t <= VELOCITY_MS);
    const first = recent[0];
    const dt = first ? e.timeStamp - first[0] : 0;
    const velocity = first && dt > 0 ? (e.clientY - first[1]) / dt : 0;
    if (dragCloses(dy, velocity, root.getBoundingClientRect().height)) {
      root.classList.remove('is-dragging');
      // Von der gezogenen Position ganz nach unten hinaus (siehe @keyframes win-sink).
      root.style.setProperty('--sink', '100%');
      close();
    } else {
      settle();
    }
  };

  const onCancel = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const active = drag.active;
    drag = null;
    if (active) settle();
  };

  // Verliert das Fenster den Zeiger mitten in der Geste, gleitet es zurück. Das Ereignis des Griffs selbst zählt nicht:
  // Er gibt den Zeiger beim Start der Geste an das Fenster ab. Nach normalem Loslassen ist die Geste schon beendet.
  const onLost = (e: PointerEvent) => {
    if (e.target === root) onCancel(e);
  };

  const onSettled = (e: TransitionEvent) => {
    if (e.target === root && e.propertyName === 'transform') endSettle();
  };

  // iOS Safari: Solange am Griff gezogen wird, darf die Seite nicht mitscrollen oder „Zum Aktualisieren ziehen“ starten.
  // Nur an der Zugfläche, damit der scrollende Inhalt keinen blockierenden Listener bekommt.
  const onTouchMove = (e: TouchEvent) => {
    if (drag && e.cancelable) e.preventDefault();
  };
  const zones = [...root.children].filter((c) => c.matches(ZONE));

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onCancel);
  root.addEventListener('lostpointercapture', onLost);
  root.addEventListener('transitionend', onSettled);
  for (const z of zones) z.addEventListener('touchmove', onTouchMove as EventListener, { passive: false });

  return () => {
    window.clearTimeout(settleTimer);
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerup', onUp);
    root.removeEventListener('pointercancel', onCancel);
    root.removeEventListener('lostpointercapture', onLost);
    root.removeEventListener('transitionend', onSettled);
    for (const z of zones) z.removeEventListener('touchmove', onTouchMove as EventListener);
  };
}
