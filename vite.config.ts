import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import type { Plugin } from 'vite';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * Texterkennung (Foto-Check) komplett selbst gehostet: Worker, WASM-Kern und englische Sprachdaten
 * aus node_modules nach public/ocr kopieren. Kein CDN – funktioniert nach dem ersten Laden auch offline.
 */
const OCR_VERSION: string = createRequire(import.meta.url)('tesseract.js/package.json').version;

function ocrAssets(): Plugin {
  return {
    name: 'ocr-assets',
    buildStart() {
      const req = createRequire(import.meta.url);
      // Versionierter Ordner (ocr/7.0.0/): Worker und Kern passen immer zur gebauten App,
      // und der Service Worker kann alte Versionen gezielt aufräumen.
      const root = join(__dirname, 'public/ocr');
      const out = join(root, OCR_VERSION);
      mkdirSync(out, { recursive: true });
      for (const d of readdirSync(root)) if (d !== OCR_VERSION) rmSync(join(root, d), { recursive: true, force: true });
      const core = dirname(req.resolve('tesseract.js-core/package.json'));
      const files: [string, string][] = [
        [join(dirname(req.resolve('tesseract.js/package.json')), 'dist/worker.min.js'), 'worker.min.js'],
        ...['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'].map((f) => [join(core, f), f] as [string, string]),
        [join(dirname(req.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int/eng.traineddata.gz'), 'eng.traineddata.gz'],
      ];
      for (const [from, name] of files) {
        const to = join(out, name);
        if (!existsSync(to) || statSync(to).size !== statSync(from).size) copyFileSync(from, to);
      }
    },
  };
}

/** Schreibt alle gebauten Assets (auch nachgeladene wie den Barcode-Leser) nach precache.json für den Service Worker. */
function precacheList(): Plugin {
  return {
    name: 'precache-list',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => f.startsWith('assets/')).sort();
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify(files) });
    },
  };
}

// BASE_PATH wird in GitHub Actions auf "/<repo-name>/" gesetzt (GitHub Pages).
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [preact(), precacheList(), ocrAssets()],
  define: { __OCR_DIR__: JSON.stringify(`ocr/${OCR_VERSION}/`) },
  build: { target: 'es2020', sourcemap: false },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] },
});
