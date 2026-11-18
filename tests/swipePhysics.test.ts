import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const load = async (linear: boolean) => {
  vi.stubGlobal('CSS', { supports: (_p: string, v: string) => linear && v.startsWith('linear(') });
  return import('../src/lib/categorySwipe');
};

describe('Wischgeste: Physik', () => {
  it('Gummiband am Rand: anfangs spürbar, dann immer zäher, nie über die Breite hinaus', async () => {
    const { followOffset } = await load(false);
    expect(followOffset(60, true, 380)).toBe(60); // mit Nachbar: 1:1
    const a = followOffset(60, false, 380);
    const b = followOffset(240, false, 380);
    const c = followOffset(2000, false, 380);
    expect(a).toBeGreaterThan(15);
    expect(a).toBeLessThan(60);
    expect(b - a).toBeLessThan(240 - 60); // zäher
    expect(c).toBeLessThan(380);
    expect(followOffset(-60, false, 380)).toBe(-a); // symmetrisch
  });

  it('Feder startet mit dem Tempo des Fingers und endet ohne Überschwingen', async () => {
    const { springEasing } = await load(true);
    const slow = springEasing(0)!;
    const fast = springEasing(12)!;
    const pts = (e: string) => e.slice(7, -1).split(', ').map(Number);
    for (const e of [slow, fast]) {
      const p = pts(e.easing);
      expect(p[0]).toBe(0);
      expect(p.at(-1)).toBe(1);
      expect(p.every((v, i) => i === 0 || v >= p[i - 1]!)).toBe(true); // nur vorwärts
      expect(Math.max(...p)).toBeLessThanOrEqual(1); // kein Überschwingen
      expect(e.ms).toBeGreaterThan(150);
      expect(e.ms).toBeLessThan(1200);
    }
    // Schneller Finger: Die Kurve startet steiler (Schwung wird übernommen)
    expect(pts(fast.easing)[1]!).toBeGreaterThan(pts(slow.easing)[1]!);
  });

  it('ohne linear() im Browser: keine Federkurve (feste Kurve als Ersatz)', async () => {
    const { springEasing } = await load(false);
    expect(springEasing(5)).toBeNull();
  });
});
