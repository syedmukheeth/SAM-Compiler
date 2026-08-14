import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  plugins: [react()],
  // Inlined so the UI cannot drift from the manifest the way the four
  // hardcoded version strings did.
  define: { __APP_VERSION__: JSON.stringify(version) },
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
    // Off by default. Generating maps for this dependency set costs ~16MB of
    // output (9.4MB for Monaco alone) and the peak memory to build them, which
    // a 512MB Render instance does not have - the deploy dies mid-build while
    // CI, on a far larger runner, passes.
    //
    // Set SOURCEMAP=true to get them back when a production stack trace needs
    // decoding; `npm run dev` is unaffected and always has them.
    sourcemap: process.env.SOURCEMAP === "true",
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

