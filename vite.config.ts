import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// BASE_PATH wird in GitHub Actions auf "/<repo-name>/" gesetzt (GitHub Pages).
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [preact()],
  build: { target: 'es2020', sourcemap: false },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] },
});
