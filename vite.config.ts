import { pfxReleasePlugin } from "./scripts/pfx-release.mjs";
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react(), pfxReleasePlugin()],
  build: {
    outDir: 'site-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        studio: fileURLToPath(new URL('./index.html', import.meta.url)),
        diagnostics: fileURLToPath(new URL('./diagnostics/index.html', import.meta.url)),
      },
    },
  },
  optimizeDeps: {
    exclude: [
      '@jsquash/jpeg',
      '@jsquash/png',
      '@jsquash/oxipng',
      '@jsquash/webp',
    ],
  },
});
