import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: '.',
  base: '/',
  plugins: [
    react(),
    {
      name: 'adiutor-dev-csp',
      // Geliştirme sunucusu React Refresh için satır içi betik enjekte eder.
      // Sıkı CSP yalnızca üretim derlemesinde uygulanır.
      transformIndexHtml(html, context) {
        if (context.server) {
          return html.replace(/\s*<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '');
        }
        return html;
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@shared': path.resolve(import.meta.dirname, 'src/shared'),
    },
  },
  server: {
    port: 5273,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome130',
    chunkSizeWarningLimit: 4096,
  },
});
