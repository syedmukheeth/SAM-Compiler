/**
 * 🌑 Centralized endpoint configuration for SAM Compiler
 * Ensures that API and WebSocket traffic are routed correctly
 * to the monolithic Render backend.
 */

// HARDENED: Definitively targets the monolithic Render domain as the source of truth
const RENDER_BASE = "https://sam-compiler.onrender.com";

const isProduction = import.meta.env.PROD;
const isVercel = window.location.hostname.includes("vercel.app");

export const ENDPOINTS = {
  // REST API Endpoint: Tunneled through Vercel/Vite proxies for CORS-free communication
  API_BASE_URL: "/api",

  // WebSocket Endpoint: Requires absolute domain for cross-origin Socket.io handshakes on Vercel
  WS_ENDPOINT: RENDER_BASE,

  // SOCKET_OPTIONS: Optimized for Render's container handshake
  SOCKET_OPTIONS: {
     transports: ["polling", "websocket"],
     reconnection: true,
     reconnectionAttempts: 50,
     timeout: 30000
  },

  IS_PRODUCTION: isProduction,
  IS_VERCEL: isVercel
};

export default ENDPOINTS;
