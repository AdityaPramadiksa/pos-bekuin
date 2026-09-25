import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Saat development, web meneruskan /api, /uploads, dan /socket.io ke API NestJS.
// Browser hanya bicara dengan satu alamat (tanpa CORS), jadi bisa dibuka dari HP lewat IP laptop.
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000';
const proxy = {
  '/api': { target: API_TARGET, xfwd: true },
  '/uploads': { target: API_TARGET },
  '/socket.io': { target: API_TARGET, ws: true },
};

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
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/, /^\/socket\.io/],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    host: true, // bisa diakses dari HP di jaringan WiFi yang sama
    strictPort: true,
    proxy,
    // Izinkan alamat Cloudflare Tunnel untuk tes HTTPS (printer Bluetooth, install PWA).
    allowedHosts: ['.trycloudflare.com'],
  },
  preview: { port: 4173, host: true, proxy },
});
