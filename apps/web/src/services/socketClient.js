import { io } from "socket.io-client";

let socket = null;

export function getSocket() {
  if (socket) return socket;
  // Use window.location.origin for same-origin proxy support
  // The backend will receive this at /socket.io but the proxy maps /api/socket.io to /socket.io
  socket = io(window.location.origin, {
    path: "/api/socket.io",
    reconnectionDelayMax: 10000,
    autoConnect: true,
    transports: ["polling", "websocket"] // Start with polling on Vercel
  });
  return socket;
}
