import { io } from "socket.io-client";
import ENDPOINTS from "./endpoints";

let socket = null;

export function getSocket() {
  if (socket) return socket;
  
  // Use centralized production/dev endpoint
  const endpoint = ENDPOINTS.WS_ENDPOINT;

  console.log(`📡 [LiquidIDE] Initializing WebSocket @ ${endpoint}`);

  socket = io(endpoint, {
    path: "/socket.io", 
    reconnection: true,
    reconnectionAttempts: 25, // More attempts for Render wake up
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 60000, // 60s for Render to wake up
    autoConnect: true,
    transports: ["websocket", "polling"], // WebSocket first
    secure: endpoint.startsWith("https:")
  });

  socket.on("connect", () => {
    console.log("✅ [LiquidIDE] WebSocket Connected to", endpoint);
  });

  socket.on("connect_error", (err) => {
    console.error("❌ [LiquidIDE] WebSocket Connection Error:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.warn("⚠️ [LiquidIDE] WebSocket Disconnected:", reason);
  });

  return socket;
}
