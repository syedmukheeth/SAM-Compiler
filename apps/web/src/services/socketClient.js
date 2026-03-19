import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";
const IS_PRODUCTION = API_URL.includes("vercel.app");

let socket = null;

export function getSocket() {
  if (IS_PRODUCTION) {
    return {
      on: () => {},
      off: () => {},
      emit: () => {},
      connected: false
    };
  }
  
  if (socket) return socket;
  socket = io(API_URL, {
    transports: ["websocket"],
    autoConnect: true
  });
  return socket;
}

