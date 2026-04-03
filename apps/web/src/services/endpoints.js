/**
 * Centralized endpoint configuration for LiquidIDE
 * Ensures that API and WebSocket traffic are routed correctly
 * between Vercel (REST) and Render (WebSockets).
 */

const isProduction = import.meta.env.PROD;
const isVercel = window.location.hostname.includes("vercel.app");

export const ENDPOINTS = {
  // REST API Endpoint
  // ALIGNMENT: In production, route ALL traffic to Render to avoid Vercel proxy issues
  API_BASE_URL: isProduction 
    ? "https://liquid-ide.onrender.com" 
    : "",

  // WebSocket Endpoint 
  WS_ENDPOINT: isProduction 
    ? "https://liquid-ide.onrender.com" 
    : window.location.protocol + "//" + window.location.hostname + ":8080",

  // SOCKET_OPTIONS: Polling first for max reliability on Render free-tier
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
