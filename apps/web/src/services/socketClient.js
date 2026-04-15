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

  let heartbeatInterval = null;

  socket.on("connect", () => {
    const transport = socket.io.engine.transport.name;
    console.log(`✅ [SAM Compiler] WebSocket Connected | Host: ${endpoint} | Transport: ${transport}`);
    
    // Heartbeat to keep Render proxy alive
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
      if (socket.connected) socket.emit("sam:ping");
    }, 20000); // Increased frequency for Render/Vercel stability

    window.dispatchEvent(new CustomEvent("sam:socket:status", { 
      detail: { connected: true, status: "online", endpoint, transport } 
    }));
  });

  socket.on("connect_error", (err) => {
    // SILENT MODE: If the hardware says we are offline, don't spam the console.
    if (!navigator.onLine) return;

    console.error("❌ [SAM Compiler] WebSocket Connection Error:", err.message);
    
    // Fallback strategy for Render
    if (socket.io.opts.transports.includes("websocket")) {
       console.warn("⚠️ [SAM Compiler] Potential proxy block: Falling back to polling for stability.");
       socket.io.opts.transports = ["polling"];
    }

    window.dispatchEvent(new CustomEvent("sam:socket:status", { 
      detail: { connected: false, status: "error", message: err.message } 
    }));
  });

  socket.on("disconnect", (reason) => {
    // Only log if it's not a voluntary OS-level offline event
    if (navigator.onLine) {
      console.warn("⚠️ [SAM Compiler] WebSocket Disconnected:", reason);
    }

    if (reason === "io server disconnect") {
      socket.connect();
    }

    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    window.dispatchEvent(new CustomEvent("sam:socket:status", { 
      detail: { connected: false, status: "offline", reason } 
    }));
  });

  // OS-LEVEL SYNC: Force socket state to match hardware state
  window.addEventListener("online", () => {
    console.log("🌐 [SAM Compiler] Internet recovered. Forcing clean reconnection...");
    socket.connect();
  });

  window.addEventListener("offline", () => {
    console.warn("🌐 [SAM Compiler] Internet hardware disconnected. Suspending sync.");
    socket.disconnect();
  });

  return socket;
}
