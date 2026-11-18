/**
 * Zurückwischen wie in iOS: vom linken Bildschirmrand nach rechts ziehen → eine Ebene zurück.
 *
 * - Startet nur am Rand (EDGE px) und nur, wenn die Bewegung klar waagrecht ist – Scrollen, Eingabefelder und
 *   waagrechte Leisten bleiben unberührt.
 * - Die aktuelle Ebene folgt dem Finger, die vorige liegt darunter und gleitet leicht versetzt nach (Parallaxe wie iOS).
 * - Loslassen: weit genug oder schnell genug → zurück (federnd), sonst gleitet die Ebene wieder an ihren Platz.
 * Der Zurück-Knopf nutzt dieselbe Animation über `slideBack` – Knopf und Geste lösen dieselbe Aktion aus.
 */
import { springEasing } from './categorySwipe';

/** Breite des Randstreifens, in dem die Geste beginnen darf (px) */
export const EDGE = 28;
/** Ab dieser Strecke (px) wird entschieden: waagrecht (Geste) oder senkrecht (Scrollen) */
const SLOP = 8;
/** Zurück ab diesem Anteil der Breite … */
const BACK_SHARE = 0.4;
/** … oder bei einem schnellen Wisch (px/ms) nach mindestens FLICK_MIN_PX */
const FLICK = 0.35;
const FLICK_MIN_PX = 24;
/** Die untere Ebene startet um diesen Anteil der Breite nach links versetzt */
const PARALLAX = 0.3;
/** Feste Dauer, wenn der Browser keine Federkurve kann bzw. beim Knopf (ms) */
const DURATION = 320;
const EASE = 'cubic-bezier(.2, .8, .2, 1)';
const VELOCITY_MS = 100;
const IGNORE = 'input, textarea, select, [data-no-swipe]';

/** Entscheidet beim Loslassen: zurück (true) oder an den Platz (false). `velocity` in px/ms, nach rechts positiv. */
export function edgeGoesBack(dx: number, velocity: number, width: number): boolean {
  if (!(dx > 0) || velocity < -0.1) return false;
  if (velocity >= FLICK && dx >= FLICK_MIN_PX) return true;
  return dx >= width * BACK_SHARE;
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface EdgeLayers {
  /** die aktuelle Ebene (wird verschoben) */
  page: HTMLElement;
  /** die Ebene darunter (optional – auf der obersten Ebene liegt darunter die App selbst) */
  under?: HTMLElement | null;
}

function place({ page, under }: EdgeLayers, x: number, width: number) {
  page.style.transform = `translate3d(${x}px, 0, 0)`;
  const share = Math.min(1, Math.max(0, x / width));
  page.style.setProperty('--edge-shadow', String(1 - share));
  if (under) {
    under.style.transform = `translate3d(${Math.round(-(1 - share) * PARALLAX * width)}px, 0, 0)`;
    under.style.setProperty('--edge-dim', String(1 - share));
  }
}

function clear({ page, under }: EdgeLayers) {
  for (const el of [page, under]) {
    if (!el) continue;
    el.style.removeProperty('transform');
    el.style.removeProperty('transition');
    el.style.removeProperty('--edge-shadow');
    el.style.removeProperty('--edge-dim');
  }
}

/** Ebenen animiert an Position `to` (px) bringen, danach `done`. `v` = Fingertempo (px/ms) für die Federkurve. */
function animate(layers: EdgeLayers, to: number, width: number, v: number, done: () => void) {
  const from = Number(/translate3d\((-?[\d.]+)px/.exec(layers.page.style.transform)?.[1] ?? 0);
  const dist = Math.abs(to - from);
  if (reducedMotion() || dist < 1) {
    done();
    return;
  }
  const spring = springEasing((Math.abs(v) * 1000) / Math.max(1, dist));
  const ms = spring ? Math.min(520, spring.ms) : DURATION;
  const transition = `transform ${ms}ms ${spring?.easing ?? EASE}`;
  layers.page.style.transition = transition;
  if (layers.under) layers.under.style.transition = transition;
  // Erst im nächsten Bild das Ziel setzen, damit die Übergangskurve greift
  requestAnimationFrame(() => {
    place(layers, to, width);
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      layers.page.removeEventListener('transitionend', onEnd);
      done();
    };
    const onEnd = (e: TransitionEvent) => e.target === layers.page && e.propertyName === 'transform' && end();
    layers.page.addEventListener('transitionend', onEnd);
    window.setTimeout(end, ms + 80);
  });
}

/**
 * Zurück per Knopf mit derselben Bewegung wie die Geste. `prepare` legt die untere Ebene bereit (z. B. Zustand setzen
 * und auf das nächste Bild warten) und liefert die Ebenen; `commit` wechselt danach wirklich die Ebene.
 */
export async function slideBack(prepare: () => Promise<EdgeLayers | null>, commit: () => void): Promise<void> {
  if (reducedMotion()) return commit();
  const layers = await prepare();
  if (!layers) return commit();
  const width = layers.page.getBoundingClientRect().width || window.innerWidth;
  place(layers, 0, width);
  animate(layers, width, width, 0, () => {
    commit();
    requestAnimationFrame(() => clear(layers));
  });
}

export interface EdgeOptions {
  /** Darf gerade zurückgewischt werden? (z. B. nicht während die Kamera läuft) */
  canBack: () => boolean;
  /** Geste beginnt: untere Ebene bereitlegen; liefert die Ebenen (null = abbrechen) */
  start: () => EdgeLayers | null;
  /** Geste fertig: zurück */
  back: () => void;
  /** Geste abgebrochen (Ebene wieder an ihrem Platz) */
  cancel: () => void;
}

/** Hängt die Randgeste an `root` (Vollbild-Fenster). Gibt die Funktion zum Aushängen zurück. */
export function attachEdgeBack(root: HTMLElement, opts: EdgeOptions): () => void {
  let g: { id: number; x: number; y: number; active: boolean; layers: EdgeLayers | null; width: number; samples: [number, number][] } | null = null;
  let busy = false;

  const onDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.pointerType === 'mouse' || busy || g) return;
    const target = e.target as Element | null;
    if (e.clientX > EDGE || target?.closest?.(IGNORE) || !opts.canBack()) return;
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false, layers: null, width: root.clientWidth || window.innerWidth, samples: [[e.timeStamp, e.clientX]] };
  };

  const onMove = (e: PointerEvent) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.active) {
      if (Math.hypot(dx, dy) < SLOP) return;
      // senkrecht oder nach links → Scrollen bzw. nichts; die Geste ist für diese Berührung vorbei
      if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
        g = null;
        return;
      }
      const layers = opts.start();
      if (!layers) {
        g = null;
        return;
      }
      g.active = true;
      g.layers = layers;
      busy = true;
      root.classList.add('edge-dragging');
      try {
        root.setPointerCapture(e.pointerId);
      } catch {
        /* Zeiger schon weg */
      }
    }
    e.preventDefault();
    g.samples.push([e.timeStamp, e.clientX]);
    while (g.samples.length > 2 && e.timeStamp - g.samples[0]![0] > VELOCITY_MS) g.samples.shift();
    place(g.layers!, Math.max(0, dx), g.width);
  };

  const finish = (e: PointerEvent, cancelled: boolean) => {
    if (!g || e.pointerId !== g.id) return;
    const cur = g;
    g = null;
    if (!cur.active || !cur.layers) return;
    root.classList.remove('edge-dragging');
    const dx = Math.max(0, e.clientX - cur.x);
    // Tempo aus den letzten Bewegungen (nicht bis zum Loslassen – das kommt oft etwas später)
    const [t0, x0] = cur.samples[0]!;
    const [t1, x1] = cur.samples[cur.samples.length - 1]!;
    const idle = e.timeStamp - t1 > VELOCITY_MS; // Finger stand vor dem Loslassen still
    const v = !idle && t1 > t0 ? (x1 - x0) / (t1 - t0) : 0;
    const layers = cur.layers;
    if (!cancelled && edgeGoesBack(dx, v, cur.width)) {
      animate(layers, cur.width, cur.width, v, () => {
        busy = false;
        opts.back();
        requestAnimationFrame(() => clear(layers));
      });
    } else {
      animate(layers, 0, cur.width, v, () => {
        busy = false;
        clear(layers);
        opts.cancel();
      });
    }
  };
  const onUp = (e: PointerEvent) => finish(e, false);
  const onCancel = (e: PointerEvent) => finish(e, true);
  // Waagrechtes Ziehen am Rand darf die Seite nicht scrollen (iOS)
  const onTouchMove = (e: TouchEvent) => {
    if (g?.active && e.cancelable) e.preventDefault();
  };

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onCancel);
  root.addEventListener('touchmove', onTouchMove, { passive: false });
  return () => {
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerup', onUp);
    root.removeEventListener('pointercancel', onCancel);
    root.removeEventListener('touchmove', onTouchMove);
    root.classList.remove('edge-dragging');
  };
}
