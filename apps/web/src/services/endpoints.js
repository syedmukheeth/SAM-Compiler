/**
 * Centralized endpoint configuration for SAM Compiler
 * Ensures that API and WebSocket traffic are routed correctly
 * between Vercel (REST) and Render (WebSockets).
 */

const isProduction = import.meta.env.PROD;
const isVercel = window.location.hostname.includes("vercel.app");

export const ENDPOINTS = {
  // REST API Endpoint
  // ALIGNMENT: Uses VITE_API_URL if provided (for separate Vercel deployments), else defaults to origin.
  API_BASE_URL: (import.meta.env.VITE_API_URL || "").replace(/\/+$/, ""),

  // WebSocket Endpoint 
  WS_ENDPOINT: (import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || (isProduction ? "" : window.location.protocol + "//" + window.location.hostname + ":8080")).replace(/\/+$/, ""),

  // SOCKET_OPTIONS: WebSocket first for max performance on Render container
  SOCKET_OPTIONS: {
     transports: ["websocket", "polling"], // Standard upgrade sequence
     reconnection: true,
     reconnectionAttempts: 50,
     timeout: 30000
  },

  IS_PRODUCTION: isProduction,
  IS_VERCEL: isVercel
};

export default ENDPOINTS;
