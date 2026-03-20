import { io } from "socket.io-client";

let socket = null;

export function getSocket() {
  if (socket) return socket;
  // Use window.location.origin for same-origin proxy support
  // The backend will receive this at /socket.io but the proxy maps /api/socket.io to /socket.io
  const isVercel = window.location.hostname.includes("vercel.app");
  const endpoint = isVercel ? "https://liquid-ide.onrender.com" : window.location.origin;

  socket = io(endpoint, {
    path: "/socket.io", // Direct path to Render
    reconnectionDelayMax: 10000,
    autoConnect: true,
    transports: ["polling", "websocket"]
  });
  return socket;
}
