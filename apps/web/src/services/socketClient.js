import { io } from "socket.io-client";

let socket = null;

export function getSocket() {
  if (socket) return socket;
  // Use window.location.origin for same-origin proxy support
  // The backend will receive this at /socket.io but the proxy maps /api/socket.io to /socket.io
  const isVercel = window.location.hostname.includes("vercel.app");
  if (isVercel) {
    // Socket.IO is not supported in Vercel's serverless environment.
    // We return a dummy socket to prevent 404 spam.
    return {
      connected: false,
      on: () => {},
      off: () => {},
      emit: () => {},
      connect: () => {}
    };
  }

  // Use window.location.origin for same-origin proxy support
  socket = io(window.location.origin, {
    path: "/api/socket.io",
    reconnectionDelayMax: 10000,
    autoConnect: true,
    transports: ["polling", "websocket"]
  });
  return socket;
}
