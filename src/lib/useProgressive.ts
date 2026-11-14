import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * Lange Listen schrittweise zeichnen: erst `first` Einträge, beim Scrollen automatisch mehr
 * (ein unsichtbarer Marker am Listenende löst das Nachladen aus). Hält den ersten Aufbau schnell.
 * `resetKey` setzt bei neuen Filtern wieder auf den Anfang.
 */
export function useProgressive(total: number, resetKey: string, first = 24, step = 48) {
  const [count, setCount] = useState(first);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => setCount(first), [resetKey, first]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || count >= total) return;
    if (typeof IntersectionObserver === 'undefined') {
      setCount(total);
      return;
    }
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setCount((c) => Math.min(total, c + step)), { rootMargin: '1200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [count, total, step]);
  return { count: Math.min(count, total), sentinel };
}
