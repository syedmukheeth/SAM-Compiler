import { io } from "socket.io-client";
import ENDPOINTS from "./endpoints";

export const SOCKET_STATES = {
  IDLE: "idle",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  FAILED: "failed",
  WAKING: "waking"
};

let socket = null;
let currentStatus = SOCKET_STATES.IDLE;
let wakingTimer = null;

function emitStatus(status, details = {}) {
  currentStatus = status;
  window.dispatchEvent(new CustomEvent("sam:socket:status", { 
    detail: { status, ...details } 
  }));
}

export function getSocket(tokenArg) {
  const token = tokenArg || localStorage.getItem("token");

  if (!token) {
    console.warn("⚠️ [SAM Compiler] No auth token. Connection suspended.");
    return null;
  }

  if (socket) {
    socket.auth = { token };
    return socket;
  }
  
  const endpoint = ENDPOINTS.WS_ENDPOINT;
  console.log(`📡 [SAM Compiler] Initializing Secure WebSocket machine @ ${endpoint}`);

  emitStatus(SOCKET_STATES.CONNECTING);

  // 3s Waking Engine: If connecting takes too long, it's likely a cold start
  wakingTimer = setTimeout(() => {
    if (currentStatus === SOCKET_STATES.CONNECTING || currentStatus === SOCKET_STATES.RECONNECTING) {
      emitStatus(SOCKET_STATES.WAKING);
    }
  }, 3500);

  socket = io(endpoint, {
    transports: ["websocket"],
    auth: { token },
    withCredentials: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    autoConnect: true
  });

  let heartbeatInterval = null;

  socket.on("connect", () => {
    if (wakingTimer) clearTimeout(wakingTimer);
    emitStatus(SOCKET_STATES.CONNECTED, { transport: socket.io.engine.transport.name });
    
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
      if (socket.connected) socket.emit("sam:ping");
    }, 20000);
  });

  socket.on("connect_error", (err) => {
    if (!navigator.onLine) return;
    console.error("❌ [SAM Compiler] Socket Error:", err.message);
    emitStatus(SOCKET_STATES.RECONNECTING, { error: err.message });
  });

  socket.on("disconnect", (reason) => {
    if (wakingTimer) clearTimeout(wakingTimer);
    
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    if (reason === "io server disconnect") {
      socket.connect();
    }

    // Only broadcast as RECONNECTING if we expect to recover
    const nextState = navigator.onLine ? SOCKET_STATES.RECONNECTING : SOCKET_STATES.FAILED;
    emitStatus(nextState, { reason });
  });

  window.addEventListener("online", () => {
    if (socket && !socket.connected) {
      emitStatus(SOCKET_STATES.RECONNECTING);
      socket.connect();
    }
  });

  window.addEventListener("offline", () => {
    emitStatus(SOCKET_STATES.FAILED, { reason: "Network offline" });
    if (socket) socket.disconnect();
  });

  return socket;
}

export function reconnect() {
  if (socket) {
    emitStatus(SOCKET_STATES.CONNECTING);
    socket.connect();
  } else {
    getSocket();
  }
}

export function getSocketStatus() {
  return currentStatus;
}
