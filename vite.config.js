import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages (https://<user>.github.io/omaha-93/)
// and from any other static host or sub-folder.
export default defineConfig({
  base: './',
  server: { port: 5193, host: true },
  preview: { port: 5194 },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
