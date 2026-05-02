import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Restarted to sync module renames: 2026-05-02
export default defineConfig({
  plugins: [
    react(),
      // 🛠️ DEBUG Fix: Temporarily disable Service Worker to bypass fetch interception issues
      // VitePWA({ ... original config ... })

  ],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  }
});

