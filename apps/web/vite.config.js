import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Restarted to sync module renames: 2026-05-02
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Raise the warning threshold - Monaco is inherently large and can't be eliminated
    chunkSizeWarningLimit: 1000,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Monaco Editor - 2.5MB irreducible (ships its own language workers)
          // Isolated so the app shell loads independently without waiting for it
          if (id.includes('node_modules/monaco-editor') || id.includes('node_modules/@monaco-editor')) {
            return 'monaco';
          }
          // Yjs + collaboration stack
          if (id.includes('node_modules/yjs') || id.includes('node_modules/y-') || id.includes('node_modules/lib0')) {
            return 'yjs';
          }
          // xterm.js terminal emulator
          if (id.includes('node_modules/xterm') || id.includes('node_modules/@xterm')) {
            return 'xterm';
          }
          // Animation library
          if (id.includes('node_modules/framer-motion')) {
            return 'framer-motion';
          }
          // Socket.IO client
          if (id.includes('node_modules/socket.io-client') || id.includes('node_modules/engine.io-client')) {
            return 'socketio';
          }
          // All other node_modules (including react, react-dom) go into one stable vendor chunk.
          // Keeping react here (not a separate chunk) prevents circular dependency warnings.
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
});

