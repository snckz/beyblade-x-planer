import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedCutout, cutoutFromImage, pauseCutouts } from '../src/lib/cutout';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Freistellen: Warteschlange', () => {
  afterEach(() => pauseCutouts(false));

  it('ruht während einer Geste und läuft danach weiter', async () => {
    // Ohne Zeichenfläche (jsdom): Ergebnis „nicht freistellbar“ (null) – hier zählt nur der Zeitpunkt
    const ctx = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    pauseCutouts(true);
    const job = cutoutFromImage(new Image(), 'https://example.test/a.png');
    await wait(30);
    expect(cachedCutout('https://example.test/a.png')).toBeUndefined(); // noch nicht gerechnet
    expect(ctx).not.toHaveBeenCalled();
    pauseCutouts(false);
    await expect(job).resolves.toBeNull();
    expect(cachedCutout('https://example.test/a.png')).toBeNull();
    ctx.mockRestore();
  });

  it('rechnet dasselbe Foto nur einmal, auch bei gleichzeitigen Anfragen', async () => {
    const ctx = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const img = new Image();
    const [a, b] = [cutoutFromImage(img, 'https://example.test/b.png'), cutoutFromImage(img, 'https://example.test/b.png')];
    expect(a).toBe(b);
    await a;
    expect(ctx).toHaveBeenCalledTimes(1);
    ctx.mockRestore();
  });
});
