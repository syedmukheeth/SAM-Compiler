import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'SAM Compiler',
        short_name: 'SAM',
        description: 'Hardened Collaborative Cloud Compiler',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MiB (Allow larger Monaco/XTerm bundles)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // 🛠️ STABILITY Fix: Prevent Service Worker from intercepting real-time communication
        navigateFallbackDenylist: [/^\/socket\.io/, /^\/api/],
        runtimeCaching: [
          {
            // Skip caching for socket.io polling requests COMPLETELY
            urlPattern: ({ url }) => url.pathname.startsWith('/socket.io'),
            handler: 'NetworkOnly', 
          },
          {
            urlPattern: ({ url }) => url.origin === url.origin && !url.pathname.startsWith('/api'), // Matches same-origin (excluding API)
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'sam-assets',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkOnly', // Prefer fresh execution data over stale results
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  }
});

