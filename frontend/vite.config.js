// frontend/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Sahayak — Disaster Resilience',
        short_name: 'Sahayak',
        description: 'Offline-first AI disaster response for rural India',
        theme_color: '#0f172a',
        background_color: '#f1f5f9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  server: {
    allowedHosts: true,
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      '/alerts':       { target: 'http://localhost:8000', changeOrigin: true },
      '/stream':       { target: 'http://localhost:8000', changeOrigin: true },
      '/instructions': { target: 'http://localhost:8000', changeOrigin: true },
      '/manual-alert': { target: 'http://localhost:8000', changeOrigin: true },
      '/demo':         { target: 'http://localhost:8000', changeOrigin: true },
      '/ask':          { target: 'http://localhost:8000', changeOrigin: true },
      '/health':       { target: 'http://localhost:8000', changeOrigin: true },
      '/serial':       { target: 'http://localhost:8000', changeOrigin: true },
      '/ollama':       { target: 'http://localhost:8000', changeOrigin: true },
      '/situation':    { target: 'http://localhost:8000', changeOrigin: true },
      '/nodes':        { target: 'http://localhost:8000', changeOrigin: true },
    }
  },
});
