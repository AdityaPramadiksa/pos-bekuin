import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Bekuin POS',
        short_name: 'Bekuin',
        description: 'Order, approval, dan stok Bekuin',
        theme_color: '#b91c1c',
        background_color: '#fffbf5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        lang: 'id',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache shell aplikasi agar tetap terbuka offline; data API tidak di-cache.
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    host: true, // bisa diakses dari HP di jaringan WiFi yang sama
    strictPort: true, // CORS_ORIGIN di API memakai port 5173
  },
});
