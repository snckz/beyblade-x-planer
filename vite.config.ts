import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import type { Plugin } from 'vite';

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
  plugins: [preact(), precacheList()],
  build: { target: 'es2020', sourcemap: false },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] },
});
