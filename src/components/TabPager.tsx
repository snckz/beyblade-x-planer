import { Component, type ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { attachCategorySwipe } from '../lib/categorySwipe';
import { blocksTabSwipe, rowOwnsStep } from '../lib/tabSwipe';
import { pauseCutouts } from '../lib/cutout';

/** Wartezeit nach dem Start bzw. einem Seitenwechsel, bevor die Nachbarseiten gebaut werden (ms) */
const NEIGHBOR_DELAY_MS = 250;
/** So lange dürfen Nachbarseiten nach einer Änderung auf ihren neuen Stand warten (ms) */
const REFRESH_MS = 500;

/**
 * Nachbarseiten laufen im Hintergrund mit: Änderungen kommen dort gesammelt und verzögert an, damit die sichtbare
 * Seite beim Tippen nicht für drei Seiten arbeitet. Die sichtbare Seite (`live`) zeichnet immer sofort.
 */
class Lazily extends Component<{ live: boolean; children: ComponentChildren }> {
  private timer = 0;

  shouldComponentUpdate(next: { live: boolean }) {
    if (next.live) {
      window.clearTimeout(this.timer);
      this.timer = 0;
      return true;
    }
    if (!this.timer) {
      this.timer = window.setTimeout(() => {
        this.timer = 0;
        this.forceUpdate();
      }, REFRESH_MS);
    }
    return false;
  }

  componentWillUnmount() {
    window.clearTimeout(this.timer);
  }

  render() {
    return this.props.children;
  }
}

interface Props<T extends string> {
  tabs: readonly T[];
  current: T;
  /** Inhalt einer Seite. `active`: die sichtbare Seite – Nachbarn (`false`) liegen fertig daneben, sind aber nicht bedienbar. */
  render: (tab: T, active: boolean) => ComponentChildren;
  /** Darf diese Seite schon im Hintergrund gebaut werden (Programmteil geladen)? */
  canPrebuild?: (tab: T) => boolean;
  /** Wechsel nach dem Einrasten */
  onChange: (tab: T) => void;
  /** Beim Loslassen: Ziel schon anzeigen (Leiste unten), `null` = wieder die aktuelle Seite */
  onPreview?: (tab: T | null) => void;
}

/**
 * Hauptseiten zum Blättern: Die aktuelle Seite liegt normal im Dokument (sie scrollt mit dem Fenster), ihre Nachbarn
 * liegen fertig gebaut links und rechts daneben. Gewischt wird wie in den Auswahlfenstern (lib/categorySwipe.ts):
 * Die Seite geht mit dem Finger, die nächste kommt gleichzeitig herein.
 *
 * - Nachbarn entstehen erst kurz nach dem Start/Wechsel (der erste Aufbau bleibt schlank). Wischt man vorher, geht die
 *   aktuelle Seite trotzdem mit und die neue erscheint nach dem Einrasten.
 * - Wer eine Seite verlässt, findet sie beim nächsten Mal frisch vor (wie bisher): Sie wird neu aufgebaut.
 */
export function TabPager<T extends string>({ tabs, current, render, canPrebuild = () => true, onChange, onPreview }: Props<T>) {
  const root = useRef<HTMLDivElement>(null);
  const index = tabs.indexOf(current);

  // Zähler je Seite: erhöht sich beim Verlassen → neuer Schlüssel → frischer Aufbau
  const leaves = useRef<Record<string, number>>({});
  const last = useRef(current);
  if (last.current !== current) {
    leaves.current[last.current] = (leaves.current[last.current] ?? 0) + 1;
    last.current = current;
  }

  // Nachbarn gehören immer zur aktuellen Seite: Nach einem Wechsel verschwinden die alten sofort, die neuen folgen im Leerlauf.
  const [readyFor, setReadyFor] = useState<T | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setReadyFor(current), NEIGHBOR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [current]);
  const ready = readyFor === current;

  const live = useRef({ index, tabs, onChange, onPreview });
  live.current = { index, tabs, onChange, onPreview };

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const at = (step: 1 | -1) => live.current.tabs[live.current.index + step];
    return attachCategorySwipe(
      el,
      (step) => {
        const next = at(step);
        live.current.onPreview?.(null);
        if (next !== undefined) live.current.onChange(next);
      },
      {
        pager: {
          track: () => el.querySelector<HTMLElement>(':scope > .tab-track'),
          side: (step) => el.querySelector<HTMLElement>(`:scope > .tab-track > .tab-page[data-dir="${step}"]`),
        },
        canStep: (step) => at(step) !== undefined,
        // Während der Geste ruht das Freistellen von Fotos – wie in den Auswahlfenstern
        onActive: pauseCutouts,
        onSettle: (step) => live.current.onPreview?.(at(step) ?? null),
        ignore: (target) => blocksTabSwipe(target, el),
        ownsStep: rowOwnsStep,
        scrollTop: () => window.scrollY,
      },
    );
  }, []);

  return (
    <div class="tab-pager" ref={root}>
      <div class="tab-track">
        {tabs.map((t, i) => {
          const dir = i - index;
          if (dir !== 0 && !(ready && Math.abs(dir) === 1 && canPrebuild(t))) return null;
          const side = dir !== 0;
          return (
            <div
              key={`${t}:${leaves.current[t] ?? 0}`}
              class={`tab-page ${side ? 'is-side' : 'is-current'}`}
              data-tab={t}
              data-dir={side ? dir : undefined}
              aria-hidden={side ? 'true' : undefined}
              inert={side}
            >
              <Lazily live={!side}>{render(t, !side)}</Lazily>
            </div>
          );
        })}
      </div>
    </div>
  );
}
