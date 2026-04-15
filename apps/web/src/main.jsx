import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import axios from "axios";

// 🛡️ SECURITY Fix: Ensure credentials are sent with all API requests
axios.defaults.withCredentials = true;
// import { registerSW } from 'virtual:pwa-register';

// Register service worker for offline support
// registerSW({ immediate: true });

// 🛠️ EMERGENCY Fix: Force-unregister any legacy Service Workers and CLEAR ALL CACHES
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (let registration of registrations) {
      registration.unregister();
      console.log("🧹 [SAM Compiler] Legacy Service Worker purged.");
    }
  });
}

// 🛡️ SECURITY: Wipe all old caches to prevent Workbox/PWA fetch interception
if ('caches' in window) {
  caches.keys().then((names) => {
    for (let name of names) {
      caches.delete(name);
      console.log(`🗑️ [SAM Compiler] Cache cleared: ${name}`);
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

