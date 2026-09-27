import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = process.env.AETHERA_API_URL ?? 'http://127.0.0.1:4400';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Chunk scene 3D (three + r3f + drei) memang ~950 kB dan dimuat lazy setelah HUD tampil.
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, rewrite: (p) => p.replace(/^\/api/, '') },
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
});
