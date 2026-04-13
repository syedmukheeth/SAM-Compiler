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
    window.dispatchEvent(new CustomEvent("sam:socket:status", { detail: { connected: true, status: "online", endpoint } }));
  });

  socket.on("connect_error", (err) => {
    console.error("❌ [SAM Compiler] WebSocket Connection Error:", err.message);
    window.dispatchEvent(new CustomEvent("sam:socket:status", { detail: { connected: false, status: "error", message: err.message } }));
  });

  socket.on("disconnect", (reason) => {
    console.warn("⚠️ [SAM Compiler] WebSocket Disconnected:", reason);
    window.dispatchEvent(new CustomEvent("sam:socket:status", { detail: { connected: false, status: "offline", reason } }));
  });

  return socket;
}
