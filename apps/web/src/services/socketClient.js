import { io } from "socket.io-client";
import ENDPOINTS from "./endpoints";

let socket = null;

export function getSocket() {
  if (socket) return socket;
  
  // Use centralized production/dev endpoint
  const endpoint = ENDPOINTS.WS_ENDPOINT;

  console.log(`📡 [SAM Compiler] Initializing WebSocket @ ${endpoint}`);

  socket = io(endpoint, {
    path: "/socket.io", 
    ...ENDPOINTS.SOCKET_OPTIONS,
    autoConnect: true,
    secure: endpoint.startsWith("https:")
  });

  socket.on("connect", () => {
    console.log("✅ [SAM Compiler] WebSocket Connected to", endpoint);
  });

  socket.on("connect_error", (err) => {
    console.error("❌ [SAM Compiler] WebSocket Connection Error:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.warn("⚠️ [SAM Compiler] WebSocket Disconnected:", reason);
  });

  return socket;
}
