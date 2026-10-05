import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` → static site in dist/ (works on GitHub Pages or any host).
// `npm run build:single` → one self-contained HTML file in dist-single/.
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [react(), viteSingleFile()] : [react()],
    build: single
      ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000, cssCodeSplit: false }
      : { outDir: 'dist', target: 'es2022' },
    test: {
      include: ['tests/**/*.test.ts'],
    },
  };
});
