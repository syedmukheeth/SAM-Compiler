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
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    autoConnect: true
  });

  socket.on("connect", () => {
    const transport = socket.io.engine.transport.name;
    console.log(`✅ [SAM Compiler] WebSocket Connected | Host: ${endpoint} | Transport: ${transport}`);
    window.dispatchEvent(new CustomEvent("sam:socket:status", { 
      detail: { connected: true, status: "online", endpoint, transport } 
    }));
  });

  socket.on("connect_error", (err) => {
    console.error("❌ [SAM Compiler] WebSocket Connection Error:", err.message);
    // Force transport to polling if websocket fails consistently
    if (socket.io.opts.transports.includes("websocket")) {
       console.warn("⚠️ [SAM Compiler] WebSocket upgrade failed, sticking to polling...");
       socket.io.opts.transports = ["polling"];
    }
    window.dispatchEvent(new CustomEvent("sam:socket:status", { 
      detail: { connected: false, status: "error", message: err.message } 
    }));
  });

  socket.on("disconnect", (reason) => {
    console.warn("⚠️ [SAM Compiler] WebSocket Disconnected:", reason);
    if (reason === "io server disconnect") {
      // the disconnection was initiated by the server, you need to reconnect manually
      socket.connect();
    }
    window.dispatchEvent(new CustomEvent("sam:socket:status", { 
      detail: { connected: false, status: "offline", reason } 
    }));
  });

  return socket;
}
