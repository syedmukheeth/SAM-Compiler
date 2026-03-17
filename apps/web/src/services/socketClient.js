import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

let socket = null;

export function getSocket() {
  if (socket) return socket;
  socket = io(API_URL, {
    transports: ["websocket"],
    autoConnect: true
  });
  return socket;
}

