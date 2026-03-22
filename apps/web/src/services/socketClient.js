import { io } from "socket.io-client";

let socket = null;

export function getSocket() {
  if (socket) return socket;
  // Use window.location.origin for same-origin proxy support
  // The backend will receive this at /socket.io but the proxy maps /api/socket.io to /socket.io
  const isVercel = window.location.hostname.includes("vercel.app");
  const endpoint = isVercel ? "https://liquid-ide.onrender.com" : window.location.origin;

  // For local development, if we're hitting a non-localhost origin (like mobile via IP),
  // we still want to use that origin as the socket endpoint.
  // The backend CORS origin: true handles the reflected origin.
  socket = io(endpoint, {
    path: "/socket.io", 
    reconnectionDelayMax: 10000,
    autoConnect: true,
    transports: ["polling", "websocket"],
    secure: window.location.protocol === "https:"
  });
  return socket;
}
