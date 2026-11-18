import { defineConfig } from 'vite';

// Relative base so the built site works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: false, open: false },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('node_modules/three-mesh-bvh')) return 'three';
        },
      },
    },
  },
});
