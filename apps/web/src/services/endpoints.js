/**
 * 🌑 Centralized endpoint configuration for SAM Compiler
 * Ensures that API and WebSocket traffic are routed correctly
 * to the monolithic Render backend.
 */

// HARDENED: Definitively targets the monolithic Render domain as the source of truth
const RENDER_BASE = "https://sam-compiler.onrender.com";

const isProduction = import.meta.env.PROD;
const isVercel = window.location.hostname.includes("vercel.app");

const getBaseEndpoint = () => {
  const host = window.location.hostname;
  const isLocal = host === "localhost" || 
                  host === "127.0.0.1" || 
                  host === "0.0.0.0" ||
                  host.startsWith("192.168.") || 
                  host.startsWith("10.") || 
                  host.startsWith("172.");
  
  return isLocal ? `http://${host}:8080` : RENDER_BASE;
};

const DYNAMIC_BASE = getBaseEndpoint();

export const ENDPOINTS = {
  // REST API Endpoint: Consistently targets the same node as Sockets
  API_BASE_URL: `${DYNAMIC_BASE}/api`,

  // WebSocket Endpoint: Smart detection for Local vs Production
  WS_ENDPOINT: DYNAMIC_BASE,

  // SOCKET_OPTIONS: Optimized for Render's container handshake
  SOCKET_OPTIONS: {
     transports: ["websocket"],
     withCredentials: true, // 🛡️ Required for cross-origin handshaking
     reconnection: true,
     reconnectionAttempts: 50,
     timeout: 30000
  },

  IS_PRODUCTION: isProduction,
  IS_VERCEL: isVercel
};

export default ENDPOINTS;
