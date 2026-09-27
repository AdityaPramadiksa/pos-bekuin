import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = process.env.AETHERA_API_URL ?? 'http://127.0.0.1:4400';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, rewrite: (p) => p.replace(/^\/api/, '') },
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
});
